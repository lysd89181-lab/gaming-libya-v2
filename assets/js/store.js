import {
  CONFIG, auth, api, esc, $, $$, imgTag, imgUrl, fmt, money, timeAgo, fmtDate, store, toast, sheet, closeSheet,
  confirmSheet, busy, copyText, uuid, captcha, loginWith, signupWith, resetPassword, changePassword, logout,
  onAuthStateChanged, enablePush,
} from './core.js';
import { icon, logoMark, brand } from './icons.js';

/* ================= State ================= */
const S = {
  user: null, me: null, cfg: null, cat: null, authReady: false,
  cart: store.get('gl_cart', []), favs: new Set(store.get('gl_favs', [])),
  actions: {}, timers: [], cap: null,
};
const view = $('#view');
const topbar = $('#topbar');
const tabbar = $('#tabbar');
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };
const saveCart = () => { store.set('gl_cart', S.cart); updateChrome(); };
const saveFavs = () => store.set('gl_favs', [...S.favs]);

/* ================= Data ================= */
async function loadConfig() {
  if (!S.cfg) S.cfg = await api('/api/config');
  return S.cfg;
}
async function loadCatalog(force = false) {
  if (!S.cat || force) S.cat = await api('/api/catalog');
  return S.cat;
}
async function loadMe() {
  if (!S.user) { S.me = null; updateChrome(); return null; }
  try { S.me = await api('/api/me'); }
  catch (e) {
    S.me = null;
    if (e.status === 403 || e.status === 401) { toast(e.message, 'bad', 5000); await logout(); }
  }
  updateChrome();
  return S.me;
}
const svcById = (id) => S.cat?.services.find((s) => s.id === id);
const catById = (id) => S.cat?.categories.find((c) => c.id === id);
function linePrice(s, qty) {
  if (s.enableQuantity) return r3((s.price / s.qtyMin) * qty * (1 - s.discount / 100));
  return r3(s.finalPrice * qty);
}
const cartCount = () => S.cart.length;

/* ================= Chrome (top bar / tab bar / drawer) ================= */
function setTop(mode, title = '', action = '') {
  if (mode === 'home') {
    topbar.innerHTML = `<div class="tb-actions">
        <button class="btn-icon" data-act="drawer" aria-label="القائمة">${S.me ? `<span class="avatar" style="width:100%;height:100%;box-shadow:none;border-radius:13px">${esc((S.me.name || 'G').trim().charAt(0))}</span>` : icon('menu')}</button>
        <a class="btn-icon" href="#/notifications" aria-label="الإشعارات">${icon('bell')}${S.me?.unread ? '<i class="dot"></i>' : ''}</a>
      </div><a href="#/home" aria-label="الرئيسية">${brand()}</a>`;
  } else {
    topbar.innerHTML = `<button class="btn-icon" data-act="back" aria-label="رجوع">${icon('back')}</button>
      <div class="tb-title">${esc(title)}</div><div class="tb-actions">${action || '<span style="width:44px"></span>'}</div>`;
  }
}
function updateChrome() {
  const h = parseHash().path.split('/')[0] || 'home';
  const map = { home: 'home', categories: 'categories', category: 'categories', cart: 'cart', account: 'account' };
  const cur = map[h] || '';
  const n = cartCount();
  tabbar.innerHTML = [
    ['home', 'home', 'الرئيسية'], ['categories', 'grid', 'الأقسام'], ['cart', 'cart', 'السلة'], ['account', 'user', 'حسابي'],
  ].map(([k, ic, label]) => `<a class="tab ${cur === k ? 'active' : ''}" href="#/${k}">${icon(ic)}${k === 'cart' && n ? `<i class="count">${n}</i>` : ''}<span>${label}</span></a>`).join('');
  const bell = topbar.querySelector('a[href="#/notifications"]');
  if (bell) { bell.querySelector('.dot')?.remove(); if (S.me?.unread) bell.insertAdjacentHTML('beforeend', '<i class="dot"></i>'); }
}
function openDrawer() {
  closeDrawer();
  const me = S.me;
  const ov = document.createElement('div'); ov.id = 'drawer-ov';
  const d = document.createElement('aside'); d.id = 'drawer'; d.setAttribute('role', 'dialog');
  const links = [
    ['#/home', 'home', 'الرئيسية'], ['#/categories', 'grid', 'الأقسام'], ['#/offers', 'tag', 'العروض'], ['#/cart', 'cart', 'السلة'],
    ['#/wallet', 'wallet', 'المحفظة'], ['#/orders', 'receipt', 'طلباتي'], ['#/notifications', 'bell', 'الإشعارات'],
    ['#/favorites', 'heart', 'المفضلة'], ['#/account', 'user', 'حسابي'],
  ];
  const sup = S.cfg?.settings?.supportWhatsapp;
  d.innerHTML = `<div class="drawer-head">${brand()}<button class="btn-icon" data-act="closeDrawer" aria-label="إغلاق">${icon('x')}</button></div>
    ${me ? `<a class="drawer-user" href="#/account"><span class="avatar">${esc(me.name.trim().charAt(0) || 'G')}</span><div style="min-width:0"><b>${esc(me.name)}</b><span>${esc(me.email)}</span></div></a>`
      : `<a class="btn btn-primary btn-block" href="#/login">${icon('user')} تسجيل الدخول</a>`}
    <nav class="menu">${links.map(([h, ic, t]) => `<a href="${h}">${icon(ic)}<span>${t}</span>${icon('forward', 'chev')}</a>`).join('')}
    ${sup ? `<a href="https://wa.me/${esc(sup.replace(/^\+/, ''))}" target="_blank" rel="noopener">${icon('support')}<span>الدعم الفني</span>${icon('forward', 'chev')}</a>` : ''}
    ${me ? `<button class="danger" data-act="logout">${icon('logout')}<span>تسجيل الخروج</span></button>` : ''}</nav>`;
  ov.addEventListener('click', closeDrawer);
  document.body.append(ov, d);
  d.addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(); });
}
function closeDrawer() { $('#drawer')?.remove(); $('#drawer-ov')?.remove(); }

/* ================= Global events ================= */
document.addEventListener('click', async (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.preventDefault(); e.stopPropagation();
    const id = fav.dataset.fav;
    if (S.favs.has(id)) { S.favs.delete(id); toast('أُزيلت من المفضلة', 'info', 1400); } else { S.favs.add(id); toast('أُضيفت للمفضلة', 'ok', 1400); }
    saveFavs();
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle('on', S.favs.has(id)));
    return;
  }
  const cp = e.target.closest('[data-copy]');
  if (cp) { e.preventDefault(); copyText(cp.dataset.copy); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const name = a.dataset.act;
  if (name === 'back') { if (S.navCount > 1) history.back(); else go('#/home'); return; }
  if (name === 'drawer') return openDrawer();
  if (name === 'closeDrawer') return closeDrawer();
  if (name === 'logout') {
    closeDrawer();
    const ok = await confirmSheet({ title: 'تسجيل الخروج', text: 'هل تريد تسجيل الخروج من حسابك؟', ok: 'خروج', danger: true });
    if (ok) { await logout(); toast('تم تسجيل الخروج', 'ok'); go('#/home'); }
    return;
  }
  const fn = S.actions[name];
  if (fn) { e.preventDefault(); fn(a, e); }
});
window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 8), { passive: true });

