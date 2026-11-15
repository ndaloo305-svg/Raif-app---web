import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";

const SUPABASE_URL = "https://puhipyjljmbvczijtzkb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cfCNLzoEfFSf5mLwunrmCw_qDdyWIo7";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const items = [];

let activeFilter = "all";
let activeView = "home";
let currentUser = null;
const SHARED_ACCOUNT_EMAIL = "raif-shared@puhipyjljmbvczijtzkb.supabase.co";
let savedIds = [];
let favoritesLoading = false;
let addons = [];
let addonCatalogItems = [];
let addonCatalogLoading = false;
const addonDiscoveryCache = new Set();
const addonManifestCache = new Map();
const addonDiscoveryErrors = [];
let addonDiscoveryRun = 0;

const catalog = document.querySelector("#catalog");
const search = document.querySelector("#search");
const empty = document.querySelector("#empty");
const authDialog = document.querySelector("#auth-dialog");
const authStatus = document.querySelector("#auth-status");
const accountStatus = document.querySelector("#account-status");
const sourceStatus = document.querySelector("#source-status");
const typeNames = {movie:"فيلم",series:"مسلسل",anime:"أنمي"};

function setStatus(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function updateAuthView() {
  const signedIn = Boolean(currentUser);
  document.querySelector("#auth-form-view").hidden = signedIn;
  document.querySelector("#account-view").hidden = !signedIn;
  document.querySelector("#account-button").textContent = signedIn ? "✓" : "N";
  document.querySelector("#account-button").setAttribute(
    "aria-label",
    signedIn ? "حساب RAIF المشترك" : "إدخال رمز الدخول"
  );
  if (signedIn) {
    document.querySelector("#account-email").textContent = "حساب RAIF المشترك";
  }
}

function itemContentType(item) {
  // The existing RAIF favorites schema supports movie, series and episode.
  // Anime titles are stored as series with their display category retained in metadata.
  return item.type === "movie" ? "movie" : "series";
}

function normalizeTitle(value) {
  return String(value || "").normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLocaleLowerCase("ar").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function catalogIdentity(type, meta) {
  const ids = [meta?.imdb_id, meta?.imdbId, meta?.tmdb_id, meta?.tmdbId, meta?.id].filter(value => typeof value === "string" && /^(tt\d+|\d+)$/i.test(value.trim()));
  if (ids.length) return type + "|id|" + ids[0].toLowerCase();
  const title = normalizeTitle(meta?.name || meta?.title || meta?.id);
  const year = String(meta?.year || "").match(/\d{4}/)?.[0] || "";
  return type + "|title|" + title + "|" + year;
}

function mergeCatalogMeta(addon, entry, meta) {
  if (!meta?.id) return;
  const type = entry.type === "anime" ? "anime" : entry.type;
  const identity = catalogIdentity(type, meta);
  let item = addonCatalogItems.find(candidate => candidate.identity === identity);
  const provider = {addon, catalogEntry:entry, meta};
  if (item) {
    if (!item.providers.some(source => source.addon.id === addon.id && source.meta.id === meta.id)) item.providers.push(provider);
    if (!item.poster && meta.poster) item.poster = meta.poster;
    return;
  }
  addonCatalogItems.push({_kind:"addon",identity,providers:[provider],addon,catalogEntry:entry,meta,id:meta.id,type,title:meta.name || meta.title || meta.id,year:meta.year || "",genre:Array.isArray(meta.genres) ? meta.genres.join("، ") : "",poster:meta.poster || ""});
}

function render() {
  const q = normalizeTitle(search.value);
  const filtered = activeView === "library" ? [] : addonCatalogItems.filter(item => (activeFilter === "all" || item.type === activeFilter || (activeFilter === "series" && item.type === "anime")) && (!q || normalizeTitle([item.title,item.genre,item.year].join(" ")).includes(q)));
  catalog.replaceChildren();
  filtered.forEach(item => {
    const card = document.createElement("article"); card.className = "media-card"; card.tabIndex = 0; card.setAttribute("role","button"); card.setAttribute("aria-label","تفاصيل " + item.title);
    const posterUrl = safeAddonAssetUrl(item.poster, item.addon.manifest_url);
    if (posterUrl) { const poster = document.createElement("img"); poster.className = "poster addon-card-poster"; poster.src = posterUrl.href; poster.alt = ""; poster.loading = "lazy"; poster.referrerPolicy = "no-referrer"; card.append(poster); }
    else { const poster = document.createElement("div"); poster.className = "poster"; const art = document.createElement("span"); art.className = "poster-art"; art.textContent = "RAIF"; poster.append(art); card.append(poster); }
    const label = document.createElement("span"); label.className = "poster-label"; label.textContent = [typeNames[item.type] || item.type,item.year].filter(Boolean).join(" · ");
    const title = document.createElement("div"); title.className = "media-title"; title.textContent = item.title || "عنوان بدون اسم";
    const detail = document.createElement("div"); detail.className = "media-meta"; detail.textContent = [item.genre,item.providers.length + " مصدر"].filter(Boolean).join(" · ");
    card.append(label,title,detail); card.addEventListener("click",() => openAddonMeta(item.addon,item.catalogEntry,item.meta,item.providers));
    card.addEventListener("keydown",event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); card.click(); } }); catalog.append(card);
  });
  const count = document.querySelector("#catalog-count"); if (count) count.textContent = filtered.length ? filtered.length.toLocaleString("ar") + " عنوان موحّد · " + filtered.reduce((sum,item) => sum + item.providers.length,0).toLocaleString("ar") + " نتائج مصادر" : "";
  if (activeView === "library" && !currentUser) empty.textContent = "سجّل الدخول أولاً لعرض مكتبتك المحفوظة.";
  else if (activeView === "library") empty.textContent = "المكتبة المحفوظة ستظهر هنا بعد ربط حفظ عناوين الإضافات.";
  else if (!currentUser) empty.textContent = "سجّل الدخول أولاً لتحميل كتالوجات مصادرك.";
  else if (addonCatalogLoading && !filtered.length) empty.textContent = "جارٍ تحميل الكتالوجات من مصادرك… ستظهر النتائج تباعاً.";
  else if (!filtered.length && addonDiscoveryErrors.length) empty.textContent = "لم تصل عناوين. تعذّر تحميل " + addonDiscoveryErrors.length + " طلباً. افتح مصادري لمعرفة التفاصيل.";
  else if (!filtered.length) empty.textContent = "لا توجد عناوين من المصادر المفعّلة لهذا القسم.";
  else empty.textContent = "";
  empty.hidden = filtered.length > 0;
}

async function loadFavorites() {
  if (!currentUser) {
    savedIds = [];
    favoritesLoading = false;
    render();
    return;
  }
  favoritesLoading = true;
  render();
  const { data, error } = await supabase
    .from("favorites")
    .select("content_id, metadata")
    .eq("user_id", currentUser.id);

  favoritesLoading = false;
  if (error) {
    setStatus(accountStatus, "تعذر تحميل المكتبة: " + error.message, true);
    render();
    return;
  }

  savedIds = (data || [])
    .map(row => Number(row.metadata?.demo_id))
    .filter(id => Number.isInteger(id) && items.some(item => item.id === id));

  await migrateLocalFavorites();
  render();
}

