import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}

function getSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch {}
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  try {
    const expectedCode = Deno.env.get("RAIF_ACCESS_CODE") || "";
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secretKey = getSecretKey();
    if (!expectedCode || !url || !secretKey) {
      return reply({ error: "إعداد تسجيل الدخول غير مكتمل في الخادم." }, 503);
    }

    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: "طلب غير صالح." }, 400);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return reply({ error: "طلب غير صالح." }, 400); }

    const ip = (req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 128);
    const fingerprint = await digest(ip);
    const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

    await admin.from("raif_access_attempts").delete()
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin.from("raif_access_attempts")
      .select("id", { count: "exact", head: true })
      .eq("fingerprint", fingerprint)
      .gte("created_at", since);
    if (countError) throw countError;
    if ((count || 0) >= 6) return reply({ error: "محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجدداً." }, 429);

    if (typeof body.code !== "string" || body.code !== expectedCode) {
      const { error: insertError } = await admin.from("raif_access_attempts").insert({ fingerprint });
      if (insertError) throw insertError;
      return reply({ error: "رمز الدخول غير صحيح." }, 401);
    }

    const sharedEmail = "raif-shared@wdgjjqwxsluumltezqlp.supabase.co";
    let { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    let sharedUser = listed.users.find(user => user.email?.toLowerCase() === sharedEmail);
    if (!sharedUser) {
      const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(48)))
        .map(value => value.toString(16).padStart(2, "0")).join("");
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: sharedEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { raif_shared_account: true, display_name: "RAIF المشترك" },
      });
      if (createError) throw createError;
      sharedUser = created.user;
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: sharedEmail,
    });
    if (linkError) throw linkError;
    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) throw new Error("تعذر إنشاء جلسة الدخول.");
    return reply({ token_hash: tokenHash, type: "magiclink" });
  } catch (error) {
    console.error("raif-code-login:", error);
    return reply({ error: "تعذر إكمال تسجيل الدخول حالياً." }, 500);
  }
});
