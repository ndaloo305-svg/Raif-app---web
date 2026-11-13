import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";

const SUPABASE_URL = "https://wdgjjqwxsluumltezqlp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQ-8YLFPKOLy8MCQnu0gkQ_QOm0b_bn";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const items = [
 {id:1,title:"رحلة إلى المجهول",type:"movie",year:"2025",genre:"مغامرة",symbol:"✧",c1:"#4d3b35",c2:"#171c2b",description:"عنوان تجريبي لعرض شكل بطاقة المحتوى وتفاصيلها داخل واجهة RAIF."},
 {id:2,title:"مدينة الظلال",type:"series",year:"2024",genre:"دراما",symbol:"◈",c1:"#273d4a",c2:"#151a25",description:"بيانات تجريبية فقط. لم يتم ربط أي مزود محتوى أو مصدر بث بعد."},
 {id:3,title:"آخر المحاربين",type:"anime",year:"2025",genre:"أنمي",symbol:"武",c1:"#6b3e35",c2:"#241923",description:"بطاقة أنمي تجريبية لا تمثل عملاً حقيقياً أو رابط مشاهدة."},
 {id:4,title:"ما وراء النجوم",type:"movie",year:"2023",genre:"خيال علمي",symbol:"✦",c1:"#334b63",c2:"#17192b",description:"مساحة مخصصة مستقبلاً لبيانات TMDB أو مصدر بيانات تختاره."},
 {id:5,title:"ملفات سرية",type:"series",year:"2025",genre:"تشويق",symbol:"⌁",c1:"#51433a",c2:"#1b1b22",description:"سيتم لاحقاً توصيل صفحة التفاصيل بمصادر المحتوى المتاحة."},
 {id:6,title:"أفق جديد",type:"anime",year:"2024",genre:"خيال",symbol:"星",c1:"#66513b",c2:"#202238",description:"هذا المحتوى الوهمي موجود لاختبار العرض والبحث والتصفية فقط."}
];

let activeFilter = "all";
let activeView = "home";
let currentUser = null;
let savedIds = [];
let favoritesLoading = false;
let addons = [];

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
  document.querySelector("#account-button").textContent = signedIn
    ? (currentUser.email?.trim()?.[0]?.toUpperCase() || "✓")
    : "N";
  document.querySelector("#account-button").setAttribute(
    "aria-label",
    signedIn ? "الحساب المتصل" : "تسجيل الدخول"
  );
  if (signedIn) {
    document.querySelector("#account-email").textContent = currentUser.email || "حساب RAIF";
  }
}

function itemContentType(item) {
  // The existing RAIF favorites schema supports movie, series and episode.
  // Anime titles are stored as series with their display category retained in metadata.
  return item.type === "movie" ? "movie" : "series";
}

function render() {
  const q = search.value.trim().toLocaleLowerCase("ar");
  const filtered = items.filter(item =>
    (activeFilter === "all" || item.type === activeFilter) &&
    (activeView !== "library" || savedIds.includes(item.id)) &&
    (item.title.toLocaleLowerCase("ar").includes(q) ||
      item.genre.toLocaleLowerCase("ar").includes(q))
  );

  catalog.innerHTML = filtered.map(item => `
    <article class="media-card" tabindex="0" role="button" data-id="${item.id}" aria-label="تفاصيل ${item.title}">
      <div class="poster" style="--c1:${item.c1};--c2:${item.c2}">
        <span class="poster-art">${item.symbol}</span>
        <span class="poster-label">${typeNames[item.type]} · ${item.year}</span>
      </div>
      <div class="media-title">${item.title}</div>
      <div class="media-meta">${item.genre} · ${typeNames[item.type]}</div>
    </article>
  `).join("");

  if (activeView === "library" && !currentUser) {
    empty.textContent = "سجّل الدخول أولاً لعرض مكتبتك المحفوظة على RAIF.";
  } else if (activeView === "library" && favoritesLoading) {
    empty.textContent = "جارٍ تحميل مكتبتك...";
  } else {
    empty.textContent = activeView === "library"
      ? "مكتبتك فارغة حالياً. أضف عناوين من نافذة التفاصيل."
      : "لا توجد نتائج مطابقة. جرّب كلمة بحث أخرى.";
  }
  empty.hidden = filtered.length > 0;
  catalog.querySelectorAll(".media-card").forEach(card => {
    card.addEventListener("click", () => openDetail(Number(card.dataset.id)));
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetail(Number(card.dataset.id));
      }
    });
  });
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
    fetchAddonResource(addon, "manifest").then(manifest => {
      const asset = safeAddonAssetUrl(manifest?.logo || manifest?.icon, addon.manifest_url);
      if (!asset) return;
      const image = document.createElement("img");
      image.src = asset.href;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.onerror = () => image.remove();
      logo.replaceChildren(image);
    }).catch(() => {});

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
  if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = target.href;
    status.textContent = "تم تجهيز بث HLS. اضغط تشغيل.";
  } else if (isHls) {
    try {
      const {default: Hls} = await import("https://esm.sh/hls.js@1.6.13");
      if (!Hls.isSupported()) throw new Error("المتصفح لا يدعم HLS عبر Media Source Extensions.");
      activeHlsPlayer = new Hls({enableWorker:true, lowLatencyMode:false, maxBufferLength:30});
      activeHlsPlayer.attachMedia(video);
      activeHlsPlayer.on(Hls.Events.MEDIA_ATTACHED, () => activeHlsPlayer?.loadSource(target.href));
      activeHlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => { status.textContent = "تم تحميل قائمة HLS. اضغط تشغيل."; });
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
      status.textContent = "تم تحميل مشغل DASH. اضغط تشغيل.";
    } catch (error) { status.textContent = "تعذر تجهيز DASH: " + error.message; status.classList.add("is-error"); }
  } else {
    video.src = target.href;
    status.textContent = "تم إرسال رابط الوسائط إلى المشغل. اضغط تشغيل.";
  }
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
        const streamData = await fetchAddonResource(addon, "stream", catalogEntry.type, meta.id);
        const rawStreams = Array.isArray(streamData?.streams) ? streamData.streams : [];
        const streams = rawStreams.filter(stream => {
          if (stream?.infoHash || stream?.externalUrl || stream?.ytId || stream?.behaviorHints?.notWebReady) return false;
          if (typeof stream?.url !== "string") return false;
          try { const url = new URL(stream.url); return url.protocol === "https:" && !url.username && !url.password && !/\.torrent$/i.test(url.pathname); }
          catch { return false; }
        });
        if (!streams.length) {
          const note = document.createElement("p");
          note.textContent = rawStreams.length ? "لم نجد روابط مباشرة قابلة للتشغيل؛ تم إخفاء التورنت والروابط التي تتطلب خدمة خارجية." : "لم يُرجع هذا المصدر خيارات تشغيل لهذا العنوان.";
          streamsArea.append(note);
        }
        streams.forEach((stream, index) => {
          const row = document.createElement("article");
          row.className = "addon-stream-row";
          const name = document.createElement("strong");
          name.textContent = stream.name || stream.title || ("مصدر " + (index + 1));
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
}

async function deleteSource(id) {
  const { error } = await supabase.from("user_addons").delete().eq("id", id);
  if (error) {
    setStatus(sourceStatus, "تعذر حذف المصدر: " + error.message, true);
    return;
  }
  setStatus(sourceStatus, "تم حذف المصدر من حسابك.");
  await loadSources();
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
});


