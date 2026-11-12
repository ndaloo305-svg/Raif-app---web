const items = [
 {id:1,title:"رحلة إلى المجهول",type:"movie",year:"2025",genre:"مغامرة",symbol:"✧",c1:"#4d3b35",c2:"#171c2b",description:"عنوان تجريبي لعرض شكل بطاقة المحتوى وتفاصيلها داخل واجهة RAIF."},
 {id:2,title:"مدينة الظلال",type:"series",year:"2024",genre:"دراما",symbol:"◈",c1:"#273d4a",c2:"#151a25",description:"بيانات تجريبية فقط. لم يتم ربط أي مزود محتوى أو مصدر بث بعد."},
 {id:3,title:"آخر المحاربين",type:"anime",year:"2025",genre:"أنمي",symbol:"武",c1:"#6b3e35",c2:"#241923",description:"بطاقة أنمي تجريبية لا تمثل عملاً حقيقياً أو رابط مشاهدة."},
 {id:4,title:"ما وراء النجوم",type:"movie",year:"2023",genre:"خيال علمي",symbol:"✦",c1:"#334b63",c2:"#17192b",description:"مساحة مخصصة مستقبلاً لبيانات TMDB أو مصدر بيانات تختاره."},
 {id:5,title:"ملفات سرية",type:"series",year:"2025",genre:"تشويق",symbol:"⌁",c1:"#51433a",c2:"#1b1b22",description:"سيتم لاحقاً توصيل صفحة التفاصيل بمصادر المحتوى المتاحة."},
 {id:6,title:"أفق جديد",type:"anime",year:"2024",genre:"خيال",symbol:"星",c1:"#66513b",c2:"#202238",description:"هذا المحتوى الوهمي موجود لاختبار العرض والبحث والتصفية فقط."}
];
let activeFilter="all";
let activeView="home";
const savedKey="raif-web-saved-items";
function readSaved(){
 try{
  const value=JSON.parse(localStorage.getItem(savedKey)||"[]");
  return Array.isArray(value)?value.filter(Number.isInteger):[];
 }catch{return [];}
}
let savedIds=readSaved();
function saveSaved(){
 try{localStorage.setItem(savedKey,JSON.stringify(savedIds));return true;}
 catch{return false;}
}
const catalog=document.querySelector("#catalog");
const search=document.querySelector("#search");
const empty=document.querySelector("#empty");
const typeNames={movie:"فيلم",series:"مسلسل",anime:"أنمي"};
function render(){
 const q=search.value.trim().toLocaleLowerCase("ar");
 const filtered=items.filter(item=>(activeFilter==="all"||item.type===activeFilter)&&
  (activeView!=="library"||savedIds.includes(item.id))&&
  (item.title.toLocaleLowerCase("ar").includes(q)||item.genre.toLocaleLowerCase("ar").includes(q)));
 catalog.innerHTML=filtered.map(item=>`
  <article class="media-card" tabindex="0" role="button" data-id="${item.id}" aria-label="تفاصيل ${item.title}">
   <div class="poster" style="--c1:${item.c1};--c2:${item.c2}"><span class="poster-art">${item.symbol}</span><span class="poster-label">${typeNames[item.type]} · ${item.year}</span></div>
   <div class="media-title">${item.title}</div><div class="media-meta">${item.genre} · ${typeNames[item.type]}</div>
  </article>`).join("");
 empty.textContent=activeView==="library"?"مكتبتك فارغة حالياً. أضف عناوين من نافذة التفاصيل.":"لا توجد نتائج مطابقة. جرّب كلمة بحث أخرى.";
 empty.hidden=filtered.length>0;
 catalog.querySelectorAll(".media-card").forEach(card=>{
  card.addEventListener("click",()=>openDetail(Number(card.dataset.id)));
  card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetail(Number(card.dataset.id));}});
 });
}
function openDetail(id){
 const item=items.find(x=>x.id===id);if(!item)return;
 const isSaved=savedIds.includes(item.id);
 document.querySelector("#detail-content").innerHTML=`<span class="eyebrow">${typeNames[item.type]} · ${item.year}</span><h2>${item.title}</h2><p>${item.description}</p><button class="save-btn" id="toggle-save" type="button">${isSaved?"إزالة من مكتبتي":"＋ أضف إلى مكتبتي"}</button><div class="detail-note">حالة الربط: لا توجد مصادر بث متصلة حالياً. هذه نسخة واجهة أولية.</div>`;
 document.querySelector("#toggle-save").addEventListener("click",()=>{
  savedIds=savedIds.includes(item.id)?savedIds.filter(savedId=>savedId!==item.id):[...savedIds,item.id];
  const persisted=saveSaved();
  document.querySelector("#toggle-save").textContent=savedIds.includes(item.id)?"إزالة من مكتبتي":"＋ أضف إلى مكتبتي";
  if(!persisted) document.querySelector("#detail-content .detail-note").textContent="تعذر حفظ التغيير على هذا المتصفح.";
  if(activeView==="library")render();
 });
 document.querySelector("#detail-dialog").showModal();
}
document.querySelectorAll(".filter").forEach(button=>button.addEventListener("click",()=>{
 activeFilter=button.dataset.filter;
 document.querySelectorAll(".filter").forEach(b=>b.classList.toggle("active",b===button));render();
}));
search.addEventListener("input",render);
document.querySelector("#close-dialog").addEventListener("click",()=>document.querySelector("#detail-dialog").close());
document.querySelector("#detail-dialog").addEventListener("click",e=>{if(e.target.id==="detail-dialog")e.currentTarget.close();});
document.querySelector("#explore").addEventListener("click",()=>document.querySelector("#catalog").scrollIntoView({behavior:"smooth",block:"start"}));
document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{
 activeView=button.dataset.view;
 const map={home:"all",movies:"movie",series:"series",anime:"anime",library:"all"};
 activeFilter=map[activeView]||"all";
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===button));
 document.querySelectorAll(".filter").forEach(b=>b.classList.toggle("active",b.dataset.filter===activeFilter));
 document.querySelector("#section-title").textContent=({home:"اكتشف المحتوى",movies:"الأفلام",series:"المسلسلات",anime:"الأنمي",library:"مكتبتي"})[activeView];
 document.querySelector("#catalog").scrollIntoView({behavior:"smooth",block:"start"});render();
}));
render();