/* ================= Shared UI ================= */
function priceHtml(s) {
  if (s.enableQuantity) return `<b><small class="cur">من</small> <span class="num">${fmt(linePrice(s, s.qtyMin))}</span> <span class="cur">د.ل</span></b>`;
  return `<b><span class="num">${fmt(s.finalPrice)}</span> <span class="cur">د.ل</span></b>${s.discount > 0 ? `<s class="num">${fmt(s.price)}</s>` : ''}`;
}
function pCard(s) {
  const out = s.auto && s.stock === 0;
  const tag = s.auto ? `<span class="p-tag">${icon('bolt')} ${out ? 'نفذت' : 'فوري'}</span>` : s.badge ? `<span class="p-tag">${esc(s.badge)}</span>` : '';
  return `<a class="p-card ${out ? 'out' : ''}" href="#/service/${encodeURIComponent(s.id)}">
    <div class="p-media">${imgTag(s.image, s.title)}${s.discount > 0 ? `<span class="p-off">-${s.discount}%</span>` : ''}${tag}
    <button class="p-fav ${S.favs.has(s.id) ? 'on' : ''}" data-fav="${esc(s.id)}" aria-label="المفضلة">${icon('heart')}</button></div>
    <div class="p-body"><div class="p-title">${esc(s.title)}</div><div class="p-price">${priceHtml(s)}</div></div></a>`;
}
function emptyState(ic, title, text = '', btn = '') {
  return `<div class="empty"><div class="ico-wrap">${icon(ic, 'ico-lg')}</div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}${btn}</div>`;
}
function errorState(msg) {
  S.actions.retry = () => render();
  return emptyState('alert', 'تعذّر التحميل', msg, `<button class="btn btn-ghost btn-sm" data-act="retry">${icon('refresh')} إعادة المحاولة</button>`);
}
const skGrid = (n = 4) => `<div class="p-grid" style="margin-top:16px">${Array.from({ length: n }, () => '<div class="sk" style="aspect-ratio:.78"></div>').join('')}</div>`;
const statusBadge = (st) => ({
  completed: `<span class="badge badge-ok">${icon('check', 'ico-sm')} مكتمل</span>`,
  approved: `<span class="badge badge-ok">${icon('check', 'ico-sm')} مقبول</span>`,
  pending: `<span class="badge badge-warn">${icon('clock', 'ico-sm')} قيد التنفيذ</span>`,
  rejected: `<span class="badge badge-bad">${icon('x', 'ico-sm')} مرفوض</span>`,
}[st] || `<span class="badge badge-info">${esc(st)}</span>`);
function footer() {
  const s = S.cfg?.settings || {};
  const so = s.social || {};
  const links = [['facebook', so.facebook], ['instagram', so.instagram], ['telegram', so.telegram], ['tiktok', so.tiktok], ['whatsapp', so.whatsapp || (s.supportWhatsapp ? `https://wa.me/${s.supportWhatsapp.replace(/^\+/, '')}` : '')]].filter(([, u]) => u && /^https:\/\//.test(u));
  return `<footer class="footer">${brand()}
    ${links.length ? `<div class="socials">${links.map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${k}">${icon(k)}</a>`).join('')}</div>` : ''}
    <small>© ${new Date().getFullYear()} Gaming Libya — جميع الحقوق محفوظة</small>
    <span class="credit">تطوير <a href="https://wa.me/${CONFIG.DEV_CREDIT.whatsapp}" target="_blank" rel="noopener">${esc(CONFIG.DEV_CREDIT.name)}</a></span></footer>`;
}
function needLogin(next) {
  setTop('inner', 'تسجيل الدخول مطلوب');
  view.innerHTML = emptyState('lock', 'سجّل الدخول للمتابعة', 'هذه الصفحة تحتاج حساباً', `<a class="btn btn-primary" href="#/login?next=${encodeURIComponent(next)}">تسجيل الدخول</a><a class="btn btn-ghost btn-sm" href="#/signup">إنشاء حساب جديد</a>`);
}

/* ================= Screens ================= */

// 1. شاشة البداية
function welcome() {
  document.body.classList.add('bare');
  view.innerHTML = `<section class="welcome"><div class="rays"></div>
    <div class="center">${logoMark('brand-mark')}<div class="brand-word"><b>GAMING</b><span>LIBYA</span></div></div>
    <div class="tagline"><b>ألعاب • بطاقات • اشتراكات رقمية</b><p>كل ما تحتاجه في مكان واحد</p></div>
    <div class="hello">أهلاً في عالم الألعاب</div>
    <a class="btn btn-primary btn-block" href="#/login" data-act="seen">ابدأ الآن ${icon('forward')}</a>
    <a class="btn btn-block" style="color:var(--text-2);margin-top:6px" href="#/home" data-act="seen">تصفح كضيف</a>
    <div class="pager"><i class="on"></i><i></i><i></i></div></section>`;
  S.actions.seen = (a) => { store.set('gl_seen', 1); location.hash = a.getAttribute('href'); };
}

// 2. تسجيل الدخول
async function loginPage(q) {
  document.body.classList.add('bare');
  if (S.user) return go(q.get('next') ? '#/' + q.get('next') : '#/home');
  view.innerHTML = `<section class="auth">
    <div class="auth-logo">${logoMark('brand-mark')}<div class="brand-word"><b>GAMING</b><span>LIBYA</span></div></div>
    <h1>تسجيل الدخول</h1><p class="sub">مرحباً مجدداً، سجّل دخولك للمتابعة</p>
    <form id="f" novalidate>
      <div class="input-wrap">${icon('user')}<input class="input has-ico" name="ident" autocomplete="username" placeholder="البريد الإلكتروني أو رقم الهاتف" required maxlength="100"></div>
      <div class="input-wrap">${icon('lock')}<input class="input has-ico" name="pw" type="password" autocomplete="current-password" placeholder="كلمة المرور" required maxlength="64"><button type="button" class="input-act" data-act="pw" aria-label="إظهار">${icon('eye')}</button></div>
      <div class="links"><label class="check"><input type="checkbox" name="rem" checked> تذكّرني</label><a href="#/forgot">نسيت كلمة المرور؟</a></div>
      <div id="cap" class="captcha"></div>
      <button class="btn btn-primary btn-block" type="submit">تسجيل الدخول</button>
      <div class="or">أو</div>
      <a class="btn btn-ghost btn-block" href="#/signup${q.get('next') ? `?next=${encodeURIComponent(q.get('next'))}` : ''}">إنشاء حساب جديد</a>
      <a class="btn btn-block" style="color:var(--text-2);height:44px" href="#/home">تسجيل الدخول كضيف</a>
    </form></section>`;
  S.actions.pw = (b) => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = icon(i.type === 'password' ? 'eye' : 'eyeoff'); };
  const f = $('#f');
  loadConfig().then((c) => captcha($('#cap'), c.turnstileSiteKey)).then((c) => { S.cap = c; }).catch(() => {});
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    busy(btn, async () => {
      const id = f.ident.value.trim(), pw = f.pw.value;
      if (!id || !pw) return toast('أدخل بيانات الدخول', 'bad');
      try {
        if (!S.cap) S.cap = await captcha($('#cap'), (await loadConfig()).turnstileSiteKey);
        const t = await S.cap.get();
        await loginWith(id, pw, t, { remember: f.rem.checked });
        store.set('gl_seen', 1);
        toast('أهلاً بك 👋', 'ok');
        go(q.get('next') ? '#/' + q.get('next') : '#/home');
      } catch (err) { toast(err.message, 'bad'); S.cap?.reset(); }
    });
  });
}

// تسجيل جديد
async function signupPage(q) {
  document.body.classList.add('bare');
  if (S.user) return go('#/home');
  view.innerHTML = `<section class="auth"><button class="btn-icon back" data-act="back" aria-label="رجوع">${icon('back')}</button>
    <div class="auth-logo" style="margin-bottom:18px">${logoMark('brand-mark')}</div>
    <h1>إنشاء حساب جديد</h1><p class="sub">انضم لأكبر متجر ألعاب في ليبيا</p>
    <form id="f" novalidate>
      <div class="input-wrap">${icon('user')}<input class="input has-ico" name="fullname" autocomplete="name" placeholder="الاسم الكامل" maxlength="40" required></div>
      <div class="input-wrap">${icon('phone')}<input class="input has-ico ltr" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="09XXXXXXXX" maxlength="20" required></div>
      <div class="input-wrap">${icon('mail')}<input class="input has-ico ltr" name="email" type="email" autocomplete="email" placeholder="example@domain.com" maxlength="100" required></div>
      <div class="input-wrap">${icon('lock')}<input class="input has-ico" name="pw" type="password" autocomplete="new-password" placeholder="كلمة المرور (8 أحرف وأرقام)" maxlength="64" required><button type="button" class="input-act" data-act="pw" aria-label="إظهار">${icon('eye')}</button></div>
      <div class="input-wrap">${icon('lock')}<input class="input has-ico" name="pw2" type="password" autocomplete="new-password" placeholder="تأكيد كلمة المرور" maxlength="64" required></div>
      <div id="cap" class="captcha"></div>
      <button class="btn btn-primary btn-block" type="submit">إنشاء الحساب</button>
      <p class="hint" style="text-align:center;margin:0">لديك حساب؟ <a href="#/login">سجّل الدخول</a></p>
    </form></section>`;
  S.actions.pw = (b) => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = icon(i.type === 'password' ? 'eye' : 'eyeoff'); };
  loadConfig().then((c) => captcha($('#cap'), c.turnstileSiteKey)).then((c) => { S.cap = c; }).catch(() => {});
  const f = $('#f');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      const d = { name: f.fullname.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), password: f.pw.value };
      if (d.name.length < 2) return toast('أدخل اسمك', 'bad');
      if (!/^0?9[1-6]\d{7}$/.test(d.phone.replace(/\D/g, '').replace(/^218/, ''))) return toast('رقم الهاتف غير صحيح', 'bad');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return toast('البريد الإلكتروني غير صحيح', 'bad');
      if (d.password.length < 8 || !/\d/.test(d.password) || !/\D/.test(d.password)) return toast('كلمة المرور 8 أحرف على الأقل وتحتوي حروفاً وأرقاماً', 'bad');
      if (d.password !== f.pw2.value) return toast('كلمتا المرور غير متطابقتين', 'bad');
      try {
        if (!S.cap) S.cap = await captcha($('#cap'), (await loadConfig()).turnstileSiteKey);
        await signupWith(d, await S.cap.get());
        store.set('gl_seen', 1);
        toast('تم إنشاء حسابك بنجاح 🎉', 'ok');
        go(q.get('next') ? '#/' + q.get('next') : '#/home');
      } catch (err) { toast(err.message, 'bad'); S.cap?.reset(); }
    });
  });
}

// 3. استعادة كلمة المرور
function forgotPage() {
  document.body.classList.add('bare');
  view.innerHTML = `<section class="auth"><button class="btn-icon back" data-act="back" aria-label="رجوع">${icon('back')}</button>
    <div style="height:70px"></div><h1>استعادة كلمة المرور</h1>
    <p class="sub">أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور</p>
    <form id="f" novalidate>
      <div class="input-wrap">${icon('mail')}<input class="input has-ico ltr" name="email" type="email" autocomplete="email" placeholder="example@domain.com" required maxlength="100"></div>
      <button class="btn btn-primary btn-block" type="submit">إرسال الرابط</button>
    </form>
    <div style="display:grid;justify-items:center;gap:14px;margin-top:44px;color:var(--gold)">
      <div class="empty" style="padding:0"><div class="ico-wrap" style="width:110px;height:110px;border-radius:34px">${icon('mail', 'ico-lg')}</div></div>
      <span class="muted" style="font-size:13px">ستصلك رسالة خلال دقائق، تحقق من البريد المزعج أيضاً</span></div></section>`;
  const f = $('#f');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      const em = f.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return toast('البريد الإلكتروني غير صحيح', 'bad');
      try { await resetPassword(em); } catch {}
      sheet(`<div class="center-t"><div class="success-ic">${icon('mail')}</div><h3>تحقق من بريدك</h3><p class="t2">إذا كان البريد مسجلاً لدينا، ستصلك رسالة بها رابط إعادة التعيين.</p>
        <a class="btn btn-primary btn-block" href="#/login" data-act="cls" style="margin-top:12px">العودة لتسجيل الدخول</a></div>`, { center: true });
      S.actions.cls = () => { closeSheet(); go('#/login'); };
    });
  });
}

// 4. الرئيسية
async function home() {
  setTop('home');
  view.innerHTML = `<div class="sk" style="height:96px;margin-top:6px;border-radius:28px"></div><div class="sk" style="height:178px;margin-top:16px;border-radius:28px"></div>${skGrid(4)}`;
  let cfg, cat;
  try { [cfg, cat] = await Promise.all([loadConfig(), loadCatalog()]); } catch (e) { view.innerHTML = errorState(e.message); return; }
  const s = cfg.settings;
  const svcs = cat.services;
  const best = [...svcs].filter((x) => !(x.auto && x.stock === 0)).sort((a, b) => b.sold - a.sold || a.order - b.order).slice(0, 10);
  const offers = svcs.filter((x) => x.discount > 0).slice(0, 10);
  const banners = (s.banners || []).filter((b) => imgUrl(b.image));
  const slides = banners.length
    ? banners.map((b) => `<a class="slide" href="${esc(b.link && b.link.startsWith('#') ? b.link : '#/categories')}">${imgTag(b.image, b.title)}<div class="slide-body">${b.title ? `<h3>${esc(b.title)}</h3>` : ''}${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}<span class="btn btn-primary btn-sm">تسوّق الآن</span></div></a>`).join('')
    : `<div class="slide default">${logoMark('art')}<div class="slide-body"><h3>أفضل الألعاب<br><span class="gold-text">بأفضل الأسعار</span></h3><p>شحن فوري وأكواد تصلك خلال ثوانٍ</p><a class="btn btn-primary btn-sm" href="#/categories">تسوّق الآن</a></div></div>`;
  const n = banners.length || 1;
  view.innerHTML = `
    ${S.me ? `<div class="balance"><div style="position:relative;z-index:1"><small>رصيدك الحالي</small><div class="amt">${money(S.me.balance)}</div></div><a class="btn-add" href="#/wallet" aria-label="شحن الرصيد">${icon('plus')}</a></div>`
      : `<div class="balance"><div style="position:relative;z-index:1"><small>مرحباً بك في جيمنق ليبيا</small><div style="font-weight:600;font-size:17px;margin-top:4px">سجّل الدخول وابدأ الشحن</div></div><a class="btn btn-primary btn-sm" style="position:relative;z-index:1" href="#/login">دخول</a></div>`}
    ${s.announcement ? `<div class="announce">${icon('sparkle')}<span>${esc(s.announcement)}</span></div>` : ''}
    <div class="hero"><div class="hero-track" id="track">${slides}</div>${n > 1 ? `<div class="hero-dots">${Array.from({ length: n }, (_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>
    <a class="searchbar" href="#/search">${icon('search')}<span style="flex:1">ابحث عن لعبة أو بطاقة...</span>${icon('forward', 'ico-sm')}</a>
    <section class="sec"><div class="sec-head"><h2>الأقسام</h2><a href="#/categories">عرض الكل</a></div>
      <div class="h-scroll">${cat.categories.slice(0, 12).map((c) => `<a class="cat-pill" href="#/category/${encodeURIComponent(c.id)}"><div class="ring">${imgTag(c.image, c.name)}</div><span>${esc(c.name)}</span></a>`).join('') || '<span class="muted">لا توجد أقسام بعد</span>'}</div></section>
    ${best.length ? `<section class="sec"><div class="sec-head"><h2>${icon('fire')} الأكثر مبيعاً</h2><a href="#/categories">عرض الكل</a></div><div class="h-scroll">${best.map(pCard).join('')}</div></section>` : ''}
    ${offers.length ? `<section class="sec"><div class="sec-head"><h2>${icon('tag')} عروض وخصومات</h2><a href="#/offers">عرض الكل</a></div><div class="h-scroll">${offers.map(pCard).join('')}</div></section>` : ''}
    <section class="sec"><div class="sec-head"><h2>${icon('grid')} تصفّح الأقسام</h2></div>
      <div class="cat-grid">${cat.categories.slice(0, 8).map(catCard).join('')}</div>
      ${cat.categories.length > 8 ? `<a class="btn btn-ghost btn-block" style="margin-top:14px" href="#/categories">عرض كل الأقسام</a>` : ''}</section>
    ${footer()}`;
  if (n > 1) {
    let i = 0;
    const track = $('#track'), dots = $$('.hero-dots i');
    S.timers.push(setInterval(() => { i = (i + 1) % n; track.style.transform = `translateX(${i * 100}%)`; dots.forEach((d, k) => d.classList.toggle('on', k === i)); }, 4500));
  }
}
function catCard(c) {
  const count = S.cat.services.filter((s) => s.category === c.id).length;
  return `<a class="cat-card" href="#/category/${encodeURIComponent(c.id)}">${imgTag(c.image, c.name)}<div class="cc-body"><b>${esc(c.name)}</b><small>${count} خدمة</small></div></a>`;
}

// كل الأقسام
async function categoriesPage() {
  setTop('inner', 'الأقسام', `<a class="btn-icon" href="#/search" aria-label="بحث">${icon('search')}</a>`);
  view.innerHTML = skGrid(6);
  try { await loadCatalog(); } catch (e) { view.innerHTML = errorState(e.message); return; }
  view.innerHTML = S.cat.categories.length ? `<p class="page-sub">اختر القسم لعرض الخدمات</p><div class="cat-grid">${S.cat.categories.map(catCard).join('')}</div>` : emptyState('grid', 'لا توجد أقسام بعد');
}

// 5. صفحة القسم
async function categoryPage(id) {
  setTop('inner', '...', `<a class="btn-icon" href="#/search" aria-label="بحث">${icon('search')}</a>`);
  view.innerHTML = skGrid(6);
  try { await loadCatalog(); } catch (e) { view.innerHTML = errorState(e.message); return; }
  const c = catById(id);
  if (!c) return notFound();
  setTop('inner', c.name, `<a class="btn-icon" href="#/search" aria-label="بحث">${icon('search')}</a>`);
  listPage(S.cat.services.filter((s) => s.category === id), { emptyText: 'لا توجد خدمات في هذا القسم حالياً' });
}
function listPage(items, { emptyText = 'لا توجد نتائج', head = '' } = {}) {
  let sort = 'default', page = 1;
  const draw = () => {
    let list = [...items];
    if (sort === 'low') list.sort((a, b) => linePrice(a, a.enableQuantity ? a.qtyMin : 1) - linePrice(b, b.enableQuantity ? b.qtyMin : 1));
    else if (sort === 'high') list.sort((a, b) => linePrice(b, b.enableQuantity ? b.qtyMin : 1) - linePrice(a, a.enableQuantity ? a.qtyMin : 1));
    else if (sort === 'off') list = list.filter((s) => s.discount > 0).sort((a, b) => b.discount - a.discount);
    else if (sort === 'best') list.sort((a, b) => b.sold - a.sold);
    else if (sort === 'auto') list = list.filter((s) => s.auto);
    else list.sort((a, b) => a.order - b.order || a.finalPrice - b.finalPrice);
    const shown = list.slice(0, page * 20);
    $('#grid').innerHTML = shown.length ? shown.map(pCard).join('') : `<div style="grid-column:1/-1">${emptyState('box', emptyText)}</div>`;
    $('#more').classList.toggle('hidden', list.length <= shown.length);
    $$('.toolbar .chip').forEach((ch) => ch.classList.toggle('active', ch.dataset.sort === sort));
  };
  const chips = [['default', 'الكل'], ['low', 'الأقل سعراً'], ['high', 'الأعلى سعراً'], ['best', 'الأكثر مبيعاً'], ['off', 'خصم'], ['auto', '⚡ تسليم فوري']];
  view.innerHTML = `${head}<div class="toolbar">${chips.map(([k, t]) => `<button class="chip" data-act="sort" data-sort="${k}">${t}</button>`).join('')}</div>
    <div class="p-grid wide" id="grid"></div><button class="btn btn-ghost btn-block hidden" id="more" data-act="more" style="margin-top:18px">تحميل المزيد</button>`;
  S.actions.sort = (b) => { sort = b.dataset.sort; page = 1; draw(); };
  S.actions.more = () => { page++; draw(); };
  draw();
}
async function offersPage() {
  setTop('inner', 'العروض');
  view.innerHTML = skGrid(4);
  try { await loadCatalog(); } catch (e) { view.innerHTML = errorState(e.message); return; }
  listPage(S.cat.services.filter((s) => s.discount > 0), { emptyText: 'لا توجد عروض حالياً، تابعنا قريباً' });
}
async function favoritesPage() {
  setTop('inner', 'المفضلة');
  view.innerHTML = skGrid(4);
  try { await loadCatalog(); } catch (e) { view.innerHTML = errorState(e.message); return; }
  const list = S.cat.services.filter((s) => S.favs.has(s.id));
  if (!list.length) { view.innerHTML = emptyState('heart', 'قائمة المفضلة فارغة', 'اضغط على ♡ في أي خدمة لحفظها هنا', '<a class="btn btn-primary btn-sm" href="#/categories">تصفح الخدمات</a>'); return; }
  view.innerHTML = `<div class="p-grid wide">${list.map(pCard).join('')}</div>`;
}
async function searchPage(q) {
  setTop('inner', 'البحث');
  view.innerHTML = `<div class="searchbar" style="margin-top:4px">${icon('search')}<input id="q" type="search" placeholder="ابحث عن لعبة أو بطاقة..." value="${esc(q.get('q') || '')}" autocomplete="off" maxlength="60"></div><div id="res" style="margin-top:18px"></div>`;
  try { await loadCatalog(); } catch (e) { $('#res').innerHTML = errorState(e.message); return; }
  const inp = $('#q');
  const draw = () => {
    const t = norm(inp.value);
    if (!t) { $('#res').innerHTML = `<div class="sec-head"><h2>الأقسام</h2></div><div class="chips" style="flex-wrap:wrap">${S.cat.categories.map((c) => `<a class="chip" href="#/category/${encodeURIComponent(c.id)}">${esc(c.name)}</a>`).join('')}</div>`; return; }
    const cats = new Map(S.cat.categories.map((c) => [c.id, norm(c.name)]));
    const res = S.cat.services.filter((s) => norm(s.title).includes(t) || (cats.get(s.category) || '').includes(t) || norm(s.description).includes(t)).slice(0, 60);
    $('#res').innerHTML = res.length ? `<p class="page-sub">${res.length} نتيجة</p><div class="p-grid wide">${res.map(pCard).join('')}</div>` : emptyState('search', 'لا توجد نتائج', 'جرّب كلمة أخرى');
  };
  inp.addEventListener('input', draw);
  draw();
  setTimeout(() => inp.focus(), 50);
}

// 6. تفاصيل الخدمة
const FIELD_DEF = { id: ['معرّف اللاعب (ID)', 'أدخل الـ ID الخاص بك'], phone: ['رقم الهاتف', '09XXXXXXXX'], account: ['رابط أو اسم الحساب', 'رابط الحساب أو اسم المستخدم'], custom: ['البيانات المطلوبة', 'أدخل البيانات المطلوبة'] };
async function servicePage(id) {
  setTop('inner', 'تفاصيل الخدمة');
  view.innerHTML = `<div class="sk" style="aspect-ratio:16/10;border-radius:28px;margin-top:4px"></div><div class="sk" style="height:28px;width:70%;margin-top:18px"></div><div class="sk" style="height:140px;margin-top:18px"></div>`;
  try { await loadCatalog(); } catch (e) { view.innerHTML = errorState(e.message); return; }
  const s = svcById(id);
  if (!s) return notFound();
  const c = catById(s.category);
  setTop('inner', c ? c.name : 'تفاصيل الخدمة', `<button class="btn-icon" data-act="share" aria-label="مشاركة">${icon('send')}</button>`);
  const out = s.auto && s.stock === 0;
  const [flabel, fph] = FIELD_DEF[s.fieldType] || FIELD_DEF.id;
  const label = s.fieldLabel || flabel;
  let qty = s.enableQuantity ? s.qtyMin : 1;
  const maxQty = s.enableQuantity ? s.qtyMax : s.auto ? Math.max(1, Math.min(10, s.stock || 1)) : 10;
  const related = S.cat.services.filter((x) => x.category === s.category && x.id !== s.id).slice(0, 10);
  view.innerHTML = `
    <div class="svc-hero">${imgTag(s.image, s.title)}${s.discount > 0 ? `<span class="p-off">-${s.discount}%</span>` : ''}</div>
    <div class="svc-head"><h1>${esc(s.title)}</h1></div>
    <div class="svc-meta">
      ${s.auto ? (out ? `<span class="badge badge-bad">${icon('x', 'ico-sm')} نفذت الكمية</span>` : `<span class="badge badge-ok">${icon('bolt', 'ico-sm')} تسليم فوري</span><span class="badge badge-gold">متوفر: <span class="num">${s.stock}</span></span>`)
        : `<span class="badge badge-gold">${icon('clock', 'ico-sm')} تنفيذ خلال دقائق</span>`}
      ${s.badge ? `<span class="badge badge-gold">${esc(s.badge)}</span>` : ''}${s.sold > 5 ? `<span class="badge badge-info">${icon('fire', 'ico-sm')} بيع <span class="num">${s.sold}</span> مرة</span>` : ''}
    </div>
    <div class="svc-price">${s.enableQuantity ? `<b><span class="num" id="unitP">${fmt(linePrice(s, s.qtyMin))}</span> <span class="cur">د.ل / ${s.qtyMin}</span></b>` : `<b><span class="num">${fmt(s.finalPrice)}</span> <span class="cur">د.ل</span></b>${s.discount > 0 ? `<s class="num">${fmt(s.price)}</s>` : ''}`}</div>
    ${s.description ? `<div class="svc-desc">${esc(s.description)}</div>` : ''}
    <div class="box">
      ${s.fieldEnabled ? `<div class="field"><label for="inp">${esc(label)}</label><div class="input-wrap">${icon(s.fieldType === 'phone' ? 'phone' : s.fieldType === 'account' ? 'link' : 'gamepad')}<input id="inp" class="input has-ico ${s.fieldType === 'phone' || s.fieldType === 'id' ? 'ltr' : ''}" maxlength="200" placeholder="${esc(s.fieldLabel ? 'أدخل ' + s.fieldLabel : fph)}" ${s.fieldType === 'phone' ? 'inputmode="tel"' : ''}></div></div>` : ''}
      ${s.enableQuantity ? `<div class="field"><label>الكمية <span class="muted">(${s.qtyMin} - ${s.qtyMax})</span></label>
          <input type="range" id="rng" min="${s.qtyMin}" max="${s.qtyMax}" value="${s.qtyMin}" step="1">
          <input id="qn" class="input ltr" type="number" inputmode="numeric" min="${s.qtyMin}" max="${s.qtyMax}" value="${s.qtyMin}"></div>`
        : `<div class="qty-row"><span class="label">الكمية</span><div class="stepper"><button type="button" data-act="dec" aria-label="إنقاص">${icon('minus')}</button><input id="qn" class="num" value="1" inputmode="numeric" aria-label="الكمية"><button type="button" data-act="inc" aria-label="زيادة">${icon('plus')}</button></div></div>`}
      <div class="total-row"><span class="t2">الإجمالي</span><b><span class="num" id="tot">${fmt(linePrice(s, qty))}</span> <small class="cur">د.ل</small></b></div>
    </div>
    ${related.length ? `<section class="sec"><div class="sec-head"><h2>خدمات مشابهة</h2></div><div class="h-scroll">${related.map(pCard).join('')}</div></section>` : ''}
    <div style="height:70px"></div>
    <div class="buy-bar"><button class="btn-icon ${S.favs.has(s.id) ? 'on' : ''}" data-fav="${esc(s.id)}" aria-label="المفضلة">${icon('heart')}</button>
      <button class="btn btn-ghost" data-act="addCart" ${out ? 'disabled' : ''}>${icon('cart')} السلة</button>
      <button class="btn btn-primary" data-act="buyNow" ${out ? 'disabled' : ''}>${out ? 'غير متوفر' : 'اشترِ الآن'}</button></div>`;
  const qn = $('#qn'), rng = $('#rng'), tot = $('#tot');
  const setQty = (v) => {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) v = s.enableQuantity ? s.qtyMin : 1;
    qty = Math.min(maxQty, Math.max(s.enableQuantity ? s.qtyMin : 1, v));
    qn.value = qty; if (rng) rng.value = qty;
    tot.textContent = fmt(linePrice(s, qty));
  };
  qn.addEventListener('change', () => setQty(qn.value));
  if (rng) rng.addEventListener('input', () => setQty(rng.value));
  S.actions.inc = () => setQty(qty + 1);
  S.actions.dec = () => setQty(qty - 1);
  S.actions.share = async () => {
    const url = location.href;
    try { if (navigator.share) await navigator.share({ title: s.title, url }); else copyText(url); } catch {}
  };
  const collect = () => {
    const input = s.fieldEnabled ? $('#inp').value.trim() : '';
    if (s.fieldEnabled && input.length < 2) { $('#inp').focus(); toast(`أدخل ${label}`, 'bad'); return null; }
    setQty(qn.value);
    return { serviceId: s.id, qty, input };
  };
  S.actions.addCart = () => {
    const it = collect(); if (!it) return;
    const same = S.cart.find((c) => c.serviceId === it.serviceId && c.input === it.input && !s.enableQuantity);
    if (same) same.qty = Math.min(maxQty, same.qty + it.qty);
    else S.cart.push({ key: uuid(), ...it });
    saveCart();
    toast('أُضيفت إلى السلة', 'ok', 1800);
  };
  S.actions.buyNow = () => {
    const it = collect(); if (!it) return;
    if (!S.user) return go(`#/login?next=${encodeURIComponent('service/' + s.id)}`);
    checkout([it], { title: s.title });
  };
}

// تنفيذ الشراء (مشترك بين "اشترِ الآن" والسلة)
async function checkout(items, { fromCart = false } = {}) {
  if (!S.user) return go('#/login?next=cart');
  if (!S.me) await loadMe();
  if (!S.me) return;
  const lines = items.map((it) => ({ it, s: svcById(it.serviceId) })).filter((l) => l.s);
  if (!lines.length) return toast('السلة تحتوي خدمات غير متوفرة', 'bad');
  const total = r3(lines.reduce((a, l) => a + linePrice(l.s, l.it.qty), 0));
  const bal = S.me.balance;
  if (bal < total) {
    sheet(`<div class="center-t"><div class="success-ic" style="background:var(--warn-bg);color:var(--warn);border-color:rgba(229,182,101,.3)">${icon('wallet')}</div>
      <h3>رصيدك غير كافٍ</h3><p class="t2">المطلوب ${money(total)} ورصيدك ${money(bal)}</p>
      <a class="btn btn-primary btn-block" href="#/wallet" data-act="cls" style="margin-top:10px">${icon('plus')} اشحن رصيدك</a></div>`, { center: true });
    S.actions.cls = () => { closeSheet(); go('#/wallet'); };
    return;
  }
  const contact = store.get('gl_contact', S.me.phone || '');
  const ok = await confirmSheet({
    title: 'تأكيد الطلب',
    text: `${lines.map((l) => `• ${esc(l.s.title)} × <span class="num">${l.it.qty}</span>`).join('<br>')}<br><br>الإجمالي: <b class="gold">${money(total)}</b><br>رصيدك بعد الشراء: ${money(r3(bal - total))}`,
    inputs: `<div class="field" style="margin-top:6px"><label>رقم التواصل (واتساب) — اختياري</label><input class="input ltr" data-in="contact" inputmode="tel" maxlength="30" value="${esc(contact)}" placeholder="09XXXXXXXX"></div>`,
    ok: 'تأكيد الشراء',
  });
  if (!ok) return;
  store.set('gl_contact', ok.contact.trim());
  const idem = uuid();
  sheet(`<div class="center-t" style="padding:26px 0"><div class="spinner" style="width:40px;height:40px;margin:0 auto 16px;color:var(--gold)"></div><b>جاري تنفيذ طلبك...</b></div>`, { center: true });
  try {
    const r = await api('/api/orders', { method: 'POST', body: { idem, contactPhone: ok.contact.trim(), items: lines.map((l) => ({ serviceId: l.s.id, quantity: l.it.qty, input: l.it.input })) } });
    if (fromCart) { S.cart = []; saveCart(); }
    S.me.balance = r.balance;
    updateChrome();
    loadCatalog(true).catch(() => {});
    const autos = r.orders.filter((o) => o.auto);
    sheet(`<div class="center-t"><div class="success-ic">${icon('check')}</div><h3>${autos.length ? 'تم التسليم فوراً ⚡' : 'تم استلام طلبك بنجاح'}</h3>
      <p class="t2">${autos.length ? 'أكوادك جاهزة الآن في صفحة الطلب' : 'سيتم تنفيذ طلبك خلال دقائق وستصلك إشعاراً'}</p>
      <p class="muted" style="font-size:13px">رصيدك الحالي: ${money(r.balance)}</p>
      <div style="display:grid;gap:10px;margin-top:14px">
      ${autos.length === 1 ? `<a class="btn btn-primary btn-block" href="#/order/${encodeURIComponent(autos[0].id)}" data-act="cls">${icon('key')} عرض الكود</a>` : ''}
      <a class="btn ${autos.length === 1 ? 'btn-soft' : 'btn-primary'} btn-block" href="#/orders" data-act="cls">طلباتي</a></div></div>`, { center: true });
    S.actions.cls = (a) => { closeSheet(); location.hash = a.getAttribute('href'); };
  } catch (e) {
    closeSheet();
    toast(e.message, 'bad', 5000);
    if (e.status === 402) loadMe();
    if (e.status === 409) loadCatalog(true).then(() => render()).catch(() => {});
  }
}

// 7. السلة
async function cartPage() {
  setTop('inner', 'سلة المشتريات', S.cart.length ? `<button class="btn-icon" data-act="clear" aria-label="تفريغ">${icon('trash')}</button>` : '');
  view.innerHTML = `<div class="sk" style="height:100px"></div><div class="sk" style="height:100px;margin-top:10px"></div>`;
  try { await loadCatalog(); } catch (e) { view.innerHTML = errorState(e.message); return; }
  if (!S.cart.length) { view.innerHTML = emptyState('cart', 'سلتك فارغة', 'أضف خدماتك المفضلة وأكمل الشراء بخطوة واحدة', '<a class="btn btn-primary btn-sm" href="#/categories">تسوّق الآن</a>'); return; }
  const draw = () => {
    let total = 0, invalid = 0;
    const items = S.cart.map((it) => {
      const s = svcById(it.serviceId);
      if (!s) { invalid++; return `<div class="c-item"><div class="c-thumb"><div class="img-ph">${icon('alert')}</div></div><div class="c-info"><b>خدمة غير متوفرة</b><span class="meta">أُزيلت من المتجر</span><div class="c-foot"><span></span><button class="btn btn-danger btn-xs" data-act="rm" data-key="${esc(it.key)}">${icon('trash', 'ico-sm')} إزالة</button></div></div></div>`; }
      const p = linePrice(s, it.qty); total += p;
      const out = s.auto && s.stock < it.qty;
      if (out) invalid++;
      return `<div class="c-item"><a class="c-thumb" href="#/service/${encodeURIComponent(s.id)}">${imgTag(s.image, s.title)}</a><div class="c-info"><b>${esc(s.title)}</b>
        <span class="meta">${it.input ? esc(it.input) : s.auto ? '⚡ تسليم فوري' : '—'}${out ? ' • <span style="color:var(--bad)">الكمية غير متوفرة</span>' : ''}</span>
        <div class="c-foot"><b class="gold"><span class="num">${fmt(p)}</span> <small>د.ل</small></b>
        ${s.enableQuantity ? `<span class="badge badge-gold num">× ${it.qty}</span>` : `<div class="stepper"><button data-act="q" data-key="${esc(it.key)}" data-d="-1" aria-label="إنقاص">${it.qty > 1 ? icon('minus') : icon('trash')}</button><input class="num" value="${it.qty}" readonly aria-label="الكمية"><button data-act="q" data-key="${esc(it.key)}" data-d="1" aria-label="زيادة">${icon('plus')}</button></div>`}
        </div></div></div>`;
    }).join('');
    total = r3(total);
    const bal = S.me?.balance ?? null;
    view.innerHTML = `${items}
      <div class="summary"><div class="row"><span>عدد الخدمات</span><span class="num">${S.cart.length}</span></div>
      ${bal !== null ? `<div class="row"><span>رصيدك الحالي</span><span>${money(bal)}</span></div>` : ''}
      <div class="row big"><span>الإجمالي</span><b>${money(total)}</b></div>
      ${bal !== null && bal < total ? `<div class="row low"><span>ينقصك</span><span>${money(r3(total - bal))}</span></div>` : ''}</div>
      <div style="display:grid;gap:10px;margin-top:16px">
      ${bal !== null && bal < total ? `<a class="btn btn-ghost btn-block" href="#/wallet">${icon('plus')} اشحن رصيدك</a>` : ''}
      <button class="btn btn-primary btn-block" data-act="pay" ${invalid ? 'disabled' : ''}>${S.user ? 'إتمام الشراء' : 'سجّل الدخول لإتمام الشراء'}</button></div>`;
  };
  S.actions.q = (b) => {
    const it = S.cart.find((c) => c.key === b.dataset.key); if (!it) return;
    const s = svcById(it.serviceId);
    const max = s?.auto ? Math.max(1, Math.min(10, s.stock)) : 10;
    it.qty += Number(b.dataset.d);
    if (it.qty < 1) S.cart = S.cart.filter((c) => c !== it); else it.qty = Math.min(max, it.qty);
    saveCart(); S.cart.length ? draw() : cartPage();
  };
  S.actions.rm = (b) => { S.cart = S.cart.filter((c) => c.key !== b.dataset.key); saveCart(); S.cart.length ? draw() : cartPage(); };
  S.actions.clear = async () => { if (await confirmSheet({ title: 'تفريغ السلة؟', ok: 'تفريغ', danger: true })) { S.cart = []; saveCart(); cartPage(); } };
  S.actions.pay = () => { if (!S.user) return go('#/login?next=cart'); checkout(S.cart.map((c) => ({ ...c })), { fromCart: true }); };
  draw();
}

// 8. المحفظة
const PM_ICON = { libyana: 'sim', madar: 'sim', cards: 'card', onepay: 'bank', lypay: 'bank', crypto: 'crypto' };
async function walletPage() {
  if (!S.user) return needLogin('wallet');
  setTop('inner', 'المحفظة');
  view.innerHTML = `<div class="sk" style="height:170px;border-radius:28px"></div>`;
  try { await Promise.all([loadConfig(), loadMe()]); } catch (e) { view.innerHTML = errorState(e.message); return; }
  if (!S.me) return;
  const pms = Object.entries(S.cfg.settings.payments).filter(([, p]) => p.enabled);
  view.innerHTML = `<div class="wallet-hero"><div class="wi">${icon('wallet', 'ico-lg')}</div><small class="t2">رصيدك الحالي</small><div class="amt">${money(S.me.balance)}</div>
      <div class="wallet-actions"><a class="btn btn-primary" href="#wallet-methods" data-act="toMethods">${icon('plus')} إيداع</a><a class="btn btn-ghost" href="#/deposits">${icon('history')} السجل</a></div></div>
    <section class="sec" id="wallet-methods"><div class="sec-head"><h2>طرق الإيداع</h2></div>
    <div class="list">${pms.map(([k, p]) => `<a class="row-link" href="#/deposit/${k}"><span class="ri">${icon(PM_ICON[k] || 'coin')}</span><span class="rt"><b>${esc(p.label)}</b><small>${k === 'crypto' ? `1$ = ${fmt(S.cfg.settings.usdRate)} د.ل` : 'مراجعة سريعة'}</small></span>${icon('forward', 'chev')}</a>`).join('') || emptyState('wallet', 'لا توجد طرق إيداع متاحة حالياً')}</div></section>`;
  S.actions.toMethods = () => $('#wallet-methods').scrollIntoView({ behavior: 'smooth' });
}

// 9. الإيداع
async function depositPage(method) {
  if (!S.user) return needLogin('deposit/' + method);
  setTop('inner', 'إيداع');
  try { await loadConfig(); } catch (e) { view.innerHTML = errorState(e.message); return; }
  const st = S.cfg.settings;
  const p = st.payments[method];
  if (!p || !p.enabled) return notFound();
  setTop('inner', `إيداع عبر ${p.label}`);
  const amt = `<div class="field"><label>المبلغ (د.ل)</label><input class="input ltr" name="amount" type="number" inputmode="decimal" step="0.01" min="${st.depositMin}" max="${st.depositMax}" placeholder="0.00" required></div>`;
  let stepNo = 1;
  const numBox = p.number ? `<div class="field"><label><span class="step-n">${stepNo++}</span>${method === 'onepay' || method === 'lypay' ? 'حوّل المبلغ لهذا الحساب' : method === 'crypto' ? 'أرسل إلى هذا المعرّف' : 'حوّل الرصيد لهذا الرقم'}</label>
      <div class="copy-box"><code>${esc(p.number)}</code><button type="button" class="btn btn-primary btn-sm" data-copy="${esc(p.number)}">${icon('copy', 'ico-sm')} نسخ</button></div></div>` : '';
  let fields = '';
  if (method === 'libyana' || method === 'madar') fields = `<div class="field"><label>رقم هاتفك المحوَّل منه</label><input class="input ltr" name="phone" type="tel" inputmode="tel" placeholder="09XXXXXXXX" maxlength="20" required></div>${amt}`;
  else if (method === 'cards') fields = `<div class="field"><label>نوع الكرت</label><select class="select" name="cardProvider"><option value="libyana">ليبيانا</option><option value="madar">مدار</option></select></div><div class="field"><label>رقم الكرت</label><input class="input ltr" name="cardCode" inputmode="numeric" placeholder="أدخل رقم الكرت" maxlength="30" required></div>${amt.replace('المبلغ (د.ل)', 'قيمة الكرت (د.ل)')}`;
  else if (method === 'onepay' || method === 'lypay') fields = `<div class="field"><label>اسم المحوِّل (كما يظهر في التحويل)</label><input class="input" name="senderName" maxlength="60" placeholder="الاسم الكامل" required></div>${amt}`;
  else if (method === 'crypto') fields = `<div class="field"><label>معرّفك (Binance / Bybit ID)</label><input class="input ltr" name="cryptoId" maxlength="80" placeholder="Pay ID" required></div>
    <div class="field"><label>المبلغ بالدولار (USDT)</label><input class="input ltr" name="usd" type="number" inputmode="decimal" step="0.01" min="1" placeholder="0.00" required></div><div class="hint" id="lyd">يعادل: 0.00 د.ل (1$ = ${fmt(st.usdRate)} د.ل)</div>`;
  view.innerHTML = `<div class="dep-head"><div class="di">${icon(PM_ICON[method] || 'coin')}</div><h2>${esc(p.label)}</h2>${p.note ? `<p class="muted" style="margin:0;font-size:13px">${esc(p.note)}</p>` : ''}</div>
    <form id="f" class="box" novalidate>${numBox}<div class="field"><label><span class="step-n">${stepNo}</span>أدخل بيانات التحويل</label></div>${fields}</form>
    <div class="box"><b style="font-size:14px">${icon('info', 'ico-sm')} معلومات مهمة</b><ul class="notes">
      <li>تأكد من إرسال المبلغ الصحيح قبل تأكيد الطلب</li><li>يُضاف الرصيد لمحفظتك بعد مراجعة الإدارة (عادة خلال دقائق)</li>
      <li>الحد الأدنى ${fmt(st.depositMin)} د.ل والأقصى ${fmt(st.depositMax)} د.ل</li><li>ستصلك رسالة فور إضافة الرصيد</li></ul></div>
    <button class="btn btn-primary btn-block" style="margin-top:16px" data-act="send">${icon('check')} تم التحويل، أرسل الطلب</button>`;
  const f = $('#f');
  if (method === 'crypto') f.usd.addEventListener('input', () => { $('#lyd').textContent = `يعادل: ${fmt(Number(f.usd.value || 0) * st.usdRate)} د.ل (1$ = ${fmt(st.usdRate)} د.ل)`; });
  S.actions.send = (b) => busy(b, async () => {
    const body = { method };
    for (const el of f.elements) if (el.name) body[el.name] = el.value.trim();
    if (method !== 'crypto') {
      const a = Number(body.amount);
      if (!(a >= st.depositMin && a <= st.depositMax)) return toast(`المبلغ يجب أن يكون بين ${st.depositMin} و ${st.depositMax}`, 'bad');
    }
    for (const el of f.elements) if (el.required && !el.value.trim()) { el.focus(); return toast('أكمل جميع الحقول', 'bad'); }
    try {
      const r = await api('/api/deposits', { method: 'POST', body });
      sheet(`<div class="center-t"><div class="success-ic">${icon('check')}</div><h3>تم إرسال طلب الإيداع</h3><p class="t2">المبلغ: ${money(r.amount)} — سيتم مراجعته وإضافته لمحفظتك قريباً</p>
        <a class="btn btn-primary btn-block" href="#/deposits" data-act="cls" style="margin-top:10px">سجل الإيداعات</a></div>`, { center: true });
      S.actions.cls = () => { closeSheet(); go('#/deposits'); };
    } catch (e) { toast(e.message, 'bad', 5000); }
  });
}
async function depositsPage() {
  if (!S.user) return needLogin('deposits');
  setTop('inner', 'سجل الإيداعات');
  view.innerHTML = `<div class="sk" style="height:76px"></div><div class="sk" style="height:76px;margin-top:10px"></div>`;
  let r;
  try { r = await api('/api/deposits'); } catch (e) { view.innerHTML = errorState(e.message); return; }
  if (!r.deposits.length) { view.innerHTML = emptyState('wallet', 'لا توجد إيداعات بعد', '', '<a class="btn btn-primary btn-sm" href="#/wallet">إيداع الآن</a>'); return; }
  view.innerHTML = r.deposits.map((d) => `<div class="o-card" style="cursor:default"><span class="c-thumb"><span class="img-ph">${icon(PM_ICON[d.method] || 'coin')}</span></span>
    <div style="min-width:0"><b>${esc(d.provider || d.method)}</b><small>${timeAgo(d.createdAt)}${d.reason ? ` • ${esc(d.reason)}` : ''}</small></div>
    <div class="o-side"><span class="price">${money(d.approvedAmount ?? d.amount)}</span>${statusBadge(d.status)}</div></div>`).join('');
}

// 10. حسابي
async function accountPage() {
  if (!S.user) {
    setTop('inner', 'حسابي');
    view.innerHTML = `<div class="profile-head" style="padding-top:30px"><span class="avatar lg">${icon('user', 'ico-lg')}</span><b>أهلاً بك ضيفنا</b><span style="direction:rtl">سجّل الدخول لإدارة حسابك وطلباتك</span></div>
      <div style="display:grid;gap:10px;margin-top:22px"><a class="btn btn-primary btn-block" href="#/login?next=account">تسجيل الدخول</a><a class="btn btn-ghost btn-block" href="#/signup">إنشاء حساب جديد</a></div>
      <div class="list" style="margin-top:22px"><a class="row-link" href="#/favorites"><span class="ri">${icon('heart')}</span><span class="rt"><b>المفضلة</b></span>${icon('forward', 'chev')}</a></div>${footer()}`;
    return;
  }
  setTop('inner', 'حسابي');
  view.innerHTML = `<div class="sk" style="height:150px"></div>`;
  try { await Promise.all([loadMe(), loadConfig()]); } catch {}
  const me = S.me;
  if (!me) { view.innerHTML = errorState('تعذّر تحميل الحساب'); return; }
  const pushOn = store.get('gl_push', false) && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const sup = S.cfg?.settings?.supportWhatsapp;
  view.innerHTML = `<div class="profile-head"><span class="avatar lg">${esc(me.name.trim().charAt(0) || 'G')}</span><b>${esc(me.name)}</b><span>${esc(me.email)}</span>
      <a class="btn btn-ghost btn-sm" href="#/profile" style="margin-top:6px">${icon('edit', 'ico-sm')} تعديل البيانات</a></div>
    <div class="stats3"><div><b class="num">${fmt(me.balance)}</b><small>الرصيد (د.ل)</small></div><div><b class="num">${esc(me.phone || '—')}</b><small>الهاتف</small></div><div><b class="num">${fmtDate(me.createdAt)}</b><small>عضو منذ</small></div></div>
    <div class="list">
      <a class="row-link" href="#/orders"><span class="ri">${icon('receipt')}</span><span class="rt"><b>طلباتي</b><small>تتبع طلباتك وأكوادك</small></span>${icon('forward', 'chev')}</a>
      <a class="row-link" href="#/wallet"><span class="ri">${icon('wallet')}</span><span class="rt"><b>المحفظة</b><small>شحن الرصيد</small></span>${icon('forward', 'chev')}</a>
      <a class="row-link" href="#/deposits"><span class="ri">${icon('history')}</span><span class="rt"><b>الإيداعات</b></span>${icon('forward', 'chev')}</a>
      <a class="row-link" href="#/notifications"><span class="ri">${icon('bell')}</span><span class="rt"><b>الإشعارات</b>${me.unread ? `<small class="gold">${me.unread} جديد</small>` : ''}</span>${icon('forward', 'chev')}</a>
      <a class="row-link" href="#/favorites"><span class="ri">${icon('heart')}</span><span class="rt"><b>المفضلة</b></span>${icon('forward', 'chev')}</a>
      <div class="row-link"><span class="ri">${icon('bolt')}</span><span class="rt"><b>إشعارات الجوال</b><small>تنبيه فوري عند تنفيذ طلبك</small></span><label class="switch"><input type="checkbox" id="push" ${pushOn ? 'checked' : ''} aria-label="إشعارات"></label></div>
      <a class="row-link" href="#/password"><span class="ri">${icon('lock')}</span><span class="rt"><b>تغيير كلمة المرور</b></span>${icon('forward', 'chev')}</a>
      ${sup ? `<a class="row-link" href="https://wa.me/${esc(sup.replace(/^\+/, ''))}" target="_blank" rel="noopener"><span class="ri">${icon('support')}</span><span class="rt"><b>الدعم الفني</b><small>تواصل معنا عبر واتساب</small></span>${icon('forward', 'chev')}</a>` : ''}
      <button class="row-link danger" data-act="logout"><span class="ri">${icon('logout')}</span><span class="rt"><b>تسجيل الخروج</b></span></button>
    </div>${footer()}`;
  $('#push').addEventListener('change', async (e) => {
    if (!e.target.checked) { store.set('gl_push', false); toast('أوقف الإشعارات من إعدادات المتصفح للتوقف نهائياً', 'info', 4000); return; }
    try { await enablePush(S.cfg.vapidKey); toast('تم تفعيل الإشعارات 🔔', 'ok'); } catch (err) { e.target.checked = false; toast(err.message, 'bad', 4500); }
  });
}
async function profilePage() {
  if (!S.user) return needLogin('profile');
  setTop('inner', 'تعديل البيانات');
  if (!S.me) await loadMe();
  if (!S.me) return;
  view.innerHTML = `<form id="f" class="box" novalidate>
    <div class="field"><label>الاسم</label><input class="input" name="fullname" maxlength="40" value="${esc(S.me.name)}" required></div>
    <div class="field"><label>رقم الهاتف</label><input class="input ltr" name="phone" type="tel" inputmode="tel" maxlength="20" value="${esc(S.me.phone)}" placeholder="09XXXXXXXX"></div>
    <div class="field"><label>البريد الإلكتروني</label><input class="input ltr" value="${esc(S.me.email)}" disabled><span class="hint">لا يمكن تغيير البريد الإلكتروني</span></div>
    <button class="btn btn-primary btn-block" type="submit">حفظ التغييرات</button></form>`;
  const f = $('#f');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      const body = { name: f.fullname.value.trim() };
      if (f.phone.value.trim()) body.phone = f.phone.value.trim();
      try { await api('/api/me', { method: 'PATCH', body }); await loadMe(); toast('تم الحفظ', 'ok'); go('#/account'); } catch (err) { toast(err.message, 'bad'); }
    });
  });
}
function passwordPage() {
  if (!S.user) return needLogin('password');
  setTop('inner', 'تغيير كلمة المرور');
  view.innerHTML = `<form id="f" class="box" novalidate>
    <div class="field"><label>كلمة المرور الحالية</label><input class="input" name="cur" type="password" autocomplete="current-password" maxlength="64" required></div>
    <div class="field"><label>كلمة المرور الجديدة</label><input class="input" name="pw" type="password" autocomplete="new-password" maxlength="64" required><span class="hint">8 أحرف على الأقل، تحتوي حروفاً وأرقاماً</span></div>
    <div class="field"><label>تأكيد كلمة المرور الجديدة</label><input class="input" name="pw2" type="password" autocomplete="new-password" maxlength="64" required></div>
    <button class="btn btn-primary btn-block" type="submit">تحديث كلمة المرور</button></form>`;
  const f = $('#f');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      if (f.pw.value.length < 8 || !/\d/.test(f.pw.value) || !/\D/.test(f.pw.value)) return toast('كلمة المرور الجديدة ضعيفة', 'bad');
      if (f.pw.value !== f.pw2.value) return toast('كلمتا المرور غير متطابقتين', 'bad');
      try { await changePassword(f.cur.value, f.pw.value); toast('تم تحديث كلمة المرور', 'ok'); go('#/account'); } catch (err) { toast(err.message, 'bad'); }
    });
  });
}

