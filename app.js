import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";

const SUPABASE_URL = "https://puhipyjljmbvczijtzkb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cfCNLzoEfFSf5mLwunrmCw_qDdyWIo7";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let activeFilter = "all";
let activeView = "home";
let currentUser = null;
const SHARED_ACCOUNT_EMAIL = "raif-shared@puhipyjljmbvczijtzkb.supabase.co";
let savedIds = [];
let savedItems = [];
let favoritesLoading = false;
let addons = [];
let addonCatalogItems = [];
let addonCatalogLoading = false;
let addonDiscoveryRun = 0;
const addonDiscoveryCache = new Set();
const addonManifestCache = new Map();
const addonLoadErrors = new Map();

function resetAddonDiscovery() {
  addonCatalogItems = [];
  addonDiscoveryCache.clear();
  addonManifestCache.clear();
  addonLoadErrors.clear();
}

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

function render() {
  const q = search.value.trim().toLocaleLowerCase("ar");
  const matches = (item) =>
    (activeFilter === "all" || item.type === activeFilter) &&
    ((item.title || "").toLocaleLowerCase("ar").includes(q) ||
      (item.genre || "").toLocaleLowerCase("ar").includes(q) ||
      String(item.year || "").includes(q));
  const visibleItems = activeView === "library" ? savedItems : addonCatalogItems;
  const filtered = visibleItems.filter(matches);

  catalog.replaceChildren();
  filtered.forEach(item => {
    const card = document.createElement("article");
    card.className = "media-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "تفاصيل " + item.title);
    if (item._kind === "addon" || item._kind === "saved") {
      const posterUrl = safeHttpsUrl(item.poster);
      if (posterUrl) {
        const poster = document.createElement("img");
        poster.className = "poster addon-card-poster";
        poster.src = posterUrl.href;
        poster.alt = "";
        poster.loading = "lazy";
        poster.referrerPolicy = "no-referrer";
        card.append(poster);
      } else {
        const poster = document.createElement("div");
        poster.className = "poster";
        const art = document.createElement("span");
        art.className = "poster-art";
        art.textContent = "RAIF";
        poster.append(art);
        card.append(poster);
      }
    } else {
      const poster = document.createElement("div");
      poster.className = "poster";
      poster.style.setProperty("--c1", item.c1);
      poster.style.setProperty("--c2", item.c2);
      const art = document.createElement("span");
      art.className = "poster-art";
      art.textContent = item.symbol;
      poster.append(art);
      card.append(poster);
    }
    const label = document.createElement("span");
    label.className = "poster-label";
    label.textContent = [typeNames[item.type] || item.type, item.year].filter(Boolean).join(" · ");
    const title = document.createElement("div");
    title.className = "media-title";
    title.textContent = item.title || "عنوان بدون اسم";
    const detail = document.createElement("div");
    detail.className = "media-meta";
    detail.textContent = [item.genre, typeNames[item.type] || item.type].filter(Boolean).join(" · ");
    card.append(label, title, detail);
    if (item._kind === "addon" && item._raifProviders?.length > 1) {
      const sources = document.createElement("div");
      sources.className = "media-sources-count";
      sources.textContent = item._raifProviders.length + " مصادر متاحة";
      card.append(sources);
    }
    card.addEventListener("click", () => {
      if (item._kind === "addon") openAddonMeta(item.addon, item.catalogEntry, item.meta);
      else if (item._kind === "saved") {
        const addon = addons.find(candidate => candidate.id === item.addon_id);
        if (addon) {
          openAddonMeta(addon, {type:item.catalog_resource_type || item.type, id:item.catalog_id || item.catalog_resource_type || item.type},
            {id:item.meta_id || item.id, name:item.title, year:item.year, poster:item.poster, description:item.description});
        } else {
          const detail = document.querySelector("#detail-content");
          detail.replaceChildren();
          const title = document.createElement("h2");
          title.textContent = item.title;
          const note = document.createElement("p");
          note.textContent = item.description || "العنوان محفوظ في مكتبتك، لكن مصدر البيانات المرتبط به لم يعد متاحًا.";
          detail.append(title,note);
          document.querySelector("#detail-dialog").showModal();
        }
      }
    });
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });
    catalog.append(card);
  });

  if (activeView === "library" && !currentUser) {
    empty.textContent = "سجّل الدخول أولاً لعرض مكتبتك المحفوظة على RAIF.";
  } else if (activeView === "library" && favoritesLoading) {
    empty.textContent = "جارٍ تحميل مكتبتك...";
  } else if (addonCatalogLoading && activeView !== "library") {
    empty.textContent = "جارٍ تحميل أفلام ومسلسلات المصادر...";
  } else {
    const failures = addonLoadErrors.size;
    empty.textContent = activeView === "library"
      ? "مكتبتك فارغة حالياً. أضف عناوين حقيقية من كتالوجات RAIF."
      : failures
        ? "لم تصل نتائج من بعض المصادر (" + failures + "). افتح «مصادري» لمراجعة تفاصيل الأخطاء."
        : "لا توجد عناوين حقيقية في هذا القسم حتى الآن. أضف أو فعّل مصدرًا يوفّر كتالوجًا.";
  }
  empty.hidden = filtered.length > 0;
  const catalogSummary = document.querySelector("#catalog-summary");
  if (catalogSummary) {
    const sourceCount = new Set(filtered.flatMap(item => (item._raifProviders || [{addon:item.addon}])
      .map(provider => provider?.addon?.id).filter(Boolean))).size;
    catalogSummary.textContent = filtered.length
      ? "يعرض RAIF " + filtered.length + " عنوانًا حقيقيًا" + (sourceCount ? " من " + sourceCount + " مصدرًا." : ".")
      : (addonCatalogLoading ? "جارٍ جلب الكتالوجات من المصادر المفعّلة..." : "لا توجد عناوين حقيقية للعرض حاليًا.");
  }
}

