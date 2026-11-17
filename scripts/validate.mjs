import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const js = readFileSync("app.js", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error("Duplicate HTML IDs: " + [...new Set(duplicates)].join(", "));

const selectors = [...js.matchAll(/document\.querySelector(?:All)?\(["']#([^"']+)["']\)/g)]
  .map(match => match[1]);
const dynamicIds = new Set(["toggle-save"]);
const missing = [...new Set(selectors.filter(id => !ids.includes(id) && !dynamicIds.has(id)))];
if (missing.length) throw new Error("JavaScript references missing HTML IDs: " + missing.join(", "));

for (const required of ["auth-dialog", "source-manager", "source-form", "source-list", "detail-dialog", "player-dialog", "raif-video"]) {
  if (!ids.includes(required)) throw new Error("Missing required UI element: " + required);
}
if (!html.includes('type="module"')) throw new Error("app.js must load as an ES module");
if (/service_role|sb_secret_/i.test(js)) throw new Error("A server-side Supabase key must never be shipped to the browser");


for (const required of [
  "addonCatalogIndex.get(identity)",
  "addonDiscoveryCache.add(job.key)",
  "loadMoreCatalogPages()",
  "CATALOG_CACHE_TTL",
  "catalog-load-more",
  "supportsCatalog",
  "روابط التشغيل"
]) {
  if (!js.includes(required) && !html.includes(required)) {
    throw new Error("Missing catalog/source regression guard: " + required);
  }
}
if (/if \(addonDiscoveryCache\.has\(key\)\) return;\s*addonDiscoveryCache\.add\(key\);/.test(js)) {
  throw new Error("Catalog requests must not be cached before a successful response.");
}
if (!js.includes('if(activeView!=="home"){section.hidden=true;return;}')) {
  throw new Error("Recommendations should not recalculate outside the home view.");
}


if (!js.includes("ADDON_MANIFEST_CACHE_TTL") || !js.includes("addonManifestStorageKey")) {
  throw new Error("Persistent add-on Manifest caching is missing.");
}
if (/function clearAddonManifestCache\(\)\s*\{\s*clearAddonManifestCache\(\)/.test(js)) {
  throw new Error("Manifest cache invalidation must not recurse.");
}
if (!js.includes("CATALOG_PAGE_SIZE = 100") || !js.includes("catalogPages")) {
  throw new Error("On-demand catalog pagination state is missing.");
}

console.log("RAIF Web structural, cache, pagination and source regression checks passed.");
