import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

function publicHttpsUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4096) {
    throw new Error("Invalid source URL.");
  }
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^[0-9.]+$/.test(host) ||
    host.includes(":")
  ) {
    throw new Error("Only public HTTPS hostnames are allowed.");
  }
  return url;
}

function validateManifestUrl(value: unknown): URL {
  const url = publicHttpsUrl(value);
  if (!/\/manifest\.json$/i.test(url.pathname)) {
    throw new Error("The source URL must end with manifest.json.");
  }
  return url;
}

async function safeFetch(input: URL, accept: string, timeoutMs = 12000): Promise<Response> {
  let current = publicHttpsUrl(input.href);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const response = await fetch(current.href, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        redirect: "manual",
        headers: { Accept: accept },
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || hop === 3) throw new Error("Too many or invalid source redirects.");
        current = publicHttpsUrl(new URL(location, current).href);
        continue;
      }
      return response;
    }
    throw new Error("Too many source redirects.");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The source request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function responseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.ok) throw new Error("Source returned HTTP " + response.status + ".");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("Source response is too large.");
  const text = await response.text();
  if (text.length > maxBytes) throw new Error("Source response is too large.");
  return text;
}

async function fetchJson(url: URL): Promise<Record<string, unknown>> {
  const response = await safeFetch(url, "application/json");
  const raw = await responseText(response, 1_500_000);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Source did not return valid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Source returned an unexpected JSON shape.");
  }
  return data as Record<string, unknown>;
}

function resourceNames(manifest: Record<string, unknown>): string[] {
  return Array.isArray(manifest.resources)
    ? manifest.resources.map((item: unknown) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object"
            ? String((item as Record<string, unknown>).name || "")
            : ""
      ).filter(Boolean)
    : [];
}

function addonEndpoint(manifestUrl: URL, parts: string[], query: Record<string, unknown> = {}): URL {
  const endpoint = new URL(manifestUrl.href);
  endpoint.search = "";
  endpoint.hash = "";
  endpoint.pathname = endpoint.pathname.replace(/manifest\.json$/i, "");
  if (!endpoint.pathname.endsWith("/")) endpoint.pathname += "/";
  endpoint.pathname += parts.map((part) => encodeURIComponent(part)).join("/") + ".json";
  for (const [key, value] of Object.entries(query)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key)) throw new Error("Invalid catalog parameter.");
    if (value === undefined || value === null || value === "") continue;
    const text = String(value);
    if (text.length > 200) throw new Error("Catalog parameter is too long.");
    endpoint.searchParams.set(key, text);
  }
  return publicHttpsUrl(endpoint.href);
}

function normalizeMediaUrls(data: Record<string, unknown>, manifestUrl: URL, resource: string) {
  if (resource === "subtitles" && Array.isArray(data.subtitles)) {
    return {
      ...data,
      subtitles: data.subtitles.map((item: unknown) => {
        if (!item || typeof item !== "object") return item;
        const subtitle = item as Record<string, unknown>;
        if (typeof subtitle.url !== "string") return subtitle;
        try {
          const url = publicHttpsUrl(new URL(subtitle.url, manifestUrl).href);
          return { ...subtitle, url: url.href };
        } catch {
          return { ...subtitle, url: "" };
        }
      }),
    };
  }
  if (resource === "stream" && Array.isArray(data.streams)) {
    return {
      ...data,
      streams: data.streams.map((item: unknown) => {
        if (!item || typeof item !== "object") return item;
        const stream = item as Record<string, unknown>;
        if (typeof stream.url !== "string") return stream;
        try {
          const url = new URL(stream.url, manifestUrl);
          if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
            return { ...stream, url: "" };
          }
          return { ...stream, url: url.href };
        } catch {
          return { ...stream, url: "" };
        }
      }),
    };
  }
  return data;
}

function validType(value: unknown): string {
  if (typeof value !== "string" || !["movie", "series", "anime", "episode"].includes(value)) {
    throw new Error("Invalid content type.");
  }
  return value;
}

function validContentId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) {
    throw new Error("Invalid content ID.");
  }
  return value.trim();
}

async function getOwnedAddon(client: any, userId: string, addonId: unknown) {
  if (typeof addonId !== "string" || !/^[0-9a-f-]{36}$/i.test(addonId)) {
    throw new Error("Invalid addon ID.");
  }
  const { data, error } = await client
    .from("user_addons")
    .select("id,manifest_url,enabled")
    .eq("id", addonId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Source not found for this account.");
  if (!data.enabled) throw new Error("This source is disabled.");
  return { ...data, manifestUrl: validateManifestUrl(data.manifest_url) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return jsonResponse({ error: "A signed-in RAIF account is required." }, 401);
    }
    const token = authorization.slice(7);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !publishableKey) {
      return jsonResponse({ error: "Supabase function configuration is incomplete." }, 500);
    }

    const client = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Your session is invalid or expired." }, 401);
    }

    const rawBody = await req.text();
    if (rawBody.length > 20000) return jsonResponse({ error: "Request is too large." }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON request." }, 400);
    }

    if (body.action === "inspect_url") {
      const manifestUrl = validateManifestUrl(body.manifest_url);
      const manifest = await fetchJson(manifestUrl);
      if (!manifest.id || !Array.isArray(manifest.resources)) {
        return jsonResponse({ error: "Invalid Stremio manifest." }, 422);
      }
      return jsonResponse(manifest);
    }

    const addon = await getOwnedAddon(client, userData.user.id, body.addon_id);
    const manifest = await fetchJson(addon.manifestUrl);
    const resources = resourceNames(manifest);

    if (body.action === "manifest") return jsonResponse(manifest);

    if (body.action === "subtitle_file") {
      if (!resources.includes("subtitles")) throw new Error("This source does not provide subtitles.");
      const type = validType(body.type);
      const contentId = validContentId(body.content_id);
      const subtitleUrl = publicHttpsUrl(body.subtitle_url).href;
      const subtitleData = await fetchJson(addonEndpoint(addon.manifestUrl, ["subtitles", type, contentId]));
      const entries = Array.isArray(subtitleData.subtitles) ? subtitleData.subtitles : [];
      const match = entries.find((entry: unknown) => {
        if (!entry || typeof entry !== "object") return false;
        const value = (entry as Record<string, unknown>).url;
        if (typeof value !== "string") return false;
        try {
          return publicHttpsUrl(new URL(value, addon.manifestUrl).href).href === subtitleUrl;
        } catch {
          return false;
        }
      });
      if (!match) throw new Error("Subtitle URL was not returned by this source.");
      const response = await safeFetch(new URL(subtitleUrl), "text/vtt,text/plain,application/x-subrip,*/*", 12000);
      const content = await responseText(response, 5_000_000);
      return jsonResponse({ content });
    }

    if (body.action !== "resource") throw new Error("Unsupported action.");
    const resource = String(body.resource || "");
    if (!["catalog", "meta", "stream", "subtitles"].includes(resource)) {
      throw new Error("Unsupported add-on resource.");
    }
    if (!resources.includes(resource)) throw new Error("This source does not declare the requested resource.");
    const type = validType(body.type);
    const contentId = validContentId(body.content_id);
    const query = body.query && typeof body.query === "object" && !Array.isArray(body.query)
      ? body.query as Record<string, unknown>
      : {};
    const data = await fetchJson(addonEndpoint(addon.manifestUrl, [resource, type, contentId], query));
    return jsonResponse(normalizeMediaUrls(data, addon.manifestUrl, resource));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected source proxy error.";
    return jsonResponse({ error: message }, 400);
  }
});
