import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const js = readFileSync("app.js", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error("Duplicate HTML IDs: " + [...new Set(duplicates)].join(", "));

const selectors = [...js.matchAll(/document\.querySelector(?:All)?\(["']#([^"']+)["']\)/g)]
  .map(match => match[1]);
const missing = [...new Set(selectors.filter(id => !ids.includes(id)))];
if (missing.length) throw new Error("JavaScript references missing HTML IDs: " + missing.join(", "));

for (const required of ["auth-dialog", "source-manager", "source-form", "source-list", "detail-dialog"]) {
  if (!ids.includes(required)) throw new Error("Missing required UI element: " + required);
}
if (!html.includes('type="module"')) throw new Error("app.js must load as an ES module");
if (/service_role|sb_secret_/i.test(js)) throw new Error("A server-side Supabase key must never be shipped to the browser");

console.log("RAIF Web structural checks passed.");