async function migrateLocalFavorites() {
  if (!currentUser) return;
  let oldIds = [];
  try {
    const stored = JSON.parse(localStorage.getItem("raif-web-saved-items") || "[]");
    if (Array.isArray(stored)) oldIds = stored.filter(Number.isInteger);
  } catch {
    oldIds = [];
  }
  const pending = oldIds.filter(id => items.some(item => item.id === id) && !savedIds.includes(id));
  if (!pending.length) return;

  const rows = pending.map(id => {
    const item = items.find(entry => entry.id === id);
    return {
      user_id: currentUser.id,
      content_id: `demo-${item.id}`,
      content_type: itemContentType(item),
      metadata: {
        demo_id: item.id,
        title: item.title,
        year: item.year,
        genre: item.genre,
        catalog_type: item.type
      }
    };
  });
  const { error } = await supabase.from("favorites").upsert(rows, {
    onConflict: "user_id,content_id,content_type",
    ignoreDuplicates: true
  });
  if (!error) {
    localStorage.removeItem("raif-web-saved-items");
    savedIds = [...new Set([...savedIds, ...pending])];
  } else {
    setStatus(accountStatus, "تعذر نقل العناصر المحفوظة القديمة: " + error.message, true);
  }
}

async function toggleFavorite(item) {
  if (!currentUser) {
    setStatus(authStatus, "سجّل الدخول أولاً حتى تُحفظ مكتبتك في حسابك.");
    authDialog.showModal();
    return;
  }

  const button = document.querySelector("#toggle-save");
  if (button) button.disabled = true;
  const contentId = `demo-${item.id}`;
  const contentType = itemContentType(item);
  let error;

  if (savedIds.includes(item.id)) {
    ({ error } = await supabase.from("favorites")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("content_id", contentId)
      .eq("content_type", contentType));
    if (!error) savedIds = savedIds.filter(id => id !== item.id);
  } else {
    ({ error } = await supabase.from("favorites").insert({
      user_id: currentUser.id,
      content_id: contentId,
      content_type: contentType,
      metadata: {
        demo_id: item.id,
        title: item.title,
        year: item.year,
        genre: item.genre,
        catalog_type: item.type
      }
    }));
    if (!error) savedIds = [...savedIds, item.id];
  }

  if (error) {
    setStatus(accountStatus, "تعذر تحديث المكتبة: " + error.message, true);
    if (button) button.disabled = false;
    return;
  }

  setStatus(accountStatus, "تم تحديث مكتبتك ومزامنتها مع RAIF.");
  if (button) {
    button.textContent = savedIds.includes(item.id) ? "إزالة من مكتبتي" : "＋ أضف إلى مكتبتي";
    button.disabled = false;
  }
  if (activeView === "library") render();
}

function openDetail(id) {
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  const isSaved = savedIds.includes(item.id);
  document.querySelector("#detail-content").innerHTML = `
    <span class="eyebrow">${typeNames[item.type]} · ${item.year}</span>
    <h2>${item.title}</h2>
    <p>${item.description}</p>
    <button class="save-btn" id="toggle-save" type="button">${isSaved ? "إزالة من مكتبتي" : "＋ أضف إلى مكتبتي"}</button>
    <div class="detail-note">حالة المحتوى: بيانات تجريبية. المفضلة تُحفظ في حساب RAIF بعد تسجيل الدخول، أما مصادر البث فلم تُربط بعد.</div>
  `;
  document.querySelector("#toggle-save").addEventListener("click", () => toggleFavorite(item));
  document.querySelector("#detail-dialog").showModal();
}

async function loadSources() {
  const list = document.querySelector("#source-list");
  list.replaceChildren();
  if (!currentUser) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "سجّل الدخول لإدارة مصادر حسابك.";
    list.append(message);
    return;
  }

  const { data, error } = await supabase.from("user_addons")
    .select("id,addon_id,name,manifest_url,enabled,config,created_at")
    .order("created_at", {ascending:false});

  if (error) {
    setStatus(sourceStatus, "تعذر تحميل المصادر: " + error.message, true);
    return;
  }
  addons = data || [];
  if (!addons.length) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "لم تضف أي مصادر بعد.";
    list.append(message);
    return;
  }

  addons.forEach(addon => {
    const card = document.createElement("article");
    card.className = "source-card";
    const identity = document.createElement("div");
    identity.className = "source-identity";
    const logo = document.createElement("div");
    logo.className = "source-logo";
    logo.textContent = "R";
    identity.append(logo);
    const details = document.createElement("div");
    details.className = "source-details";
    const name = document.createElement("strong");
    name.textContent = addon.name || addon.addon_id;
    const url = document.createElement("span");
    url.textContent = addon.manifest_url;
    details.append(name, url);
    identity.append(details);

    const actions = document.createElement("div");
    actions.className = "source-actions";
    const browse = document.createElement("button");
    browse.className = "save-btn";
    browse.type = "button";
    browse.textContent = "عرض الكتالوج";
    browse.disabled = !addon.enabled;
    browse.addEventListener("click", () => inspectAddon(addon));
    const toggle = document.createElement("button");
    toggle.className = "save-btn";
    toggle.type = "button";
    toggle.textContent = addon.enabled ? "تعطيل" : "تفعيل";
    toggle.addEventListener("click", () => updateSource(addon.id, {enabled:!addon.enabled}));
    const remove = document.createElement("button");
    remove.className = "source-remove";
    remove.type = "button";
    remove.textContent = "حذف";
    remove.addEventListener("click", () => deleteSource(addon.id));
    actions.append(browse, toggle, remove);
    card.append(identity, actions);
    list.append(card);
  });
}

const addonCatalogResults = document.querySelector("#source-catalog-results");
addonCatalogResults.className = "addon-catalog-results";
addonCatalogResults.setAttribute("aria-live", "polite");

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function safeAddonAssetUrl(value, manifestUrl) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, manifestUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

