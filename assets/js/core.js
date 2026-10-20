import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithCustomToken, signOut, sendPasswordResetEmail,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  reauthenticateWithCredential, EmailAuthProvider, updatePassword,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { CONFIG } from './config.js?v=202610201844';
import { icon } from './icons.js?v=202610201844';

export { CONFIG };
export const app = initializeApp(CONFIG.firebase);
export const auth = getAuth(app);
auth.languageCode = 'ar';

/* ---------- HTML helpers ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function imgUrl(url) {
  if (!url) return '';
  url = String(url).trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(url)) return url;
  if (/^[\w.\-\/]+\.(jpe?g|png|webp|gif)$/i.test(url) && !url.includes('..')) return 'legacy/' + url.split('/').pop();
  return '';
}
// بديل واقعي للصورة: أول كلمتين من اسم المنتج بدل أيقونة فارغة
export function phText(alt) {
  const words = String(alt || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return icon('gamepad', 'ico-lg');
  const main = words.slice(0, 2).join(' ');
  return `<span>${esc(main.length > 18 ? main.slice(0, 18) : main)}</span>`;
}
export function imgTag(url, alt = '', cls = '') {
  const u = imgUrl(url);
  if (!u) return `<div class="img-ph ${esc(cls)}">${phText(alt)}</div>`;
  return `<img class="${esc(cls)}" src="${esc(u)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-ph>`;
}
// صورة مكسورة → بديل أنيق (بدون inline handlers عشان CSP)
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.hasAttribute('data-ph')) {
    const d = document.createElement('div');
    d.className = 'img-ph ' + (t.className || '');
    d.innerHTML = phText(t.alt);
    t.replaceWith(d);
  }
}, true);

export const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => `<span class="num">${fmt(n)}</span> <small class="cur">د.ل</small>`;

export function timeAgo(iso) {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60); if (m < 60) return m === 1 ? 'منذ دقيقة' : m === 2 ? 'منذ دقيقتين' : m <= 10 ? `منذ ${m} دقائق` : `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60); if (h < 24) return h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : h <= 10 ? `منذ ${h} ساعات` : `منذ ${h} ساعة`;
  const d = Math.floor(h / 24); if (d < 30) return d === 1 ? 'منذ يوم' : d === 2 ? 'منذ يومين' : d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يوماً`;
  return fmtDate(iso);
}
export function fmtDate(iso, withTime = false) {
  const t = Date.parse(iso || '');
  if (!t) return '—';
  const d = new Date(t);
  const opt = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Tripoli' };
  if (withTime) Object.assign(opt, { hour: '2-digit', minute: '2-digit', hour12: false });
  return new Intl.DateTimeFormat('en-GB', opt).format(d).replace(',', ' ');
}

/* ---------- Ripple (لمسة ناعمة على الأزرار) ---------- */
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.btn, .soft');
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height);
  const s = document.createElement('span');
  s.className = 'rip';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  el.appendChild(s);
  setTimeout(() => s.remove(), 600);
}, { passive: true });

/* ---------- Storage (آمن) ---------- */
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ---------- API ---------- */
export async function api(path, { method = 'GET', body, timeout = 25000 } = {}) {
  if (CONFIG.API_BASE.includes('REPLACE_ME')) throw new Error('لم يتم ضبط رابط الخادم بعد');
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const u = auth.currentUser;
  if (u) headers.authorization = 'Bearer ' + (await u.getIdToken());
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(CONFIG.API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl.signal, credentials: 'omit' });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'انتهت مهلة الاتصال تحقق من الإنترنت' : 'تعذّر الاتصال بالخادم تحقق من الإنترنت');
  } finally { clearTimeout(timer); }
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(j.error || 'حدث خطأ حاول مرة أخرى'); e.status = r.status; throw e; }
  return j;
}