async function loadFavorites() {
  if (!currentUser) {
    savedIds = [];
    savedItems = [];
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

  savedItems = (data || []).map(row => {
    const meta = row.metadata || {};
    return {
      _kind:"saved", content_id:row.content_id, id:meta.meta_id || row.content_id,
      type:meta.catalog_type || row.content_type, title:meta.title || "عنوان محفوظ",
      year:meta.year || "", genre:meta.genre || "", poster:meta.poster || "",
      description:meta.description || "", meta_id:meta.meta_id || row.content_id,
      addon_id:meta.addon_id || "", catalog_id:meta.catalog_id || "",
      catalog_type:meta.catalog_type || row.content_type,
      catalog_resource_type:meta.catalog_resource_type || meta.catalog_type || row.content_type
    };
  });
  savedIds = (data || []).map(row => row.content_id);
  render();
}


async function toggleFavorite(item) {
  if (!currentUser) {
    setStatus(authStatus, "سجّل الدخول أولاً حتى تُحفظ مكتبتك في حسابك.");
    authDialog.showModal();
    return;
  }

  const button = document.querySelector("#toggle-save");
  if (button) button.disabled = true;
  const resourceType = item.catalogEntry?.type || item.catalog_resource_type || item.type;
  const contentId = item.content_id || ("stremio:" + resourceType + ":" + item.id);
  const contentType = itemContentType(item);
  const isSaved = savedIds.includes(contentId);
  const provider = item._raifProviders?.[0] || {addon:item.addon, catalogEntry:item.catalogEntry};
  const metadata = {
    meta_id:item.id,
    title:item.title || item.meta?.name || item.id,
    year:item.year || item.meta?.year || "",
    genre:item.genre || (Array.isArray(item.meta?.genres) ? item.meta.genres.join("، ") : ""),
    poster:item.poster || item.meta?.poster || "",
    description:item.meta?.description || "",
    catalog_type:item.type,
    catalog_resource_type:provider.catalogEntry?.type || item.catalog_resource_type || item.type,
    catalog_id:provider.catalogEntry?.id || item.catalog_id || "",
    addon_id:provider.addon?.id || item.addon_id || ""
  };
  let error;

  if (isSaved) {
    ({ error } = await supabase.from("favorites")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("content_id", contentId)
      .eq("content_type", contentType));
    if (!error) {
      savedIds = savedIds.filter(id => id !== contentId);
      savedItems = savedItems.filter(entry => entry.content_id !== contentId);
    }
  } else {
    ({ error } = await supabase.from("favorites").insert({
      user_id: currentUser.id,
      content_id: contentId,
      content_type: contentType,
      metadata
    }));
    if (!error) {
      savedIds = [...savedIds, contentId];
      savedItems = [...savedItems, {...metadata, _kind:"saved", content_id:contentId, id:item.id,
        type:item.type, title:metadata.title, year:metadata.year, genre:metadata.genre, poster:metadata.poster}];
    }
  }

  if (error) {
    setStatus(accountStatus, "تعذر تحديث المكتبة: " + error.message, true);
    if (button) button.disabled = false;
    return;
  }

  setStatus(accountStatus, "تم تحديث مكتبتك ومزامنتها مع RAIF.");
  if (button) {
    button.textContent = savedIds.includes(contentId) ? "إزالة من مكتبتي" : "＋ أضف إلى مكتبتي";
    button.disabled = false;
  }
  render();
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
    try {
      const manifestDisplayUrl = new URL(addon.manifest_url);
      url.textContent = manifestDisplayUrl.origin + manifestDisplayUrl.pathname +
        (manifestDisplayUrl.search ? " · إعدادات محفوظة" : "");
    } catch { url.textContent = "رابط Manifest غير صالح"; }
    details.append(name, url);
    const manifest = addonManifestCache.get(addon.id);
    const resources = Array.isArray(manifest?.resources)
      ? manifest.resources.map(resource => typeof resource === "string" ? resource : resource?.name).filter(Boolean)
      : (Array.isArray(addon.config?.resources) ? addon.config.resources : []);
    const capabilities = document.createElement("small");
    capabilities.className = "source-capabilities";
    capabilities.textContent = resources.length
      ? ["catalog","stream","subtitles","meta"].filter(resource => resources.includes(resource)).map(resource => ({
          catalog:"كتالوج",stream:"تشغيل",subtitles:"ترجمة",meta:"تفاصيل"
        })[resource]).join(" · ")
      : "لم يُفحص Manifest بعد";
    details.append(capabilities);
    const loadError = [...addonLoadErrors.values()].find(entry => entry.name === (addon.name || addon.addon_id));
    if (loadError) {
      const errorNote = document.createElement("small");
      errorNote.className = "is-error";
      errorNote.textContent = "آخر خطأ: " + loadError.message;
      details.append(errorNote);
    }
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
  return invokeAddonProxy({
    action: resource === "manifest" ? "manifest" : "resource",
    addon_id: addon.id,
    resource,
    type,
    content_id: contentId,
    query
  }, resource === "manifest" ? "Manifest" : resource);
}

function fetchAddonManifestByUrl(manifestUrl) {
  return invokeAddonProxy({action:"inspect_url", manifest_url:manifestUrl}, "Manifest");
}

function normalizeCatalogTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function catalogIdentity(meta, type) {
  const ids = [meta?.imdb_id, meta?.imdbId, meta?.id]
    .filter(value => typeof value === "string")
    .map(value => value.trim().toLowerCase());
  const imdb = ids.find(value => /^tt\d{5,12}(?::\d+:\d+)?$/.test(value));
  if (imdb) return type + "|imdb|" + imdb.split(":")[0];
  const tmdb = ids.find(value => /^(?:tmdb:|tmdb\/|movie:|tv:)?\d{2,12}$/.test(value));
  if (tmdb) return type + "|id|" + tmdb.replace(/^(?:tmdb:|tmdb\/|movie:|tv:)/, "");
  const title = normalizeCatalogTitle(meta?.name || meta?.title);
  const year = String(meta?.year || "").match(/\d{4}/)?.[0] || "";
  return title ? type + "|title|" + title + "|" + year : "";
}

function withAddonTimeout(promise, label, timeoutMs = 11000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("انتهت مهلة انتظار " + label + " (11 ثانية).")), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function loadAddonDiscovery(view = activeView) {
  if (!currentUser || view === "library" || view === "sources") return;
  const runId = ++addonDiscoveryRun;
  const wanted = view === "movies" ? ["movie"] :
    view === "series" ? ["series"] :
    view === "anime" ? ["anime", "series"] : ["movie", "series", "anime"];
  const enabled = addons.filter(addon => addon.enabled);
  addonCatalogLoading = true;
  addonLoadErrors.clear();
  render();
  if (!enabled.length) {
    addonCatalogLoading = false;
    render();
    return;
  }

  const jobs = enabled.map(async addon => {
    try {
      const manifest = addonManifestCache.get(addon.id) ||
        await withAddonTimeout(fetchAddonResource(addon, "manifest"), "Manifest · " + (addon.name || addon.addon_id));
      addonManifestCache.set(addon.id, manifest);
      const catalogs = Array.isArray(manifest?.catalogs) ? manifest.catalogs : [];
      const entries = catalogs.filter(entry => {
        if (!entry?.id || !wanted.includes(entry.type)) return false;
        const label = String(entry.id + " " + (entry.name || "")).toLowerCase();
        if (view === "anime") return entry.type === "anime" || /anime|animation|cartoon/.test(label);
        return true;
      });
      if (!entries.length) return;

      await Promise.all(entries.map(async entry => {
        const key = addon.id + "|" + entry.type + "|" + entry.id;
        if (addonDiscoveryCache.has(key)) return;
        try {
          const data = await withAddonTimeout(
            fetchAddonResource(addon, "catalog", entry.type, entry.id, {skip:0}),
            "كتالوج " + (entry.name || entry.id)
          );
          addonDiscoveryCache.add(key);
          const metas = Array.isArray(data?.metas) ? data.metas : [];
          metas.forEach(meta => {
            if (!meta || !meta.id) return;
            const catalogLabel = String(entry.id + " " + (entry.name || "")).toLowerCase();
            const type = entry.type === "anime" || /anime|animation|cartoon/.test(catalogLabel) ? "anime" : entry.type;
            const identity = catalogIdentity(meta, type) || type + "|source|" + addon.id + "|" + meta.id;
            const existing = addonCatalogItems.find(item => item.identity === identity);
            const provider = {addon, catalogEntry:entry, metaId:meta.id, catalogName:entry.name || entry.id};
            if (existing) {
              if (!existing._raifProviders.some(item => item.addon.id === addon.id && item.metaId === meta.id)) {
                existing._raifProviders.push(provider);
              }
              if (!existing.poster && meta.poster) existing.poster = meta.poster;
              if (!existing.year && meta.year) existing.year = meta.year;
              return;
            }
            addonCatalogItems.push({
              _kind:"addon", identity, addon, catalogEntry:entry, meta,
              _raifProviders:[provider],
              id:meta.id, type, title:meta.name || meta.id,
              year:meta.year || "",
              genre:Array.isArray(meta.genres) ? meta.genres.join("، ") : "",
              poster:meta.poster || ""
            });
          });
          render();
        } catch (error) {
          addonLoadErrors.set(addon.id + "|" + entry.id, {name:addon.name || addon.addon_id, message:error.message});
        }
      }));
    } catch (error) {
      addonLoadErrors.set(addon.id, {name:addon.name || addon.addon_id, message:error.message});
    }
  });

  await Promise.allSettled(jobs);
  if (runId === addonDiscoveryRun) addonCatalogLoading = false;
  render();
}

document.querySelector("#player-speed")?.addEventListener("change", event => {
  const video = document.querySelector("#raif-video");
  video.playbackRate = Number(event.target.value) || 1;
  localStorage.setItem("raif-player-speed", String(video.playbackRate));
});
document.querySelector("#player-quality")?.addEventListener("change", event => {
  if (activeHlsPlayer) activeHlsPlayer.currentLevel = Number(event.target.value);
});
document.querySelector("#player-subtitles")?.addEventListener("change", event => {
  const value = Number(event.target.value);
  if (activeHlsPlayer) activeHlsPlayer.subtitleTrack = value;
  const video = document.querySelector("#raif-video");
  Array.from(video.textTracks || []).forEach((track, index) => {
    track.mode = value === index ? "showing" : "disabled";
  });
});

document.addEventListener("keydown", event => {
  const dialog = document.querySelector("#player-dialog");
  if (!dialog?.open || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  const video = document.querySelector("#raif-video");
  if (event.key === " " && !event.repeat) { event.preventDefault(); video.paused ? video.play().catch(() => {}) : video.pause(); }
  else if (event.key === "ArrowRight") { event.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); }
  else if (event.key.toLowerCase() === "f") { event.preventDefault(); if (!document.fullscreenElement) video.requestFullscreen?.(); else document.exitFullscreen?.(); }
});

function renderAddonMessage(message, isError = false) {
  addonCatalogResults.replaceChildren();
  const note = document.createElement("p");
  note.className = isError ? "auth-status is-error" : "empty-state";
  note.textContent = message;
  addonCatalogResults.append(note);
}

function buildAddonConfigForm(addon, manifest, manifestUrl) {
  const specs = Array.isArray(manifest.config) ? manifest.config.filter(item => item && typeof item === "object") : [];
  if (!specs.length) return {form:null, missingRequired:false};
  const form = document.createElement("form");
  form.className = "addon-extra-form";
  const heading = document.createElement("strong");
  heading.textContent = "إعدادات الإضافة";
  form.append(heading);
  let missingRequired = false;

  specs.slice(0, 20).forEach(spec => {
    const key = String(spec.key || spec.name || "").trim();
    if (!key || !/^[a-zA-Z0-9_-]{1,64}$/.test(key)) return;
    const required = spec.required === true || spec.isRequired === true;
    const current = manifestUrl.searchParams.get(key) ?? spec.default ?? "";
    if (required && !String(current).trim()) missingRequired = true;
    const label = document.createElement("label");
    label.textContent = String(spec.title || spec.name || key) + (required ? " *" : "");
    let field;
    const kind = String(spec.type || "text").toLowerCase();
    if (Array.isArray(spec.options) && spec.options.length) {
      field = document.createElement("select");
      field.append(new Option(required ? "اختر قيمة" : "القيمة الافتراضية", ""));
      spec.options.forEach(option => {
        const value = typeof option === "object" && option !== null
          ? String(option.value ?? option.key ?? option.name ?? "")
          : String(option);
        const caption = typeof option === "object" && option !== null
          ? String(option.title ?? option.name ?? option.value ?? value)
          : String(option);
        field.append(new Option(caption, value));
      });
      field.value = String(current);
    } else {
      field = document.createElement("input");
      field.type = ["password","number","email","url"].includes(kind) ? kind : "text";
      field.value = String(current);
      if (kind === "checkbox" || kind === "boolean") {
        field.type = "checkbox";
        field.checked = /^(true|1|yes|on)$/i.test(String(current));
      }
    }
    field.name = key;
    field.required = required && field.type !== "checkbox";
    label.append(field);
    form.append(label);
  });

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "save-btn";
  save.textContent = "حفظ إعدادات الإضافة";
  form.append(save);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const updatedUrl = new URL(manifestUrl.href);
    specs.forEach(spec => {
      const key = String(spec.key || spec.name || "").trim();
      const field = form.elements.namedItem(key);
      if (!field) return;
      const value = field.type === "checkbox" ? String(field.checked) : String(field.value || "").trim();
      if (value) updatedUrl.searchParams.set(key, value);
      else updatedUrl.searchParams.delete(key);
    });
    save.disabled = true;
    save.textContent = "جارٍ حفظ الإعدادات...";
    try {
      await updateSource(addon.id, {
        manifest_url:updatedUrl.href,
        config:{...(addon.config || {}), manifest_configured:true}
      });
      const updatedAddon = addons.find(item => item.id === addon.id) || {...addon, manifest_url:updatedUrl.href};
      await inspectAddon(updatedAddon);
    } catch (error) {
      renderAddonMessage("تعذر حفظ إعدادات الإضافة: " + error.message, true);
    } finally {
      save.disabled = false;
      save.textContent = "حفظ إعدادات الإضافة";
    }
  });
  return {form, missingRequired};
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

    const configState = buildAddonConfigForm(addon, manifest, manifestUrl);
    if (configState.form) addonCatalogResults.append(configState.form);
    if (configState.missingRequired) {
      const requiredNote = document.createElement("p");
      requiredNote.className = "auth-status is-error";
      requiredNote.textContent = "أكمل حقول الإعداد المطلوبة ثم احفظها حتى تعمل كتالوجات هذه الإضافة.";
      addonCatalogResults.append(requiredNote);
    }

    const catalogButtons = document.createElement("div");
    catalogButtons.className = "addon-catalog-buttons";
    manifest.catalogs.forEach(entry => {
      if (!entry || !entry.type || !entry.id) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter";
      button.textContent = entry.name || (entry.type + " · " + entry.id);
      button.disabled = configState.missingRequired;
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
let lastProgressSavedAt = 0;
let currentProgressKey = "";

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
  const subtitleSelect = document.querySelector("#player-subtitles");
  if (subtitleSelect) {
    subtitleSelect.replaceChildren(new Option("إيقاف", "-1"), new Option(track.label || "ترجمة", "0"));
    subtitleSelect.value = "0";
  }
  track.addEventListener("load", () => {
    for (const item of video.textTracks) item.mode = item === track.track ? "showing" : "disabled";
  }, {once:true});
}

function setSelectedSubtitle(subtitle) {
  if (selectedSubtitle?.objectUrl) URL.revokeObjectURL(selectedSubtitle.objectUrl);
  selectedSubtitle = subtitle;
  if (subtitle?.language && subtitle.language !== "und") {
    try { localStorage.setItem("raif-subtitle-language", subtitle.language); } catch {}
  }
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

async function fetchSubtitleFile(subtitle, catalogEntry, meta, selectedVideoId = null) {
  const {data, error} = await supabase.functions.invoke("raif-addon-proxy", {
    body: {
      action:"subtitle_file",
      addon_id:subtitle.addonId,
      type:catalogEntry.type,
      content_id:selectedVideoId || meta.id,
      subtitle_url:subtitle.url
    }
  });
  if (error) throw new Error("تعذر تحميل الترجمة: " + error.message);
  if (typeof data?.content !== "string") throw new Error(data?.error || "ملف الترجمة غير صالح.");
  const vtt = subtitleToVtt(data.content);
  return URL.createObjectURL(new Blob([vtt], {type:"text/vtt;charset=utf-8"}));
}

async function findSubtitles(meta, catalogEntry, area, button, selectedVideoId = null) {
  area.replaceChildren();
  button.disabled = true;
  button.textContent = "جارٍ البحث عن الترجمات...";
  const candidates = addons.filter(addon => {
    if (!addon.enabled) return false;
    const manifest = addonManifestCache.get(addon.id);
    const resources = Array.isArray(manifest?.resources)
      ? manifest.resources.map(resource => typeof resource === "string" ? resource : resource?.name)
      : (Array.isArray(addon.config?.resources) ? addon.config.resources : []);
    return resources.includes("subtitles") || /subtito|subsource|subdl|submaker|opensubtitles/i.test(addon.name || "");
  });
  if (!candidates.length) {
    const note = document.createElement("p");
    note.textContent = "لم يتم إعداد أي مصدر ترجمات بعد. أضف Subtito أو SubSource أو SubDL أو OpenSubtitles.";
    area.append(note);
    button.disabled = false;
    button.textContent = "البحث عن الترجمات";
    return;
  }
  const results = await Promise.allSettled(candidates.map(async addon => {
    const data = await withAddonTimeout(fetchAddonResource(addon, "subtitles", catalogEntry.type, selectedVideoId || meta.id), "ترجمات " + (addon.name || addon.addon_id), 12000);
    return (Array.isArray(data?.subtitles) ? data.subtitles : [])
      .filter(entry => typeof entry?.url === "string" && safeHttpsUrl(entry.url))
      .map(entry => ({
        url: entry.url,
        addonId: addon.id,
        label: [entry.lang || entry.language || "ترجمة", addon.name].filter(Boolean).join(" · "),
        language: /^[a-z]{2,3}(?:-[a-z0-9]+)?$/i.test(entry.langCode || "") ? entry.langCode : "und"
      }));
  }));
  const preferredLanguage = localStorage.getItem("raif-subtitle-language") || "ar";
  const subtitles = results.flatMap(result => result.status === "fulfilled" ? result.value : [])
    .sort((a,b) => Number(b.language.toLowerCase().startsWith(preferredLanguage)) - Number(a.language.toLowerCase().startsWith(preferredLanguage)));
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
          const objectUrl = await fetchSubtitleFile(subtitle, catalogEntry, meta, selectedVideoId);
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
    if (currentProgressKey && Number.isFinite(video.currentTime) && video.currentTime > 5) {
      try { localStorage.setItem(currentProgressKey, JSON.stringify({time:video.currentTime,duration:video.duration,updatedAt:Date.now()})); } catch {}
    }
    video.pause();
    video.onerror = null;
    video.onplaying = null;
    video.onloadedmetadata = null;
    video.ontimeupdate = null;
    video.querySelectorAll('track[data-raif-subtitle="true"]').forEach(track => track.remove());
    video.removeAttribute("src");
    video.hidden = false;
    video.load();
    currentProgressKey = "";
  }
  const embed = document.querySelector("#raif-embed");
  if (embed) { embed.src = "about:blank"; embed.hidden = true; }
}
async function openEmbedPlayer(rawUrl, title = "RAIF Player") {
  const target = new URL(rawUrl);
  const allowed = ["www.youtube-nocookie.com","www.youtube.com","youtube.com","youtu.be","player.vimeo.com","vimeo.com"];
  if (!allowed.includes(target.hostname.toLowerCase())) throw new Error("هذا الموقع غير موجود ضمن منصات التضمين المسموحة.");
  if (target.protocol !== "https:") throw new Error("التضمين يتطلب رابط HTTPS.");
  const dialog = document.querySelector("#player-dialog");
  const video = document.querySelector("#raif-video");
  const embed = document.querySelector("#raif-embed");
  disposeStreamPlayer();
  video.hidden = true;
  embed.hidden = false;
  embed.src = target.href;
  document.querySelector("#player-title").textContent = title;
  setStatus(document.querySelector("#player-status"), "يتم عرض المشغل الخارجي. الترجمة وإعدادات الجودة تخضع للمنصة.");
  dialog.showModal();
}

function hashPlaybackKey(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getStreamHealth(url) {
  try { return JSON.parse(localStorage.getItem("raif-stream-health-" + hashPlaybackKey(url)) || "{}"); }
  catch { return {}; }
}

function recordStreamHealth(url, success) {
  const previous = getStreamHealth(url);
  const next = {
    successes:(previous.successes || 0) + (success ? 1 : 0),
    failures:(previous.failures || 0) + (success ? 0 : 1),
    lastSuccess:success ? Date.now() : (previous.lastSuccess || 0)
  };
  try { localStorage.setItem("raif-stream-health-" + hashPlaybackKey(url), JSON.stringify(next)); } catch {}
}

async function openStreamPlayer(rawUrl, title = "RAIF Player", stream = {}, progressIdentity = "") {
  let target;
  try { target = new URL(rawUrl); } catch { throw new Error("رابط التشغيل غير صالح."); }
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password) throw new Error("المشغل يقبل روابط HTTP وHTTPS فقط.");
  if (target.protocol === "http:" && location.protocol === "https:") throw new Error("المتصفح يمنع تشغيل HTTP داخل صفحة HTTPS. استخدم رابط HTTPS.");
  const dialog = document.querySelector("#player-dialog");
  const video = document.querySelector("#raif-video");
  const embed = document.querySelector("#raif-embed");
  const status = document.querySelector("#player-status");
  const qualityWrap = document.querySelector("#player-quality-wrap");
  const qualitySelect = document.querySelector("#player-quality");
  const subtitleSelect = document.querySelector("#player-subtitles");
  const speedSelect = document.querySelector("#player-speed");
  document.querySelector("#player-title").textContent = title;
  if (qualityWrap) qualityWrap.hidden = true;
  if (qualitySelect) qualitySelect.replaceChildren(new Option("تلقائي", "-1"));
  if (subtitleSelect) subtitleSelect.replaceChildren(new Option("إيقاف", "-1"));
  if (speedSelect) speedSelect.value = localStorage.getItem("raif-player-speed") || "1";
  video.hidden = false;
  if (embed) { embed.src = "about:blank"; embed.hidden = true; }
  status.textContent = "جارٍ تجهيز المشغل...";
  status.classList.remove("is-error");
  disposeStreamPlayer();
  currentProgressKey = "raif-progress-" + hashPlaybackKey(progressIdentity || title);
  lastProgressSavedAt = 0;
  video.playbackRate = Number(speedSelect?.value || 1);
  applySelectedSubtitle(video);
  dialog.showModal();
  const mime = String(stream.behaviorHints?.mimeType || stream.mimeType || stream.type || "").toLowerCase();
  const filename = String(stream.behaviorHints?.filename || stream.filename || "");
  const mediaHint = (target.pathname + " " + filename).toLowerCase();
  const isHls = /\.m3u8(?:$|[?#\s])/.test(mediaHint) || /mpegurl|vnd\.apple\.mpegurl/.test(mime);
  const isDash = /\.mpd(?:$|[?#\s])/.test(mediaHint) || /dash\+xml/.test(mime);
  let playbackSettled = false;
  let resolvePlayback, rejectPlayback;
  const playbackReady = new Promise((resolve, reject) => { resolvePlayback = resolve; rejectPlayback = reject; });
  const playbackTimeout = setTimeout(() => failPlayback("انتهت مهلة تشغيل هذا المصدر."), 30000);
  const markPlaying = () => {
    if (playbackSettled) return;
    playbackSettled = true;
    clearTimeout(playbackTimeout);
    resolvePlayback();
  };
  const failPlayback = message => {
    status.textContent = message;
    status.classList.add("is-error");
    recordStreamHealth(target.href, false);
    if (playbackSettled) return;
    playbackSettled = true;
    clearTimeout(playbackTimeout);
    rejectPlayback(new Error(message));
  };
  video.onerror = () => failPlayback("تعذر تشغيل الرابط. قد يكون منتهيًا أو يتطلب CORS أو ترويسات لا يدعمها المتصفح.");
  video.onplaying = () => {
    status.textContent = "يتم التشغيل داخل RAIF.";
    status.classList.remove("is-error");
    recordStreamHealth(target.href, true);
    try {
      localStorage.setItem("raif-last-source-" + hashPlaybackKey(progressIdentity || title), JSON.stringify({
        url:target.href, provider:stream._raifProviderName || stream.name || stream.title || "", usedAt:Date.now()
      }));
    } catch {}
    markPlaying();
  };
  video.onloadedmetadata = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(currentProgressKey) || "null");
      if (saved && Number.isFinite(saved.time) && saved.time > 15 &&
          (!Number.isFinite(video.duration) || saved.time < video.duration - 15)) {
        video.currentTime = saved.time;
        status.textContent = "استُعيد موضع المشاهدة السابق.";
      }
    } catch {}
  };
  video.ontimeupdate = () => {
    if (!currentProgressKey || !Number.isFinite(video.currentTime) || video.currentTime < 5) return;
    const now = Date.now();
    if (now - lastProgressSavedAt < 8000) return;
    lastProgressSavedAt = now;
    try {
      localStorage.setItem(currentProgressKey, JSON.stringify({
        time: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : null,
        updatedAt: now, title
      }));
    } catch {}
  };
  const startPlayback = () => video.play().catch(error => {
    if (error?.name === "NotAllowedError") {
      status.textContent = "اضغط زر التشغيل داخل الفيديو لبدء المشاهدة.";
      status.classList.remove("is-error");
    } else {
      failPlayback(error?.name === "NotSupportedError"
        ? "صيغة الفيديو غير مدعومة في متصفحك."
        : "تعذر بدء تشغيل هذا المصدر.");
    }
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
        const levels = activeHlsPlayer?.levels || [];
        if (qualitySelect && levels.length) {
          qualitySelect.replaceChildren(new Option("تلقائي", "-1"));
          levels.forEach((level, index) => {
            const label = level.height ? level.height + "p" : Math.round((level.bitrate || 0) / 1000) + " kbps";
            qualitySelect.append(new Option(label, String(index)));
          });
          if (qualityWrap) qualityWrap.hidden = false;
        }
        status.textContent = "تم تحميل قائمة HLS. جارٍ التشغيل...";
        startPlayback();
      });
      activeHlsPlayer.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
        if (!subtitleSelect) return;
        subtitleSelect.replaceChildren(new Option("إيقاف", "-1"));
        (data?.subtitleTracks || []).forEach((track, index) => {
          const label = [track.name, track.lang].filter(Boolean).join(" · ") || ("ترجمة " + (index + 1));
          subtitleSelect.append(new Option(label, String(index)));
        });
      });
      activeHlsPlayer.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) failPlayback("تعذر تشغيل HLS. قد يكون الرابط منتهيًا أو يمنع الخادم الوصول (CORS).");
      });
    } catch (error) { failPlayback("تعذر تجهيز HLS: " + error.message); }
  } else if (isDash) {
    try {
      const module = await import("https://esm.sh/dashjs@5.0.3");
      const dashjs = module.default || module;
      activeDashPlayer = dashjs.MediaPlayer().create();
      activeDashPlayer.initialize(video, target.href, false);
      activeDashPlayer.on(dashjs.MediaPlayer.events.ERROR, () => {
        failPlayback("تعذر تشغيل DASH. تحقق من الرابط ودعم CORS.");
      });
      status.textContent = "تم تحميل مشغل DASH. جارٍ التشغيل...";
      startPlayback();
    } catch (error) { failPlayback("تعذر تجهيز DASH: " + error.message); }
  } else {
    video.src = target.href;
    status.textContent = "جارٍ بدء تشغيل الفيديو...";
    startPlayback();
  }
  await playbackReady;
}