async function invokeAddonProxy(body, label = "المصدر") {
  const {data, error} = await supabase.functions.invoke("raif-addon-proxy", {body});
  if (error) throw new Error("تعذر الاتصال بخدمة " + label + ": " + error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

function fetchAddonResource(addon, resource, type, contentId, query = {}) {
  if (resource === "manifest" && addonManifestCache.has(addon.id)) return addonManifestCache.get(addon.id);
  const request = invokeAddonProxy({
    action: resource === "manifest" ? "manifest" : "resource",
    addon_id: addon.id,
    resource,
    type,
    content_id: contentId,
    query
  }, resource === "manifest" ? "Manifest" : resource);
  if (resource === "manifest") {
    const cached = request.catch(error => { addonManifestCache.delete(addon.id); throw error; });
    addonManifestCache.set(addon.id, cached);
    return cached;
  }
  return request;
}

function fetchAddonManifestByUrl(manifestUrl) {
  return invokeAddonProxy({action:"inspect_url", manifest_url:manifestUrl}, "Manifest");
}

async function loadAddonDiscovery(view = activeView) {
  if (!currentUser || view === "library" || view === "sources") return;
  const run = ++addonDiscoveryRun;
  const wanted = view === "movies" ? ["movie"] : view === "series" ? ["series"] : view === "anime" ? ["anime","series"] : ["movie","series","anime"];
  const enabled = addons.filter(addon => addon.enabled);
  addonCatalogLoading = true; addonDiscoveryErrors.length = 0; render();
  if (!enabled.length) { addonCatalogLoading = false; render(); return; }
  const withTimeout = (promise,label,ms=14000) => Promise.race([promise,new Promise((_,reject) => setTimeout(() => reject(new Error("انتهت مهلة الاتصال: " + label)),ms))]);
  const getManifest = addon => {
    if (!addonManifestCache.has(addon.id)) {
      const request = withTimeout(fetchAddonResource(addon,"manifest"),"Manifest");
      addonManifestCache.set(addon.id,request.catch(error => { addonManifestCache.delete(addon.id); throw error; }));
    }
    return addonManifestCache.get(addon.id);
  };
  let cursor=0;
  const worker=async () => {
    while (cursor < enabled.length) {
      const addon=enabled[cursor++];
      try {
        const manifest=await getManifest(addon);
        const resources=Array.isArray(manifest?.resources) ? manifest.resources.map(resource => typeof resource === "string" ? resource : resource?.name) : [];
        if (!resources.includes("catalog")) continue;
        const entries=(Array.isArray(manifest?.catalogs) ? manifest.catalogs : []).filter(entry => entry?.id && wanted.includes(entry.type));
        for (const entry of entries) {
          const key=addon.id + "|" + entry.type + "|" + entry.id;
          if (addonDiscoveryCache.has(key)) continue;
          addonDiscoveryCache.add(key);
          try {
            const data=await withTimeout(fetchAddonResource(addon,"catalog",entry.type,entry.id,{skip:0}),"كتالوج " + (entry.name || entry.id));
            (Array.isArray(data?.metas) ? data.metas : []).forEach(meta => mergeCatalogMeta(addon,entry,meta));
            render();
          } catch(error) {
            addonDiscoveryCache.delete(key);
            addonDiscoveryErrors.push({addon:addon.name || addon.addon_id,catalog:entry.name || entry.id,message:error.message});
            console.warn("RAIF catalog load failed:",addon.name,entry.id,error);
          }
        }
      } catch(error) {
        addonDiscoveryErrors.push({addon:addon.name || addon.addon_id,message:error.message});
        console.warn("RAIF manifest load failed:",addon.name,error);
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(5,enabled.length)},() => worker()));
  if (run === addonDiscoveryRun) { addonCatalogLoading=false; render(); renderDiscoveryDiagnostics(); }
}

function renderDiscoveryDiagnostics() {
  const panel=document.querySelector("#catalog-diagnostics"); if (!panel) return; panel.replaceChildren();
  const heading=document.createElement("strong"); heading.textContent="حالة جلب الكتالوجات";
  const summary=document.createElement("span"); summary.textContent=addonCatalogItems.length.toLocaleString("ar") + " عنوان موحّد من " + addons.filter(addon => addon.enabled).length.toLocaleString("ar") + " مصدر مفعّل.";
  panel.append(heading,summary);
  if (addonDiscoveryErrors.length) {
    const details=document.createElement("details"); const label=document.createElement("summary"); label.textContent="تعذّر تحميل " + addonDiscoveryErrors.length + " طلباً — اضغط للتفاصيل"; details.append(label);
    addonDiscoveryErrors.forEach(error => { const line=document.createElement("p"); line.textContent=[error.addon,error.catalog,error.message].filter(Boolean).join(" · "); details.append(line); }); panel.append(details);
  }
}

function renderAddonMessage(message, isError = false) {
  addonCatalogResults.replaceChildren();
  const note = document.createElement("p");
  note.className = isError ? "auth-status is-error" : "empty-state";
  note.textContent = message;
  addonCatalogResults.append(note);
}

async function inspectAddon(addon) {
  if (!addon.enabled) return;
  renderAddonMessage("جارٍ قراءة Manifest للمصدر...");
  addonCatalogResults.scrollIntoView({behavior: "smooth", block: "start"});
  try {
    const manifestUrl = safeHttpsUrl(addon.manifest_url);
    if (!manifestUrl) throw new Error("الرابط غير آمن. استخدم رابط HTTPS صحيحاً.");
    const manifest = await fetchAddonResource(addon, "manifest");
    if (!manifest || typeof manifest !== "object" || !manifest.id || !manifest.name ||
        !Array.isArray(manifest.resources) || !Array.isArray(manifest.catalogs)) {
      throw new Error("ملف Manifest لا يطابق بنية إضافة Stremio المتوقعة.");
    }
    if (manifestHasUnsupportedDelivery(manifest)) {
      throw new Error("استُبعد المصدر لأنه يعلن عن Torrent أو Debrid أو P2P.");
    }
    const resourceNames = manifest.resources.map(resource =>
      typeof resource === "string" ? resource : resource?.name
    ).filter(Boolean);
    const supportsCatalog = resourceNames.includes("catalog");
    if (!supportsCatalog || manifest.catalogs.length === 0) {
      if (resourceNames.includes("subtitles")) {
        renderAddonMessage("هذا مصدر ترجمات. ستظهر ترجماته عند فتح عنوان من أحد كتالوجات RAIF.");
        return;
      }
      throw new Error("هذا المصدر لا يعلن عن كتالوج قابل للعرض أو مورد ترجمات.");
    }

    addonCatalogResults.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "addon-results-heading";
    const title = document.createElement("h3");
    title.textContent = manifest.name;
    const subtitle = document.createElement("p");
    subtitle.textContent = manifest.description || "اختر كتالوجاً لعرض عناوينه.";
    const manifestIcon = safeAddonAssetUrl(manifest.logo || manifest.icon, manifestUrl.href);
    if (manifestIcon) {
      const icon = document.createElement("img");
      icon.className = "addon-manifest-icon";
      icon.src = manifestIcon.href;
      icon.alt = "";
      icon.loading = "lazy";
      icon.referrerPolicy = "no-referrer";
      icon.onerror = () => icon.remove();
      heading.append(icon);
    }
    const headingText = document.createElement("div");
    headingText.className = "addon-heading-text";
    headingText.append(title, subtitle);
    heading.append(headingText);
    addonCatalogResults.append(heading);

    const catalogButtons = document.createElement("div");
    catalogButtons.className = "addon-catalog-buttons";
    manifest.catalogs.forEach(entry => {
      if (!entry || !entry.type || !entry.id) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter";
      button.textContent = entry.name || (entry.type + " · " + entry.id);
      button.addEventListener("click", () => configureAddonCatalog(addon, entry, button));
      catalogButtons.append(button);
    });
    addonCatalogResults.append(catalogButtons);
    if (!catalogButtons.childElementCount) throw new Error("لم يعثر Manifest على كتالوجات صالحة.");
  } catch (error) {
    renderAddonMessage("تعذر قراءة المصدر: " + error.message, true);
  }
}


let activeHlsPlayer = null;
let activeDashPlayer = null;
let selectedSubtitle = null;

function applySelectedSubtitle(video) {
  video.querySelectorAll('track[data-raif-subtitle="true"]').forEach(track => track.remove());
  if (!selectedSubtitle?.objectUrl) return;
  const track = document.createElement("track");
  track.kind = "subtitles";
  track.label = selectedSubtitle.label || "ترجمة";
  track.srclang = selectedSubtitle.language || "und";
  track.src = selectedSubtitle.objectUrl;
  track.default = true;
  track.dataset.raifSubtitle = "true";
  video.append(track);
  track.addEventListener("load", () => {
    for (const item of video.textTracks) item.mode = item === track.track ? "showing" : "disabled";
  }, {once:true});
}

function setSelectedSubtitle(subtitle) {
  if (selectedSubtitle?.objectUrl) URL.revokeObjectURL(selectedSubtitle.objectUrl);
  selectedSubtitle = subtitle;
  const video = document.querySelector("#raif-video");
  if (video) applySelectedSubtitle(video);
}

function subtitleToVtt(raw) {
  let value = String(raw || "").replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (!value) throw new Error("ملف الترجمة فارغ.");
  if (/^WEBVTT(?:\s|$)/i.test(value)) return value;
  value = value
    .replace(/^(\d+)\s*\n(?=\d{2}:\d{2}:\d{2}[,.])/gm, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  if (!/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->/.test(value)) {
    throw new Error("صيغة الترجمة غير مدعومة؛ نحتاج WebVTT أو SRT.");
  }
  return "WEBVTT\n\n" + value;
}

async function fetchSubtitleFile(subtitle, catalogEntry, meta) {
  const {data, error} = await supabase.functions.invoke("raif-addon-proxy", {
    body: {
      action:"subtitle_file",
      addon_id:subtitle.addonId,
      type:catalogEntry.type,
      content_id:meta.id,
      subtitle_url:subtitle.url
    }
  });
  if (error) throw new Error("تعذر تحميل الترجمة: " + error.message);
  if (typeof data?.content !== "string") throw new Error(data?.error || "ملف الترجمة غير صالح.");
  const vtt = subtitleToVtt(data.content);
  return URL.createObjectURL(new Blob([vtt], {type:"text/vtt;charset=utf-8"}));
}

async function findSubtitles(meta, catalogEntry, area, button) {
  area.replaceChildren();
  button.disabled = true;
  button.textContent = "جارٍ البحث عن الترجمات...";
  const candidates = addons.filter(addon => addon.enabled && (
    (Array.isArray(addon.config?.resources) && addon.config.resources.includes("subtitles")) ||
    /subtito|subsource|subdl|submaker|opensubtitles/i.test(addon.name || "")
  ));
  if (!candidates.length) {
    const note = document.createElement("p");
    note.textContent = "لم يتم إعداد أي مصدر ترجمات بعد. أضف Subtito أو SubSource أو SubDL أو OpenSubtitles.";
    area.append(note);
    button.disabled = false;
    button.textContent = "البحث عن الترجمات";
    return;
  }
  const results = await Promise.allSettled(candidates.map(async addon => {
    const data = await fetchAddonResource(addon, "subtitles", catalogEntry.type, meta.id);
    return (Array.isArray(data?.subtitles) ? data.subtitles : [])
      .filter(entry => typeof entry?.url === "string" && safeHttpsUrl(entry.url))
      .map(entry => ({
        url: entry.url,
        addonId: addon.id,
        label: [entry.lang || entry.language || "ترجمة", addon.name].filter(Boolean).join(" · "),
        language: /^[a-z]{2,3}(?:-[a-z0-9]+)?$/i.test(entry.langCode || "") ? entry.langCode : "und"
      }));
  }));
  const subtitles = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  if (!subtitles.length) {
    const note = document.createElement("p");
    note.textContent = "لم تُرجع المصادر ترجمات لهذا العنوان، أو تعذر الوصول إلى أحدها.";
    area.append(note);
  } else {
    subtitles.forEach((subtitle, index) => {
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "save-btn subtitle-choice";
      choose.textContent = subtitle.label || ("ترجمة " + (index + 1));
      choose.addEventListener("click", async () => {
        choose.disabled = true;
        choose.textContent = "جارٍ تحميل الترجمة...";
        try {
          const objectUrl = await fetchSubtitleFile(subtitle, catalogEntry, meta);
          setSelectedSubtitle({objectUrl, label:subtitle.label, language:subtitle.language});
          choose.textContent = "✓ " + (subtitle.label || "تم اختيار الترجمة");
          area.querySelectorAll("button").forEach(item => { if (item !== choose) item.disabled = true; });
        } catch (error) {
          choose.disabled = false;
          choose.textContent = "تعذر التحميل — حاول مجدداً";
          const note = document.createElement("small");
          note.className = "is-error";
          note.textContent = error.message;
          area.append(note);
        }
      });
      area.append(choose);
    });
  }
  button.disabled = false;
  button.textContent = "إعادة البحث عن الترجمات";
}

function disposeStreamPlayer() {
  const video = document.querySelector("#raif-video");
  if (activeHlsPlayer) { activeHlsPlayer.destroy(); activeHlsPlayer = null; }
  if (activeDashPlayer) { activeDashPlayer.reset(); activeDashPlayer = null; }
  if (video) {
    video.pause();
    video.querySelectorAll('track[data-raif-subtitle="true"]').forEach(track => track.remove());
    video.removeAttribute("src");
    video.load();
  }
}
async function openStreamPlayer(rawUrl, title = "RAIF Player", stream = {}) {
  let target;
  try { target = new URL(rawUrl); } catch { throw new Error("رابط التشغيل غير صالح."); }
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password) throw new Error("المشغل يقبل روابط HTTP وHTTPS فقط.");
  if (target.protocol === "http:" && location.protocol === "https:") throw new Error("المتصفح يمنع تشغيل HTTP داخل صفحة HTTPS. استخدم رابط HTTPS.");
  const dialog = document.querySelector("#player-dialog");
  const video = document.querySelector("#raif-video");
  const status = document.querySelector("#player-status");
  document.querySelector("#player-title").textContent = title;
  status.textContent = "جارٍ تجهيز المشغل...";
  status.classList.remove("is-error");
  disposeStreamPlayer();
  applySelectedSubtitle(video);
  dialog.showModal();
  const mime = String(stream.behaviorHints?.mimeType || stream.mimeType || stream.type || "").toLowerCase();
  const filename = String(stream.behaviorHints?.filename || stream.filename || "");
  const mediaHint = (target.pathname + " " + filename).toLowerCase();
  const isHls = /\.m3u8(?:$|[?#\s])/.test(mediaHint) || /mpegurl|vnd\.apple\.mpegurl/.test(mime);
  const isDash = /\.mpd(?:$|[?#\s])/.test(mediaHint) || /dash\+xml/.test(mime);
  video.onerror = () => { status.textContent = "تعذر تشغيل الرابط. تأكد أن الرابط ملف وسائط مباشر، وأن الخادم يسمح بالوصول من المتصفح (CORS)."; status.classList.add("is-error"); };
  video.onplaying = () => { status.textContent = "يتم التشغيل داخل RAIF."; status.classList.remove("is-error"); };
  const startPlayback = () => video.play().catch(error => {
    status.textContent = error?.name === "NotSupportedError"
      ? "صيغة الفيديو غير مدعومة في متصفحك. اختر رابط HLS أو MP4 من المصادر."
      : "تعذر بدء التشغيل تلقائياً؛ اضغط زر التشغيل داخل الفيديو.";
    status.classList.add("is-error");
  });
  if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = target.href;
    status.textContent = "جارٍ بدء بث HLS...";
    startPlayback();
  } else if (isHls) {
    try {
      const {default: Hls} = await import("https://esm.sh/hls.js@1.6.13");
      if (!Hls.isSupported()) throw new Error("المتصفح لا يدعم HLS عبر Media Source Extensions.");
      activeHlsPlayer = new Hls({enableWorker:true, lowLatencyMode:false, maxBufferLength:30});
      activeHlsPlayer.attachMedia(video);
      activeHlsPlayer.on(Hls.Events.MEDIA_ATTACHED, () => activeHlsPlayer?.loadSource(target.href));
      activeHlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
        status.textContent = "تم تحميل قائمة HLS. جارٍ التشغيل...";
        startPlayback();
      });
      activeHlsPlayer.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) { status.textContent = "تعذر تشغيل HLS. تحقق من الرابط ودعم CORS."; status.classList.add("is-error"); }
      });
    } catch (error) { status.textContent = "تعذر تجهيز HLS: " + error.message; status.classList.add("is-error"); }
  } else if (isDash) {
    try {
      const module = await import("https://esm.sh/dashjs@5.0.3");
      const dashjs = module.default || module;
      activeDashPlayer = dashjs.MediaPlayer().create();
      activeDashPlayer.initialize(video, target.href, false);
      activeDashPlayer.on(dashjs.MediaPlayer.events.ERROR, () => {
        status.textContent = "تعذر تشغيل DASH. تحقق من الرابط ودعم CORS.";
        status.classList.add("is-error");
      });
      status.textContent = "تم تحميل مشغل DASH. جارٍ التشغيل...";
      startPlayback();
    } catch (error) { status.textContent = "تعذر تجهيز DASH: " + error.message; status.classList.add("is-error"); }
  } else {
    video.src = target.href;
    status.textContent = "جارٍ بدء تشغيل الفيديو...";
    startPlayback();
  }
}

