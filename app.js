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

const catalog = document.querySelector("#catalog");
const search = document.querySelector("#search");
const empty = document.querySelector("#empty");
const authDialog = document.querySelector("#auth-dialog");
const authStatus = document.querySelector("#auth-status");
const accountStatus = document.querySelector("#account-status");
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
  document.querySelector("#section-title").textContent =
    ({home:"اكتشف المحتوى",movies:"الأفلام",series:"المسلسلات",anime:"الأنمي",library:"مكتبتي"})[activeView];
  document.querySelector("#catalog").scrollIntoView({behavior:"smooth",block:"start"});
  render();
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
  Promise.resolve().then(loadFavorites);
});

const { data: { session } } = await supabase.auth.getSession();
currentUser = session?.user || null;
updateAuthView();
await loadFavorites();
render();
