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
    .select("id,addon_id,name,manifest_url,enabled,created_at")
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
    const details = document.createElement("div");
    details.className = "source-details";
    const name = document.createElement("strong");
    name.textContent = addon.name || addon.addon_id;
    const url = document.createElement("span");
    url.textContent = addon.manifest_url;
    details.append(name, url);

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
    card.append(details, actions);
    list.append(card);
  });
}

const addonCatalogResults = document.createElement("section");
addonCatalogResults.id = "source-catalog-results";
addonCatalogResults.className = "addon-catalog-results";
addonCatalogResults.setAttribute("aria-live", "polite");
document.querySelector("#source-list").after(addonCatalogResults);

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchAddonJson(url, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      headers: {Accept: "application/json"},
      signal: controller.signal
    });
    if (!response.ok) throw new Error(label + " أعاد HTTP " + response.status);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 1_500_000) throw new Error("حجم استجابة المصدر أكبر من الحد المسموح.");
    const raw = await response.text();
    if (raw.length > 1_500_000) throw new Error("حجم استجابة المصدر أكبر من الحد المسموح.");
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("استجابة المصدر ليست JSON صالحاً.");
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("انتهت مهلة الاتصال بالمصدر.");
    if (error instanceof TypeError) throw new Error("تعذر الوصول للمصدر. تحقق من الرابط أو دعم CORS في خادم الإضافة.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function addonEndpoint(manifestUrl, parts, query = {}) {
  const manifest = safeHttpsUrl(manifestUrl);
  if (!manifest) throw new Error("يجب أن يكون رابط Manifest آمناً ويستخدم HTTPS.");
  const endpoint = new URL(manifest.href);
  endpoint.search = "";
  endpoint.hash = "";
  endpoint.pathname = endpoint.pathname.replace(/manifest[.]json$/i, "");
  if (!endpoint.pathname.endsWith("/")) endpoint.pathname += "/";
  endpoint.pathname += parts.map(part => encodeURIComponent(String(part))).join("/") + ".json";
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") endpoint.searchParams.set(key, String(value));
  }
  return endpoint;
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
    const manifest = await fetchAddonJson(manifestUrl.href, "Manifest");
    if (!manifest || typeof manifest !== "object" || !manifest.id || !manifest.name ||
        !Array.isArray(manifest.resources) || !Array.isArray(manifest.catalogs)) {
      throw new Error("ملف Manifest لا يطابق بنية إضافة Stremio المتوقعة.");
    }
    const supportsCatalog = manifest.resources.some(resource =>
      resource === "catalog" || (resource && typeof resource === "object" && resource.name === "catalog")
    );
    if (!supportsCatalog || manifest.catalogs.length === 0) {
      throw new Error("هذا المصدر لا يعلن عن أي كتالوج قابل للعرض.");
    }

    addonCatalogResults.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "addon-results-heading";
    const title = document.createElement("h3");
    title.textContent = manifest.name;
    const subtitle = document.createElement("p");
    subtitle.textContent = manifest.description || "اختر كتالوجاً لعرض عناوينه.";
    heading.append(title, subtitle);
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
    const url = addonEndpoint(addon.manifest_url, ["catalog", entry.type, entry.id], {skip: 0, ...extra});
    const data = await fetchAddonJson(url.href, "الكتالوج");
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

document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(entry => entry.classList.toggle("active", entry === button));
  render();
}));

search.addEventListener("input", render);
document.querySelector("#close-dialog").addEventListener("click", () => document.querySelector("#detail-dialog").close());
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