async function openAddonMeta(addon, catalogEntry, catalogMeta, providers = [{addon,catalogEntry,meta:catalogMeta}]) {
  setSelectedSubtitle(null);
  const dialog = document.querySelector("#detail-dialog");
  const content = document.querySelector("#detail-content");
  content.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = catalogMeta.name || catalogMeta.id || "تفاصيل العنوان";
  const summary = document.createElement("p");
  summary.textContent = "جارٍ تحميل تفاصيل العنوان...";
  content.append(heading, summary);
  dialog.showModal();

  try {
    const result = await fetchAddonResource(addon, "meta", catalogEntry.type, catalogMeta.id);
    const meta = result?.meta || catalogMeta;
    summary.textContent = meta.description || "لا توجد تفاصيل إضافية لهذا العنوان.";
    const facts = document.createElement("p");
    facts.textContent = [meta.year, meta.runtime, ...(Array.isArray(meta.genres) ? meta.genres : [])]
      .filter(Boolean).join(" · ");
    content.append(facts);
    const sourceInfo = document.createElement("p");
    sourceInfo.className = "detail-note";
    sourceInfo.textContent = "المصادر التي وفّرت هذا العنوان: " + [...new Set(providers.map(source => source.addon.name || source.addon.addon_id))].join("، ");
    content.append(sourceInfo);

    if (typeof meta.poster === "string" && safeHttpsUrl(meta.poster)) {
      const poster = document.createElement("img");
      poster.src = meta.poster;
      poster.alt = "";
      poster.loading = "lazy";
      poster.referrerPolicy = "no-referrer";
      poster.className = "addon-detail-poster";
      content.prepend(poster);
    }

    let selectedVideoId = null;
    if (catalogEntry.type === "series" && Array.isArray(meta.videos) && meta.videos.length) {
      selectedVideoId = meta.videos[0]?.id || null;
      const episodeLabel = document.createElement("label");
      episodeLabel.className = "episode-select-label";
      episodeLabel.textContent = "اختر الموسم والحلقة";
      const episodeSelect = document.createElement("select");
      episodeSelect.className = "episode-select";
      meta.videos.forEach((video, index) => {
        if (!video?.id) return;
        const option = document.createElement("option");
        option.value = video.id;
        option.textContent = [
          video.season != null ? "الموسم " + video.season : "",
          video.episode != null ? "الحلقة " + video.episode : "",
          video.title || ("حلقة " + (index + 1))
        ].filter(Boolean).join(" · ");
        episodeSelect.append(option);
      });
      episodeSelect.value = selectedVideoId || "";
      episodeSelect.addEventListener("change", () => {
        selectedVideoId = episodeSelect.value || null;
        streamsArea.replaceChildren();
        streamsButton.textContent = "عرض مصادر تشغيل الحلقة";
      });
      content.append(episodeLabel, episodeSelect);
    }

    const subtitleButton = document.createElement("button");
    subtitleButton.type = "button";
    subtitleButton.className = "save-btn";
    subtitleButton.textContent = "البحث عن الترجمات";
    const subtitleArea = document.createElement("div");
    subtitleArea.className = "addon-subtitle-list";
    subtitleButton.addEventListener("click", () => findSubtitles(meta, catalogEntry, subtitleArea, subtitleButton));
    content.append(subtitleButton, subtitleArea);

    const streamsButton = document.createElement("button");
    streamsButton.type = "button";
    streamsButton.className = "primary-btn";
    streamsButton.textContent = "عرض مصادر التشغيل";
    const streamsArea = document.createElement("div");
    streamsArea.className = "addon-stream-list";
    streamsButton.addEventListener("click", async () => {
      streamsButton.disabled = true;
      streamsButton.textContent = "جارٍ البحث عن المصادر...";
      streamsArea.replaceChildren();
      try {
        // Catalog/metadata add-ons are often separate from stream-provider add-ons.
        // Query every enabled add-on that actually declares the stream resource.
        const providers = addons.filter(candidate => candidate.enabled);
        const settled = await Promise.allSettled(providers.map(async candidate => {
          const manifest = await fetchAddonResource(candidate, "manifest");
          const resources = Array.isArray(manifest?.resources) ? manifest.resources.map(resource =>
            typeof resource === "string" ? resource : resource?.name
          ) : [];
          if (!resources.includes("stream")) return [];
          const streamData = await fetchAddonResource(candidate, "stream", catalogEntry.type, meta.id,
            selectedVideoId ? {videoId:selectedVideoId} : {});
          return (Array.isArray(streamData?.streams) ? streamData.streams : [])
            .map(stream => ({...stream, _raifProviderName:candidate.name || candidate.addon_id}));
        }));
        const failedProviders = settled.filter(result => result.status === "rejected").length;
        const rawStreams = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
        const streams = rawStreams.filter(stream => {
          const streamLabel = [stream?.name, stream?.title, stream?.description].filter(Boolean).join(" ");
          if (/\b(?:torrent|debrid|real[- ]?debrid|peer[- ]?to[- ]?peer|p2p)\b/i.test(streamLabel)) return false;
          if (stream?.infoHash || stream?.behaviorHints?.notWebReady) return false;
          if (typeof stream?.url !== "string") return false;
          try { const url = new URL(stream.url); return url.protocol === "https:" && !url.username && !url.password && !/\.torrent$/i.test(url.pathname); }
          catch { return false; }
        });
        const playbackPriority = stream => {
          let path = "";
          try { path = new URL(stream.url).pathname.toLowerCase(); } catch {}
          const mime = String(stream.behaviorHints?.mimeType || stream.mimeType || stream.type || "").toLowerCase();
          if (/\.m3u8$/i.test(path) || /mpegurl/.test(mime)) return 0;
          if (/\.(mp4|m4v)$/i.test(path) || /video\/mp4/.test(mime)) return 1;
          if (/\.mpd$/i.test(path) || /dash\+xml/.test(mime)) return 2;
          if (/\.webm$/i.test(path) || /video\/webm/.test(mime)) return 3;
          if (/\.(mkv|avi|wmv|flv)$/i.test(path)) return 20;
          return 5;
        };
        streams.sort((a, b) => playbackPriority(a) - playbackPriority(b));
        if (!streams.length) {
          const note = document.createElement("p");
          note.textContent = failedProviders && !rawStreams.length
            ? "تعذر الاتصال بمصادر البث. تحقق من الإضافات التي توفر التشغيل أو أعد المحاولة."
            : rawStreams.length
              ? "المصادر أعادت روابط غير مباشرة أو غير مدعومة في مشغل الويب."
              : "لم تُرجع إضافات البث المفعّلة روابط لهذا العنوان.";
          streamsArea.append(note);
        }
        streams.forEach((stream, index) => {
          const row = document.createElement("article");
          row.className = "addon-stream-row";
          const name = document.createElement("strong");
          name.textContent = [stream.name || stream.title || ("مصدر " + (index + 1)), stream._raifProviderName].filter(Boolean).join(" · ");
          const description = document.createElement("p");
          description.textContent = stream.description || stream.behaviorHints?.filename || "";
          row.append(name, description);
          if (typeof stream.url === "string") {
            let target;
            try { target = new URL(stream.url); } catch { target = null; }
            if (target && ["https:", "http:"].includes(target.protocol) && !target.username && !target.password) {
              const link = document.createElement("a");
              link.href = target.href;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = "فتح رابط المصدر";
              row.append(link);
              const unsupportedContainer = /\.(mkv|avi|wmv|flv)$/i.test(target.pathname) &&
                !/video\/(mp4|webm)/i.test(String(stream.behaviorHints?.mimeType || stream.mimeType || ""));
              if (unsupportedContainer) {
                const note = document.createElement("small");
                note.textContent = "هذا الملف بصيغة لا يدعمها مشغل الويب مباشرة. اختر رابط HLS أو MP4 من المصادر.";
                row.append(note);
              } else {
                const play = document.createElement("button");
                play.type = "button";
                play.className = "save-btn stream-play-btn";
                play.textContent = "تشغيل داخل RAIF";
                play.addEventListener("click", async () => {
                  try { await openStreamPlayer(target.href, name.textContent, stream); }
                  catch (error) {
                    const note = document.createElement("small");
                    note.className = "is-error";
                    note.textContent = error.message;
                    row.append(note);
                  }
                });
                row.append(play);
              }
              if (target.protocol === "http:" && location.protocol === "https:") {
                const warning = document.createElement("small");
                warning.textContent = "قد يمنع المتصفح فتح HTTP من صفحة HTTPS.";
                row.append(warning);
              }
            }
          } else if (stream.externalUrl) {
            const external = safeAddonAssetUrl(stream.externalUrl, addon.manifest_url);
            const note = document.createElement("small");
            note.textContent = external ? "هذا المصدر يتطلب فتح خدمة خارجية." : "رابط خارجي غير صالح.";
            row.append(note);
            if (external) {
              const link = document.createElement("a");
              link.href = external.href;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = "فتح خدمة المشاهدة";
              row.append(link);
            }
          } else if (stream.infoHash) {
            const note = document.createElement("small");
            note.textContent = "هذا مصدر Torrent. يحتاج محرك Torrent مدمجاً، ولا يمكن تشغيله بمشغل الفيديو المباشر الحالي.";
            row.append(note);
          } else if (stream.ytId) {
            const note = document.createElement("small");
            note.textContent = "هذا المصدر معرّف فيديو خارجي، وليس رابط ملف مباشر.";
            row.append(note);
          }
          streamsArea.append(row);
        });
      } catch (error) {
        const note = document.createElement("p");
        note.className = "auth-status is-error";
        note.textContent = "تعذر جلب المصادر: " + error.message;
        streamsArea.append(note);
      } finally {
        streamsButton.disabled = false;
        streamsButton.textContent = "تحديث مصادر التشغيل";
      }
    });
    content.append(streamsButton, streamsArea);
  } catch (error) {
    summary.textContent = "تعذر تحميل التفاصيل: " + error.message;
    summary.classList.add("is-error");
  }
}

