# RAIF Web

واجهة ويب مستقلة لمشروع RAIF، عربية RTL ومتجاوبة، مرتبطة بمشروع Supabase الحالي نفسه المستخدم ضمن منظومة RAIF.

## التشغيل

يتطلب المشروع خادماً ثابتاً ويدعم ES Modules في المتصفح. شغّل:

```bash
python3 -m http.server 8000
```

ثم افتح `http://localhost:8000`.

## المنفذ
- واجهة عربية RTL بتصميم متجاوب.
- كتالوج حقيقي من الإضافات المفعّلة، مع البحث والتصفية حسب النوع والتصنيف والترتيب.
- تسجيل دخول بالبريد عبر رابط سحري باستخدام Supabase Auth.
- مزامنة قائمة المشاهدة في جدول `public.favorites` وسجل المشاهدة وتقدم الحلقات في `public.watch_history` بمشروع RAIF Supabase.
- إدارة روابط Manifest الخاصة بإضافات Stremio عبر `public.user_addons`، وقراءة الكتالوجات وتفاصيل العناوين وخيارات التشغيل التي تعلنها الإضافة.
- بيانات الإضافات والمفضلة مرتبطة بالمستخدم، وتخضع لسياسات RLS الموجودة في قاعدة البيانات.
- لا توجد مفاتيح service-role أو secret داخل المتصفح.
- ترحيل المفضلة التجريبية القديمة من Local Storage إلى الحساب بعد تسجيل الدخول.

## إعداد تسجيل الدخول

في Supabase Dashboard لمشروع RAIF Web الحالي `puhipyjljmbvczijtzkb`:
1. افتح Authentication ثم URL Configuration.
2. أضف رابط الموقع المنشور إلى قائمة Redirect URLs، وأضف رابط التطوير المحلي عند الحاجة.
3. تأكد من إعداد Site URL وقالب البريد الإلكتروني لإرسال رابط الدخول.

المفتاح الموجود في الواجهة هو Publishable Key فقط، وهو مخصص للاستخدام من المتصفح مع RLS.

## حدود النسخة الحالية
- الصفحة الرئيسية والكتالوج يعتمدان على كتالوجات المصادر المفعّلة؛ لا تُعرض عناوين تجريبية على أنها محتوى حقيقي.
- استيراد JSON يفحص Manifest عبر Edge Function خاصة بالمشروع، ويستبعد إضافات Torrent وDebrid المعروفة، ويحفظ موارد الكتالوجات والترجمات. طلبات Manifest والكتالوجات والتفاصيل والتدفقات والترجمات تمر عبر وسيط موثّق يتحقق من ملكية المصدر وفق RLS، ولا تحتاج خوادم الإضافات إلى CORS لهذه الطلبات.
- تمت إضافة البحث عن الترجمات من تفاصيل العنوان لمصادر Subtito وSubSource وSubDL وSubMaker وOpenSubtitles، مع تحميل ملفات الترجمة عبر الوسيط وتحويل SRT إلى WebVTT.
- مشغل RAIF يقبل روابط HTTPS المباشرة الجاهزة للمتصفح، ويدعم HLS وDASH برمجياً حسب المتصفح والخادم. قد تتطلب HLS وDASH ترويسات CORS من خادم الوسائط نفسه. يتم إخفاء روابط Torrent والروابط التي تعلن أنها غير جاهزة للويب. لا يوجد دعم DRM أو الروابط التي تتطلب ترويسات مخصصة أو تشغيل Torrent. لا تُضاف روابط بث إلا من مزود يملك حق التوزيع أو تفويضاً واضحاً.
- المزامنة الحالية تشمل المفضلة وروابط الإضافات؛ قائمة المشاهدة ومصادر الإضافات متزامنة عبر Supabase. سجل مشاهدة الأفلام والحلقات وتقدم المسلسلات يُحفظ في `public.watch_history` مع RLS ومزامنة بين الأجهزة، ويستخدم تخزيناً محلياً احتياطياً عند انقطاع الاتصال.
- أُضيف سير عمل GitHub Pages للنشر التلقائي. يلزم تفعيل GitHub Pages من Settings → Pages واختيار GitHub Actions كمصدر أول مرة.

هذا المستودع منفصل عن تطبيق RAIF iOS، ويستخدم مشروع Supabase الحالي دون إنشاء مشروع جديد.


## Stremio catalog browsing

The source manager reads enabled add-on HTTPS Manifests through the authenticated RAIF proxy, lists declared catalogs, supports their extra parameters, displays metadata details, and lists stream options returned by the add-on. RAIF is being prepared to use playback links supplied by the project owner, with direct video, HLS and DASH playback when supported by the browser and source server.

- Only HTTPS Manifest, poster and stream URLs are accepted for embedded playback.
- Requests are routed through the RAIF Supabase Edge Function proxy; the source server does not need to expose browser CORS to the client for proxied metadata requests.
- Catalog browsing supports required and optional extra parameters declared by the add-on.
- The source manager includes a live Manifest health check that reports catalog count and whether the add-on declares stream and subtitle resources.
- Direct playback is possible only when a source returns a browser-compatible authorized URL. DRM, torrent and sources requiring custom headers are not supported.


## Playback links

RAIF does not include a streaming-platform discovery directory. The project owner can add multiple playback servers to each movie or exact series episode from the title details. RAIF saves the server name, HTTPS URL, format, quality, and language in the shared account, and provides play/delete actions. A URL being saved does not by itself guarantee that the host allows browser playback; HLS/DASH may require appropriate CORS support, and DRM or custom-header-only streams are not supported by the current web player.


### Owner-managed playback sources

- `public.playback_sources` stores multiple HTTPS playback servers for a movie or an exact episode, keyed by the stable catalog identity and episode ID.
- Each row stores server name, URL, format hint (auto/HLS/MP4/DASH/WebM), quality, language, and enabled/order metadata. The browser player receives the format hint and reports browser/CORS failures; saving a URL is not a playback guarantee.
- Row Level Security restricts all read/write operations to the authenticated owner. The browser uses the publishable key only; no service-role key is used.
- Links are loaded when a title detail is opened and refreshed when the selected episode changes. Users can add, play, prioritize, and delete links from the detail view. If a selected server fails with a media/HLS/DASH error, the player offers the next saved server in priority order; fallback is user-triggered so a slow stream is not silently interrupted.