// 11. طلباتي
async function ordersPage(q) {
  if (!S.user) return needLogin('orders');
  setTop('inner', 'طلباتي', `<button class="btn-icon" data-act="reload" aria-label="تحديث">${icon('refresh')}</button>`);
  view.innerHTML = `<div class="sk" style="height:80px"></div><div class="sk" style="height:80px;margin-top:10px"></div><div class="sk" style="height:80px;margin-top:10px"></div>`;
  let r;
  try { [r] = await Promise.all([api('/api/orders'), loadCatalog().catch(() => null)]); } catch (e) { view.innerHTML = errorState(e.message); return; }
  let filter = q.get('s') || 'all';
  const draw = () => {
    const list = filter === 'all' ? r.orders : r.orders.filter((o) => o.status === filter);
    view.innerHTML = `<div class="toolbar">${[['all', 'الكل'], ['completed', 'مكتمل'], ['pending', 'معلّق'], ['rejected', 'مرفوض']].map(([k, t]) => `<button class="chip ${filter === k ? 'active' : ''}" data-act="f" data-k="${k}">${t}</button>`).join('')}</div>
      ${list.length ? list.map((o) => {
        const img = o.image || svcById(o.serviceId)?.image;
        return `<a class="o-card" href="#/order/${encodeURIComponent(o.id)}"><span class="c-thumb">${imgTag(img, o.title)}</span>
          <div style="min-width:0"><b>${esc(o.title)}</b><small><span class="num">#${esc(o.id.slice(0, 6).toUpperCase())}</span> • ${timeAgo(o.createdAt)}</small>${o.hasCodes && o.status === 'completed' ? `<small class="gold" style="display:block">${icon('key', 'ico-sm')} الكود جاهز</small>` : ''}</div>
          <div class="o-side"><span class="price">${money(o.total)}</span>${statusBadge(o.status)}</div></a>`;
      }).join('') : emptyState('receipt', 'لا توجد طلبات', filter === 'all' ? 'ابدأ أول طلب لك الآن' : '', filter === 'all' ? '<a class="btn btn-primary btn-sm" href="#/categories">تسوّق الآن</a>' : '')}`;
  };
  S.actions.f = (b) => { filter = b.dataset.k; draw(); };
  S.actions.reload = () => render();
  draw();
}
async function orderPage(id) {
  if (!S.user) return needLogin('order/' + id);
  setTop('inner', 'تفاصيل الطلب');
  view.innerHTML = `<div class="sk" style="height:140px"></div><div class="sk" style="height:200px;margin-top:12px"></div>`;
  let o;
  try { [o] = await Promise.all([api('/api/orders/' + encodeURIComponent(id)), loadConfig().catch(() => null)]); } catch (e) { view.innerHTML = e.status === 404 ? emptyState('receipt', 'الطلب غير موجود') : errorState(e.message); return; }
  const sup = S.cfg?.settings?.supportWhatsapp;
  const stIcon = { completed: ['checkc', 'var(--ok)', 'var(--ok-bg)', 'تم تنفيذ الطلب'], pending: ['clock', 'var(--warn)', 'var(--warn-bg)', 'طلبك قيد التنفيذ'], rejected: ['xc', 'var(--bad)', 'var(--bad-bg)', 'تم رفض الطلب'] }[o.status] || ['info', 'var(--info)', 'var(--info-bg)', o.status];
  view.innerHTML = `<div class="box" style="text-align:center;justify-items:center;margin-top:4px">
      <div class="success-ic" style="margin:0;color:${stIcon[1]};background:${stIcon[2]};border-color:transparent">${icon(stIcon[0])}</div>
      <b style="font-size:18px">${stIcon[3]}</b><span class="muted" style="font-size:13px">${o.status === 'pending' ? 'سيصلك إشعار فور التنفيذ' : o.status === 'rejected' ? 'تم إرجاع المبلغ لمحفظتك' : fmtDate(o.createdAt, true)}</span></div>
    ${o.codes && o.codes.length ? `<div class="box"><b>${icon('key', 'ico-sm')} ${o.codes.length > 1 ? 'الأكواد' : 'الكود'}</b>${o.codes.map((c) => `<div class="code-box"><code>${esc(c)}</code><button class="btn btn-ok btn-sm" data-copy="${esc(c)}">${icon('copy', 'ico-sm')} نسخ</button></div>`).join('')}
      <span class="hint">احتفظ بالكود في مكان آمن ولا تشاركه مع أحد</span></div>` : ''}
    ${o.note ? `<div class="announce">${icon('info')}<span>${esc(o.note)}</span></div>` : ''}${o.reason ? `<div class="announce" style="color:var(--bad);border-color:rgba(229,130,111,.3)">${icon('alert')}<span>${esc(o.reason)}</span></div>` : ''}
    <div class="box kv">
      <div><span>الخدمة</span><span>${esc(o.title)}</span></div>
      <div><span>رقم الطلب</span><span class="num" data-copy="${esc(o.id)}" style="cursor:pointer">#${esc(o.id.slice(0, 8).toUpperCase())} ${icon('copy', 'ico-sm')}</span></div>
      <div><span>التاريخ</span><span class="num">${fmtDate(o.createdAt, true)}</span></div>
      <div><span>الكمية</span><span class="num">${o.quantity}</span></div>
      ${o.input ? `<div><span>البيانات</span><span>${esc(o.input)}</span></div>` : ''}
      <div><span>طريقة التسليم</span><span>${o.delivery === 'auto' ? '⚡ تلقائي' : 'يدوي'}</span></div>
      <div><span>الحالة</span><span>${statusBadge(o.status)}</span></div>
      <div style="padding-top:10px;border-top:1px dashed var(--line-2)"><span>المبلغ</span><b class="gold">${money(o.total)}</b></div></div>
    ${sup ? `<a class="btn btn-ghost btn-block" style="margin-top:16px" target="_blank" rel="noopener" href="https://wa.me/${esc(sup.replace(/^\+/, ''))}?text=${encodeURIComponent('استفسار عن الطلب #' + o.id.slice(0, 8).toUpperCase())}">${icon('support')} تواصل مع الدعم بخصوص الطلب</a>` : ''}`;
}