function configureAddonCatalog(addon, entry, activeButton) {
  addonCatalogResults.querySelector(".addon-extra-form")?.remove();
  const specs = Array.isArray(entry.extra) ? entry.extra : [];
  const required = Array.isArray(entry.extraRequired) ? entry.extraRequired : [];
  const names = [...new Set([...required, ...specs.map(spec => spec?.name).filter(Boolean)])];
  if (!names.length) {
    loadAddonCatalog(addon, entry, activeButton, {});
    return;
  }

  const form = document.createElement("form");
  form.className = "addon-extra-form";
  const heading = document.createElement("strong");
  heading.textContent = "خيارات الكتالوج";
  form.append(heading);

  names.slice(0, 8).forEach(name => {
    const spec = specs.find(item => item?.name === name) || {};
    const isRequired = required.includes(name) || spec.isRequired === true;
    const label = document.createElement("label");
    label.textContent = name + (isRequired ? " *" : "");
    let field;
    if (Array.isArray(spec.options) && spec.options.length) {
      field = document.createElement("select");
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = isRequired ? "اختر قيمة" : "الكل";
      field.append(emptyOption);
      spec.options.forEach(option => {
        const item = document.createElement("option");
        item.value = String(option);
        item.textContent = String(option);
        field.append(item);
      });
    } else {
      field = document.createElement("input");
      field.type = name === "skip" ? "number" : "text";
      if (name === "skip") {
        field.min = "0";
        field.value = "0";
      }
      field.placeholder = name === "search" ? "اكتب كلمة البحث" : name;
    }
    field.name = name;
    field.required = isRequired;
    label.append(field);
    form.append(label);
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary-btn";
  submit.textContent = "تطبيق وعرض العناوين";
  form.append(submit);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const params = {};
    new FormData(form).forEach((value, key) => {
      if (String(value).trim() !== "") params[key] = String(value).trim();
    });
    loadAddonCatalog(addon, entry, activeButton, params);
  });
  addonCatalogResults.querySelector(".addon-extra-form")?.remove();
  addonCatalogResults.querySelector(".addon-catalog-buttons")?.after(form);
}

