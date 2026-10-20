import {
  auth, api, esc, $, $$, imgTag, imgUrl, fmt, money, timeAgo, fmtDate, store, toast, sheet, closeSheet,
  confirmSheet, busy, copyText, captcha, loginWith, logout, onAuthStateChanged, enablePush, compressImage,
} from './core.js';
import { icon, brand } from './icons.js';

const A = { user: null, cfg: null, tab: 'dash', actions: {}, timers: [], cat: null, stats: null, cap: null };
const root = $('#root');
const PAGES = [
  ['dash', 'chart', 'الإحصائيات'], ['orders', 'receipt', 'الطلبات'], ['deposits', 'wallet', 'الإيداعات'],
  ['categories', 'grid', 'الأقسام'], ['services', 'box', 'الخدمات والأكواد'], ['users', 'users', 'المستخدمين'],
  ['notify', 'bell', 'الإشعارات'], ['settings', 'settings', 'الإعدادات'],
];
const ST = {
  completed: '<span class="badge badge-ok">مكتمل</span>', approved: '<span class="badge badge-ok">مقبول</span>',
  pending: '<span class="badge badge-warn">معلّق</span>', rejected: '<span class="badge badge-bad">مرفوض</span>',
};

/* ---------- Events ---------- */
document.addEventListener('click', (e) => {
  const cp = e.target.closest('[data-copy]');
  if (cp) { e.preventDefault(); copyText(cp.dataset.copy); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const fn = A.actions[a.dataset.act];
  if (fn) { e.preventDefault(); fn(a, e); }
});

/* ---------- Login (13) ---------- */
function loginScreen(msg = '') {
  root.innerHTML = `<div class="login-wrap"><form class="login-card" id="f" novalidate>
    <div style="display:flex;justify-content:center">${brand('ADMIN')}</div><h1>دخول الإدارة</h1><p>أدخل بيانات حساب الإدارة</p>
    ${msg ? `<div class="announce" style="color:var(--bad);border-color:rgba(229,130,111,.3)">${icon('alert')}<span>${esc(msg)}</span></div>` : ''}
    <div class="field"><label>البريد الإلكتروني</label><div class="input-wrap">${icon('mail')}<input class="input has-ico ltr" name="email" type="email" autocomplete="username" placeholder="admin@example.com" required maxlength="100"></div></div>
    <div class="field"><label>كلمة المرور</label><div class="input-wrap">${icon('lock')}<input class="input has-ico" name="pw" type="password" autocomplete="current-password" required maxlength="64"></div></div>
    <div id="cap" class="captcha"></div>
    <button class="btn btn-primary btn-block" type="submit">دخول</button>
    <p class="warn-note">الدخول مخصص للإدارة فقط</p></form></div>`;
  const f = $('#f');
  api('/api/config').then((c) => { A.cfg = c; return captcha($('#cap'), c.turnstileSiteKey); }).then((c) => { A.cap = c; }).catch(() => {});
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        if (!A.cap) { A.cfg = A.cfg || await api('/api/config'); A.cap = await captcha($('#cap'), A.cfg.turnstileSiteKey); }
        await loginWith(f.email.value.trim(), f.pw.value, await A.cap.get(), { admin: true, remember: false });
      } catch (err) { toast(err.message, 'bad', 4500); A.cap?.reset(); }
    });
  });
}

/* ---------- Shell ---------- */
function shell() {
  root.innerHTML = `<div class="adm"><aside class="adm-side" id="side">
      <div style="display:flex;justify-content:space-between;align-items:center">${brand('ADMIN')}</div>
      <nav class="nav" id="nav">${PAGES.map(([k, ic, t]) => `<button data-act="tab" data-k="${k}" class="${A.tab === k ? 'active' : ''}">${icon(ic)}<span>${t}</span><i class="nb hidden" data-nb="${k}"></i></button>`).join('')}</nav>
      <div class="side-user"><b>${icon('shield', 'ico-sm')} مدير النظام</b><span>${esc(A.user.email || A.user.uid)}</span>
        <button class="btn btn-soft btn-sm" data-act="theme">${icon(document.documentElement.getAttribute('data-theme') === 'light' ? 'moon' : 'sun', 'ico-sm')} تبديل الوضع</button>
        <button class="btn btn-soft btn-sm" data-act="push">${icon('bell', 'ico-sm')} إشعارات الطلبات</button>
        <a class="btn btn-soft btn-sm" href="./" target="_blank" rel="noopener">${icon('home', 'ico-sm')} فتح المتجر</a>
        <button class="btn btn-danger btn-sm" data-act="logout">${icon('logout', 'ico-sm')} تسجيل الخروج</button></div>
    </aside><main class="adm-main" id="main"></main></div>`;
  A.actions.tab = (b) => { A.tab = b.dataset.k; store.set('gl_adm_tab', A.tab); closeSide(); renderTab(); };
  A.actions.theme = () => {
    const light = document.documentElement.getAttribute('data-theme') !== 'light';
    if (light) document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('gl_theme', light ? 'light' : 'dark'); } catch {}
  };
  A.actions.logout = async () => { if (await confirmSheet({ title: 'تسجيل الخروج؟', ok: 'خروج', danger: true })) { await logout(); } };
  A.actions.push = async (b) => busy(b, async () => {
    try { A.cfg = A.cfg || await api('/api/config'); await enablePush(A.cfg.vapidKey, { admin: true }); toast('ستصلك إشعارات الطلبات والإيداعات الجديدة', 'ok', 4000); }
    catch (e) { toast(e.message, 'bad', 4500); }
  });
  A.actions.menu = () => { $('#side').classList.add('open'); const ov = document.createElement('div'); ov.className = 'side-ov'; ov.id = 'side-ov'; ov.onclick = closeSide; document.body.appendChild(ov); };
  renderTab();
  refreshBadges();
  A.badgeTimer = setInterval(refreshBadges, 60000);
}
function closeSide() { $('#side')?.classList.remove('open'); $('#side-ov')?.remove(); }
async function refreshBadges() {
  try {
    const s = await api('/api/admin/stats');
    A.stats = s;
    const set = (k, n) => { const el = $(`[data-nb="${k}"]`); if (el) { el.textContent = n; el.classList.toggle('hidden', !n); } };
    set('orders', s.kpi.pendingOrders); set('deposits', s.kpi.pendingDeposits);
  } catch {}
}
function top(title, tools = '') {
  return `<div class="adm-top"><button class="btn-icon menu-btn" data-act="menu" aria-label="القائمة">${icon('menu')}</button><h1>${esc(title)}</h1><div class="tools">${tools}</div></div>`;
}
function renderTab() {
  A.timers.forEach(clearInterval); A.timers = [];
  const keep = { tab: A.actions.tab, logout: A.actions.logout, push: A.actions.push, menu: A.actions.menu, theme: A.actions.theme };
  A.actions = keep;
  $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.k === A.tab));
  const fn = { dash, orders, deposits, categories, services, users, notify, settings }[A.tab] || dash;
  window.scrollTo(0, 0);
  fn().catch((e) => { $('#main').innerHTML = top('خطأ') + `<div class="empty"><div class="ico-wrap">${icon('alert', 'ico-lg')}</div><b>تعذّر التحميل</b><span>${esc(e.message)}</span><button class="btn btn-ghost btn-sm" data-act="re">إعادة المحاولة</button></div>`; A.actions.re = renderTab; });
}
const loading = (t) => { $('#main').innerHTML = top(t) + '<div class="kpis">' + '<div class="sk" style="height:110px"></div>'.repeat(4) + '</div><div class="sk" style="height:260px;margin-top:14px"></div>'; };

