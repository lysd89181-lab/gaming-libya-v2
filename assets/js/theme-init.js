// يطبّق الوضع (ليلي/نهاري) قبل رسم الصفحة لتفادي الوميض
(function () {
  try { if (localStorage.getItem('gl_theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}
})();