async function loadAddonCatalog(addon, entry, activeButton, extra = {}) {
  addonCatalogResults.querySelectorAll(".addon-catalog-buttons button")
    .forEach(button => button.classList.toggle("active", button === activeButton));
  const results = document.createElement("div");
  results.className = "addon-meta-grid";
  const loading = document.createElement("p");
  loading.className = "empty-state";
  loading.textContent = "جارٍ تحميل العناوين...";
  addonCatalogResults.querySelector(".addon-meta-grid")?.remove();
  addonCatalogResults.append(loading);
  try {
    const data = await fetchAddonResource(addon, "catalog", entry.type, entry.id, {skip:0, ...extra});
    const metas = Array.isArray(data?.metas) ? data.metas : [];
    loading.remove();
    if (!metas.length) {
      const note = document.createElement("p");
      note.className = "empty-state";
      note.textContent = "هذا الكتالوج لا يحتوي على عناوين حالياً.";
      addonCatalogResults.append(note);
      return;
    }
    metas.forEach(meta => {
      const card = document.createElement("article");
      card.className = "addon-meta-card";
      if (typeof meta.poster === "string" && safeHttpsUrl(meta.poster)) {
        const poster = document.createElement("img");
        poster.src = meta.poster;
        poster.alt = "";
        poster.loading = "lazy";
        poster.referrerPolicy = "no-referrer";
        card.append(poster);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "addon-meta-poster";
        placeholder.textContent = "RAIF";
        card.append(placeholder);
      }
      const title = document.createElement("strong");
      title.textContent = meta.name || meta.id || "عنوان بدون اسم";
      const detail = document.createElement("span");
      const details = [meta.year, meta.type, meta.releaseInfo].filter(Boolean);
      detail.textContent = details.join(" · ");
      card.append(title, detail);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "تفاصيل " + (meta.name || meta.id || "العنوان"));
      card.addEventListener("click", () => openAddonMeta(addon, entry, meta));
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openAddonMeta(addon, entry, meta);
        }
      });
      results.append(card);
    });
    addonCatalogResults.append(results);
  } catch (error) {
    loading.textContent = "تعذر تحميل الكتالوج: " + error.message;
    loading.classList.add("is-error");
  }
}

