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
- بحث محلي وتصفية للأفلام والمسلسلات والأنمي (البيانات الحالية تجريبية).
- تسجيل دخول بالبريد عبر رابط سحري باستخدام Supabase Auth.
- مزامنة المفضلة في جدول `public.favorites` بمشروع RAIF Supabase.
- إدارة روابط Manifest الخاصة بإضافات Stremio عبر `public.user_addons`، وقراءة الكتالوجات وتفاصيل العناوين وخيارات التشغيل التي تعلنها الإضافة.
- بيانات الإضافات والمفضلة مرتبطة بالمستخدم، وتخضع لسياسات RLS الموجودة في قاعدة البيانات.
- لا توجد مفاتيح service-role أو secret داخل المتصفح.
- ترحيل المفضلة التجريبية القديمة من Local Storage إلى الحساب بعد تسجيل الدخول.

## إعداد تسجيل الدخول

في Supabase Dashboard للمشروع `wdgjjqwxsluumltezqlp`:
1. افتح Authentication ثم URL Configuration.
2. أضف رابط الموقع المنشور إلى قائمة Redirect URLs، وأضف رابط التطوير المحلي عند الحاجة.
3. تأكد من إعداد Site URL وقالب البريد الإلكتروني لإرسال رابط الدخول.

المفتاح الموجود في الواجهة هو Publishable Key فقط، وهو مخصص للاستخدام من المتصفح مع RLS.

## حدود النسخة الحالية
- بيانات الأفلام والمسلسلات والأنمي المعروضة تجريبية وليست كتالوج إنتاجياً.
- جلب Manifest والكتالوجات وتفاصيل العناوين وخيارات التشغيل يعتمد على دعم CORS لدى الإضافة. روابط الفيديو المباشرة وHLS يمكن تشغيلها داخل مشغل RAIF، أو فتح الرابط خارج التطبيق.
- مشغل RAIF يدعم ملفات الفيديو المباشرة وHLS داخل الصفحة حسب دعم المتصفح والخادم. قد تتطلب قوائم HLS وملفاتها دعم CORS. روابط HTTP قد تُمنع عند فتح الموقع عبر HTTPS. بعض المصادر التي تتطلب ترويسات مخصصة أو DRM قد لا تعمل. محرك Torrent وDASH وDRM غير مربوطين.
- المزامنة الحالية تشمل المفضلة وروابط الإضافات؛ قوائم المشاهدة والتقدم وسجل المشاهدة لم تُربط بواجهات الموقع بعد.
- النشر الحي يتطلب تفعيل GitHub Pages من إعدادات المستودع واختيار GitHub Actions كمصدر للنشر.

هذا المستودع منفصل عن تطبيق RAIF iOS، ويستخدم مشروع Supabase الحالي دون إنشاء مشروع جديد.


## Stremio catalog browsing

The source manager reads enabled add-on HTTPS Manifests, lists declared catalogs, supports their extra parameters, displays metadata details, and lists stream options returned by the add-on. Direct video and HLS stream URLs can be played in RAIF’s in-page player when supported by the browser and source server.

- Catalog requests are made directly from the browser; the add-on server must allow cross-origin requests (CORS).
- Only HTTPS Manifest and poster URLs are accepted.
- Responses are limited to 1.5 MB and requests time out after 12 seconds.
- Catalog browsing supports required and optional extra parameters declared by the add-on. Direct HTTP(S) video and HLS playback are implemented. Torrent, DASH, DRM, and sources requiring custom headers are not supported yet.