async function openAddonMeta(addon, catalogEntry, catalogMeta) {
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
    subtitleButton.addEventListener("click", () => findSubtitles(meta, catalogEntry, subtitleArea, subtitleButton, selectedVideoId));
    content.append(subtitleButton, subtitleArea);

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "save-btn";
    favoriteButton.id = "toggle-save";
    favoriteButton.textContent = savedIds.includes("stremio:" + catalogEntry.type + ":" + meta.id)
      ? "إزالة من مكتبتي" : "＋ أضف إلى مكتبتي";
    favoriteButton.addEventListener("click", () => toggleFavorite({
      id:meta.id, type:catalogEntry.type === "anime" ? "anime" : catalogEntry.type,
      title:meta.name || catalogMeta.name || meta.id, year:meta.year || catalogMeta.year || "",
      genre:Array.isArray(meta.genres) ? meta.genres.join("، ") : "",
      poster:meta.poster || catalogMeta.poster || "", meta, addon, catalogEntry
    }));
    content.append(favoriteButton);

    const streamsButton = document.createElement("button");
    streamsButton.type = "button";
    streamsButton.className = "primary-btn";
    streamsButton.textContent = "عرض مصادر التشغيل";
    const streamsArea = document.createElement("div");
    streamsArea.className = "addon-stream-list";
    let availableStreams = [];
    const bestButton = document.createElement("button");
    bestButton.type = "button";
    bestButton.className = "primary-btn";
    bestButton.textContent = "تشغيل أفضل مصدر";
    bestButton.hidden = true;
    bestButton.addEventListener("click", async () => {
      bestButton.disabled = true;
      bestButton.textContent = "جارٍ تجربة أفضل المصادر...";
      const progressId = catalogEntry.type + ":" + meta.id + ":" + (selectedVideoId || "");
      let lastError = null;
      for (const candidate of availableStreams) {
        try {
          await openStreamPlayer(candidate.url, candidate.name || candidate.title || "RAIF", candidate, progressId);
          bestButton.textContent = "يتم التشغيل";
          return;
        } catch (error) {
          lastError = error;
          const playerDialog = document.querySelector("#player-dialog");
          if (playerDialog.open) playerDialog.close();
          disposeStreamPlayer();
        }
      }
      bestButton.disabled = false;
      bestButton.textContent = "إعادة تجربة أفضل مصدر";
      const note = document.createElement("p");
      note.className = "auth-status is-error";
      note.textContent = "لم ينجح تشغيل أي مصدر. آخر خطأ: " + (lastError?.message || "غير معروف");
      streamsArea.prepend(note);
    });
    streamsButton.addEventListener("click", async () => {
      streamsButton.disabled = true;
      streamsButton.textContent = "جارٍ البحث عن المصادر...";
      streamsArea.replaceChildren();
      try {
        // Catalog/metadata add-ons are often separate from stream-provider add-ons.
        // Query every enabled add-on that actually declares the stream resource.
        const providers = addons.filter(candidate => candidate.enabled);
        const sourceProgress = document.createElement("p");
        sourceProgress.className = "source-fetch-progress";
        sourceProgress.textContent = "يتم فحص " + providers.length + " إضافة مفعّلة؛ يجري استبعاد الإضافات التي لا تعلن مورد تشغيل.";
        streamsArea.append(sourceProgress);
        let completedProviders = 0;
        const settled = await Promise.allSettled(providers.map(async candidate => {
          const manifest = addonManifestCache.get(candidate.id) ||
            await withAddonTimeout(fetchAddonResource(candidate, "manifest"), "Manifest · " + (candidate.name || candidate.addon_id));
          addonManifestCache.set(candidate.id, manifest);
          const resources = Array.isArray(manifest?.resources) ? manifest.resources.map(resource =>
            typeof resource === "string" ? resource : resource?.name
          ) : [];
          if (!resources.includes("stream")) return [];
          const streamData = await withAddonTimeout(
            fetchAddonResource(candidate, "stream", catalogEntry.type, selectedVideoId || meta.id),
            "مصدر التشغيل · " + (candidate.name || candidate.addon_id),
            15000
          );
          return (Array.isArray(streamData?.streams) ? streamData.streams : [])
            .map(stream => ({...stream, _raifProviderName:candidate.name || candidate.addon_id}));
        }).map(promise => promise.then(value => {
          completedProviders++;
          sourceProgress.textContent = "تم فحص " + completedProviders + " من " + providers.length + " إضافة...";
          return value;
        }).catch(error => {
          completedProviders++;
          sourceProgress.textContent = "تم فحص " + completedProviders + " من " + providers.length + " إضافة...";
          throw error;
        })));
        const failedResults = settled.filter(result => result.status === "rejected");
        const failedProviders = failedResults.length;
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
        const uniqueStreams = new Map();
        streams.forEach(stream => {
          try {
            const normalizedUrl = new URL(stream.url).href;
            const existing = uniqueStreams.get(normalizedUrl);
            if (existing) {
              existing._raifProviders = [...new Set([...(existing._raifProviders || [existing._raifProviderName]), stream._raifProviderName])];
            } else {
              stream.url = normalizedUrl;
              stream._raifProviders = [stream._raifProviderName];
              uniqueStreams.set(normalizedUrl, stream);
            }
          } catch {}
        });
        const dedupedStreams = [...uniqueStreams.values()];
        const qualityRank = stream => {
          const label = [stream.name,stream.title,stream.description,stream.behaviorHints?.filename].filter(Boolean).join(" ").toLowerCase();
          if (/2160p|4k|uhd/.test(label)) return 4;
          if (/1440p|2k/.test(label)) return 3;
          if (/1080p|fhd/.test(label)) return 2;
          if (/720p|hd/.test(label)) return 1;
          if (/480p|sd/.test(label)) return 0;
          return -1;
        };
        const languageRank = stream => {
          const label = [stream.name,stream.title,stream.description].filter(Boolean).join(" ").toLowerCase();
          if (/arabic|عربي|العربية|dubbed ar|arab dub/.test(label)) return 3;
          if (/multi|dual audio|متعدد/.test(label)) return 2;
          if (/english|انجليزي|إنجليزي/.test(label)) return 1;
          return 0;
        };
        let lastSourceUrl = "";
        try {
          lastSourceUrl = JSON.parse(localStorage.getItem("raif-last-source-" +
            hashPlaybackKey(catalogEntry.type + ":" + meta.id + ":" + (selectedVideoId || ""))) || "{}").url || "";
        } catch {}
        dedupedStreams.sort((a,b) => {
          const ah=getStreamHealth(a.url), bh=getStreamHealth(b.url);
          const aHealth=(ah.successes||0)*2-(ah.failures||0);
          const bHealth=(bh.successes||0)*2-(bh.failures||0);
          const aLast=Number(a.url===lastSourceUrl), bLast=Number(b.url===lastSourceUrl);
          return (bLast-aLast) ||
            (qualityRank(b)-qualityRank(a)) ||
            (languageRank(b)-languageRank(a)) ||
            (bHealth-aHealth) ||
            (playbackPriority(a)-playbackPriority(b));
        });
        streams.splice(0,streams.length,...dedupedStreams);
        availableStreams = streams;
        bestButton.hidden = !streams.length;
        if (!streams.length) {
          const note = document.createElement("p");
          note.textContent = failedProviders && !rawStreams.length
            ? "تعذر الاتصال بمصادر البث. تحقق من الإضافات التي توفر التشغيل أو أعد المحاولة."
            : rawStreams.length
              ? "المصادر أعادت روابط غير مباشرة أو غير مدعومة في مشغل الويب."
              : "لم تُرجع إضافات البث المفعّلة روابط لهذا العنوان.";
          streamsArea.append(note);
        }
        sourceProgress.textContent = "اكتمل الفحص: " + providers.length + " إضافة، " + streams.length + " مصدر تشغيل فريد.";
        if (failedResults.length) {
          const errors = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = "تفاصيل تعذر الوصول إلى " + failedProviders + " إضافة";
          errors.append(summary);
          failedResults.forEach(result => {
            const item = document.createElement("small");
            item.className = "is-error";
            item.textContent = result.reason?.message || "تعذر الاتصال بمصدر.";
            errors.append(item);
          });
          streamsArea.append(errors);
        }
        streams.forEach((stream, index) => {
          const row = document.createElement("article");
          row.className = "addon-stream-row";
          const name = document.createElement("strong");
          name.textContent = [stream.name || stream.title || ("مصدر " + (index + 1)), (stream._raifProviders || [stream._raifProviderName]).join("، ")].filter(Boolean).join(" · ");
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
                  try { await openStreamPlayer(target.href, name.textContent, stream, catalogEntry.type + ":" + meta.id + ":" + (selectedVideoId || "")); }
                  catch (error) {
                    const playerDialog = document.querySelector("#player-dialog");
                    if (playerDialog.open) playerDialog.close();
                    disposeStreamPlayer();
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
            note.textContent = "فيديو خارجي عبر YouTube.";
            const playEmbed = document.createElement("button");
            playEmbed.type = "button";
            playEmbed.className = "save-btn stream-play-btn";
            playEmbed.textContent = "تشغيل داخل RAIF";
            playEmbed.addEventListener("click", async () => {
              if (!/^[A-Za-z0-9_-]{6,20}$/.test(String(stream.ytId))) {
                note.textContent = "معرّف الفيديو الخارجي غير صالح.";
                return;
              }
              try {
                await openEmbedPlayer("https://www.youtube-nocookie.com/embed/" + encodeURIComponent(stream.ytId), name.textContent);
              } catch (error) { note.textContent = error.message; }
            });
            row.append(note, playEmbed);
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
    content.append(streamsButton, bestButton, streamsArea);
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
  resetAddonDiscovery();
  await loadSources();
  if (activeView !== "library" && activeView !== "sources") loadAddonDiscovery(activeView);
}

async function deleteSource(id) {
  const { error } = await supabase.from("user_addons").delete().eq("id", id);
  if (error) {
    setStatus(sourceStatus, "تعذر حذف المصدر: " + error.message, true);
    return;
  }
  setStatus(sourceStatus, "تم حذف المصدر من حسابك.");
  resetAddonDiscovery();
  await loadSources();
  if (activeView !== "library" && activeView !== "sources") loadAddonDiscovery(activeView);
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
  resetAddonDiscovery();
  await loadSources();
  if (activeView !== "library" && activeView !== "sources") loadAddonDiscovery(activeView);
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
    resetAddonDiscovery();
    await loadSources();
    if (activeView !== "library" && activeView !== "sources") loadAddonDiscovery(activeView);
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
  savedItems = [];
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
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js", {scope:"./"})
    .catch(error => console.warn("RAIF PWA registration failed:", error));
}