const unsupportedAddonPattern = /torrent|debrid|realdebrid|peerflix|p2p|jackettio|torrentio|torrin|aiostreams|comet|one pace|cinetorrent|torrentsdb|torrentclaw|torrentfreaks|brazuca|absolute cinema|orion|meteor|\bRD\b/i;
function shouldSkipAddon(source) {
  const label = String(source?.name || "");
  let host = "";
  try { host = new URL(source?.url || "").hostname; } catch {}
  const rawUrl = String(source?.url || "");
  return unsupportedAddonPattern.test(label) || /torrent|debrid|realdebrid|peerflix/i.test(host) || /realdebrid|debrid(?:=|%3d)/i.test(rawUrl);
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
    const accepted = [];
    let skipped = 0, failed = 0, duplicates = 0;
    for (const source of sources) {
      const rawUrl = typeof source?.url === "string" ? source.url.trim() : "";
      let url;
      try {
        url = new URL(rawUrl);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe");
      } catch { skipped++; continue; }
      if (shouldSkipAddon(source)) { skipped++; continue; }
      if (known.has(url.href)) { duplicates++; continue; }
      try {
        const manifest = await fetchAddonManifestByUrl(url.href);
        if (!manifest || typeof manifest !== "object" || !manifest.id ||
            !Array.isArray(manifest.resources)) { failed++; continue; }
        const resources = manifest.resources.map(resource =>
          typeof resource === "string" ? resource : resource?.name
        ).filter(Boolean);
        const supported = resources.some(resource =>
          ["catalog", "stream", "subtitles", "meta"].includes(resource)
        );
        if (!supported) { skipped++; continue; }
        accepted.push({
          user_id: currentUser.id,
          addon_id: String(manifest.id).slice(0, 255),
          name: String(source.name || manifest.name || manifest.id).slice(0, 100),
          manifest_url: url.href,
          enabled: true,
          config: {raif_imported: true, resources}
        });
        known.add(url.href);
      } catch { failed++; }
    }
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

document.querySelector("#auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.querySelector("#auth-email").value.trim();
  const submit = document.querySelector("#auth-submit");
  if (!email) return;
  submit.disabled = true;
  submit.textContent = "جارٍ الإرسال...";
  setStatus(authStatus, "جارٍ إرسال رابط الدخول إلى بريدك...");
  const redirectUrl = new URL(window.location.href);
  redirectUrl.search = "";
  redirectUrl.hash = "";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {emailRedirectTo: redirectUrl.toString(), shouldCreateUser: true}
  });
  submit.disabled = false;
  submit.textContent = "إرسال رابط الدخول";
  if (error) {
    setStatus(authStatus, "تعذر إرسال الرابط: " + error.message, true);
  } else {
    setStatus(authStatus, "أرسلنا رابط الدخول إلى بريدك. افتح الرسالة من نفس المتصفح لإكمال تسجيل الدخول.");
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

const { data: { session } } = await supabase.auth.getSession();
currentUser = session?.user || null;
updateAuthView();
await loadFavorites();
render();
if (activeView === "sources") await loadSources();