/* ---------- Charts (SVG) ---------- */
function barChart(days, key, { h = 190 } = {}) {
  const w = 640, pad = 26, n = days.length;
  const max = Math.max(1, ...days.map((d) => d[key]));
  const bw = (w - pad) / n;
  const bars = days.map((d, i) => {
    const bh = Math.max(d[key] ? 3 : 0, (d[key] / max) * (h - 30));
    const x = w - (i + 1) * bw;
    return `<rect x="${x + bw * 0.2}" y="${h - 18 - bh}" width="${bw * 0.6}" height="${bh}" rx="2" fill="#D4B895"><title>${d.day}: ${fmt(d[key])}</title></rect>`;
  }).join('');
  const labels = days.map((d, i) => (i % 5 === 4 || i === n - 1 ? `<text x="${w - (i + 0.5) * bw}" y="${h - 3}" text-anchor="middle">${d.day.slice(5).replace('-', '/')}</text>` : '')).join('');
  const grid = [0.25, 0.5, 0.75, 1].map((p) => `<line x1="0" x2="${w}" y1="${h - 18 - p * (h - 30)}" y2="${h - 18 - p * (h - 30)}" stroke="rgba(232,213,183,.07)"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${grid}${bars}${labels}<text x="${w}" y="10" text-anchor="end">${fmt(max)}</text></svg>`;
}
function lineChart(days, key, { h = 150 } = {}) {
  const w = 640, n = days.length;
  const max = Math.max(1, ...days.map((d) => d[key]));
  const pts = days.map((d, i) => [w - (i / (n - 1)) * w, h - 16 - (d[key] / max) * (h - 30)]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(201,160,108,.35)"/><stop offset="1" stop-color="rgba(201,160,108,0)"/></linearGradient></defs>
    <path d="${path} L0,${h - 16} L${w},${h - 16} Z" fill="url(#lg)"/><path d="${path}" fill="none" stroke="#D9B988" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#E8D2AD"><title>${days[i].day}: ${days[i][key]}</title></circle>`).join('')}<text x="${w}" y="10" text-anchor="end">${max}</text></svg>`;
}
function hbars(rows, valKey, labelKey, fmtV = (v) => fmt(v)) {
  const max = Math.max(1, ...rows.map((r) => r[valKey]));
  return `<div class="hbar">${rows.map((r) => `<div class="r"><div><span>${esc(r[labelKey])}</span><b class="num">${fmtV(r[valKey], r)}</b></div><div class="track"><div class="fill" style="width:${Math.max(3, (r[valKey] / max) * 100)}%"></div></div></div>`).join('') || '<span class="muted">لا توجد بيانات بعد</span>'}</div>`;
}

/* ---------- Dashboard (clean tables) ---------- */
async function dash() {
  loading('الإحصائيات');
  const s = await api('/api/admin/stats');
  A.stats = s;
  const k = s.kpi;
  const m = (v) => `<span class="num">${fmt(v)}</span> د.ل`;
  const n = (v) => `<span class="num">${v}</span>`;
  const rows = [
    ['مبيعات اليوم', m(k.revenueToday)], ['مبيعات آخر 7 أيام', m(k.revenue7)], ['مبيعات آخر 30 يوم', m(k.revenue30)], ['إجمالي المبيعات', m(k.revenueAll)],
    [`<a href="#" data-act="go" data-k="orders">طلبات معلّقة</a>`, k.pendingOrders ? `<b style="color:var(--warn)">${n(k.pendingOrders)}</b>` : n(0)],
    [`<a href="#" data-act="go" data-k="deposits">إيداعات معلّقة</a>`, k.pendingDeposits ? `<b style="color:var(--warn)">${n(k.pendingDeposits)}</b>` : n(0)],
    ['عدد المستخدمين', n(k.users)], ['مجموع أرصدة العملاء', m(k.balances)], ['إيداعات مقبولة (30 يوم)', m(k.deposits30)],
    ['طلبات مكتملة (الكل)', n(k.ordersCompletedAll)], ['طلبات تسليم تلقائي (30 يوم)', n(k.autoOrders30)], ['أكواد متاحة في المخزون', n(k.stockAvailable)],
  ];
  const last7 = s.days.slice(-7).reverse();
  $('#main').innerHTML = top('الإحصائيات', `<button class="btn btn-soft btn-sm" data-act="re">${icon('refresh', 'ico-sm')} تحديث</button>`) + `
    <div class="panels two">
      <div class="panel"><h3>ملخص</h3><table class="tbl kv2"><tbody>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel"><h3>آخر 7 أيام</h3><table class="tbl"><thead><tr><th>اليوم</th><th>الطلبات</th><th>المبيعات</th><th>الإيداعات</th></tr></thead><tbody>
        ${last7.map((d) => `<tr><td class="num">${d.day.slice(5).replace('-', '/')}</td><td class="num">${d.orders}</td><td class="num">${fmt(d.revenue)}</td><td class="num">${fmt(d.deposits)}</td></tr>`).join('')}</tbody></table></div>
    </div>
    <div class="panel" style="margin-top:14px"><h3>المبيعات اليومية <small>آخر 30 يوم — د.ل</small></h3>${barChart(s.days, 'revenue')}</div>
    <div class="panels two">
      <div class="panel"><h3>الأكثر مبيعاً <small>30 يوم</small></h3>${s.top.length ? `<table class="tbl"><thead><tr><th>الخدمة</th><th>العدد</th><th>المبيعات</th></tr></thead><tbody>${s.top.map((t) => `<tr><td>${esc(t.title)}</td><td class="num">${t.count}</td><td class="num">${fmt(t.revenue)}</td></tr>`).join('')}</tbody></table>` : '<span class="muted">لا توجد بيانات بعد</span>'}</div>
      <div class="panel"><h3>الإيداعات حسب الطريقة <small>30 يوم</small></h3>${s.methods.length ? `<table class="tbl"><thead><tr><th>الطريقة</th><th>المبلغ</th></tr></thead><tbody>${s.methods.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${fmt(x.value)}</td></tr>`).join('')}</tbody></table>` : '<span class="muted">لا توجد بيانات بعد</span>'}</div>
    </div>
    ${s.warnings && s.warnings.length ? `<div class="panel" style="margin-top:14px;border-color:rgba(217,122,108,.4)"><h3 style="color:var(--bad)">أجزاء لم تُحسب</h3>${s.warnings.map((w) => `<code style="display:block;direction:ltr;text-align:left;overflow-wrap:anywhere;font-size:11.5px;margin-top:6px">${esc(w)}</code>`).join('')}</div>` : ''}
    <p class="muted" style="font-size:12px;margin-top:12px">آخر تحديث: ${fmtDate(new Date(s.at).toISOString(), true)}</p>`;
  A.actions.re = renderTab;
  A.actions.go = (b) => { A.tab = b.dataset.k; renderTab(); };
}

/* ---------- Orders ---------- */
async function orders() {
  A.ordStatus = A.ordStatus || 'pending';
  $('#main').innerHTML = top('الطلبات', `<button class="btn btn-soft btn-sm" data-act="re">${icon('refresh', 'ico-sm')}</button>`) + `<div class="filters" id="flt"></div><div class="items" id="list"><div class="sk" style="height:150px"></div><div class="sk" style="height:150px"></div></div>`;
  const r = await api('/api/admin/orders?status=' + A.ordStatus);
  let q = '';
  const sel = new Set();
  const draw = () => {
    $('#flt').innerHTML = [['pending', 'معلّقة'], ['completed', 'مكتملة'], ['rejected', 'مرفوضة'], ['all', 'الكل']].map(([k2, t]) => `<button class="chip ${A.ordStatus === k2 ? 'active' : ''}" data-act="st" data-k="${k2}">${t}</button>`).join('') +
      `<input class="input" id="q" placeholder="بحث: اسم، خدمة، بيانات..." value="${esc(q)}">`;
    const t = q.toLowerCase();
    const list = r.orders.filter((o) => !t || [o.title, o.userName, o.userEmail, o.input, o.id, o.contactPhone].some((v) => String(v || '').toLowerCase().includes(t)));
    $('#list').innerHTML = list.length ? list.map((o) => `<div class="item ${o.status === 'pending' ? 'pending' : ''}">
      <div class="item-top">${o.status !== 'pending' ? `<label class="check"><input type="checkbox" data-sel="${esc(o.id)}" ${sel.has(o.id) ? 'checked' : ''}></label>` : ''}<span class="th">${imgTag(o.image, o.title)}</span>
        <div class="tt"><b>${esc(o.title)}</b><small>${esc(o.userName || '—')} • ${esc(o.userEmail || '')}</small><small><span class="num">#${esc(o.id.slice(0, 8).toUpperCase())}</span> • ${timeAgo(o.createdAt)} • ${o.delivery === 'auto' ? 'تلقائي' : 'يدوي'}</small></div>
        <div class="amt"><b>${money(o.total)}</b>${ST[o.status] || ''}</div></div>
      <div class="item-data"><span class="lbl">البيانات:</span><code>${esc(o.input || '—')}</code>${o.input ? `<button class="btn btn-soft btn-xs" data-copy="${esc(o.input)}">${icon('copy', 'ico-sm')}</button>` : ''}</div>
      ${o.contactPhone ? `<div class="item-data"><span class="lbl">التواصل:</span><code>${esc(o.contactPhone)}</code><a class="btn btn-soft btn-xs" target="_blank" rel="noopener" href="https://wa.me/${esc(o.contactPhone.replace(/\D/g, '').replace(/^0/, '218'))}">${icon('whatsapp', 'ico-sm')}</a></div>` : ''}
      <div class="item-act">${o.status === 'pending' ? `<button class="btn btn-ok btn-sm" data-act="done" data-id="${esc(o.id)}">${icon('check', 'ico-sm')} تنفيذ</button><button class="btn btn-danger btn-sm" data-act="rej" data-id="${esc(o.id)}">${icon('x', 'ico-sm')} رفض وإرجاع</button>` : ''}
        <button class="btn btn-soft btn-sm" data-act="view" data-id="${esc(o.id)}">${icon('info', 'ico-sm')} التفاصيل</button></div></div>`).join('')
      : `<div class="empty"><div class="ico-wrap">${icon('receipt', 'ico-lg')}</div><b>لا توجد طلبات</b></div>`;
    $('#list').insertAdjacentHTML('beforeend', sel.size ? `<div class="sel-bar"><span>${sel.size} محدد</span><button class="btn btn-danger btn-sm" data-act="delSel">${icon('trash', 'ico-sm')} حذف المحدد</button></div>` : '');
    const qi = $('#q'); qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; draw(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
    $$('[data-sel]').forEach((c) => { c.onchange = () => { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); draw(); }; });
  };
  A.actions.re = renderTab;
  A.actions.st = (b) => { A.ordStatus = b.dataset.k; renderTab(); };
  A.actions.done = async (b) => {
    const o = r.orders.find((x) => x.id === b.dataset.id);
    const v = await confirmSheet({
      title: 'تنفيذ الطلب', text: `${esc(o.title)} — ${money(o.total)}<br><span class="muted">البيانات: ${esc(o.input)}</span>`, ok: 'تأكيد التنفيذ',
      inputs: `<div class="form-grid"><div class="field"><label>كود / بيانات التسليم (اختياري — تظهر للعميل مشفّرة)</label><textarea class="textarea" data-in="delivery" maxlength="2000" placeholder="مثال: XXXX-XXXX-XXXX"></textarea></div>
        <div class="field"><label>ملاحظة للعميل (اختياري)</label><input class="input" data-in="note" maxlength="300" placeholder="تم الشحن بنجاح"></div></div>`,
    });
    if (!v) return;
    try { await api(`/api/admin/orders/${encodeURIComponent(o.id)}/complete`, { method: 'POST', body: v }); toast('تم تنفيذ الطلب وإشعار العميل', 'ok'); renderTab(); refreshBadges(); } catch (e) { toast(e.message, 'bad'); }
  };
  A.actions.rej = async (b) => {
    const o = r.orders.find((x) => x.id === b.dataset.id);
    const v = await confirmSheet({ title: 'رفض الطلب وإرجاع المبلغ', text: `سيتم إرجاع ${money(o.total)} لمحفظة العميل`, ok: 'رفض وإرجاع', danger: true, inputs: `<div class="field"><label>سبب الرفض (يظهر للعميل)</label><input class="input" data-in="reason" maxlength="300" placeholder="مثال: الـ ID غير صحيح"></div>` });
    if (!v) return;
    try { await api(`/api/admin/orders/${encodeURIComponent(o.id)}/reject`, { method: 'POST', body: v }); toast('تم الرفض وإرجاع المبلغ', 'ok'); renderTab(); refreshBadges(); } catch (e) { toast(e.message, 'bad'); }
  };
  A.actions.view = async (b) => {
    try {
      const o = await api('/api/admin/orders/' + encodeURIComponent(b.dataset.id));
      sheet(`<h3>تفاصيل الطلب</h3><div class="tbl-mini" style="margin-top:12px">
        ${[['رقم الطلب', o.id], ['الخدمة', o.title], ['العميل', `${o.userName} — ${o.userEmail}`], ['البيانات', o.input], ['الكمية', o.quantity], ['المبلغ', fmt(o.total) + ' د.ل'], ['الحالة', o.status], ['التسليم', o.delivery === 'auto' ? 'تلقائي' : 'يدوي'], ['التاريخ', fmtDate(o.createdAt, true)], ['التواصل', o.contactPhone], ['ملاحظة', o.note], ['سبب الرفض', o.reason]].filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([k2, v]) => `<div><span class="muted">${k2}</span><span>${esc(v)}</span></div>`).join('')}</div>
        ${o.codes.length ? `<h3 style="margin-top:16px">الأكواد المسلّمة</h3><div class="code-list">${o.codes.map((c) => `<div><code>${esc(c)}</code><button class="btn btn-soft btn-xs" data-copy="${esc(c)}">${icon('copy', 'ico-sm')}</button></div>`).join('')}</div>` : ''}
        <button class="btn btn-soft btn-block" style="margin-top:16px" data-act="closeS">إغلاق</button>`, { center: true });
      A.actions.closeS = closeSheet;
    } catch (e) { toast(e.message, 'bad'); }
  };
  A.actions.delSel = async () => {
    if (!(await confirmSheet({ title: `حذف ${sel.size} طلب؟`, text: 'لا يمكن التراجع (الطلبات المعلّقة لا تُحذف)', ok: 'حذف', danger: true }))) return;
    try { const x = await api('/api/admin/orders-delete', { method: 'POST', body: { ids: [...sel] } }); toast(`تم حذف ${x.deleted} طلب`, 'ok'); renderTab(); } catch (e) { toast(e.message, 'bad'); }
  };
  draw();
}

/* ---------- Deposits ---------- */
async function deposits() {
  A.depStatus = A.depStatus || 'pending';
  $('#main').innerHTML = top('الإيداعات', `<button class="btn btn-soft btn-sm" data-act="re">${icon('refresh', 'ico-sm')}</button>`) + `<div class="filters" id="flt"></div><div class="items" id="list"><div class="sk" style="height:140px"></div></div>`;
  const r = await api('/api/admin/deposits?status=' + A.depStatus);
  $('#flt').innerHTML = [['pending', 'معلّقة'], ['approved', 'مقبولة'], ['rejected', 'مرفوضة'], ['all', 'الكل']].map(([k, t]) => `<button class="chip ${A.depStatus === k ? 'active' : ''}" data-act="st" data-k="${k}">${t}</button>`).join('');
  $('#list').innerHTML = r.deposits.length ? r.deposits.map((d) => `<div class="item ${d.status === 'pending' ? 'pending' : ''}">
    <div class="item-top"><span class="th"><span class="img-ph">${icon(d.method === 'crypto' ? 'crypto' : d.method === 'cards' ? 'card' : d.method === 'onepay' || d.method === 'lypay' ? 'bank' : 'sim')}</span></span>
      <div class="tt"><b>${esc(d.provider || d.method)}</b><small>${esc(d.userName || '—')} • ${esc(d.userEmail || '')}</small><small>${timeAgo(d.createdAt)}${d.userPhone ? ` • <span class="num">${esc(d.userPhone)}</span>` : ''}</small></div>
      <div class="amt"><b>${money(d.approvedAmount ?? d.amount)}</b>${ST[d.status] || ''}${d.crypto ? `<small class="muted num">${fmt(d.crypto)} USDT</small>` : ''}</div></div>
    <div class="item-data"><span class="lbl">${d.method === 'cards' ? 'الكرت:' : d.method === 'crypto' ? 'المعرّف:' : d.senderName ? 'المحوّل:' : 'من رقم:'}</span><code id="ref-${esc(d.id)}">${esc(d.senderName || d.ref || '—')}</code>
      ${d.hasSecret ? `<button class="btn btn-soft btn-xs" data-act="reveal" data-id="${esc(d.id)}">${icon('eye', 'ico-sm')} إظهار</button>` : d.ref ? `<button class="btn btn-soft btn-xs" data-copy="${esc(d.senderName || d.ref)}">${icon('copy', 'ico-sm')}</button>` : ''}</div>
    ${d.reason ? `<small class="muted">سبب الرفض: ${esc(d.reason)}</small>` : ''}
    ${d.status === 'pending' ? `<div class="item-act"><button class="btn btn-ok btn-sm" data-act="ok" data-id="${esc(d.id)}">${icon('check', 'ico-sm')} قبول وإضافة الرصيد</button><button class="btn btn-danger btn-sm" data-act="no" data-id="${esc(d.id)}">${icon('x', 'ico-sm')} رفض</button></div>` : ''}</div>`).join('')
    : `<div class="empty"><div class="ico-wrap">${icon('wallet', 'ico-lg')}</div><b>لا توجد إيداعات</b></div>`;
  A.actions.re = renderTab;
  A.actions.st = (b) => { A.depStatus = b.dataset.k; renderTab(); };
  A.actions.reveal = async (b) => busy(b, async () => {
    try { const x = await api(`/api/admin/deposits/${encodeURIComponent(b.dataset.id)}/secret`); $(`#ref-${CSS.escape(b.dataset.id)}`).textContent = x.code; b.outerHTML = `<button class="btn btn-soft btn-xs" data-copy="${esc(x.code)}">${icon('copy', 'ico-sm')}</button>`; } catch (e) { toast(e.message, 'bad'); }
  });
  A.actions.ok = async (b) => {
    const d = r.deposits.find((x) => x.id === b.dataset.id);
    const v = await confirmSheet({ title: 'قبول الإيداع', text: `${esc(d.userName)} — ${esc(d.provider)}`, ok: 'قبول وإضافة',
      inputs: `<div class="field"><label>المبلغ المضاف للمحفظة (د.ل) — عدّله لو المبلغ المستلم مختلف</label><input class="input ltr" type="number" step="0.01" min="0.01" data-in="amount" value="${d.amount}"></div>` });
    if (!v) return;
    try { await api(`/api/admin/deposits/${encodeURIComponent(d.id)}/approve`, { method: 'POST', body: { amount: v.amount } }); toast('تمت إضافة الرصيد وإشعار العميل', 'ok'); renderTab(); refreshBadges(); } catch (e) { toast(e.message, 'bad'); }
  };
  A.actions.no = async (b) => {
    const v = await confirmSheet({ title: 'رفض الإيداع', ok: 'رفض', danger: true, inputs: `<div class="field"><label>سبب الرفض (يظهر للعميل)</label><input class="input" data-in="reason" maxlength="300" placeholder="مثال: لم يصل التحويل"></div>` });
    if (!v) return;
    try { await api(`/api/admin/deposits/${encodeURIComponent(b.dataset.id)}/reject`, { method: 'POST', body: v }); toast('تم رفض الإيداع', 'ok'); renderTab(); refreshBadges(); } catch (e) { toast(e.message, 'bad'); }
  };
}

