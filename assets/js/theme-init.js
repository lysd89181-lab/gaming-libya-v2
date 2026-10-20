// يطبّق الوضع (ليلي/نهاري) قبل رسم الصفحة لتفادي الوميض
(function () {
  try { if (localStorage.getItem('gl_theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}
})();
// شاشة البداية: كاملة أول مرة في الجلسة ومختصرة بعدها (الشعار والشريط فقط)
(function () {
  var seen = false;
  try { seen = sessionStorage.getItem('gl_splash') === '1'; sessionStorage.setItem('gl_splash', '1'); } catch (e) {}
  window.__glSplashStart = Date.now();
  if (seen || document.documentElement.hasAttribute('data-quick')) document.documentElement.classList.add('sp-quick');
})();
