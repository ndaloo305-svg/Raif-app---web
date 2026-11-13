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
- إضافة روابط Manifest الخاصة بإضافات Stremio وحفظها وإدارتها عبر `public.user_addons`، مع قراءة Manifest وجلب الكتالوجات مباشرة من المتصفح.
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
- جلب Manifest والكتالوجات يعتمد على دعم CORS لدى الإضافة. لا يوجد حتى الآن حل روابط البث أو مشغل فيديو.
- لم يتم ربط TMDB أو تشغيل مصادر Torrent أو HTTP/HTTPS أو مشغل فيديو.
- المزامنة الحالية تشمل المفضلة وروابط الإضافات؛ قوائم المشاهدة والتقدم وسجل المشاهدة لم تُربط بواجهات الموقع بعد.
- النشر الحي يحتاج تفعيل GitHub Pages ودمج طلب السحب بعد المراجعة.

هذا المستودع منفصل عن تطبيق RAIF iOS، ويستخدم مشروع Supabase الحالي دون إنشاء مشروع جديد.


## Stremio catalog browsing

The source manager can now read an enabled add-on's HTTPS Manifest and list the catalogs declared by that add-on. Selecting a catalog requests its first page and renders the returned metadata cards in the browser.

- Catalog requests are made directly from the browser; the add-on server must allow cross-origin requests (CORS).
- Only HTTPS Manifest and poster URLs are accepted.
- Responses are limited to 1.5 MB and requests time out after 12 seconds.
- Catalog browsing supports required and optional extra parameters declared by the add-on. Stream resolution and playback are not implemented yet.
