import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";

const SUPABASE_URL = "https://puhipyjljmbvczijtzkb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cfCNLzoEfFSf5mLwunrmCw_qDdyWIo7";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const items = [];

let activeFilter = "all";
let activeGenre = "all";
let activeSort = "recommended";
let activeView = "home";
let currentUser = null;
const SHARED_ACCOUNT_EMAIL = "raif-shared@puhipyjljmbvczijtzkb.supabase.co";
let savedIds = [];
let watchedRecords = [];
let favoritesLoading = false;
function watchHistoryKey(){return currentUser ? "raif-watch-history-v1:"+currentUser.id : null;}
function watchHistorySyncKey(){return currentUser?"raif-watch-history-synced-v1:"+currentUser.id:null;}
function watchHistoryQueueKey(){return currentUser?"raif-watch-history-queue-v1:"+currentUser.id:null;}
function readWatchHistoryQueue(){try{const value=JSON.parse(localStorage.getItem(watchHistoryQueueKey())||"[]");return Array.isArray(value)?value.filter(x=>x&&typeof x.op==="string"):[];}catch{return[];}}
function writeWatchHistoryQueue(queue){try{const key=watchHistoryQueueKey();if(key)localStorage.setItem(key,JSON.stringify(queue));}catch(error){console.warn("RAIF watch queue save failed",error);}}
function episodeKey(record){return record.episodeId?String(record.episodeId):"";}
function watchRecordKey(record){return String(record.identity)+"::"+episodeKey(record);}
function watchRecordToRow(record){const metadata={title:record.title||"",type:record.type||"",year:record.year||"",episodeTitle:record.episodeTitle||"",season:record.season??null,episode:record.episode??null};return{user_id:currentUser.id,identity:record.identity,episode_key:episodeKey(record),metadata,watched_at:record.watchedAt||new Date().toISOString()};}
function queueWatchUpsert(record){const queue=readWatchHistoryQueue();const key=watchRecordKey(record);const next=queue.filter(x=>!(x.identity+"::"+String(x.episode_key||"")===key));next.push({op:"upsert",identity:record.identity,episode_key:episodeKey(record),record});writeWatchHistoryQueue(next);}
function queueWatchDelete(identity,episodeId=""){const queue=readWatchHistoryQueue();const key=String(identity)+"::"+String(episodeId||"");const next=queue.filter(x=>!(x.identity+"::"+String(x.episode_key||"")===key));next.push({op:"delete",identity:String(identity),episode_key:String(episodeId||"")});writeWatchHistoryQueue(next);}
async function flushWatchHistoryQueue(){if(!currentUser)return false;const queue=readWatchHistoryQueue();for(let i=0;i<queue.length;i++){const change=queue[i];let result;if(change.op==="upsert"&&change.record){result=await supabase.from("watch_history").upsert(watchRecordToRow(change.record),{onConflict:"user_id,identity,episode_key"});}else if(change.op==="delete"){result=await supabase.from("watch_history").delete().eq("user_id",currentUser.id).eq("identity",change.identity).eq("episode_key",String(change.episode_key||""));}if(result?.error){writeWatchHistoryQueue(queue.slice(i));setStatus(accountStatus,"تعذرت مزامنة سجل المشاهدة؛ حُفظت التغييرات على هذا الجهاز وستُعاد المحاولة. "+result.error.message,true);return false;}}writeWatchHistoryQueue([]);return true;}
async function loadWatchHistory(){watchedRecords=[];const localKey=watchHistoryKey();if(!localKey||!currentUser)return;let localRecords=[];try{const value=JSON.parse(localStorage.getItem(localKey)||"[]");if(Array.isArray(value))localRecords=value.filter(x=>x&&typeof x.identity==="string");}catch{}const{data,error}=await supabase.from("watch_history").select("identity,episode_key,metadata,watched_at").eq("user_id",currentUser.id);if(error){watchedRecords=localRecords;setStatus(accountStatus,"تعذر تحميل سجل المشاهدة من السحابة؛ نعرض النسخة المحلية. "+error.message,true);render();return;}const synced=localStorage.getItem(watchHistorySyncKey())==="1";const merged=new Map((data||[]).map(row=>{const meta=row.metadata&&typeof row.metadata==="object"?row.metadata:{};const record={identity:row.identity,title:meta.title||"",type:meta.type||"",year:meta.year||"",watchedAt:row.watched_at,episodeId:row.episode_key||"",episodeTitle:meta.episodeTitle||"",season:meta.season??null,episode:meta.episode??null};if(!record.episodeId)delete record.episodeId;return[watchRecordKey(record),record];}));let queue=readWatchHistoryQueue();if(!synced){for(const record of localRecords){const key=watchRecordKey(record);if(!merged.has(key)&&!queue.some(change=>change.identity+"::"+String(change.episode_key||"")===key))queue.push({op:"upsert",identity:record.identity,episode_key:episodeKey(record),record});}}for(const change of queue){const key=String(change.identity)+"::"+String(change.episode_key||"");if(change.op==="delete")merged.delete(key);else if(change.op==="upsert"&&change.record)merged.set(key,change.record);}writeWatchHistoryQueue(queue);watchedRecords=[...merged.values()];const syncedOk=await flushWatchHistoryQueue();if(syncedOk){localStorage.setItem(watchHistorySyncKey(),"1");saveWatchHistory();}render();}
async function syncWatchRecord(record){if(!currentUser)return;queueWatchUpsert(record);await flushWatchHistoryQueue();saveWatchHistory();}
function isTitleWatched(item){return watchedRecords.some(x=>x.identity===item.identity&&!x.episodeId);}
function isEpisodeWatched(identity,id){return watchedRecords.some(x=>x.identity===identity&&x.episodeId===String(id));}
function getEpisodeWatchCount(identity){return new Set(watchedRecords.filter(x=>x.identity===identity&&x.episodeId).map(x=>x.episodeId)).size;}
async function toggleTitleWatched(item){if(!currentUser){authDialog.showModal();setStatus(authStatus,"سجّل الدخول لتسجيل المشاهدة.");return;}if(isTitleWatched(item)){watchedRecords=watchedRecords.filter(x=>!(x.identity===item.identity&&!x.episodeId));queueWatchDelete(item.identity,"");}else{const record={identity:item.identity,title:item.title,type:item.type,year:item.year,watchedAt:new Date().toISOString()};watchedRecords.push(record);queueWatchUpsert(record);}saveWatchHistory();render();await flushWatchHistoryQueue();}
async function markEpisodeWatched(item,episode){if(!currentUser){authDialog.showModal();setStatus(authStatus,"سجّل الدخول لتسجيل تقدم الحلقات.");return;}const id=String(episode?.id||"");if(!id)return;const existing=watchedRecords.find(record=>record.identity===item.identity&&record.episodeId===id);if(existing){watchedRecords=watchedRecords.filter(record=>!(record.identity===item.identity&&record.episodeId===id));queueWatchDelete(item.identity,id);saveWatchHistory();await flushWatchHistoryQueue();render();return;}const record={identity:item.identity,title:item.title,type:item.type,year:item.year,episodeId:id,episodeTitle:episode.title||"",season:episode.season??null,episode:episode.episode??null,watchedAt:new Date().toISOString()};watchedRecords.push(record);saveWatchHistory();await syncWatchRecord(record);render();}
let addons = [];
let addonCatalogItems = [];
let addonCatalogIndex = new Map();
let catalogDisplayLimit = 72;
let catalogFilteredCount = 0;
let catalogMoreLoading = false;
let addonCatalogLoading = false;
const addonCatalogPages = new Map();
const CATALOG_PAGE_SIZE = 100;
const addonDiscoveryCache = new Set();
const addonManifestCache = new Map();
const addonDiscoveryErrors = [];
const ADDON_MANIFEST_CACHE_TTL = 6 * 60 * 60 * 1000;
function addonManifestStorageKey(addon){return currentUser&&addon?.id?"raif-addon-manifest-v1:"+currentUser.id+":"+addon.id:null;}
function removeAddonManifestCache(addon){
  removeAddonManifestCache(addon);
  try{const key=addonManifestStorageKey(addon);if(key)localStorage.removeItem(key);}catch{}
}
function clearAddonManifestCache(){
  clearAddonManifestCache();
  addons.forEach(removeAddonManifestCache);
}
let addonDiscoveryRun = 0;