async function updateSource(id, changes) {
  const { error } = await supabase.from("user_addons").update(changes).eq("id", id);
  if (error) {
    setStatus(sourceStatus, "تعذر تحديث المصدر: " + error.message, true);
    return;
  }
  setStatus(sourceStatus, "تم تحديث حالة المصدر.");
  await loadSources();
  addonDiscoveryCache.clear(); addonManifestCache.clear(); addonCatalogItems = [];
  if (activeView !== "sources" && activeView !== "library") loadAddonDiscovery(activeView);
}

async function deleteSource(id) {
  const { error } = await supabase.from("user_addons").delete().eq("id", id);
  if (error) {
    setStatus(sourceStatus, "تعذر حذف المصدر: " + error.message, true);
    return;
  }
  setStatus(sourceStatus, "تم حذف المصدر من حسابك.");
  await loadSources();
  addonDiscoveryCache.clear(); addonManifestCache.clear(); addonCatalogItems = [];
  if (activeView !== "sources" && activeView !== "library") loadAddonDiscovery(activeView);
}

document.querySelector("#source-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) {
    authDialog.showModal();
    setStatus(authStatus, "سجّل الدخول أولاً لحفظ المصادر.");
    return;
  }

  const nameInput = document.querySelector("#source-name");
  const urlInput = document.querySelector("#source-url");
  const submit = document.querySelector("#source-submit");
  let manifest;
  try {
    manifest = new URL(urlInput.value.trim());
    if (manifest.protocol !== "https:" || manifest.username || manifest.password) throw new Error("protocol");
  } catch {
    setStatus(sourceStatus, "أدخل رابط HTTPS صحيحاً وآمناً.", true);
    return;
  }

  submit.disabled = true;
  const { error } = await supabase.from("user_addons").insert({
    user_id: currentUser.id,
    addon_id: "raif-web-" + crypto.randomUUID(),
    name: nameInput.value.trim() || manifest.hostname,
    manifest_url: manifest.toString(),
    enabled: true,
    config: {}
  });
  submit.disabled = false;

  if (error) {
    setStatus(sourceStatus, "تعذر حفظ المصدر: " + error.message, true);
    return;
  }
  nameInput.value = "";
  urlInput.value = "";
  setStatus(sourceStatus, "تم حفظ المصدر في حسابك.");
  await loadSources();
  addonDiscoveryCache.clear(); addonManifestCache.clear(); addonCatalogItems = [];
  if (activeView !== "sources" && activeView !== "library") loadAddonDiscovery(activeView);
});


const unsupportedAddonPattern = /torrent|debrid|realdebrid|peerflix|p2p|jackettio|torrentio|torrin|aiostreams|comet|one pace|cinetorrent|torrentsdb|torrentclaw|torrentfreaks|brazuca|absolute cinema|orion|meteor|\bRD\b/i;
function shouldSkipAddon(source) {
  const label = String(source?.name || "");
  let host = "";
  try { host = new URL(source?.url || "").hostname; } catch {}
  const rawUrl = String(source?.url || "");
  return unsupportedAddonPattern.test(label) || /torrent|debrid|realdebrid|peerflix/i.test(host) || /realdebrid|debrid(?:=|%3d)/i.test(rawUrl);
}

