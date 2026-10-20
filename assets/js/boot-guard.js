// لو الصفحة ما حمّلتش خلال 12 ثانية (نسخة قديمة في الكاش أو إنترنت ضعيف) نعرض زر تحديث بدل الدائرة
(function () {
  setTimeout(function () {
    var b = document.getElementById('boot') || document.querySelector('#root > div');
    if (!b || !b.querySelector('.spinner')) return;
    b.innerHTML = '<div style="text-align:center;padding:24px;max-width:320px"><p style="margin:0 0 16px">تعذّر تحميل الصفحة. غالباً نسخة قديمة محفوظة في المتصفح.</p><button id="gl-reload" class="btn btn-primary">تحديث الصفحة</button></div>';
    document.getElementById('gl-reload').addEventListener('click', function () { location.reload(); });
  }, 12000);
})();