const catalog = document.querySelector("#catalog");
const search = document.querySelector("#search");
const empty = document.querySelector("#empty");
const authDialog = document.querySelector("#auth-dialog");
const authStatus = document.querySelector("#auth-status");
const accountStatus = document.querySelector("#account-status");
const sourceStatus = document.querySelector("#source-status");
const typeNames = {movie:"فيلم",series:"مسلسل",anime:"أنمي"};

const CATALOG_CACHE_VERSION = 2;
const CATALOG_CACHE_TTL = 6 * 60 * 60 * 1000;
const CATALOG_VISIBLE_BATCH = 72;
function catalogCacheKey() {
  return currentUser ? "raif-catalog-cache-v" + CATALOG_CACHE_VERSION + ":" + currentUser.id : null;
}
function saveCatalogCache() {
  const key = catalogCacheKey();
  if (!key || !addonCatalogItems.length) return;
  try {
    const enabledIds = new Set(addons.filter(addon => addon.enabled).map(addon => addon.id));
    const entries = addonCatalogItems.flatMap(item => item.providers
      .filter(provider => enabledIds.has(provider.addon.id))
      .map(provider => ({addonId:provider.addon.id,catalogEntry:provider.catalogEntry,meta:provider.meta})));
    const catalogPages = [...addonCatalogPages.values()].map(page => ({addonId:page.addon.id,entry:page.entry,nextSkip:page.nextSkip,hasMore:page.hasMore}));
    localStorage.setItem(key, JSON.stringify({version:CATALOG_CACHE_VERSION,savedAt:Date.now(),entries,catalogPages}));
  } catch (error) {
    console.warn("RAIF catalog cache could not be saved:", error);
  }
}
function restoreCatalogCache() {
  const key = catalogCacheKey();
  if (!key) { render(); return; }
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached?.version !== CATALOG_CACHE_VERSION || !Array.isArray(cached.entries)) { render(); return; }
    const enabled = new Map(addons.filter(addon => addon.enabled).map(addon => [addon.id,addon]));
    const fresh = Number.isFinite(cached.savedAt) && Date.now() - cached.savedAt < CATALOG_CACHE_TTL;
    if (Array.isArray(cached.catalogPages)) cached.catalogPages.forEach(page => {
      const addon = enabled.get(page.addonId);
      if (addon && page.entry?.id && page.entry?.type && Number.isFinite(page.nextSkip)) {
        const pageKey = addon.id + "|" + page.entry.type + "|" + page.entry.id;
        addonCatalogPages.set(pageKey,{addon,entry:page.entry,nextSkip:page.nextSkip,hasMore:page.hasMore===true,loading:false});
        if (fresh) addonDiscoveryCache.add(pageKey);
      }
    });
    cached.entries.forEach(entry => {
      const addon = enabled.get(entry.addonId);
      if (addon && entry.catalogEntry && entry.meta) {
        mergeCatalogMeta(addon,entry.catalogEntry,entry.meta);
        if (fresh && entry.catalogEntry.id && entry.catalogEntry.type) {
          addonDiscoveryCache.add(addon.id + "|" + entry.catalogEntry.type + "|" + entry.catalogEntry.id);
        }
      }
    });
  } catch (error) {
    console.warn("RAIF catalog cache could not be restored:", error);
  }
  render();
}


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

const GENRE_LABELS = new Map([
  ["action","أكشن"],["adventure","مغامرة"],["animation","رسوم متحركة"],["anime","أنمي"],
  ["comedy","كوميديا"],["crime","جريمة"],["documentary","وثائقي"],["drama","دراما"],
  ["family","عائلي"],["fantasy","فانتازيا"],["history","تاريخي"],["horror","رعب"],
  ["music","موسيقي"],["mystery","غموض"],["romance","رومانسي"],["sci fi","خيال علمي"],
  ["science fiction","خيال علمي"],["thriller","إثارة وتشويق"],["war","حربي"],
  ["western","ويسترن"],["reality","تلفزيون واقعي"],["news","أخبار"],
  ["talk show","حواري"],["sport","رياضي"],["sports","رياضي"],
  ["sci fi fantasy","خيال علمي وفانتازيا"]
]);
function genreDisplayName(value) {
  const raw=String(value||"").trim();
  return GENRE_LABELS.get(normalizeTitle(raw))||raw;
}

function catalogIdentity(type, meta) {
  const imdb = [meta?.imdb_id,meta?.imdbId,meta?.id].find(value => typeof value === "string" && /^tt\d+$/i.test(value.trim()));
  const tmdb = [meta?.tmdb_id,meta?.tmdbId].find(value => value != null && /^\d+$/.test(String(value).trim()));
  if (imdb) return type + "|imdb|" + imdb.toLowerCase();
  if (tmdb) return type + "|tmdb|" + String(tmdb).trim();
  const title = normalizeTitle(meta?.name || meta?.title || meta?.id);
  const year = String(meta?.year || "").match(/\d{4}/)?.[0] || "";
  return type + "|title|" + title + "|" + year;
}

function mergeCatalogMeta(addon, entry, meta) {
  if (!meta?.id) return;
  const type = entry.type === "anime" ? "anime" : entry.type;
  const identity = catalogIdentity(type, meta);
  let item = addonCatalogIndex.get(identity);
  const provider = {addon, catalogEntry:entry, meta};
  if (item) {
    const existingProvider = item.providers.find(source => source.addon.id === addon.id && source.meta.id === meta.id);
    if (existingProvider) {
      existingProvider.catalogEntry = entry;
      existingProvider.meta = meta;
    } else item.providers.push(provider);
    if (!item.poster && meta.poster) item.poster = meta.poster;
    if (item.addon.id === addon.id && item.meta.id === meta.id) {
      item.meta = meta;
      item.catalogEntry = entry;
      item.title = meta.name || meta.title || meta.id;
      item.year = meta.year || "";
      item.genre = Array.isArray(meta.genres) ? meta.genres.map(genreDisplayName).join("، ") : "";
      item.poster = meta.poster || item.poster;
    }
    return;
  }
  item = {_kind:"addon",identity,providers:[provider],addon,catalogEntry:entry,meta,id:meta.id,type,title:meta.name || meta.title || meta.id,year:meta.year || "",genre:Array.isArray(meta.genres) ? meta.genres.map(genreDisplayName).join("، ") : "",poster:meta.poster || ""};
  addonCatalogItems.push(item);
  addonCatalogIndex.set(identity,item);
}

function getItemGenres(item) {
  const raw = Array.isArray(item?.meta?.genres) ? item.meta.genres : (typeof item?.genre === "string" ? item.genre.split(/[،,]/) : []);
  return [...new Set(raw.map(value => String(value || "").trim()).filter(Boolean))];
}

