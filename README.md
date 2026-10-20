# Gaming Libya v2 — جيمنق ليبيا

متجر ألعاب وبطاقات رقمية — واجهة على GitHub Pages، والمنطق كامل على Cloudflare Worker، وقاعدة البيانات Firebase (`zad1-85d66`).

## الهيكل
| المسار | الوظيفة |
|---|---|
| `index.html` + `assets/js/store.js` | المتجر (16 شاشة) |
| `admin.html` + `assets/js/admin.js` | لوحة التحكم |
| `assets/js/config.js` | رابط الـ Worker + إعدادات Firebase العامة |
| `worker/worker.js` | الـ API (يُنسخ في Cloudflare) |
| `firestore.rules` | قواعد يوم الإطلاق (قفل كامل) |
| `legacy/` | صور الموقع القديم (مضغوطة) |

## الأمان
- المتصفح ما يكتبش في قاعدة البيانات نهائياً. كل عملية تمر من الـ Worker بعد التحقق من التوكن.
- الأسعار والأرصدة تُحسب في السيرفر داخل Transaction، مع منع تكرار الطلب (idempotency).
- أكواد التسليم التلقائي وأرقام كروت الشحن مشفّرة (AES-GCM) داخل القاعدة.
- تسجيل الدخول والتسجيل محميين بـ Turnstile + حد للمحاولات.
- لوحة الإدارة بصلاحية حقيقية (ADMIN_UIDS) يتم التحقق منها في السيرفر.
- CSP صارم، بدون inline scripts، وكل البيانات تُعرض بعد escape.

## يوم الإطلاق
1. انشر `firestore.rules` و `storage.rules` في Firebase.
2. Authentication › Settings › User actions: ألغِ "Enable create (sign-up)" (التسجيل يتم فقط عبر الـ Worker).
3. احذف الموقع القديم.
