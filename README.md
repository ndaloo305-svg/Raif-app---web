# RAIF Web

واجهة ويب مستقلة لمشروع RAIF، عربية RTL ومتجاوبة، مرتبطة بمشروع Supabase مستقل خاص بـ RAIF Web، ولا تستخدم مشروع RAIF Party أو مشروع التطبيق القديم.

## التشغيل

يتطلب المشروع خادماً ثابتاً ويدعم ES Modules في المتصفح. شغّل:

```bash
python3 -m http.server 8000
```

ثم افتح `http://localhost:8000`.

## المنفذ
- واجهة عربية RTL بتصميم متجاوب.
- كتالوج موحّد يجمع عناوين الإضافات المفعّلة تدريجيًا مع دمج التكرار بالمعرّفات الشائعة والعنوان والسنة.
- تسجيل دخول بالبريد عبر رابط سحري باستخدام Supabase Auth.
- مزامنة مكتبة العناوين الحقيقية في جدول `public.favorites` بمشروع RAIF Web Supabase.
- إدارة روابط Manifest الخاصة بإضافات Stremio عبر `public.user_addons`، وقراءة الكتالوجات وتفاصيل العناوين وخيارات التشغيل التي تعلنها الإضافة.
- بيانات الإضافات والمفضلة مرتبطة بالمستخدم، وتخضع لسياسات RLS الموجودة في قاعدة البيانات.
- لا توجد مفاتيح service-role أو secret داخل المتصفح.
- حفظ العناوين الحقيقية في مكتبة المستخدم ومزامنتها مع Supabase.

## إعداد تسجيل الدخول

في Supabase Dashboard للمشروع `puhipyjljmbvczijtzkb`:
1. افتح Authentication ثم URL Configuration.
2. أضف رابط الموقع المنشور إلى قائمة Redirect URLs، وأضف رابط التطوير المحلي عند الحاجة.
3. تأكد من إعداد Site URL وقالب البريد الإلكتروني لإرسال رابط الدخول.

المفتاح الموجود في الواجهة هو Publishable Key فقط، وهو مخصص للاستخدام من المتصفح مع RLS.

## حدود النسخة الحالية
- لا يعرض RAIF عناوين تجريبية؛ تُجمع الكتالوجات الحقيقية من الإضافات المفعّلة وتظهر تدريجيًا في تبويبات المحتوى بعد تسجيل الدخول.
- استيراد JSON يفحص Manifest عبر Edge Function خاصة بالمشروع، ويستبعد إضافات Torrent وDebrid المعروفة، ويحفظ موارد الكتالوجات والترجمات. طلبات Manifest والكتالوجات والتفاصيل والتدفقات والترجمات تمر عبر وسيط موثّق يتحقق من ملكية المصدر وفق RLS، ولا تحتاج خوادم الإضافات إلى CORS لهذه الطلبات.
- تمت إضافة البحث عن الترجمات من تفاصيل العنوان لمصادر Subtito وSubSource وSubDL وSubMaker وOpenSubtitles، مع تحميل ملفات الترجمة عبر الوسيط وتحويل SRT إلى WebVTT.
- مشغل RAIF يدعم روابط MP4/WebM المباشرة وHLS عبر hls.js، مع اختيار سرعة التشغيل وجودة HLS ومسارات الترجمة، وحفظ موضع المشاهدة محليًا. قد تتطلب HLS وDASH ترويسات CORS من خادم الوسائط نفسه. يتم إخفاء روابط Torrent والروابط الخارجية والروابط التي تعلن أنها غير جاهزة للويب. لا يوجد دعم DRM أو الروابط التي تتطلب ترويسات مخصصة أو تشغيل Torrent.
- المفضلة متزامنة عبر Supabase، بينما تقدم المشاهدة وتفضيلات المشغل تحفظ محليًا على الجهاز حاليًا.
- أُضيف سير عمل GitHub Pages للنشر التلقائي. يلزم تفعيل GitHub Pages من Settings → Pages واختيار GitHub Actions كمصدر أول مرة.

هذا المستودع منفصل عن تطبيق RAIF iOS، ويستخدم مشروع Supabase الحالي دون إنشاء مشروع جديد.


## Stremio catalog browsing

The source manager reads enabled add-on HTTPS Manifests, lists declared catalogs, supports their extra parameters, displays metadata details, and lists stream options returned by the add-on. Direct video and HLS stream URLs can be played in RAIF’s in-page player when supported by the browser and source server.

- Catalog, metadata, stream-list and subtitle discovery requests pass through the authenticated `raif-addon-proxy` Edge Function; browser CORS on the add-on API is not required for these JSON requests.
- Only HTTPS Manifest and poster URLs are accepted.
- Responses are limited to 1.5 MB and requests time out after 12 seconds.
- Catalog browsing supports required and optional extra parameters declared by the add-on. Direct HTTP(S) video and HLS playback are implemented. Torrent, DASH, DRM, and sources requiring custom headers are not supported yet.


## PWA

Validation is tracked through the pull request checks.

This branch includes the first staged catalog/player rebuild; it is not the production Pages deployment until merged.
- يمكن تثبيت RAIF كتطبيق ويب من المتصفح بعد تفعيل Service Worker.
- يتم تخزين هيكل الواجهة الأساسي فقط؛ لا تُخزّن روابط البث أو جلسات الدخول أو بيانات المستخدم في ذاكرة التخزين المؤقت.