/* ---------- Toast ---------- */
export function toast(msg, type = 'info', ms = 3200) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = icon(type === 'ok' ? 'checkc' : type === 'bad' ? 'alert' : 'info') + `<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}

/* ---------- Sheet ---------- */
export function sheet(html, { center = false, onClose } = {}) {
  closeSheet();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'sheet-ov';
  const sh = document.createElement('div');
  sh.className = 'sheet' + (center ? ' center' : '');
  sh.id = 'sheet';
  sh.setAttribute('role', 'dialog');
  sh.innerHTML = html;
  ov.addEventListener('click', () => closeSheet());
  document.body.append(ov, sh);
  document.body.style.overflow = 'hidden';
  sh._onClose = onClose;
  return sh;
}
export function closeSheet() {
  const sh = document.getElementById('sheet');
  if (sh && sh._onClose) try { sh._onClose(); } catch {}
  document.getElementById('sheet')?.remove();
  document.getElementById('sheet-ov')?.remove();
  document.body.style.overflow = '';
}
export function confirmSheet({ title, text = '', ok = 'تأكيد', cancel = 'إلغاء', danger = false, inputs = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const sh = sheet(`<h3>${esc(title)}</h3>${text ? `<p class="t2" style="margin:0 0 16px">${text}</p>` : ''}${inputs}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>
      <button class="btn btn-soft" data-cancel>${esc(cancel)}</button></div>`, { center: true, onClose: () => { if (!done) resolve(null); } });
    sh.querySelector('[data-ok]').addEventListener('click', () => {
      const vals = {};
      sh.querySelectorAll('[data-in]').forEach((i) => { vals[i.dataset.in] = i.type === 'checkbox' ? i.checked : i.value; });
      done = true; closeSheet(); resolve(vals);
    });
    sh.querySelector('[data-cancel]').addEventListener('click', () => { done = true; closeSheet(); resolve(null); });
  });
}

/* ---------- Busy button ---------- */
export async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove();
  }
  toast('تم النسخ', 'ok', 1600);
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));

/* ---------- Turnstile ---------- */
let tsLoading = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!tsLoading) tsLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = () => res(); s.onerror = () => { tsLoading = null; rej(new Error('تعذر تحميل التحقق الأمني')); };
    document.head.appendChild(s);
  });
  return tsLoading;
}
export async function captcha(el, siteKey) {
  let token = null, wid = null, err = null;
  if (!siteKey) return { get: async () => { throw new Error('التحقق الأمني غير مُعد بعد'); }, reset() {} };
  try {
    await loadTurnstile();
    wid = window.turnstile.render(el, {
      sitekey: siteKey, theme: 'dark', language: 'ar', appearance: 'interaction-only',
      callback: (t) => { token = t; err = null; }, 'expired-callback': () => { token = null; }, 'error-callback': () => { err = true; },
    });
  } catch (e) { err = e; }
  return {
    async get() {
      for (let i = 0; i < 60 && !token; i++) { if (err === true) break; await new Promise((r) => setTimeout(r, 250)); }
      if (!token) throw new Error('أكمل التحقق الأمني ثم حاول مرة أخرى');
      const t = token; return t;
    },
    reset() { token = null; try { if (wid !== null) window.turnstile.reset(wid); } catch {} },
  };
}

/* ---------- Auth helpers ---------- */
export async function loginWith(identifier, password, captchaToken, { remember = true, admin = false } = {}) {
  const r = await api('/api/auth/login', { method: 'POST', body: { identifier, password, captcha: captchaToken, admin } });
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  await signInWithCustomToken(auth, r.customToken);
}
export async function signupWith(data, captchaToken) {
  const r = await api('/api/auth/signup', { method: 'POST', body: { ...data, captcha: captchaToken } });
  await signInWithCustomToken(auth, r.customToken);
}
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}
export async function changePassword(current, next) {
  const u = auth.currentUser;
  if (!u || !u.email) throw new Error('سجّل الدخول من جديد');
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
  } catch { throw new Error('كلمة المرور الحالية غير صحيحة'); }
  await updatePassword(u, next);
}
export const logout = () => signOut(auth);
export { onAuthStateChanged };

/* ---------- Push (FCM) ---------- */
export async function enablePush(vapidKey, { admin = false } = {}) {
  if (!vapidKey) throw new Error('الإشعارات غير مفعلة من الإدارة بعد');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('المتصفح لا يدعم الإشعارات');
  const m = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');
  if (!(await m.isSupported())) throw new Error('المتصفح لا يدعم الإشعارات');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('لم يتم السماح بالإشعارات من المتصفح');
  const reg = await navigator.serviceWorker.register('./firebase-messaging-sw.js', { scope: './' });
  const token = await m.getToken(m.getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error('تعذر تفعيل الإشعارات');
  await api('/api/push', { method: 'POST', body: { token, admin } });
  store.set(admin ? 'gl_push_admin' : 'gl_push', true);
  m.onMessage(m.getMessaging(app), (p) => toast(`${p.notification?.title || ''} · ${p.notification?.body || ''}`, 'ok', 5000));
  return true;
}

/* ---------- Image compression (admin uploads) ---------- */
export async function compressImage(file, { max = 900, quality = 0.84 } = {}) {
  if (!/^image\/(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.type)) throw new Error('اختر صورة صالحة');
  const bmp = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = () => rej(new Error('تعذر قراءة الصورة'));
    im.src = URL.createObjectURL(file);
  });
  const ratio = Math.min(1, max / Math.max(bmp.naturalWidth, bmp.naturalHeight));
  const w = Math.round(bmp.naturalWidth * ratio), h = Math.round(bmp.naturalHeight * ratio);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  URL.revokeObjectURL(bmp.src);
  let out = c.toDataURL('image/webp', quality);
  if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', quality);
  for (let q = quality - 0.1; out.length > 900000 && q > 0.4; q -= 0.1) out = c.toDataURL(out.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', q);
  return out;
}