// 12. الإشعارات
async function notificationsPage() {
  if (!S.user) return needLogin('notifications');
  setTop('inner', 'الإشعارات');
  view.innerHTML = `<div class="sk" style="height:84px"></div><div class="sk" style="height:84px;margin-top:10px"></div>`;
  let r;
  try { r = await api('/api/notifications'); } catch (e) { view.innerHTML = errorState(e.message); return; }
  if (S.me) { S.me.unread = 0; updateChrome(); }
  if (!r.notifications.length) { view.innerHTML = emptyState('bell', 'لا توجد إشعارات', 'ستظهر هنا تحديثات طلباتك وعروضنا'); return; }
  const ic = { order: 'receipt', deposit: 'wallet', admin: 'sparkle', info: 'bell' };
  view.innerHTML = r.notifications.map((n) => {
    const inner = `<span class="n-ico">${icon(ic[n.type] || 'bell')}</span><div style="min-width:0"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${timeAgo(n.createdAt)}</small></div>`;
    return n.type === 'order' && n.ref ? `<a class="n-card ${n.unread ? 'unread' : ''}" style="color:inherit" href="#/order/${encodeURIComponent(n.ref)}">${inner}</a>` : `<div class="n-card ${n.unread ? 'unread' : ''}">${inner}</div>`;
  }).join('');
}

