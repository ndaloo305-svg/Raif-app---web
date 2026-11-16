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

The source manager reads enabled add-on HTTPS Manifests through the authenticated RAIF proxy, lists declared catalogs, supports their extra parameters, displays metadata details, and lists stream options returned by the add-on. Direct video, HLS and DASH stream URLs can be played in RAIF’s in-page player when supported by the browser and source server.

- Only HTTPS Manifest, poster and stream URLs are accepted for embedded playback.
- Requests are routed through the RAIF Supabase Edge Function proxy; the source server does not need to expose browser CORS to the client for proxied metadata requests.
- Catalog browsing supports required and optional extra parameters declared by the add-on.
- Title details now include a JustWatch Saudi Arabia search link to find licensed subscription, rental, purchase and free-with-ads availability. This is a discovery link, not an embedded stream or a guarantee that a provider carries the title.
- The source manager includes a live Manifest health check that reports catalog count and whether the add-on declares stream and subtitle resources.
- Direct playback is possible only when a source returns a browser-compatible authorized URL. DRM, torrent and sources requiring custom headers are not supported.


## Legal streaming discovery

RAIF separates metadata/catalog sources from playback providers. It does not scrape, proxy or publish unauthorized stream URLs. JustWatch is linked as a legal availability guide for Saudi Arabia; TMDB's Watch Providers API can be added when a TMDB API credential and the required JustWatch attribution are configured. TMDB's provider data indicates where titles are available but does not itself provide direct playback URLs.