function renderGenreFilters(items) {
  const host = document.querySelector("#genre-filters");
  if (!host) return;
  const known = new Map();
  items.forEach(item => getItemGenres(item).forEach(genre => {
    const key = normalizeTitle(genre);
    if (key && !known.has(key)) known.set(key, genre);
  }));
  if (activeGenre !== "all" && !known.has(activeGenre)) activeGenre = "all";
  host.replaceChildren();
  const choices = [["all", "كل التصنيفات"], ...[...known.entries()].sort((a,b) => a[1].localeCompare(b[1], "ar")).map(([key,label]) => [key,label])];
  choices.forEach(([key,label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "genre-chip" + (activeGenre === key ? " active" : "");
    button.textContent = key === "all" ? label : genreDisplayName(label);
    button.setAttribute("aria-pressed", String(activeGenre === key));
    button.addEventListener("click", () => { activeGenre = key; render(); });
    host.append(button);
  });
  host.hidden = known.size === 0;
}

function renderContinueWatching(){
  const section=document.querySelector("#continue-watching");
  const host=document.querySelector("#continue-watching-list");
  if(!section||!host)return;
  host.replaceChildren();
  const latestByIdentity=new Map();
  watchedRecords.filter(record=>record.episodeId).forEach(record=>{
    const previous=latestByIdentity.get(record.identity);
    if(!previous||Date.parse(record.watchedAt||0)>Date.parse(previous.watchedAt||0))latestByIdentity.set(record.identity,record);
  });
  const entries=[...latestByIdentity.values()].map(record=>({
    record,
    item:addonCatalogIndex.get(record.identity)
  })).filter(entry=>entry.item).sort((a,b)=>Date.parse(b.record.watchedAt||0)-Date.parse(a.record.watchedAt||0)).slice(0,8);
  section.hidden=activeView!=="home"||entries.length===0;
  entries.forEach(({record,item})=>{
    const card=document.createElement("article");card.className="continue-card";
    const poster=document.createElement("div");poster.className="continue-poster";
    const url=safeAddonAssetUrl(item.poster,item.addon.manifest_url);
    if(url){const img=document.createElement("img");img.src=url.href;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";img.onerror=()=>img.remove();poster.append(img);}
    else{const fallback=document.createElement("span");fallback.textContent="RAIF";poster.append(fallback);}
    const details=document.createElement("div");details.className="continue-details";
    const title=document.createElement("strong");title.textContent=item.title;
    const episode=document.createElement("span");episode.textContent=[record.season!=null?"الموسم "+record.season:"",record.episode!=null?"الحلقة "+record.episode:"",record.episodeTitle].filter(Boolean).join(" · ")||"آخر حلقة سجلتها";
    const count=document.createElement("small");count.textContent=getEpisodeWatchCount(item.identity).toLocaleString("ar")+" حلقة مسجلة";
    const action=document.createElement("button");action.type="button";action.className="save-btn";action.textContent="متابعة المسلسل";
    action.addEventListener("click",()=>openAddonMeta(item.addon,item.catalogEntry,item.meta,item.providers));
    details.append(title,episode,count,action);card.append(poster,details);host.append(card);
  });
}
 
function renderRecommendations(){
  const section=document.querySelector("#recommendations");
  const host=document.querySelector("#recommendations-list");
  if(!section||!host)return;
  if(activeView!=="home"){section.hidden=true;return;}
  host.replaceChildren();
  const seedIds=new Set([...savedIds,...watchedRecords.map(record=>record.identity)]);
  const seeds=addonCatalogItems.filter(item=>seedIds.has(item.identity));
  const genreWeights=new Map();
  seeds.forEach(item=>getItemGenres(item).forEach(genre=>{
    const key=normalizeTitle(genre);
    if(key)genreWeights.set(key,(genreWeights.get(key)||0)+1);
  }));
  const suggestions=addonCatalogItems.filter(item=>!seedIds.has(item.identity)&&!isTitleWatched(item))
    .map(item=>({item,score:getItemGenres(item).reduce((sum,genre)=>sum+(genreWeights.get(normalizeTitle(genre))||0),0)}))
    .filter(entry=>entry.score>0)
    .sort((a,b)=>b.score-a.score||(Number.parseInt(b.item.year,10)||0)-(Number.parseInt(a.item.year,10)||0))
    .slice(0,6);
  section.hidden=activeView!=="home"||suggestions.length===0;
  suggestions.forEach(({item})=>{
    const card=document.createElement("article");card.className="media-card recommendation-card";card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-label","تفاصيل "+item.title);
    const poster=document.createElement("div");poster.className="poster";
    const url=safeAddonAssetUrl(item.poster,item.addon.manifest_url);
    if(url){const img=document.createElement("img");img.src=url.href;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";img.onerror=()=>img.remove();poster.append(img);}
    else{const fallback=document.createElement("span");fallback.className="poster-art";fallback.textContent="RAIF";poster.append(fallback);}
    const title=document.createElement("div");title.className="media-title";title.textContent=item.title;
    const genres=document.createElement("div");genres.className="media-meta";genres.textContent=getItemGenres(item).slice(0,2).map(genreDisplayName).join(" · ");
    card.append(poster,title,genres);card.addEventListener("click",()=>openAddonMeta(item.addon,item.catalogEntry,item.meta,item.providers));
    card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();card.click();}});
    host.append(card);
  });
}