function manifestHasUnsupportedDelivery(manifest) {
  if (manifest?.behaviorHints?.p2p === true) return true;
  const identity = [manifest?.name, manifest?.id].filter(Boolean).join(" ");
  if (unsupportedAddonPattern.test(identity)) return true;
  const description = String(manifest?.description || "").replace(/\b(?:no|without|not using|does not use|doesn\x27t use)\s+(?:any\s+)?(?:torrents?|debrid|p2p)\b/gi, "");
  return /\b(?:torrents?|real[- ]?debrid|debrid|peer[- ]?to[- ]?peer|p2p)\b/i.test(description);
}
document.querySelector("#source-import-button").addEventListener("click", async () => {
  const fileInput = document.querySelector("#source-import-file");
  const status = document.querySelector("#source-import-status");
  const button = document.querySelector("#source-import-button");
  if (!currentUser) {
    setStatus(authStatus, "سجّل الدخول أولاً لاستيراد المصادر.");
    authDialog.showModal();
    return;
  }
  const file = fileInput.files?.[0];
  if (!file) { setStatus(status, "اختر ملف JSON أولاً.", true); return; }
  button.disabled = true;
  setStatus(status, "جارٍ فحص الإضافات وحفظ المتوافق منها...");
  try {
    const exported = JSON.parse(await file.text());
    const sources = Array.isArray(exported) ? exported : exported?.sources;
    if (!Array.isArray(sources)) throw new Error("صيغة الملف غير معروفة. اختر تصدير Stremio بصيغة JSON.");
    const { data: existing, error: existingError } = await supabase
      .from("user_addons").select("manifest_url").eq("user_id", currentUser.id);
    if (existingError) throw new Error("تعذر قراءة المصادر الحالية.");
    const known = new Set((existing || []).map(row => row.manifest_url));
    if (sources.length > 100) throw new Error("يمكن استيراد 100 مصدر كحد أقصى في المرة الواحدة.");
    const accepted = [];
    let skipped = 0, failed = 0, duplicates = 0;
    let cursor = 0;
    const inspectNext = async () => {
      while (cursor < sources.length) {
        const source = sources[cursor++];
        const rawUrl = typeof source?.url === "string" ? source.url.trim() : "";
        let url;
        try {
          url = new URL(rawUrl);
          if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe");
        } catch { skipped++; continue; }
        if (shouldSkipAddon(source)) { skipped++; continue; }
        if (known.has(url.href)) { duplicates++; continue; }
        known.add(url.href);
        try {
          const manifest = await fetchAddonManifestByUrl(url.href);
          if (!manifest || typeof manifest !== "object" || !manifest.id ||
              !Array.isArray(manifest.resources)) { failed++; continue; }
          if (manifestHasUnsupportedDelivery(manifest)) { skipped++; continue; }
          const resources = manifest.resources.map(resource =>
            typeof resource === "string" ? resource : resource?.name
          ).filter(Boolean);
          const supported = resources.some(resource =>
            ["catalog", "subtitles"].includes(resource)
          );
          if (!supported) { skipped++; continue; }
          accepted.push({
            user_id: currentUser.id,
            addon_id: String(manifest.id).slice(0, 255),
            name: String(source.name || manifest.name || manifest.id).slice(0, 100),
            manifest_url: url.href,
            enabled: source.enabled !== false,
            config: {raif_imported: true, resources}
          });
        } catch { failed++; }
      }
    };
    await Promise.all(Array.from({length: Math.min(5, sources.length)}, () => inspectNext()));
    if (accepted.length) {
      const { error } = await supabase.from("user_addons").insert(accepted);
      if (error) throw new Error("تعذر حفظ المصادر المتوافقة في حسابك.");
    }
    setStatus(status, "اكتمل الفحص: أُضيف " + accepted.length + "، استُبعد " + skipped +
      " غير مناسب، مكرر " + duplicates + "، تعذر فحص " + failed + ".");
    fileInput.value = "";
    await loadSources();
  } catch (error) {
    setStatus(status, error.message || "تعذر استيراد الملف.", true);
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(entry => entry.classList.toggle("active", entry === button));
  render();
}));

search.addEventListener("input", render);
document.querySelector("#refresh-catalog")?.addEventListener("click", () => {
  addonDiscoveryCache.clear(); addonManifestCache.clear(); addonCatalogItems = []; addonDiscoveryErrors.length = 0;
  loadAddonDiscovery(activeView);
});
document.querySelector("#close-dialog").addEventListener("click", () => document.querySelector("#detail-dialog").close());
document.querySelector("#close-player").addEventListener("click", () => {
  document.querySelector("#player-dialog").close();
  disposeStreamPlayer();
});
document.querySelector("#player-dialog").addEventListener("close", disposeStreamPlayer);

document.querySelector("#detail-dialog").addEventListener("click", event => {
  if (event.target.id === "detail-dialog") event.currentTarget.close();
});
document.querySelector("#explore").addEventListener("click", () => {
  document.querySelector("#catalog").scrollIntoView({behavior:"smooth",block:"start"});
});
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  activeView = button.dataset.view;
  const map = {home:"all",movies:"movie",series:"series",anime:"anime",library:"all"};
  activeFilter = map[activeView] || "all";
  document.querySelectorAll(".nav-item").forEach(entry => entry.classList.toggle("active", entry === button));
  document.querySelectorAll(".filter").forEach(entry => entry.classList.toggle("active", entry.dataset.filter === activeFilter));
  const isSources = activeView === "sources";
  document.querySelector("#hero").hidden = isSources;
  document.querySelector(".content-section:not(.source-manager)").hidden = isSources;
  document.querySelector("#source-manager").hidden = !isSources;
  if (!isSources) {
    document.querySelector("#section-title").textContent =
      ({home:"اكتشف المحتوى",movies:"الأفلام",series:"المسلسلات",anime:"الأنمي",library:"مكتبتي"})[activeView];
    render();
    if (activeView !== "library") loadAddonDiscovery(activeView);
  } else {
    loadSources();
  }
  (isSources ? document.querySelector("#source-manager") : document.querySelector("#catalog"))
    .scrollIntoView({behavior:"smooth",block:"start"});
}));

document.querySelector("#account-button").addEventListener("click", () => {
  setStatus(authStatus, "");
  setStatus(accountStatus, "");
  authDialog.showModal();
});
document.querySelector("#close-auth").addEventListener("click", () => authDialog.close());
authDialog.addEventListener("click", event => {
  if (event.target === authDialog) authDialog.close();
});

document.querySelector("#access-code-form").addEventListener("submit", async event => {
  event.preventDefault();
  const codeInput = document.querySelector("#access-code");
  const submit = document.querySelector("#access-code-submit");
  const code = codeInput.value.trim();
  if (!/^\d{3}$/.test(code)) {
    setStatus(authStatus, "أدخل رمز الدخول المكوّن من 3 أرقام.", true);
    return;
  }
  submit.disabled = true;
  submit.textContent = "جارٍ التحقق...";
  setStatus(authStatus, "جارٍ التحقق من رمز الدخول...");
  try {
    const { data, error } = await supabase.functions.invoke("raif-code-login", { body: { code } });
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);
    if (!data?.token_hash) throw new Error("لم تصل جلسة الدخول من الخادم.");
    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: "magiclink"
    });
    if (authError) throw authError;
    currentUser = authData.user || authData.session?.user || null;
    updateAuthView();
    await loadFavorites();
    await loadSources();
    render();
    if (activeView !== "library" && activeView !== "sources") await loadAddonDiscovery(activeView);
    setStatus(accountStatus, "تم الدخول إلى حساب RAIF المشترك.");
    authDialog.close();
  } catch (error) {
    setStatus(authStatus, error.message || "تعذر تسجيل الدخول.", true);
  } finally {
    submit.disabled = false;
    submit.textContent = "دخول";
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    setStatus(accountStatus, "تعذر تسجيل الخروج: " + error.message, true);
    return;
  }
  currentUser = null;
  savedIds = [];
  updateAuthView();
  render();
  setStatus(authStatus, "تم تسجيل الخروج.");
});

supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  updateAuthView();
  Promise.resolve().then(async () => { await loadFavorites(); if (activeView === "sources") await loadSources(); });
});

let { data: { session } } = await supabase.auth.getSession();
if (session?.user?.email?.toLowerCase() !== SHARED_ACCOUNT_EMAIL) {
  await supabase.auth.signOut({ scope: "local" });
  session = null;
}
currentUser = session?.user || null;
updateAuthView();
await loadFavorites();
await loadSources();
render();
if (activeView !== "library" && activeView !== "sources") await loadAddonDiscovery(activeView);