// 15. الصيانة
function maintenancePage() {
  document.body.classList.add('bare');
  const s = S.cfg.settings;
  const so = s.social || {};
  const links = [['facebook', so.facebook], ['instagram', so.instagram], ['telegram', so.telegram], ['tiktok', so.tiktok], ['whatsapp', so.whatsapp]].filter(([, u]) => u && /^https:\/\//.test(u));
  const until = Date.parse(s.maintenanceUntil || '');
  view.innerHTML = `<section class="state-page"><div class="cone">${icon('cone', 'cone')}</div><h1>الصيانة جارية</h1><p>${esc(s.maintenanceMsg)}</p>
    ${until > Date.now() ? `<div class="countdown"><div><b id="cd-h">00</b><small>ساعة</small></div><div><b id="cd-m">00</b><small>دقيقة</small></div><div><b id="cd-s">00</b><small>ثانية</small></div></div>` : ''}
    ${links.length ? `<p class="muted" style="font-size:13px;margin-top:10px">تابعنا على وسائل التواصل</p><div class="socials">${links.map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${k}">${icon(k)}</a>`).join('')}</div>` : ''}
    <div style="margin-top:20px">${brand()}</div></section>`;
  if (until > Date.now()) {
    const tick = () => {
      const d = Math.max(0, until - Date.now());
      const h = Math.floor(d / 3.6e6), m = Math.floor((d % 3.6e6) / 6e4), sec = Math.floor((d % 6e4) / 1000);
      const p = (n) => String(n).padStart(2, '0');
      if ($('#cd-h')) { $('#cd-h').textContent = p(h); $('#cd-m').textContent = p(m); $('#cd-s').textContent = p(sec); }
      if (d === 0) { S.cfg = null; setTimeout(render, 3000); }
    };
    tick();
    S.timers.push(setInterval(tick, 1000));
  }
}

// 14. صفحة غير موجودة
function notFound() {
  document.body.classList.add('bare');
  view.innerHTML = `<section class="state-page"><div class="big-404 num">404</div><h1>الصفحة غير موجودة</h1><p>عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
    <a class="btn btn-primary" href="#/home" style="margin-top:10px">${icon('home')} العودة للرئيسية</a></section>`;
}

/* ================= Router ================= */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const i = h.indexOf('?');
  return { path: decodeURIComponent(i < 0 ? h : h.slice(0, i)), q: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
}
const ROUTES = [
  [/^$/, () => (!S.user && !store.get('gl_seen') ? welcome() : home())],
  [/^welcome$/, welcome], [/^home$/, home], [/^login$/, (m, q) => loginPage(q)], [/^signup$/, (m, q) => signupPage(q)], [/^forgot$/, forgotPage],
  [/^categories$/, categoriesPage], [/^category\/([\w-]+)$/, (m) => categoryPage(m[1])], [/^service\/([\w-]+)$/, (m) => servicePage(m[1])],
  [/^search$/, (m, q) => searchPage(q)], [/^offers$/, offersPage], [/^favorites$/, favoritesPage], [/^cart$/, cartPage],
  [/^wallet$/, walletPage], [/^deposit\/(\w+)$/, (m) => depositPage(m[1])], [/^deposits$/, depositsPage],
  [/^account$/, accountPage], [/^profile$/, profilePage], [/^password$/, passwordPage],
  [/^orders$/, (m, q) => ordersPage(q)], [/^order\/([\w-]+)$/, (m) => orderPage(m[1])], [/^notifications$/, notificationsPage],
];
S.navCount = 0;
async function render() {
  if (!S.authReady) return;
  S.navCount++;
  S.timers.forEach(clearInterval); S.timers = [];
  S.actions = {};
  closeSheet(); closeDrawer();
  document.body.classList.remove('bare');
  const { path, q } = parseHash();
  try { await loadConfig(); } catch {}
  if (S.cfg?.settings?.maintenance && !S.me?.admin) { maintenancePage(); return; }
  const r = ROUTES.find(([re]) => re.test(path));
  updateChrome();
  window.scrollTo(0, 0);
  if (!r) return notFound();
  try { await r[1](path.match(r[0]), q); }
  catch (e) { console.error(e); view.innerHTML = errorState(e.message); }
  updateChrome();
}
window.addEventListener('hashchange', render);

/* ================= Boot ================= */
onAuthStateChanged(auth, async (u) => {
  const changed = (S.user?.uid || null) !== (u?.uid || null);
  S.user = u;
  if (u) await loadMe(); else S.me = null;
  if (!S.authReady) { S.authReady = true; $('#boot')?.remove(); render(); }
  else if (changed) render();
});