function render() {
  renderContinueWatching();
  renderRecommendations();
  const q=normalizeTitle(search.value);
  let filtered=addonCatalogItems.filter(item=>(activeFilter==="all"||item.type===activeFilter)&&(!q||normalizeTitle([item.title,item.genre,item.year].join(" ")).includes(q)));
  if(activeView==="library")filtered=filtered.filter(item=>savedIds.includes(item.identity));
  if(activeView==="watched")filtered=filtered.filter(item=>isTitleWatched(item));
  if(activeView==="progress")filtered=filtered.filter(item=>item.type!=="movie"&&getEpisodeWatchCount(item.identity)>0);
  renderGenreFilters(filtered);
  if(activeGenre !== "all") filtered=filtered.filter(item=>getItemGenres(item).some(genre=>normalizeTitle(genre)===activeGenre));
  if(activeSort==="latest"||activeSort==="oldest") filtered.sort((a,b)=>{
    const ay=Number.parseInt(a.year,10)||0, by=Number.parseInt(b.year,10)||0;
    return activeSort==="latest" ? by-ay : ay-by;
  });
  else if(activeSort==="title") filtered.sort((a,b)=>(a.title||"").localeCompare(b.title||"","ar"));
  const totalFiltered = filtered.length;
  catalogFilteredCount = totalFiltered;
  const visibleItems = filtered.slice(0,catalogDisplayLimit);
  const catalogFragment=document.createDocumentFragment();
  const watchedTitles = new Set(watchedRecords.filter(record=>!record.episodeId).map(record=>record.identity));
  const episodeCounts = new Map();
  watchedRecords.forEach(record=>{if(record.episodeId){let ids=episodeCounts.get(record.identity);if(!ids){ids=new Set();episodeCounts.set(record.identity,ids);}ids.add(record.episodeId);}});
  visibleItems.forEach(item=>{
    const card=document.createElement("article");card.className="media-card";card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-label","تفاصيل "+item.title);
    const poster=document.createElement("div");poster.className="poster";
    const url=safeAddonAssetUrl(item.poster,item.addon.manifest_url);
    if(url){const img=document.createElement("img");img.src=url.href;img.alt="";img.loading="lazy";img.decoding="async";img.referrerPolicy="no-referrer";img.onerror=()=>img.remove();poster.append(img);}
    else{const art=document.createElement("span");art.className="poster-art";art.textContent="RAIF";poster.append(art);}
    const badges=document.createElement("div");badges.className="poster-badges";
    const type=document.createElement("span");type.textContent=typeNames[item.type]||item.type;badges.append(type);
    if(savedIds.includes(item.identity)){const b=document.createElement("span");b.className="poster-saved";b.textContent="＋ قائمتي";badges.append(b);}
    if(watchedTitles.has(item.identity)){const b=document.createElement("span");b.className="poster-watched";b.textContent="✓ شاهدته";badges.append(b);}
    poster.append(badges);
    const title=document.createElement("div");title.className="media-title";title.textContent=item.title||"عنوان بدون اسم";
    const progress=episodeCounts.get(item.identity)?.size || 0;
    const meta=document.createElement("div");meta.className="media-meta";meta.textContent=[item.year,item.genre,item.providers.length+" مصدر",progress?progress+" حلقة مشاهدة":""].filter(Boolean).join(" · ");
    card.append(poster,title,meta);card.addEventListener("click",()=>openAddonMeta(item.addon,item.catalogEntry,item.meta,item.providers));
    card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();card.click();}});catalogFragment.append(card);
  });
  catalog.replaceChildren(catalogFragment);
  const loadMore = document.querySelector("#catalog-load-more");
  if (loadMore) {
    const wantedTypes = activeView === "movies" ? ["movie"] : activeView === "series" ? ["series"] : activeView === "anime" ? ["anime","series"] : ["movie","series","anime"];
    const hasMorePages = [...addonCatalogPages.values()].some(page => page.hasMore && wantedTypes.includes(page.entry.type));
    loadMore.hidden = totalFiltered <= visibleItems.length && !hasMorePages;
    loadMore.textContent = totalFiltered > visibleItems.length ? "عرض المزيد · " + (totalFiltered-visibleItems.length).toLocaleString("ar") + " متبقي" : (catalogMoreLoading ? "جارٍ تحميل عناوين إضافية..." : "تحميل المزيد من الكتالوجات");
    loadMore.disabled = catalogMoreLoading;
  }
  const count=document.querySelector("#catalog-count");if(count)count.textContent=totalFiltered.toLocaleString("ar")+" عنوان · "+filtered.reduce((n,x)=>n+x.providers.length,0).toLocaleString("ar")+" نتائج مصادر";
  const messages={library:currentUser?"قائمتك فارغة حالياً. أضف العناوين من صفحة التفاصيل.":"سجّل الدخول لعرض قائمتك.",watched:currentUser?"لم تسجّل أي عنوان كمشاهد حتى الآن.":"سجّل الدخول لعرض سجل المشاهدة.",progress:currentUser?"لا يوجد تقدم مسجل للحلقات حتى الآن.":"سجّل الدخول لمتابعة تقدم المسلسلات."};
  if(messages[activeView])empty.textContent=messages[activeView];
  else if(!currentUser)empty.textContent="سجّل الدخول أولاً لتحميل كتالوجات مصادرك.";
  else if(addonCatalogLoading&&!filtered.length)empty.textContent="جارٍ تحميل الكتالوجات من مصادرك… ستظهر النتائج تباعاً.";
  else if(!filtered.length&&addonDiscoveryErrors.length)empty.textContent="لم تصل عناوين. تعذّر تحميل "+addonDiscoveryErrors.length+" طلباً. افتح مصادري لمعرفة التفاصيل.";
  else if(!filtered.length)empty.textContent="لا توجد عناوين في هذا القسم من مصادرك المفعّلة.";
  empty.hidden=filtered.length>0;renderDiscoveryDiagnostics();
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

  savedIds = (data || []).map(row => String(row.content_id || "")).filter(Boolean);

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
        identity: item.identity,
        title: item.title,
        year: item.year,
        genre: item.genre,
        catalog_type: item.type,
        poster: item.poster || ""
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
  const contentId = item.identity;
  const contentType = itemContentType(item);
  let error;

  if (savedIds.includes(item.identity)) {
    ({ error } = await supabase.from("favorites")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("content_id", contentId)
      .eq("content_type", contentType));
    if (!error) savedIds = savedIds.filter(id => id !== item.identity);
  } else {
    ({ error } = await supabase.from("favorites").insert({
      user_id: currentUser.id,
      content_id: contentId,
      content_type: contentType,
      metadata: {
        identity: item.identity,
        title: item.title,
        year: item.year,
        genre: item.genre,
        catalog_type: item.type,
        poster: item.poster || ""
      }
    }));
    if (!error) savedIds = [...savedIds, item.identity];
  }

  if (error) {
    setStatus(accountStatus, "تعذر تحديث المكتبة: " + error.message, true);
    if (button) button.disabled = false;
    return;
  }

  setStatus(accountStatus, "تم تحديث مكتبتك ومزامنتها مع RAIF.");
  if (button) {
    button.textContent = savedIds.includes(item.identity) ? "إزالة من قائمتي" : "＋ أضف إلى قائمتي";
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

async function testAddonConnection(addon,button,status){
  button.disabled=true;button.textContent="جارٍ الفحص...";
  status.textContent="جارٍ الاتصال بالمصدر عبر وسيط RAIF...";
  status.className="source-health";
  try{
    removeAddonManifestCache(addon);
    const manifest=await fetchAddonResource(addon,"manifest");
    if(!manifest||!Array.isArray(manifest.resources))throw new Error("Manifest غير صالح أو لا يطابق بنية Stremio.");
    const resources=manifest.resources.map(resource=>typeof resource==="string"?resource:resource?.name).filter(Boolean);
    const catalogCount=(Array.isArray(manifest.catalogs)?manifest.catalogs:[]).filter(entry=>entry?.id&&entry?.type).length;
    const supportsStreams=resources.includes("stream");
    const supportsSubtitles=resources.includes("subtitles");
    const parts=["اتصال ناجح",catalogCount+" كتالوج"];
    parts.push(supportsStreams?"يوفر روابط تشغيل":"لا يوفر تشغيل");
    if(supportsSubtitles)parts.push("يوفر ترجمات");
    status.textContent=parts.join(" · ");
    status.classList.add("is-online");
  }catch(error){
    status.textContent="فشل الفحص: "+error.message;
    status.classList.add("is-error");
  }finally{
    button.disabled=false;button.textContent="فحص المصدر";
  }
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
  if (!addonCatalogItems.length) restoreCatalogCache();
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

    const health=document.createElement("p");
    health.className="source-health";
    health.textContent="لم يتم فحص الاتصال بعد.";
    card.append(identity,health);
    const actions = document.createElement("div");
    actions.className = "source-actions";
    const check=document.createElement("button");
    check.className="save-btn";check.type="button";check.textContent="فحص المصدر";
    check.addEventListener("click",()=>testAddonConnection(addon,check,health));
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
    actions.append(check,browse, toggle, remove);
    card.append(actions);
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
  if (resource === "manifest") {
    if (addonManifestCache.has(addon.id)) return addonManifestCache.get(addon.id);
    const storageKey = addonManifestStorageKey(addon);
    try {
      const stored = JSON.parse(storageKey ? localStorage.getItem(storageKey) || "null" : "null");
      if (stored?.manifest && Number.isFinite(stored.expiresAt) && stored.expiresAt > Date.now()) {
        const cached = Promise.resolve(stored.manifest);
        addonManifestCache.set(addon.id,cached);
        return cached;
      }
    } catch {}
    const request = invokeAddonProxy({action:"manifest",addon_id:addon.id,resource}, "Manifest");
    const cached = request.then(manifest => {
      try { if(storageKey)localStorage.setItem(storageKey,JSON.stringify({expiresAt:Date.now()+ADDON_MANIFEST_CACHE_TTL,manifest})); } catch {}
      return manifest;
    }).catch(error => { removeAddonManifestCache(addon); throw error; });
    addonManifestCache.set(addon.id,cached);
    return cached;
  }
  return invokeAddonProxy({action:"resource",addon_id:addon.id,resource,type,content_id:contentId,query},"المصدر");
}

function fetchAddonManifestByUrl(manifestUrl) {
  return invokeAddonProxy({action:"inspect_url", manifest_url:manifestUrl}, "Manifest");
}

async function loadAddonDiscovery(view = activeView) {
  if (!currentUser) return;
  const run = ++addonDiscoveryRun;
  if (view === "library" || view === "sources") {
    addonCatalogLoading = false;
    return;
  }
  const wanted = view === "movies" ? ["movie"] : view === "series" ? ["series"] : view === "anime" ? ["anime","series"] : ["movie","series","anime"];
  const enabled = addons.filter(addon => addon.enabled);
  addonCatalogLoading = true;
  addonDiscoveryErrors.length = 0;
  render();
  if (!enabled.length) {
    addonCatalogLoading = false;
    render();
    return;
  }
  const withTimeout = (promise,label,ms=12000) => Promise.race([
    promise,
    new Promise((_,reject) => setTimeout(() => reject(new Error("انتهت مهلة الاتصال: " + label)),ms))
  ]);
  const manifestResults = new Array(enabled.length);
  let manifestCursor = 0;
  const manifestWorker = async () => {
    while (manifestCursor < enabled.length && run === addonDiscoveryRun) {
      const index = manifestCursor++;
      const addon = enabled[index];
      try {
        const manifest = await withTimeout(fetchAddonResource(addon,"manifest"),"Manifest " + (addon.name || addon.addon_id));
        manifestResults[index] = {status:"fulfilled",value:{addon,manifest}};
      } catch(error) {
        removeAddonManifestCache(addon);
        manifestResults[index] = {status:"rejected",reason:Object.assign(new Error(error.message),{addon})};
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(5,enabled.length)},() => manifestWorker()));
  if (run !== addonDiscoveryRun) return;
  const jobs = [];
  manifestResults.forEach(result => {
    if (result.status === "rejected") {
      const addon = result.reason?.addon;
      addonDiscoveryErrors.push({addon:addon?.name || addon?.addon_id || "مصدر",message:result.reason?.message || "تعذر تحميل Manifest"});
      return;
    }
    const {addon,manifest} = result.value;
    const resources = Array.isArray(manifest?.resources) ? manifest.resources.map(resource => typeof resource === "string" ? resource : resource?.name) : [];
    if (!resources.includes("catalog")) return;
    const entries = (Array.isArray(manifest?.catalogs) ? manifest.catalogs : []).filter(entry => entry?.id && wanted.includes(entry.type));
    entries.forEach(entry => {
      const key = addon.id + "|" + entry.type + "|" + entry.id;
      if (addonDiscoveryCache.has(key)) return;
      jobs.push({addon,entry,key});
    });
  });
  let cursor = 0;
  let renderTimer = null;
  const scheduleRender = () => {
    if (renderTimer !== null) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      if (run === addonDiscoveryRun) render();
    },350);
  };
  const worker = async () => {
    while (cursor < jobs.length && run === addonDiscoveryRun) {
      const job = jobs[cursor++];
      try {
        const data = await withTimeout(
          fetchAddonResource(job.addon,"catalog",job.entry.type,job.entry.id,{skip:0}),
          "كتالوج " + (job.entry.name || job.entry.id)
        );
        if (run !== addonDiscoveryRun) return;
        if (!Array.isArray(data?.metas)) throw new Error("استجابة الكتالوج لا تحتوي قائمة عناوين صالحة.");
        data.metas.forEach(meta => mergeCatalogMeta(job.addon,job.entry,meta));
        addonCatalogPages.set(job.key,{addon:job.addon,entry:job.entry,nextSkip:data.metas.length,hasMore:data.metas.length>=CATALOG_PAGE_SIZE,loading:false});
        addonDiscoveryCache.add(job.key);
        scheduleRender();
      } catch(error) {
        if (run !== addonDiscoveryRun) return;
        addonDiscoveryCache.delete(job.key);
        addonDiscoveryErrors.push({addon:job.addon.name || job.addon.addon_id,catalog:job.entry.name || job.entry.id,message:error.message});
        console.warn("RAIF catalog load failed:",job.addon.name,job.entry.id,error);
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(6,jobs.length)},() => worker()));
  if (run === addonDiscoveryRun) {
    saveCatalogCache();
    addonCatalogLoading = false;
    render();
    renderDiscoveryDiagnostics();
  }
}
async function loadMoreCatalogPages() {
  const wantedTypes = activeView === "movies" ? ["movie"] : activeView === "series" ? ["series"] : activeView === "anime" ? ["anime","series"] : ["movie","series","anime"];
  const pages = [...addonCatalogPages.values()].filter(page => page.hasMore && !page.loading && wantedTypes.includes(page.entry.type));
  if (!pages.length) return;
  catalogMoreLoading = true;
  render();
  let cursor = 0;
  const worker = async () => {
    while (cursor < pages.length) {
      const page = pages[cursor++];
      page.loading = true;
      try {
        const data = await Promise.race([
          fetchAddonResource(page.addon,"catalog",page.entry.type,page.entry.id,{skip:page.nextSkip}),
          new Promise((_,reject) => setTimeout(() => reject(new Error("انتهت مهلة تحميل الصفحة التالية")),12000))
        ]);
        if (!Array.isArray(data?.metas)) throw new Error("استجابة الصفحة التالية غير صالحة.");
        data.metas.forEach(meta => mergeCatalogMeta(page.addon,page.entry,meta));
        page.nextSkip += data.metas.length;
        page.hasMore = data.metas.length >= CATALOG_PAGE_SIZE;
      } catch(error) {
        addonDiscoveryErrors.push({addon:page.addon.name || page.addon.addon_id,catalog:page.entry.name || page.entry.id,message:error.message});
      } finally { page.loading = false; }
    }
  };
  await Promise.all(Array.from({length:Math.min(4,pages.length)},() => worker()));
  catalogMoreLoading = false;
  catalogDisplayLimit += CATALOG_VISIBLE_BATCH;
  saveCatalogCache();
  render();
}