/* ---------- Image uploader ---------- */
function uploader(name, value = '') {
  return `<div class="uploader" data-up="${name}"><div class="pv">${imgTag(value)}</div><div class="ub">
    <input class="input ltr" data-in="${name}" value="${esc(value)}" placeholder="https://... أو ارفع صورة" maxlength="600">
    <div style="display:flex;gap:8px"><label class="btn btn-soft btn-sm" style="flex:1">${icon('upload', 'ico-sm')} رفع صورة<input type="file" accept="image/*" hidden data-file="${name}"></label></div></div></div>`;
}
function bindUploaders(box) {
  $$('[data-file]', box).forEach((inp) => {
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      const wrap = inp.closest('[data-up]');
      const lbl = inp.closest('label');
      const html = lbl.innerHTML;
      lbl.firstChild && (lbl.style.pointerEvents = 'none');
      lbl.insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
      try {
        const dataUrl = await compressImage(f);
        const { url } = await api('/api/admin/upload', { method: 'POST', body: { dataUrl }, timeout: 60000 });
        $(`[data-in="${wrap.dataset.up}"]`, wrap).value = url;
        $('.pv', wrap).innerHTML = imgTag(url);
        toast('تم رفع الصورة', 'ok', 1500);
      } catch (e) { toast(e.message, 'bad'); }
      lbl.querySelector('.spinner')?.remove(); lbl.style.pointerEvents = ''; inp.value = '';
      void html;
    });
  });
  $$('[data-up] input[data-in]', box).forEach((i) => i.addEventListener('change', () => { $('.pv', i.closest('[data-up]')).innerHTML = imgTag(i.value.trim()); }));
}
function formSheet(html, onSave, { wide = false } = {}) {
  const sh = sheet(`${html}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px"><button class="btn btn-primary" data-save>${icon('check')} حفظ</button><button class="btn btn-soft" data-cancel>إلغاء</button></div>`, { center: true });
  if (wide) sh.classList.add('wide');
  bindUploaders(sh);
  sh.querySelector('[data-cancel]').onclick = closeSheet;
  sh.querySelector('[data-save]').onclick = (e) => busy(e.currentTarget, async () => {
    const v = {};
    $$('[data-in]', sh).forEach((i) => { v[i.dataset.in] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
    try { await onSave(v, sh); closeSheet(); } catch (err) { toast(err.message, 'bad', 4500); }
  });
  return sh;
}
async function loadCat(force = false) { if (!A.cat || force) A.cat = await api('/api/admin/catalog'); return A.cat; }

/* ---------- Categories ---------- */
async function categories() {
  $('#main').innerHTML = top('الأقسام', `<button class="btn btn-primary btn-sm" data-act="add">${icon('plus', 'ico-sm')} قسم جديد</button>`) + '<div class="grid-cards" id="list"><div class="sk" style="height:200px"></div></div>';
  const c = await loadCat(true);
  const count = (id) => c.services.filter((s) => s.category === id).length;
  $('#list').innerHTML = c.categories.length ? c.categories.map((x) => `<div class="g-card"><div class="gm">${imgTag(x.image, x.name)}${x.hidden ? '<span class="badge badge-bad">مخفي</span>' : ''}</div>
    <div class="gb"><b>${esc(x.name)}</b><small class="muted">${count(x.id)} خدمة • ترتيب ${x.order}</small>
    <div style="display:flex;gap:6px"><button class="btn btn-soft btn-xs" style="flex:1" data-act="edit" data-id="${esc(x.id)}">${icon('edit', 'ico-sm')} تعديل</button><button class="btn btn-danger btn-xs" data-act="del" data-id="${esc(x.id)}" aria-label="حذف">${icon('trash', 'ico-sm')}</button></div></div></div>`).join('')
    : `<div class="empty" style="grid-column:1/-1"><div class="ico-wrap">${icon('grid', 'ico-lg')}</div><b>لا توجد أقسام</b></div>`;
  const form = (x = {}) => formSheet(`<h3>${x.id ? 'تعديل قسم' : 'قسم جديد'}</h3><div class="form-grid" style="margin-top:12px">
    <div class="field"><label>اسم القسم</label><input class="input" data-in="name" maxlength="40" value="${esc(x.name || '')}"></div>
    <div class="field"><label>الصورة</label>${uploader('image', x.image || '')}</div>
    <div class="field"><label>الترتيب (الأصغر أولاً)</label><input class="input ltr" type="number" data-in="order" value="${x.order ?? 0}"></div>
    <label class="toggle-row"><span><b>إخفاء القسم</b><small>لن يظهر في المتجر</small></span><span class="switch"><input type="checkbox" data-in="hidden" ${x.hidden ? 'checked' : ''}></span></label></div>`,
  async (v) => { await api('/api/admin/categories', { method: 'POST', body: { ...v, id: x.id } }); toast('تم الحفظ', 'ok'); categories(); });
  A.actions.add = () => form();
  A.actions.edit = (b) => form(c.categories.find((x) => x.id === b.dataset.id));
  A.actions.del = async (b) => {
    if (!(await confirmSheet({ title: 'حذف القسم؟', text: 'لازم يكون القسم فاضي من الخدمات', ok: 'حذف', danger: true }))) return;
    try { await api('/api/admin/categories/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' }); toast('تم الحذف', 'ok'); categories(); } catch (e) { toast(e.message, 'bad'); }
  };
}

/* ---------- Services + stock ---------- */
async function services() {
  $('#main').innerHTML = top('الخدمات والأكواد', `<button class="btn btn-primary btn-sm" data-act="add">${icon('plus', 'ico-sm')} خدمة جديدة</button>`) + '<div class="filters" id="flt"></div><div class="items" id="list"><div class="sk" style="height:80px"></div></div>';
  const c = await loadCat(true);
  A.svcCat = A.svcCat || '';
  let q = '';
  const catName = (id) => c.categories.find((x) => x.id === id)?.name || '—';
  $('#flt').innerHTML = `<select class="select" id="cs"><option value="">كل الأقسام</option>${c.categories.map((x) => `<option value="${esc(x.id)}" ${A.svcCat === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><input class="input" id="q" placeholder="بحث عن خدمة...">`;
  const draw = () => {
    const t = q.toLowerCase();
    const list = c.services.filter((s) => (!A.svcCat || s.category === A.svcCat) && (!t || s.title.toLowerCase().includes(t)));
    $('#list').innerHTML = list.length ? list.map((s) => `<div class="svc-row"><span class="th">${imgTag(s.image, s.title)}</span>
      <div style="min-width:0"><b>${esc(s.title)}</b><div class="meta"><span class="badge badge-gold">${money(s.finalPrice)}</span>${s.discount ? `<span class="badge badge-bad num">-${s.discount}%</span>` : ''}
        ${s.active ? '' : '<span class="badge badge-bad">معطّلة</span>'}${s.autoDelivery ? `<span class="badge ${s.stockAvailable ? 'badge-ok' : 'badge-bad'}">${icon('bolt', 'ico-sm')} <span class="num">${s.stockAvailable}</span> كود</span>` : ''}${s.enableQuantity ? '<span class="badge badge-info">كمية</span>' : ''}<span class="badge badge-info">${esc(catName(s.category))}</span></div></div>
      <div class="acts">${s.autoDelivery ? `<button class="btn btn-ok btn-xs" data-act="stock" data-id="${esc(s.id)}">${icon('key', 'ico-sm')}</button>` : ''}<button class="btn btn-soft btn-xs" data-act="edit" data-id="${esc(s.id)}">${icon('edit', 'ico-sm')}</button><button class="btn btn-danger btn-xs" data-act="del" data-id="${esc(s.id)}">${icon('trash', 'ico-sm')}</button></div></div>`).join('')
      : `<div class="empty"><div class="ico-wrap">${icon('box', 'ico-lg')}</div><b>لا توجد خدمات</b></div>`;
  };
  $('#cs').onchange = (e) => { A.svcCat = e.target.value; draw(); };
  $('#q').oninput = (e) => { q = e.target.value; draw(); };
  const form = (s = {}) => {
    const sh = formSheet(`<h3>${s.id ? 'تعديل خدمة' : 'خدمة جديدة'}</h3><div class="form-grid cols" style="margin-top:12px">
      <div class="field full"><label>اسم الخدمة</label><input class="input" data-in="title" maxlength="80" value="${esc(s.title || '')}"></div>
      <div class="field"><label>القسم</label><select class="select" data-in="category">${c.categories.map((x) => `<option value="${esc(x.id)}" ${(s.category || A.svcCat) === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field"><label>السعر (د.ل)</label><input class="input ltr" type="number" step="0.001" min="0" data-in="price" value="${s.price ?? ''}"></div>
      <div class="field"><label>الخصم %</label><input class="input ltr" type="number" min="0" max="90" data-in="discount" value="${s.discount ?? 0}"></div>
      <div class="field"><label>شارة (اختياري)</label><input class="input" data-in="badge" maxlength="16" value="${esc(s.badge || '')}" placeholder="جديد / الأفضل"></div>
      <div class="field full"><label>الصورة</label>${uploader('image', s.image || '')}</div>
      <div class="field full"><label>الوصف</label><textarea class="textarea" data-in="description" maxlength="1500">${esc(s.description || '')}</textarea></div>
      <label class="toggle-row full"><span><b>الخدمة مفعّلة</b><small>تظهر في المتجر ومتاحة للشراء</small></span><span class="switch"><input type="checkbox" data-in="status" ${s.id ? (s.active ? 'checked' : '') : 'checked'}></span></label>
      <label class="toggle-row full"><span><b>تسليم تلقائي للأكواد</b><small>يُسلّم كود من المخزون فور الشراء</small></span><span class="switch"><input type="checkbox" data-in="autoDelivery" id="fAuto" ${s.autoDelivery ? 'checked' : ''}></span></label>
      <div class="field"><label>نوع حقل البيانات</label><select class="select" data-in="fieldType">${[['id', 'ID لاعب'], ['phone', 'رقم هاتف'], ['account', 'رابط/اسم حساب'], ['custom', 'حقل مخصص']].map(([k, t]) => `<option value="${k}" ${(s.fieldType || 'id') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>عنوان الحقل (اختياري)</label><input class="input" data-in="fieldCustomLabel" maxlength="60" value="${esc(s.fieldLabel || '')}" placeholder="مثال: ID ببجي"></div>
      <label class="toggle-row full"><span><b>طلب بيانات من العميل</b><small>يُخفى تلقائياً مع التسليم التلقائي</small></span><span class="switch"><input type="checkbox" data-in="fieldEnabled" ${s.id ? (s.fieldEnabled || s.autoDelivery ? 'checked' : '') : 'checked'}></span></label>
      <label class="toggle-row full"><span><b>بيع بالكمية (عداد)</b><small>السعر أعلاه = سعر الحد الأدنى</small></span><span class="switch"><input type="checkbox" data-in="enableQuantity" id="fQty" ${s.enableQuantity ? 'checked' : ''}></span></label>
      <div class="field"><label>أقل كمية</label><input class="input ltr" type="number" min="1" data-in="qtyMin" value="${s.qtyMin ?? 30}"></div>
      <div class="field"><label>أعلى كمية</label><input class="input ltr" type="number" min="1" data-in="qtyMax" value="${s.qtyMax ?? 100}"></div>
      <div class="field"><label>الترتيب</label><input class="input ltr" type="number" data-in="order" value="${s.order ?? 0}"></div></div>`,
    async (v) => {
      if (!v.title) throw new Error('أدخل اسم الخدمة');
      if (!v.category) throw new Error('أنشئ قسماً أولاً');
      await api('/api/admin/services', { method: 'POST', body: { ...v, id: s.id } });
      toast('تم الحفظ', 'ok'); services();
    }, { wide: true });
    const sync = () => { if ($('#fAuto', sh).checked && $('#fQty', sh).checked) $('#fQty', sh).checked = false; };
    $('#fAuto', sh).onchange = sync;
    $('#fQty', sh).onchange = () => { if ($('#fQty', sh).checked) $('#fAuto', sh).checked = false; };
  };
  A.actions.add = () => form();
  A.actions.edit = (b) => form(c.services.find((x) => x.id === b.dataset.id));
  A.actions.del = async (b) => {
    if (!(await confirmSheet({ title: 'حذف الخدمة؟', text: 'لا يمكن التراجع', ok: 'حذف', danger: true }))) return;
    try { await api('/api/admin/services/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' }); toast('تم الحذف', 'ok'); services(); } catch (e) { toast(e.message, 'bad'); }
  };
  A.actions.stock = (b) => stockSheet(c.services.find((x) => x.id === b.dataset.id));
  draw();
}
async function stockSheet(s) {
  const sh = sheet(`<h3>${icon('key', 'ico-sm')} أكواد: ${esc(s.title)}</h3><div id="stk"><div class="sk" style="height:120px;margin-top:12px"></div></div>`, { center: true, onClose: () => services() });
  sh.classList.add('wide');
  const load = async () => {
    const r = await api(`/api/admin/services/${encodeURIComponent(s.id)}/stock`);
    $('#stk', sh).innerHTML = `<div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="kpi"><small>متاحة</small><b class="num" style="color:var(--ok)">${r.available}</b></div><div class="kpi"><small>مباعة</small><b class="num">${r.sold}</b></div></div>
      <div class="field" style="margin-top:14px"><label>إضافة أكواد (كود في كل سطر — الأكواد تُخزّن مشفّرة)</label><textarea class="textarea ltr" id="codes" style="direction:ltr;text-align:left;min-height:130px" placeholder="XXXX-XXXX-XXXX&#10;YYYY-YYYY-YYYY"></textarea></div>
      <button class="btn btn-primary btn-block" style="margin-top:10px" data-act="addCodes">${icon('plus', 'ico-sm')} إضافة الأكواد</button>
      <h3 style="margin-top:18px;font-size:15px">آخر الأكواد</h3><div class="code-list">${r.codes.map((c) => `<div><code>${esc(c.hint)}</code><span>${c.status === 'available' ? '<span class="badge badge-ok">متاح</span>' : `<span class="badge badge-info">مباع ${timeAgo(c.soldAt)}</span>`}</span>
        ${c.status === 'available' ? `<button class="btn btn-danger btn-xs" data-act="delCode" data-id="${esc(c.id)}">${icon('trash', 'ico-sm')}</button>` : ''}</div>`).join('') || '<span class="muted">لا توجد أكواد بعد</span>'}</div>
      <button class="btn btn-soft btn-block" style="margin-top:14px" data-act="closeS">إغلاق</button>`;
  };
  A.actions.closeS = closeSheet;
  A.actions.addCodes = (b) => busy(b, async () => {
    const codes = $('#codes', sh).value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (!codes.length) return toast('أدخل الأكواد', 'bad');
    try {
      let added = 0, dup = 0;
      for (let i = 0; i < codes.length; i += 400) { const x = await api(`/api/admin/services/${encodeURIComponent(s.id)}/stock`, { method: 'POST', body: { codes: codes.slice(i, i + 400) } }); added += x.added; dup += x.duplicates; }
      toast(`أُضيف ${added} كود${dup ? ` — ${dup} مكرر تم تجاهله` : ''}`, 'ok', 4000); await load();
    } catch (e) { toast(e.message, 'bad'); }
  });
  A.actions.delCode = async (b) => {
    try { await api('/api/admin/stock/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' }); toast('تم حذف الكود', 'ok', 1500); await load(); } catch (e) { toast(e.message, 'bad'); }
  };
  try { await load(); } catch (e) { toast(e.message, 'bad'); }
}

/* ---------- Users ---------- */
async function users() {
  $('#main').innerHTML = top('المستخدمين') + `<div class="filters"><input class="input" id="q" placeholder="بحث: اسم، بريد، هاتف..." style="max-width:360px"></div><p class="muted" id="cnt" style="font-size:13px"></p><div class="items" id="list"><div class="sk" style="height:80px"></div></div>`;
  let timer;
  const load = async (q = '') => {
    const r = await api('/api/admin/users?q=' + encodeURIComponent(q));
    $('#cnt').textContent = `إجمالي المستخدمين: ${r.total}${q ? ` — النتائج: ${r.users.length}` : ''}`;
    $('#list').innerHTML = r.users.length ? r.users.map((u) => `<button class="svc-row" style="text-align:right;width:100%" data-act="user" data-id="${esc(u.uid)}"><span class="avatar" style="width:46px;height:46px">${esc((u.name || '?').charAt(0))}</span>
      <div style="min-width:0"><b>${esc(u.name || '—')} ${u.blocked ? '<span class="badge badge-bad">موقوف</span>' : ''}</b><small class="muted" style="direction:ltr;display:block;text-align:right">${esc(u.email)} ${u.phone ? '• ' + esc(u.phone) : ''}</small></div>
      <div class="o-side" style="display:grid;justify-items:end"><b class="gold">${money(u.balance)}</b><small class="muted">${fmtDate(u.createdAt)}</small></div></button>`).join('')
      : `<div class="empty"><div class="ico-wrap">${icon('users', 'ico-lg')}</div><b>لا توجد نتائج</b></div>`;
  };
  $('#q').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => load(e.target.value.trim()).catch((x) => toast(x.message, 'bad')), 350); };
  A.actions.user = (b) => userSheet(b.dataset.id, () => load($('#q')?.value.trim() || ''));
  await load();
}
async function userSheet(uid, onChange) {
  const sh = sheet(`<div id="us"><div class="sk" style="height:200px"></div></div>`, { center: true });
  sh.classList.add('wide');
  const draw = async () => {
    const d = await api('/api/admin/users/' + encodeURIComponent(uid));
    const u = d.user;
    $('#us', sh).innerHTML = `<div style="display:flex;gap:14px;align-items:center"><span class="avatar lg" style="width:64px;height:64px">${esc((u.name || '?').charAt(0))}</span>
      <div style="min-width:0"><h3 style="margin:0">${esc(u.name)} ${u.blocked ? '<span class="badge badge-bad">موقوف</span>' : ''}</h3><small class="muted" style="direction:ltr;display:block;text-align:right">${esc(u.email)}</small><small class="muted num">${esc(u.phone || '—')}</small></div></div>
      <div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:14px"><div class="kpi hl"><small>الرصيد</small><b>${money(u.balance)}</b></div><div class="kpi"><small>إجمالي المشتريات</small><b>${money(d.spent)}</b></div></div>
      <div class="panel" style="margin-top:14px;padding:14px"><h3 style="margin-bottom:10px">تعديل الرصيد</h3><div class="form-grid cols">
        <div class="field"><label>المبلغ (+ للإضافة / - للخصم)</label><input class="input ltr" id="bd" type="number" step="0.01" placeholder="مثال: 10 أو -5"></div>
        <div class="field"><label>السبب</label><input class="input" id="bn" maxlength="200" placeholder="تعويض / تصحيح"></div></div>
        <button class="btn btn-primary btn-block" style="margin-top:10px" data-act="bal">${icon('check', 'ico-sm')} تطبيق</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"><button class="btn ${u.blocked ? 'btn-ok' : 'btn-danger'}" data-act="blk">${u.blocked ? 'إلغاء الإيقاف' : 'إيقاف الحساب'}</button><button class="btn btn-soft" data-act="msg">${icon('bell', 'ico-sm')} إرسال إشعار</button></div>
      <h3 style="margin-top:18px;font-size:15px">آخر الطلبات</h3><div class="tbl-mini">${d.orders.slice(0, 10).map((o) => `<div><span>${esc(o.title)} <small class="muted">${timeAgo(o.createdAt)}</small></span><span>${fmt(o.total)} ${ST[o.status] || ''}</span></div>`).join('') || '<span class="muted">لا توجد</span>'}</div>
      <h3 style="margin-top:16px;font-size:15px">حركة المحفظة</h3><div class="tbl-mini">${d.logs.slice(0, 12).map((l) => `<div><span>${{ order: 'شراء', deposit: 'إيداع', refund: 'استرجاع', admin: 'تعديل إداري' }[l.reason] || esc(l.reason)} ${l.note ? `<small class="muted">${esc(l.note)}</small>` : ''} <small class="muted">${timeAgo(l.createdAt)}</small></span><b class="num" style="color:${l.delta >= 0 ? 'var(--ok)' : 'var(--bad)'}">${l.delta >= 0 ? '+' : ''}${fmt(l.delta)}</b></div>`).join('') || '<span class="muted">لا توجد حركة مسجّلة</span>'}</div>
      <button class="btn btn-soft btn-block" style="margin-top:16px" data-act="closeS">إغلاق</button>`;
    A.actions.closeS = closeSheet;
    A.actions.bal = (b) => busy(b, async () => {
      const delta = Number($('#bd', sh).value);
      if (!delta) return toast('أدخل المبلغ', 'bad');
      if (!(await confirmSheet({ title: delta > 0 ? 'إضافة رصيد' : 'خصم رصيد', text: `${delta > 0 ? '+' : ''}${fmt(delta)} د.ل لـ ${esc(u.name)}`, ok: 'تأكيد' }))) { userSheet(uid, onChange); return; }
      try { await api(`/api/admin/users/${encodeURIComponent(uid)}/balance`, { method: 'POST', body: { delta, note: $('#bn', sh)?.value || '' } }); toast('تم تعديل الرصيد', 'ok'); } catch (e) { toast(e.message, 'bad'); }
      userSheet(uid, onChange); onChange?.();
    });
    A.actions.blk = async () => {
      const v = await confirmSheet({ title: u.blocked ? 'إلغاء إيقاف الحساب؟' : 'إيقاف الحساب؟', text: u.blocked ? '' : 'لن يتمكن من الدخول أو الشراء', ok: 'تأكيد', danger: !u.blocked });
      if (v) { try { await api(`/api/admin/users/${encodeURIComponent(uid)}/block`, { method: 'POST', body: { blocked: !u.blocked } }); toast('تم', 'ok'); onChange?.(); } catch (e) { toast(e.message, 'bad'); } }
      userSheet(uid, onChange);
    };
    A.actions.msg = async () => {
      const v = await confirmSheet({ title: `إشعار إلى ${esc(u.name)}`, ok: 'إرسال', inputs: `<div class="form-grid"><input class="input" data-in="title" maxlength="80" placeholder="العنوان"><textarea class="textarea" data-in="body" maxlength="400" placeholder="نص الإشعار"></textarea></div>` });
      if (v) { try { await api('/api/admin/notify', { method: 'POST', body: { ...v, target: uid } }); toast('تم الإرسال', 'ok'); } catch (e) { toast(e.message, 'bad'); } }
      userSheet(uid, onChange);
    };
  };
  try { await draw(); } catch (e) { closeSheet(); toast(e.message, 'bad'); }
}

/* ---------- Notify ---------- */
async function notify() {
  $('#main').innerHTML = top('الإشعارات') + `<div class="panel" style="max-width:640px"><h3>${icon('bell', 'ico-sm')} إرسال إشعار لكل المستخدمين</h3>
    <div class="form-grid"><div class="field"><label>العنوان</label><input class="input" id="nt" maxlength="80" placeholder="عرض خاص"></div>
    <div class="field"><label>النص</label><textarea class="textarea" id="nb" maxlength="400" placeholder="خصم 20% على بطاقات Xbox لفترة محدودة"></textarea></div>
    <button class="btn btn-primary" data-act="send">${icon('send', 'ico-sm')} إرسال للجميع</button>
    <span class="hint">يظهر في صفحة الإشعارات لكل العملاء، ويصل كإشعار جوال لمن فعّل الإشعارات.</span></div></div>`;
  A.actions.send = (b) => busy(b, async () => {
    const title = $('#nt').value.trim(), body = $('#nb').value.trim();
    if (title.length < 2 || body.length < 2) return toast('أكمل العنوان والنص', 'bad');
    if (!(await confirmSheet({ title: 'إرسال لكل المستخدمين؟', text: esc(title), ok: 'إرسال' }))) return;
    try { await api('/api/admin/notify', { method: 'POST', body: { title, body, target: 'all' } }); toast('تم إرسال الإشعار', 'ok'); $('#nt').value = ''; $('#nb').value = ''; } catch (e) { toast(e.message, 'bad'); }
  });
}

/* ---------- Settings ---------- */
async function settings() {
  loading('الإعدادات');
  const { settings: s } = await api('/api/admin/settings');
  const pmNames = { libyana: 'ليبيانا', madar: 'مدار', cards: 'كروت الشحن', onepay: 'ون باي', lypay: 'لي باي', crypto: 'كريبتو' };
  const ctaOpts = [['none', 'بدون زر'], ['url', 'رابط موقع'], ['page', 'صفحة في المتجر'], ['whatsapp', 'واتساب'], ['tiktok', 'تيك توك'], ['phone', 'اتصال']];
  const ctaPh = { none: '', url: 'https://example.com', page: '#/category/... أو #/offers', whatsapp: '0912345678', tiktok: '@اسم_الحساب أو رابط', phone: '0912345678' };
  const chOpts = [['whatsapp', 'واتساب'], ['whatsapp_channel', 'قناة واتساب'], ['telegram', 'تيليقرام'], ['tiktok', 'تيك توك'], ['instagram', 'إنستقرام'], ['facebook', 'فيسبوك'], ['youtube', 'يوتيوب'], ['snapchat', 'سناب شات'], ['website', 'موقع']];
  const untilLocal = s.maintenanceUntil ? new Date(Date.parse(s.maintenanceUntil) + 2 * 3600e3).toISOString().slice(0, 16) : '';
  let banners = [...(s.banners || [])];
  let phones = [...(s.support?.phones || [])];
  let channels = [...(s.support?.channels || [])];
  if (!phones.length && s.supportWhatsapp) phones.push({ label: 'الدعم الفني', number: s.supportWhatsapp, whatsapp: true, call: false });
  if (!channels.length) for (const [k, v] of Object.entries(s.social || {})) if (v) channels.push({ type: k === 'whatsapp' ? 'whatsapp' : k, label: '', url: v });
  const sel = (opts, v, attr) => `<select class="select" ${attr}>${opts.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const bannerRow = (b, i) => `<div class="repeat-row" data-banner="${i}">${uploader('b_image_' + i, b.image || '')}
    <div class="rr"><input class="input" data-b="title" maxlength="60" placeholder="العنوان (اختياري)" value="${esc(b.title || '')}"><input class="input" data-b="subtitle" maxlength="80" placeholder="وصف قصير (اختياري)" value="${esc(b.subtitle || '')}"></div>
    <div class="rr">${sel(ctaOpts, b.ctaType || 'none', 'data-b="ctaType"')}<input class="input" data-b="ctaLabel" maxlength="20" placeholder="نص الزر (زيارة)" value="${esc(b.ctaLabel || '')}"></div>
    <input class="input ltr" data-b="ctaValue" maxlength="300" placeholder="${esc(ctaPh[b.ctaType || 'none'] || '')}" value="${esc(b.ctaValue || '')}">
    <button class="btn btn-danger btn-xs" style="justify-self:start" data-act="rmBanner" data-i="${i}">${icon('trash', 'ico-sm')} حذف البانر</button></div>`;
  const phoneRow = (p, i) => `<div class="repeat-row" data-phone="${i}"><div class="rr"><input class="input" data-p="label" maxlength="30" placeholder="الاسم (مثال: الدعم الفني)" value="${esc(p.label || '')}"><input class="input ltr" data-p="number" maxlength="20" placeholder="0912345678" value="${esc(p.number || '')}"></div>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><label class="check"><input type="checkbox" data-p="whatsapp" ${p.whatsapp ? 'checked' : ''}> واتساب</label><label class="check"><input type="checkbox" data-p="call" ${p.call ? 'checked' : ''}> اتصال</label>
    <button class="btn btn-danger btn-xs" style="margin-right:auto" data-act="rmPhone" data-i="${i}">${icon('trash', 'ico-sm')}</button></div></div>`;
  const chRow = (c, i) => `<div class="repeat-row" data-ch="${i}"><div class="rr">${sel(chOpts, c.type || 'website', 'data-c="type"')}<input class="input" data-c="label" maxlength="30" placeholder="الاسم (اختياري)" value="${esc(c.label || '')}"></div>
    <div style="display:flex;gap:8px"><input class="input ltr" data-c="url" maxlength="300" placeholder="https://..." value="${esc(c.url || '')}"><button class="btn btn-danger btn-xs" style="height:48px" data-act="rmCh" data-i="${i}">${icon('trash', 'ico-sm')}</button></div></div>`;
  $('#main').innerHTML = top('الإعدادات', `<button class="btn btn-primary btn-sm" data-act="save">${icon('check', 'ico-sm')} حفظ</button>`) + `<div class="panels" id="sf">
    <div class="panel"><h3>البانرات الإعلانية <small>حتى 8 — يتبدلوا تلقائياً ويتسحبوا باليد</small></h3><div class="form-grid" id="banners"></div>
      <button class="btn btn-ghost btn-sm" data-act="addBanner" style="margin-top:12px">${icon('plus', 'ico-sm')} إضافة بانر</button></div>
    <div class="panel"><h3>الدعم والتواصل</h3>
      <div class="label" style="margin-bottom:8px">أرقام الدعم</div><div class="form-grid" id="phones"></div>
      <button class="btn btn-ghost btn-sm" data-act="addPhone" style="margin-top:10px">${icon('plus', 'ico-sm')} إضافة رقم</button>
      <div class="label" style="margin:18px 0 8px">القنوات والحسابات</div><div class="form-grid" id="channels"></div>
      <button class="btn btn-ghost btn-sm" data-act="addCh" style="margin-top:10px">${icon('plus', 'ico-sm')} إضافة قناة</button></div>
    <div class="panel"><h3>طرق الدفع</h3><div class="form-grid cols">
      <div class="field"><label>سعر الدولار (د.ل)</label><input class="input ltr" type="number" step="0.01" data-in="usdRate" value="${s.usdRate}"></div>
      <div class="field"><label>أقل إيداع / أعلى إيداع</label><div class="rr" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input class="input ltr" type="number" step="0.5" data-in="depositMin" value="${s.depositMin}"><input class="input ltr" type="number" step="1" data-in="depositMax" value="${s.depositMax}"></div></div></div>
      <div class="form-grid cols" style="margin-top:14px">${Object.entries(s.payments).map(([k, p]) => `<div class="pm-card"><label class="toggle-row" style="padding:0;border:0;background:none"><b>${pmNames[k] || k}</b><span class="switch"><input type="checkbox" data-in="p_${k}_enabled" ${p.enabled ? 'checked' : ''}></span></label>
        ${uploader(`p_${k}_image`, p.image || '')}
        <input class="input" data-in="p_${k}_label" maxlength="40" value="${esc(p.label)}" placeholder="الاسم الظاهر">
        <input class="input ltr" data-in="p_${k}_number" maxlength="60" value="${esc(p.number)}" placeholder="${k === 'cards' ? 'غير مطلوب' : 'الرقم / الحساب'}">
        <input class="input" data-in="p_${k}_note" maxlength="200" value="${esc(p.note)}" placeholder="ملاحظة للعميل"></div>`).join('')}</div></div>
    <div class="panel"><h3>الواجهة والصيانة</h3><div class="form-grid">
      <div class="field"><label>شريط إعلان (اختياري)</label><input class="input" data-in="announcement" maxlength="200" value="${esc(s.announcement)}" placeholder="مثال: الطلبات تتنفذ من 9 الصبح لين 2 الليل"></div>
      <label class="toggle-row"><span><b>وضع الصيانة</b><small>المتجر يعرض صفحة الصيانة ويوقف الطلبات والإيداعات</small></span><span class="switch"><input type="checkbox" data-in="maintenance" ${s.maintenance ? 'checked' : ''}></span></label>
      <div class="field"><label>رسالة الصيانة</label><input class="input" data-in="maintenanceMsg" maxlength="300" value="${esc(s.maintenanceMsg)}"></div>
      <div class="field"><label>وقت العودة المتوقع (توقيت ليبيا — اختياري)</label><input class="input ltr" type="datetime-local" data-in="maintenanceUntil" value="${untilLocal}"></div></div></div></div>
    <button class="btn btn-primary btn-block" style="margin-top:16px" data-act="save">${icon('check')} حفظ الإعدادات</button>`;
  const collectBanners = () => $$('[data-banner]').map((el) => {
    const v = (k) => $(`[data-b="${k}"]`, el).value.trim();
    return { image: $(`[data-in="b_image_${el.dataset.banner}"]`, el).value.trim(), title: v('title'), subtitle: v('subtitle'), ctaType: v('ctaType'), ctaLabel: v('ctaLabel'), ctaValue: v('ctaValue') };
  });
  const collectPhones = () => $$('[data-phone]').map((el) => ({ label: $('[data-p="label"]', el).value.trim(), number: $('[data-p="number"]', el).value.trim(), whatsapp: $('[data-p="whatsapp"]', el).checked, call: $('[data-p="call"]', el).checked }));
  const collectCh = () => $$('[data-ch]').map((el) => ({ type: $('[data-c="type"]', el).value, label: $('[data-c="label"]', el).value.trim(), url: $('[data-c="url"]', el).value.trim() }));
  const drawB = () => {
    $('#banners').innerHTML = banners.map(bannerRow).join('') || '<span class="muted">ما فيش بانرات — يظهر بانر نصي افتراضي</span>';
    bindUploaders($('#banners'));
    $$('[data-b="ctaType"]').forEach((sl) => sl.addEventListener('change', () => { $('[data-b="ctaValue"]', sl.closest('[data-banner]')).placeholder = ctaPh[sl.value] || ''; }));
  };
  const drawP = () => { $('#phones').innerHTML = phones.map(phoneRow).join('') || '<span class="muted">ما فيش أرقام</span>'; };
  const drawC = () => { $('#channels').innerHTML = channels.map(chRow).join('') || '<span class="muted">ما فيش قنوات</span>'; };
  drawB(); drawP(); drawC();
  bindUploaders($('#sf').querySelector('.panel:nth-child(3)'));
  A.actions.addBanner = () => { banners = collectBanners(); if (banners.length >= 8) return toast('الحد 8 بانرات', 'bad'); banners.push({ ctaType: 'none' }); drawB(); };
  A.actions.rmBanner = (b) => { banners = collectBanners(); banners.splice(Number(b.dataset.i), 1); drawB(); };
  A.actions.addPhone = () => { phones = collectPhones(); if (phones.length >= 6) return toast('الحد 6 أرقام', 'bad'); phones.push({ whatsapp: true, call: true }); drawP(); };
  A.actions.rmPhone = (b) => { phones = collectPhones(); phones.splice(Number(b.dataset.i), 1); drawP(); };
  A.actions.addCh = () => { channels = collectCh(); if (channels.length >= 10) return toast('الحد 10 قنوات', 'bad'); channels.push({ type: 'whatsapp_channel' }); drawC(); };
  A.actions.rmCh = (b) => { channels = collectCh(); channels.splice(Number(b.dataset.i), 1); drawC(); };
  A.actions.save = (b) => busy(b, async () => {
    const v = (k) => $(`[data-in="${k}"]`);
    const body = {
      maintenance: v('maintenance').checked, maintenanceMsg: v('maintenanceMsg').value.trim(),
      maintenanceUntil: v('maintenanceUntil').value ? new Date(Date.parse(v('maintenanceUntil').value + ':00Z') - 2 * 3600e3).toISOString() : '',
      announcement: v('announcement').value.trim(), usdRate: v('usdRate').value, depositMin: v('depositMin').value, depositMax: v('depositMax').value,
      banners: collectBanners().filter((x) => x.image),
      support: { phones: collectPhones().filter((x) => x.number), channels: collectCh().filter((x) => x.url) },
      payments: Object.fromEntries(Object.keys(s.payments).map((k) => [k, { enabled: v(`p_${k}_enabled`).checked, label: v(`p_${k}_label`).value.trim(), number: v(`p_${k}_number`).value.trim(), note: v(`p_${k}_note`).value.trim(), image: v(`p_${k}_image`).value.trim() }])),
    };
    try { await api('/api/admin/settings', { method: 'POST', body }); toast('تم حفظ الإعدادات', 'ok'); } catch (e) { toast(e.message, 'bad', 5000); }
  });
}

/* ---------- Boot ---------- */
onAuthStateChanged(auth, async (u) => {
  clearInterval(A.badgeTimer);
  if (!u) { A.user = null; loginScreen(); return; }
  try {
    const me = await api('/api/admin/me');
    A.user = { uid: me.uid, email: me.email || u.email };
    A.tab = store.get('gl_adm_tab', 'dash');
    shell();
  } catch (e) {
    await logout();
    loginScreen(e.status === 403 ? 'هذا الحساب لا يملك صلاحية الإدارة' : e.message);
  }
});