function renderDiscoveryDiagnostics() {
  const panel=document.querySelector("#catalog-diagnostics"); if (!panel) return; panel.replaceChildren();
  const heading=document.createElement("strong"); heading.textContent="حالة الكتالوج والمصادر";
  const summary=document.createElement("span");
  if (!currentUser) summary.textContent="سجّل الدخول لتحميل كتالوجات المصادر وعرض العناوين الحقيقية.";
  else if (addonCatalogLoading) summary.textContent="جارٍ جلب الكتالوجات تدريجياً من " + addons.filter(addon => addon.enabled).length.toLocaleString("ar") + " مصدر مفعّل…";
  else summary.textContent=addonCatalogItems.length.toLocaleString("ar") + " عنواناً موحّداً جُلبت من " + addons.filter(addon => addon.enabled).length.toLocaleString("ar") + " مصدر مفعّل.";
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
        !Array.isArray(manifest.resources)) {
      throw new Error("ملف Manifest لا يطابق بنية إضافة Stremio المتوقعة.");
    }
    if (manifestHasUnsupportedDelivery(manifest)) {
      throw new Error("استُبعد المصدر لأنه يعلن عن Torrent أو Debrid أو P2P.");
    }
    const resourceNames = manifest.resources.map(resource =>
      typeof resource === "string" ? resource : resource?.name
    ).filter(Boolean);
    const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];
    const supportsCatalog = resourceNames.includes("catalog") && catalogs.length > 0;
    if (!supportsCatalog) {
      const capabilities = [];
      if (resourceNames.includes("stream")) capabilities.push("روابط التشغيل");
      if (resourceNames.includes("subtitles")) capabilities.push("الترجمات");
      if (capabilities.length) {
        renderAddonMessage("تم التعرف على هذا المصدر: " + capabilities.join(" و") + ". لا يعرض كتالوجاً مستقلاً؛ ستظهر وظائفه عند فتح عنوان مناسب.");
        return;
      }
      throw new Error("هذا المصدر لا يعلن عن كتالوج أو تشغيل أو ترجمات.");
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
    catalogs.forEach(entry => {
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
let playbackFallbackQueue = [];
function reportPlaybackFailure(message){const status=document.querySelector('#player-status');const button=document.querySelector('#player-fallback-button');status.textContent=message;status.classList.add('is-error');if(button){button.hidden=playbackFallbackQueue.length===0;button.textContent=playbackFallbackQueue.length?'تعذّر التشغيل — جرّب السيرفر التالي ('+playbackFallbackQueue.length+')':'';}}
async function playNextFallback(){const next=playbackFallbackQueue.shift();if(!next)return;const mime=({hls:'application/vnd.apple.mpegurl',mp4:'video/mp4',dash:'application/dash+xml',webm:'video/webm'})[next.stream_format]||'';await openStreamPlayer(next.stream_url,next.title||('السيرفر: '+(next.server_name||'بديل')),{type:mime,filename:next.stream_url,fallbackSources:playbackFallbackQueue});}

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
async function openStreamPlayer(rawUrl,title="RAIF Player",stream={}){
  let target;try{target=new URL(rawUrl);}catch{throw new Error("رابط التشغيل غير صالح.");}
  if(!["https:","http:"].includes(target.protocol)||target.username||target.password)throw new Error("المشغل يقبل روابط HTTP وHTTPS فقط.");
  if(target.protocol==="http:"&&location.protocol==="https:")throw new Error("المتصفح يمنع تشغيل HTTP داخل صفحة HTTPS. استخدم رابط HTTPS.");
  playbackFallbackQueue=Array.isArray(stream.fallbackSources)?stream.fallbackSources.slice():[];
  const dialog=document.querySelector("#player-dialog"),video=document.querySelector("#raif-video"),status=document.querySelector("#player-status"),fallbackButton=document.querySelector("#player-fallback-button");
  document.querySelector("#player-title").textContent=title;status.textContent="جارٍ تجهيز المشغل...";status.classList.remove("is-error");fallbackButton.hidden=true;
  disposeStreamPlayer();applySelectedSubtitle(video);dialog.showModal();
  const mime=String(stream.behaviorHints?.mimeType||stream.mimeType||stream.type||"").toLowerCase(),filename=String(stream.behaviorHints?.filename||stream.filename||""),mediaHint=(target.pathname+" "+filename).toLowerCase();
  const isHls=/\.m3u8(?:$|[?#\s])/.test(mediaHint)||/mpegurl|vnd\.apple\.mpegurl/.test(mime),isDash=/\.mpd(?:$|[?#\s])/.test(mediaHint)||/dash\+xml/.test(mime);
  video.onerror=()=>reportPlaybackFailure("تعذر تشغيل الرابط. تحقق من الرابط ودعم المتصفح وCORS في خادم الوسائط.");
  video.onplaying=()=>{status.textContent="يتم التشغيل داخل RAIF.";status.classList.remove("is-error");fallbackButton.hidden=true;};
  const startPlayback=()=>video.play().catch(error=>{if(error?.name==="NotSupportedError")reportPlaybackFailure("صيغة الفيديو غير مدعومة في هذا المتصفح.");else{status.textContent="تعذر بدء التشغيل تلقائياً؛ اضغط زر التشغيل داخل الفيديو.";status.classList.add("is-error");}});
  if(isHls&&video.canPlayType("application/vnd.apple.mpegurl")){video.src=target.href;status.textContent="جارٍ بدء بث HLS...";startPlayback();}
  else if(isHls){try{const{default:Hls}=await import("https://esm.sh/hls.js@1.6.13");if(!Hls.isSupported())throw new Error("المتصفح لا يدعم HLS عبر Media Source Extensions.");activeHlsPlayer=new Hls({enableWorker:true,lowLatencyMode:false,maxBufferLength:30});activeHlsPlayer.attachMedia(video);activeHlsPlayer.on(Hls.Events.MEDIA_ATTACHED,()=>activeHlsPlayer?.loadSource(target.href));activeHlsPlayer.on(Hls.Events.MANIFEST_PARSED,()=>{status.textContent="تم تحميل قائمة HLS. جارٍ التشغيل...";startPlayback();});activeHlsPlayer.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)reportPlaybackFailure("تعذر تشغيل HLS. تحقق من الرابط ودعم CORS.");});}catch(error){reportPlaybackFailure("تعذر تجهيز HLS: "+error.message);}}
  else if(isDash){try{const module=await import("https://esm.sh/dashjs@5.0.3"),dashjs=module.default||module;activeDashPlayer=dashjs.MediaPlayer().create();activeDashPlayer.initialize(video,target.href,false);activeDashPlayer.on(dashjs.MediaPlayer.events.ERROR,()=>reportPlaybackFailure("تعذر تشغيل DASH. تحقق من الرابط ودعم CORS."));status.textContent="تم تحميل مشغل DASH. جارٍ التشغيل...";startPlayback();}catch(error){reportPlaybackFailure("تعذر تجهيز DASH: "+error.message);}}
  else{video.src=target.href;status.textContent="جارٍ بدء تشغيل الفيديو...";startPlayback();}
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
    facts.textContent = [meta.year,meta.runtime,...(Array.isArray(meta.genres)?meta.genres.map(genreDisplayName):[])].filter(Boolean).join(" · ");
    content.append(facts);
    const trackedItem=addonCatalogItems.find(x=>x.identity===catalogIdentity(catalogEntry.type,catalogMeta))||{identity:catalogIdentity(catalogEntry.type,catalogMeta),title:meta.name||catalogMeta.name||"عنوان",type:catalogEntry.type,year:meta.year||catalogMeta.year||"",poster:meta.poster||""};
    const actions=document.createElement("div");actions.className="detail-actions";
    const watchlistButton=document.createElement("button");watchlistButton.type="button";watchlistButton.className="save-btn";watchlistButton.id="toggle-save";
    const updateWatchlistLabel=()=>{watchlistButton.textContent=savedIds.includes(trackedItem.identity)?"✓ إزالة من قائمتي":"＋ أضف إلى قائمتي";};
    updateWatchlistLabel();watchlistButton.addEventListener("click",async()=>{await toggleFavorite(trackedItem);updateWatchlistLabel();});
    const watchedButton=document.createElement("button");watchedButton.type="button";watchedButton.className="save-btn";watchedButton.id="toggle-watched";
    const updateWatchedLabel=()=>{watchedButton.textContent=isTitleWatched(trackedItem)?"✓ تمت المشاهدة — إلغاء":"✓ سجّل كمشاهد";};
    updateWatchedLabel();watchedButton.addEventListener("click",()=>{toggleTitleWatched(trackedItem);updateWatchedLabel();});
    actions.append(watchlistButton,watchedButton);content.append(actions);
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
    let getSelectedEpisode = () => null;
    let manualSourceRequest = 0;
    if (["series","anime"].includes(catalogEntry.type) && Array.isArray(meta.videos) && meta.videos.length) {
      const episodes=meta.videos.filter(video=>video&&video.id);
      selectedVideoId = episodes[0]?.id || null;
      const episodeLabel = document.createElement("label");
      episodeLabel.className = "episode-select-label";
      episodeLabel.textContent = "الحلقات حسب الموسم";
      const episodeGroups = new Map();
      episodes.forEach((video,index)=>{
        const seasonKey=video.season==null?"unknown":String(video.season);
        if(!episodeGroups.has(seasonKey))episodeGroups.set(seasonKey,[]);
        episodeGroups.get(seasonKey).push({video,index});
      });
      const episodeList=document.createElement("div");
      episodeList.className="episode-season-list";
      const selectedEpisode=()=>episodes.find(video=>String(video.id)===String(selectedVideoId));
      getSelectedEpisode = selectedEpisode;
      const progressNote=document.createElement("p");progressNote.className="detail-note";
      const updateProgressNote=()=>{progressNote.textContent="تقدمك: "+getEpisodeWatchCount(trackedItem.identity).toLocaleString("ar")+" من "+episodes.length.toLocaleString("ar")+" حلقة مسجلة كمشاهدة.";};
      [...episodeGroups.entries()].sort((a,b)=>a[0]==="unknown"?1:b[0]==="unknown"?-1:Number(a[0])-Number(b[0])).forEach(([season,entries])=>{
        const group=document.createElement("details");group.className="episode-season";
        const groupTitle=document.createElement("summary");
        const seasonNumber=season==="unknown"?null:Number(season);
        const watchedInSeason=()=>entries.filter(({video})=>isEpisodeWatched(trackedItem.identity,video.id)).length;
        const updateGroupTitle=()=>{groupTitle.textContent=(seasonNumber==null?"حلقات إضافية":"الموسم "+seasonNumber)+" · "+watchedInSeason().toLocaleString("ar")+"/"+entries.length.toLocaleString("ar")+" مشاهدة";};
        updateGroupTitle();group.append(groupTitle);
        entries.forEach(({video,index})=>{
          const row=document.createElement("div");row.className="episode-row";
          const choose=document.createElement("button");choose.type="button";choose.className="episode-choice";
          choose.textContent=[video.episode!=null?"الحلقة "+video.episode:"الحلقة "+(index+1),video.title||"بدون عنوان"].join(" · ");
          choose.setAttribute("aria-pressed",String(String(video.id)===String(selectedVideoId)));
          choose.addEventListener("click",()=>{selectedVideoId=String(video.id);episodeList.querySelectorAll(".episode-choice").forEach(button=>button.setAttribute("aria-pressed","false"));choose.setAttribute("aria-pressed","true");streamsArea.replaceChildren();streamsButton.textContent="عرض مصادر تشغيل الحلقة";void loadManualPlaybackSources();});
          const toggle=document.createElement("button");toggle.type="button";toggle.className="episode-watch-toggle";
          const updateToggle=()=>{const watched=isEpisodeWatched(trackedItem.identity,video.id);toggle.textContent=watched?"✓ شاهدتها — إلغاء":"تسجيل المشاهدة";toggle.classList.toggle("is-watched",watched);};
          updateToggle();
          toggle.addEventListener("click",async()=>{toggle.disabled=true;await markEpisodeWatched(trackedItem,video);updateToggle();updateGroupTitle();updateProgressNote();updateEpisodeLabel();toggle.disabled=false;});
          row.append(choose,toggle);group.append(row);
        });
        episodeList.append(group);
      });
      const episodeTrackButton=document.createElement("button");episodeTrackButton.type="button";episodeTrackButton.className="save-btn";
      const updateEpisodeLabel=()=>{const ep=selectedEpisode();episodeTrackButton.textContent=ep&&isEpisodeWatched(trackedItem.identity,ep.id)?"✓ الحلقة المحددة مسجلة — إلغاء":"تسجيل مشاهدة الحلقة المحددة";};
      updateEpisodeLabel();
      episodeTrackButton.addEventListener("click",async()=>{const ep=selectedEpisode();if(ep){episodeTrackButton.disabled=true;await markEpisodeWatched(trackedItem,ep);updateEpisodeLabel();updateProgressNote();episodeTrackButton.disabled=false;}});
      content.append(episodeLabel,episodeList,episodeTrackButton,progressNote);
    }


    const manualPlaybackSection=document.createElement("section");
    manualPlaybackSection.className="manual-playback-section";
    const manualPlaybackHeading=document.createElement("h3");
    manualPlaybackHeading.textContent="روابط البث التي أضفتها";
    const manualPlaybackHint=document.createElement("p");
    manualPlaybackHint.className="manual-playback-hint";
    manualPlaybackHint.textContent="أضف سيرفرات متعددة لهذا العنوان أو للحلقة المحددة. تحفظ الروابط في حساب RAIF وتظهر على أجهزتك الأخرى.";
    const manualPlaybackForm=document.createElement("form");
    manualPlaybackForm.className="manual-playback-form";
    const manualServerInput=document.createElement("input");
    manualServerInput.type="text";manualServerInput.maxLength=100;manualServerInput.placeholder="اسم السيرفر (مثال: السيرفر الأول)";manualServerInput.setAttribute("aria-label","اسم السيرفر");manualServerInput.required=true;
    const manualUrlInput=document.createElement("input");
    manualUrlInput.type="url";manualUrlInput.inputMode="url";manualUrlInput.placeholder="https://example.com/video.m3u8";manualUrlInput.setAttribute("aria-label","رابط البث المباشر");manualUrlInput.required=true;manualUrlInput.autocomplete="url";
    const manualFormatSelect=document.createElement("select");manualFormatSelect.setAttribute("aria-label","صيغة البث");
    [["auto","تلقائي"],["hls","HLS / M3U8"],["mp4","MP4"],["dash","DASH / MPD"],["webm","WebM"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;manualFormatSelect.append(option);});
    const manualQualityInput=document.createElement("input");manualQualityInput.type="text";manualQualityInput.maxLength=40;manualQualityInput.placeholder="الجودة (مثال: 1080p)";manualQualityInput.setAttribute("aria-label","جودة البث");
    const manualLanguageInput=document.createElement("input");manualLanguageInput.type="text";manualLanguageInput.maxLength=40;manualLanguageInput.placeholder="اللغة (اختياري)";manualLanguageInput.setAttribute("aria-label","لغة البث");
    const manualSaveButton=document.createElement("button");manualSaveButton.type="submit";manualSaveButton.className="primary-btn";manualSaveButton.textContent="＋ حفظ رابط السيرفر";
    manualPlaybackForm.append(manualServerInput,manualUrlInput,manualFormatSelect,manualQualityInput,manualLanguageInput,manualSaveButton);
    const manualPlaybackStatus=document.createElement("p");manualPlaybackStatus.className="manual-playback-status";manualPlaybackStatus.setAttribute("role","status");
    const manualPlaybackList=document.createElement("div");manualPlaybackList.className="manual-playback-list";
    manualPlaybackSection.append(manualPlaybackHeading,manualPlaybackHint,manualPlaybackForm,manualPlaybackStatus,manualPlaybackList);
    async function loadManualPlaybackSources(){
      const request=++manualSourceRequest;
      manualPlaybackList.replaceChildren();
      if(!currentUser){manualPlaybackStatus.textContent="سجّل الدخول لعرض روابط البث المحفوظة.";return;}
      const episode=getSelectedEpisode();
      const episodeKey=episode?.id?String(episode.id):"";
      manualPlaybackHint.textContent=episode?"روابط البث للحلقة المحددة: "+(episode.title||("الحلقة "+(episode.episode??""))) + ".":"روابط البث المحفوظة لهذا العنوان. اختر حلقة لعرض روابطها المستقلة.";
      manualPlaybackStatus.textContent="جارٍ تحميل روابط البث...";
      const {data,error}=await supabase.from("playback_sources")
        .select("id,server_name,stream_url,stream_format,quality_label,language,episode_key,episode_title,season_number,episode_number,sort_order")
        .eq("user_id",currentUser.id)
        .eq("content_identity",trackedItem.identity)
        .eq("episode_key",episodeKey)
        .eq("enabled",true)
        .order("sort_order",{ascending:true})
        .order("created_at",{ascending:true})
        .limit(50);
      if(request!==manualSourceRequest)return;
      if(error){manualPlaybackStatus.textContent="تعذر تحميل روابط البث: "+error.message;manualPlaybackStatus.classList.add("is-error");return;}
      manualPlaybackStatus.classList.remove("is-error");
      manualPlaybackStatus.textContent=data?.length?"عدد السيرفرات المحفوظة: "+data.length.toLocaleString("ar"):"لا توجد روابط محفوظة لهذا "+(episode?"الحلقة بعد.":trackedItem.type==="movie"?"الفيلم بعد.":"المسلسل بعد.");
      (data||[]).forEach((source,index)=>{
        const row=document.createElement("article");row.className="manual-playback-row";
        const details=document.createElement("div");details.className="manual-playback-details";
        const name=document.createElement("strong");name.textContent=(index===0?"★ أساسي · ":"")+(source.server_name||("سيرفر "+(index+1)));
        const metadata=[source.quality_label,source.language,({auto:"تلقائي",hls:"HLS",mp4:"MP4",dash:"DASH",webm:"WebM"})[source.stream_format]||source.stream_format].filter(Boolean);
        const info=document.createElement("span");info.textContent=metadata.join(" · ")||"مصدر بث";
        const address=document.createElement("small");address.textContent=source.stream_url;address.dir="ltr";
        details.append(name,info,address);
        const actions=document.createElement("div");actions.className="manual-playback-actions";
        const play=document.createElement("button");play.type="button";play.className="save-btn";play.textContent="تشغيل";
        play.addEventListener("click",async()=>{
          const mime=({hls:"application/vnd.apple.mpegurl",mp4:"video/mp4",dash:"application/dash+xml",webm:"video/webm"})[source.stream_format]||"";
          const fallbacks=(data||[]).slice(index+1).map(item=>({...item,title:trackedItem.title+" · "+(item.server_name||"سيرفر بديل")}));
          try{await openStreamPlayer(source.stream_url,trackedItem.title+" · "+(source.server_name||"السيرفر"),{type:mime,filename:source.stream_url,fallbackSources:fallbacks});}
          catch(playError){manualPlaybackStatus.textContent="تعذر بدء التشغيل: "+playError.message;manualPlaybackStatus.classList.add("is-error");}
        });
        const primary=document.createElement("button");primary.type="button";primary.className="save-btn";primary.textContent=index===0?"السيرفر الأساسي":"جعله أساسي";primary.disabled=index===0;
        primary.addEventListener("click",async()=>{
          primary.disabled=true;manualPlaybackStatus.classList.remove("is-error");manualPlaybackStatus.textContent="جارٍ تحديث أولوية السيرفرات...";
          const ordered=[source,...(data||[]).filter(item=>item.id!==source.id)];
          for(let orderIndex=0;orderIndex<ordered.length;orderIndex++){
            const{error:priorityError}=await supabase.from("playback_sources").update({sort_order:orderIndex===0?0:100+orderIndex}).eq("id",ordered[orderIndex].id).eq("user_id",currentUser.id);
            if(priorityError){manualPlaybackStatus.textContent="تعذر تحديث الأولوية: "+priorityError.message;manualPlaybackStatus.classList.add("is-error");primary.disabled=false;await loadManualPlaybackSources();return;}
          }
          manualPlaybackStatus.textContent="تم تعيين السيرفر الأساسي وترتيب البدائل.";await loadManualPlaybackSources();
        });
        const remove=document.createElement("button");remove.type="button";remove.className="source-remove";remove.textContent="حذف";
        remove.addEventListener("click",async()=>{
          remove.disabled=true;
          const {error:deleteError}=await supabase.from("playback_sources").delete().eq("id",source.id).eq("user_id",currentUser.id);
          if(deleteError){manualPlaybackStatus.textContent="تعذر حذف الرابط: "+deleteError.message;manualPlaybackStatus.classList.add("is-error");remove.disabled=false;return;}
          manualPlaybackStatus.classList.remove("is-error");await loadManualPlaybackSources();
        });
        actions.append(play,primary,remove);row.append(details,actions);manualPlaybackList.append(row);
      });
    }
    manualPlaybackForm.addEventListener("submit",async event=>{
      event.preventDefault();
      if(!currentUser){authDialog.showModal();setStatus(authStatus,"سجّل الدخول لحفظ روابط البث.");return;}
      const serverName=manualServerInput.value.trim();
      const streamUrl=safeHttpsUrl(manualUrlInput.value.trim());
      if(!serverName||!streamUrl){manualPlaybackStatus.textContent="أدخل اسم السيرفر ورابط HTTPS صحيحاً.";manualPlaybackStatus.classList.add("is-error");return;}
      const episode=getSelectedEpisode();
      manualSaveButton.disabled=true;manualPlaybackStatus.classList.remove("is-error");manualPlaybackStatus.textContent="جارٍ حفظ الرابط...";
      const payload={
        user_id:currentUser.id,content_identity:trackedItem.identity,content_type:trackedItem.type,
        content_title:trackedItem.title,content_year:String(trackedItem.year||""),
        episode_key:episode?.id?String(episode.id):"",episode_title:episode?.title||"",
        season_number:episode?.season!=null&&Number.isInteger(Number(episode.season))?Number(episode.season):null,
        episode_number:episode?.episode!=null&&Number.isInteger(Number(episode.episode))?Number(episode.episode):null,
        server_name:serverName,stream_url:streamUrl.href,stream_format:manualFormatSelect.value,
        quality_label:manualQualityInput.value.trim(),language:manualLanguageInput.value.trim(),enabled:true,sort_order:100
      };
      const {error:insertError}=await supabase.from("playback_sources").insert(payload);
      manualSaveButton.disabled=false;
      if(insertError){manualPlaybackStatus.textContent="تعذر حفظ الرابط: "+insertError.message;manualPlaybackStatus.classList.add("is-error");return;}
      manualUrlInput.value="";manualPlaybackStatus.classList.remove("is-error");manualPlaybackStatus.textContent="تم حفظ رابط السيرفر.";
      await loadManualPlaybackSources();
    });
    content.append(manualPlaybackSection);
    void loadManualPlaybackSources();

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
        const settled = new Array(providers.length);
        let providerCursor = 0;
        const withProviderTimeout = (promise,label,ms=12000) => Promise.race([
          promise,
          new Promise((_,reject) => setTimeout(() => reject(new Error("انتهت مهلة " + label)),ms))
        ]);
        const providerWorker = async () => {
          while (providerCursor < providers.length) {
            const index = providerCursor++;
            const candidate = providers[index];
            try {
              const manifest = await withProviderTimeout(fetchAddonResource(candidate,"manifest"),"Manifest");
              const resources = Array.isArray(manifest?.resources) ? manifest.resources.map(resource =>
                typeof resource === "string" ? resource : resource?.name
              ) : [];
              if (!resources.includes("stream")) {
                settled[index] = {status:"fulfilled",value:[]};
                continue;
              }
              const streamData = await withProviderTimeout(
                fetchAddonResource(candidate,"stream",catalogEntry.type,meta.id,selectedVideoId ? {videoId:selectedVideoId} : {}),
                "مصدر التشغيل"
              );
              settled[index] = {status:"fulfilled",value:(Array.isArray(streamData?.streams) ? streamData.streams : [])
                .map(stream => ({...stream,_raifProviderName:candidate.name || candidate.addon_id}))};
            } catch(error) {
              settled[index] = {status:"rejected",reason:error};
            }
          }
        };
        await Promise.all(Array.from({length:Math.min(4,providers.length)},() => providerWorker()));
        const failedProviders = settled.filter(result => result?.status === "rejected").length;
        const rawStreams = settled.flatMap(result => result?.status === "fulfilled" ? result.value : []);
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
  addonDiscoveryCache.clear(); clearAddonManifestCache(); addonCatalogPages.clear();
  addonCatalogItems = []; addonCatalogIndex.clear();
  restoreCatalogCache();
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
  addonDiscoveryCache.clear(); clearAddonManifestCache(); addonCatalogPages.clear(); addonCatalogItems = []; addonCatalogIndex.clear();
  restoreCatalogCache();
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
  addonDiscoveryCache.clear(); clearAddonManifestCache(); addonCatalogPages.clear(); addonCatalogItems = []; addonCatalogIndex.clear();
  restoreCatalogCache();
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
            ["catalog", "stream", "subtitles"].includes(resource)
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
  activeGenre = "all";
  catalogDisplayLimit = CATALOG_VISIBLE_BATCH;
  document.querySelectorAll(".filter").forEach(entry => entry.classList.toggle("active", entry === button));
  render();
}));

document.querySelector("#catalog-sort")?.addEventListener("change", event => {
  activeSort = event.target.value;
  catalogDisplayLimit = CATALOG_VISIBLE_BATCH;
  render();
});
document.querySelector("#catalog-load-more")?.addEventListener("click", async () => {
  if (catalogDisplayLimit < catalogFilteredCount) { catalogDisplayLimit += CATALOG_VISIBLE_BATCH; render(); return; }
  await loadMoreCatalogPages();
});

let searchRenderTimer = null;
search.addEventListener("input", () => {
  catalogDisplayLimit = CATALOG_VISIBLE_BATCH;
  if (searchRenderTimer !== null) clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(() => { searchRenderTimer = null; render(); }, 160);
});
document.querySelector("#refresh-catalog")?.addEventListener("click", () => {
  addonDiscoveryCache.clear(); clearAddonManifestCache(); addonCatalogPages.clear(); addonDiscoveryErrors.length = 0;
  loadAddonDiscovery(activeView);
});
document.querySelector("#close-dialog").addEventListener("click", () => document.querySelector("#detail-dialog").close());
document.querySelector("#player-fallback-button").addEventListener("click",()=>{void playNextFallback();});
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
  const map = {home:"all",movies:"movie",series:"series",anime:"anime",library:"all",watched:"all",progress:"all"};
  activeFilter = map[activeView] || "all";
  activeGenre = "all";
  catalogDisplayLimit = CATALOG_VISIBLE_BATCH;
  document.querySelectorAll(".nav-item").forEach(entry => entry.classList.toggle("active", entry === button));
  document.querySelectorAll(".filter").forEach(entry => entry.classList.toggle("active", entry.dataset.filter === activeFilter));
  const isSources = activeView === "sources";
  document.querySelector("#hero").hidden = isSources || activeView !== "home";
  document.querySelector(".content-section:not(.source-manager)").hidden = isSources;
  document.querySelector("#source-manager").hidden = !isSources;
  if (!isSources) {
    document.querySelector("#section-title").textContent =
      ({home:"اكتشف المحتوى",movies:"الأفلام",series:"المسلسلات",anime:"الأنمي",library:"قائمتي",watched:"سجل المشاهدة",progress:"تقدم المسلسلات"})[activeView];
    render();
    if (["home","movies","series","anime"].includes(activeView)) loadAddonDiscovery(activeView);
    else { addonDiscoveryRun++; addonCatalogLoading = false; }
  } else {
    addonDiscoveryRun++;
    addonCatalogLoading = false;
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
    loadWatchHistory();
    await loadSources();
    render();
    if (["home","movies","series","anime"].includes(activeView)) void loadAddonDiscovery(activeView);
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
  watchedRecords = [];
  updateAuthView();
  render();
  setStatus(authStatus, "تم تسجيل الخروج.");
});

supabase.auth.onAuthStateChange((_event, session) => {
  const nextUser = session?.user || null;
  if (currentUser?.id === nextUser?.id) return;
  currentUser = nextUser;
  updateAuthView();
  if (!nextUser) {
    addonDiscoveryRun++;
    addonCatalogLoading = false;
    addons = [];
    addonCatalogItems = [];
    addonCatalogIndex.clear();
    addonCatalogPages.clear();
    addonDiscoveryCache.clear();
    clearAddonManifestCache();
    savedIds = [];
    watchedRecords = [];
    render();
  }
});

window.addEventListener("online", () => { if (currentUser) void loadWatchHistory(); });

let { data: { session } } = await supabase.auth.getSession();
if (session?.user?.email?.toLowerCase() !== SHARED_ACCOUNT_EMAIL) {
  await supabase.auth.signOut({ scope: "local" });
  session = null;
}
currentUser = session?.user || null;
updateAuthView();
await loadFavorites();
loadWatchHistory();
await loadSources();
render();
if (["home","movies","series","anime"].includes(activeView)) void loadAddonDiscovery(activeView);
