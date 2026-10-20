/**
 * Gaming Libya — API Worker (Cloudflare)
 * ------------------------------------------------------------
 * كل العمليات الحساسة تمر من هنا: الطلبات، الأرصدة، الإيداعات، الأكواد، لوحة الإدارة.
 * المتصفح ما يكتبش في قاعدة البيانات أبداً.
 *
 * Secrets:  FIREBASE_SERVICE_ACCOUNT, TURNSTILE_SECRET, ADMIN_UIDS, (optional) CODES_SECRET
 * Text:     TURNSTILE_SITE_KEY, FCM_VAPID_PUBLIC_KEY, (optional) ALLOWED_ORIGINS, SITE_URL
 */

const DEFAULT_ORIGINS = ['https://lysd89181-lab.github.io'];
const DEFAULT_SITE_URL = 'https://lysd89181-lab.github.io/gaming-libya-v2/';
// مفتاح الويب العام (نفسه الموجود في واجهة الموقع، مش سري)
const WEB_API_KEY = 'AIzaSyAJgwaMBo5wxM5BEK9nRrrNg04UGdHyAV0';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/identitytoolkit',
].join(' ');
const TZ_OFFSET_MS = 2 * 3600 * 1000; // ليبيا UTC+2 بدون توقيت صيفي

const DEFAULT_SETTINGS = {
  maintenance: false,
  maintenanceMsg: 'نعمل حالياً على تحسين المتجر، سنعود إليكم قريباً.',
  maintenanceUntil: '',
  announcement: '',
  banners: [],
  usdRate: 12,
  depositMin: 1,
  depositMax: 5000,
  supportWhatsapp: '',
  social: { facebook: '', instagram: '', telegram: '', whatsapp: '', tiktok: '' },
  support: { phones: [], channels: [] },
  payments: {
    libyana: { enabled: true, label: 'ليبيانا', number: '0946730213', note: 'حوّل الرصيد للرقم ثم أرسل الطلب', image: '' },
    madar: { enabled: true, label: 'مدار', number: '0915307725', note: 'حوّل الرصيد للرقم ثم أرسل الطلب', image: '' },
    cards: { enabled: true, label: 'كروت شحن', number: '', note: 'أدخل رقم الكرت وقيمته', image: '' },
    onepay: { enabled: true, label: 'ون باي OnePay', number: 'LY82005101101017366700013', note: 'حوّل المبلغ ثم أدخل اسم المحوّل', image: '' },
    lypay: { enabled: true, label: 'لي باي LYPAY', number: '101017366700013', note: 'حوّل المبلغ ثم أدخل اسم المحوّل', image: '' },
    crypto: { enabled: true, label: 'كريبتو USDT', number: '', note: 'Binance / Bybit Pay', image: '' },
  },
};
const PAYMENT_KEYS = Object.keys(DEFAULT_SETTINGS.payments);
const FIELD_TYPES = ['id', 'phone', 'account', 'custom'];
const CTA_TYPES = ['none', 'url', 'page', 'whatsapp', 'tiktok', 'phone'];
const CHANNEL_TYPES = ['whatsapp', 'whatsapp_channel', 'telegram', 'tiktok', 'instagram', 'facebook', 'youtube', 'snapchat', 'website'];

/* ============================== أدوات عامة ============================== */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const te = new TextEncoder();
const td = new TextDecoder();

function bytesToB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64url = (bytes) => bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlStr = (s) => b64url(te.encode(s));
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return b64ToBytes(s);
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tsMs = (v) => (v ? Date.parse(v) || 0 : 0);

function randId(n = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const r = crypto.getRandomValues(new Uint8Array(n * 2));
  let s = '';
  for (const x of r) { if (x < 248) s += chars[x % 62]; if (s.length === n) break; }
  return s.length === n ? s : s + randId(n - s.length);
}

function str(v, { min = 0, max = 200, field = 'الحقل', trim = true } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(`${field}: قيمة غير صالحة`);
  if (trim) v = v.trim();
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (v.length < min) throw bad(min <= 1 ? `${field} مطلوب` : `${field} قصير جداً`);
  if (v.length > max) throw bad(`${field} طويل جداً`);
  return v;
}
function money(v, { min = 0, max = 100000, field = 'المبلغ' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad(`${field} غير صالح`);
  if (n < min || n > max) throw bad(`${field} يجب أن يكون بين ${min} و ${max}`);
  return round3(n);
}
function bool(v) { return v === true || v === 'true'; }
function imageUrl(v) {
  v = str(v, { max: 600, field: 'رابط الصورة' });
  if (!v) return '';
  if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
  if (/^[\w.\-\/]+\.(jpe?g|png|webp|gif)$/i.test(v) && !v.includes('..')) return v; // صور قديمة نسبية
  throw bad('رابط الصورة غير صالح');
}

function phoneDigits(v, field = 'الرقم') {
  const raw = str(v, { max: 20, field });
  if (!raw) return '';
  const d = raw.replace(/[^\d+]/g, '');
  if (!/^\+?\d{6,15}$/.test(d)) throw bad(`${field} غير صحيح`);
  return d;
}
function ctaValue(type, v) {
  if (type === 'none') return '';
  const val = str(v, { min: 1, max: 300, field: 'رابط الزر' });
  if (type === 'url') { if (!/^https:\/\/[^\s"'<>]+$/.test(val)) throw bad('رابط الزر يجب أن يبدأ بـ https://'); return val; }
  if (type === 'page') { if (!/^#\/[\w\-\/?=&.%]*$/.test(val)) throw bad('صفحة المتجر يجب أن تبدأ بـ #/'); return val; }
  if (type === 'tiktok') {
    if (/^https:\/\/([\w-]+\.)?tiktok\.com\/[^\s"'<>]*$/.test(val)) return val;
    if (/^@?[\w.]{2,30}$/.test(val)) return 'https://www.tiktok.com/@' + val.replace(/^@/, '');
    throw bad('حساب تيك توك غير صحيح');
  }
  return phoneDigits(val, type === 'whatsapp' ? 'رقم الواتساب' : 'رقم الهاتف');
}
function normPhone(p) {
  let d = String(p || '').replace(/[^\d]/g, '');
  if (d.startsWith('00218')) d = d.slice(5);
  else if (d.startsWith('218')) d = d.slice(3);
  if (d.length === 9 && d.startsWith('9')) d = '0' + d;
  return d;
}
function phoneVariants(p) {
  const n = normPhone(p);
  const set = new Set([String(p || '').trim(), n]);
  if (/^09\d{8}$/.test(n)) { const r = n.slice(1); set.add(r); set.add('218' + r); set.add('+218' + r); set.add('00218' + r); }
  return [...set].filter(Boolean).slice(0, 10);
}
const isLyPhone = (p) => /^09[1-6]\d{7}$/.test(p);

/* ============================== Service Account و OAuth ============================== */

const G = { sa: null, saKey: null, token: null, tokenExp: 0, jwks: null, jwksExp: 0, jwkKeys: new Map(), codeKeys: {}, hmacKey: null };

async function sa(env) {
  if (!G.sa) {
    if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
    const j = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const pem = j.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    G.saKey = await crypto.subtle.importKey('pkcs8', b64ToBytes(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    G.sa = j;
  }
  return G.sa;
}
async function signJwt(env, payload) {
  await sa(env);
  const h = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64urlStr(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', G.saKey, te.encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}
async function gToken(env) {
  if (env.FIRESTORE_EMULATOR_HOST) return 'owner';
  const now = Math.floor(Date.now() / 1000);
  if (G.token && G.tokenExp - 120 > now) return G.token;
  const s = await sa(env);
  const assertion = await signJwt(env, { iss: s.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  const j = await r.json();
  if (!r.ok) throw new Error('oauth failed: ' + JSON.stringify(j).slice(0, 200));
  G.token = j.access_token;
  G.tokenExp = now + (j.expires_in || 3600);
  return G.token;
}
async function customToken(env, uid) {
  const s = await sa(env);
  const now = Math.floor(Date.now() / 1000);
  return signJwt(env, {
    iss: s.client_email, sub: s.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, uid,
  });
}

/* ============================== التحقق من توكن Firebase ============================== */

async function getJwks(force = false) {
  if (!force && G.jwks && G.jwksExp > Date.now()) return G.jwks;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const j = await r.json();
  const maxAge = int(/max-age=(\d+)/.exec(r.headers.get('cache-control') || '')?.[1], 3600);
  G.jwks = j.keys || [];
  G.jwksExp = Date.now() + maxAge * 1000;
  return G.jwks;
}
async function verifyIdToken(env, token) {
  const unauth = new HttpError(401, 'انتهت الجلسة، سجّل الدخول من جديد');
  if (!token || token.length > 4096) throw unauth;
  const parts = token.split('.');
  if (parts.length !== 3) throw unauth;
  let header, payload;
  try {
    header = JSON.parse(td.decode(b64urlToBytes(parts[0])));
    payload = JSON.parse(td.decode(b64urlToBytes(parts[1])));
  } catch { throw unauth; }
  if (header.alg !== 'RS256' || !header.kid) throw unauth;
  let key = G.jwkKeys.get(header.kid);
  if (!key) {
    let jwk = (await getJwks()).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await getJwks(true)).find((k) => k.kid === header.kid);
    if (!jwk) throw unauth;
    key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    G.jwkKeys.set(header.kid, key);
  }
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), te.encode(`${parts[0]}.${parts[1]}`));
  const pid = (await sa(env)).project_id;
  const now = Math.floor(Date.now() / 1000);
  if (!ok || payload.aud !== pid || payload.iss !== `https://securetoken.google.com/${pid}` ||
      !(payload.exp > now) || !(payload.iat <= now + 300) || !(payload.auth_time <= now + 300) ||
      typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw unauth;
  return { uid: payload.sub, email: payload.email || '' };
}

/* ============================== Turnstile ============================== */

function allowedOrigins(env) {
  const extra = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}
async function verifyCaptcha(env, token, ip) {
  if (!token || typeof token !== 'string' || token.length > 2048) throw new HttpError(403, 'أكمل التحقق الأمني أولاً');
  const fd = new FormData();
  fd.append('secret', env.TURNSTILE_SECRET || '');
  fd.append('response', token);
  if (ip) fd.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new HttpError(403, 'فشل التحقق الأمني، أعد المحاولة');
  const hosts = allowedOrigins(env).map((o) => new URL(o).hostname);
  if (j.hostname && !hosts.includes(j.hostname)) throw new HttpError(403, 'فشل التحقق الأمني');
}

/* ============================== Rate limit (لكل نسخة) ============================== */

const RL = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let e = RL.get(key);
  if (!e || e.reset < now) { e = { n: 0, reset: now + windowMs }; RL.set(key, e); }
  e.n++;
  if (RL.size > 10000) RL.clear();
  if (e.n > max) throw new HttpError(429, 'محاولات كثيرة، انتظر قليلاً ثم حاول');
}

/* ============================== تشفير الأكواد ============================== */

async function codeKey(env, k) {
  if (G.codeKeys[k]) return G.codeKeys[k];
  let material;
  if (k === 's') {
    if (!env.CODES_SECRET) throw new Error('CODES_SECRET missing');
    material = 'gl-codes-s1:' + env.CODES_SECRET;
  } else {
    material = 'gl-codes-a1:' + (await sa(env)).private_key;
  }
  const raw = await crypto.subtle.digest('SHA-256', te.encode(material));
  G.codeKeys[k] = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return G.codeKeys[k];
}
async function encSecret(env, text) {
  const k = env.CODES_SECRET ? 's' : 'a';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await codeKey(env, k), te.encode(text));
  return { k, iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}
async function decSecret(env, o) {
  try {
    if (!o || !o.iv || !o.ct) return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(o.iv) }, await codeKey(env, o.k || 'a'), b64ToBytes(o.ct));
    return td.decode(pt);
  } catch { return null; }
}
async function hmacId(env, text) {
  if (!G.hmacKey) {
    const raw = await crypto.subtle.digest('SHA-256', te.encode('gl-hmac-1:' + (env.CODES_SECRET || (await sa(env)).private_key)));
    G.hmacKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  return hex(await crypto.subtle.sign('HMAC', G.hmacKey, te.encode(text))).slice(0, 40);
}

/* ============================== Firestore REST ============================== */

class Dbl { constructor(v) { this.v = v; } }
class Inc { constructor(v) { this.v = v; } }
const SERVER_TIME = { __serverTime: true };

function fsPaths(env) {
  const pid = G.sa.project_id;
  const host = env.FIRESTORE_EMULATOR_HOST ? `http://${env.FIRESTORE_EMULATOR_HOST}` : 'https://firestore.googleapis.com';
  const name = `projects/${pid}/databases/(default)/documents`;
  return { root: `${host}/v1/${name}`, name };
}
const docName = (env, path) => `${fsPaths(env).name}/${path}`;

function encVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Dbl) return { doubleValue: v.v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encVal) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  throw new Error('unsupported value');
}
function encFields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v instanceof Inc || v === SERVER_TIME) continue;
    f[k] = encVal(v);
  }
  return f;
}
function decVal(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decVal);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
function decFields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = decVal(v); return o; }
function decDoc(d) {
  if (!d || !d.name) return null;
  const path = d.name.split('/documents/')[1];
  return { ...decFields(d.fields), id: path.split('/').pop(), _path: path, _updateTime: d.updateTime };
}

async function fsReq(env, method, url, body) {
  const tok = await gToken(env);
  const r = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j;
  try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  if (!r.ok) {
    const errObj = Array.isArray(j) ? j[0]?.error : j.error;
    const e = new Error(`firestore ${r.status}: ${(errObj?.message || t).slice(0, 300)}`);
    e.fsStatus = errObj?.status;
    e.httpStatus = r.status;
    throw e;
  }
  return j;
}

function wUpdate(env, path, data, opt = {}) {
  const fields = encFields(data);
  const w = { update: { name: docName(env, path), fields } };
  if (!opt.replace) w.updateMask = { fieldPaths: Object.keys(fields) };
  const transforms = [];
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Inc) transforms.push({ fieldPath: k, increment: Number.isInteger(v.v) ? { integerValue: String(v.v) } : { doubleValue: v.v } });
    else if (v === SERVER_TIME) transforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' });
  }
  if (transforms.length) w.updateTransforms = transforms;
  if (opt.exists !== undefined) w.currentDocument = { exists: opt.exists };
  return w;
}
const wCreate = (env, path, data) => wUpdate(env, path, data, { replace: true, exists: false });
const wDelete = (env, path) => ({ delete: docName(env, path) });

async function fsGet(env, path, tx) {
  await sa(env);
  try {
    const q = tx ? `?transaction=${encodeURIComponent(tx)}` : '';
    return decDoc(await fsReq(env, 'GET', `${fsPaths(env).root}/${path}${q}`));
  } catch (e) {
    if (e.httpStatus === 404) return null;
    throw e;
  }
}
async function fsGetMany(env, paths, tx) {
  await sa(env);
  if (!paths.length) return [];
  const body = { documents: paths.map((p) => docName(env, p)) };
  if (tx) body.transaction = tx;
  const res = await fsReq(env, 'POST', `${fsPaths(env).root}:batchGet`, body);
  const byName = new Map();
  for (const x of res) if (x.found) byName.set(x.found.name, decDoc(x.found));
  return paths.map((p) => byName.get(docName(env, p)) || null);
}
const OPS = { '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL', in: 'IN', 'array-contains': 'ARRAY_CONTAINS' };
function buildQuery(coll, { where = [], orderBy = [], limit, select } = {}) {
  const sq = { from: [{ collectionId: coll }] };
  const f = where.map(([field, op, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: encVal(value) } }));
  if (f.length === 1) sq.where = f[0];
  else if (f.length > 1) sq.where = { compositeFilter: { op: 'AND', filters: f } };
  if (orderBy.length) sq.orderBy = orderBy.map(([field, dir]) => ({ field: { fieldPath: field }, direction: dir === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
  if (limit) sq.limit = limit;
  if (select) sq.select = { fields: select.map((x) => ({ fieldPath: x })) };
  return sq;
}
async function fsQuery(env, coll, opts = {}) {
  await sa(env);
  const parent = opts.parent ? `${fsPaths(env).root}/${opts.parent}` : fsPaths(env).root;
  const body = { structuredQuery: buildQuery(coll, opts) };
  if (opts.tx) body.transaction = opts.tx;
  const res = await fsReq(env, 'POST', `${parent}:runQuery`, body);
  return res.filter((x) => x.document).map((x) => decDoc(x.document));
}
async function fsAgg(env, coll, where, aggs) {
  await sa(env);
  const body = {
    structuredAggregationQuery: {
      structuredQuery: buildQuery(coll, { where }),
      aggregations: Object.entries(aggs).map(([alias, [t, f]]) => (t === 'count' ? { alias, count: {} } : { alias, sum: { field: { fieldPath: f } } })),
    },
  };
  const res = await fsReq(env, 'POST', `${fsPaths(env).root}:runAggregationQuery`, body);
  const fields = res.find((x) => x.result)?.result?.aggregateFields || {};
  const out = {};
  for (const k of Object.keys(aggs)) out[k] = num(decVal(fields[k]));
  return out;
}
async function fsCommit(env, writes) {
  await sa(env);
  if (!writes.length) return null;
  return fsReq(env, 'POST', `${fsPaths(env).root}:commit`, { writes });
}
async function fsTx(env, fn) {
  await sa(env);
  const root = fsPaths(env).root;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { transaction } = await fsReq(env, 'POST', `${root}:beginTransaction`, { options: { readWrite: {} } });
    let out;
    try {
      out = await fn(transaction);
      await fsReq(env, 'POST', `${root}:commit`, { writes: out.writes || [], transaction });
      return out.result;
    } catch (e) {
      const retry = e.fsStatus === 'ABORTED' || e.httpStatus === 409;
      if (!out || !retry) fsReq(env, 'POST', `${root}:rollback`, { transaction }).catch(() => {});
      if (retry) { await sleep(40 * 2 ** attempt + Math.random() * 60); continue; }
      throw e;
    }
  }
  throw new HttpError(503, 'ضغط عالي على النظام، حاول مرة أخرى');
}

/* ============================== الإعدادات والكتالوج ============================== */

function mergeSettings(stored) {
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!stored) return s;
  for (const k of ['maintenance', 'maintenanceMsg', 'maintenanceUntil', 'announcement', 'usdRate', 'depositMin', 'depositMax', 'supportWhatsapp']) {
    if (stored[k] !== undefined && stored[k] !== null) s[k] = stored[k];
  }
  if (Array.isArray(stored.banners)) s.banners = stored.banners;
  if (stored.social && typeof stored.social === 'object') Object.assign(s.social, stored.social);
  if (stored.support && typeof stored.support === 'object') {
    if (Array.isArray(stored.support.phones)) s.support.phones = stored.support.phones;
    if (Array.isArray(stored.support.channels)) s.support.channels = stored.support.channels;
  }
  if (stored.payments && typeof stored.payments === 'object') {
    for (const k of PAYMENT_KEYS) if (stored.payments[k]) Object.assign(s.payments[k], stored.payments[k]);
  }
  return s;
}
async function getSettings(env) {
  return mergeSettings(await fsGet(env, 'settings/site'));
}

function finalPrice(s) {
  const p = num(s.price);
  const d = clamp(int(s.discount), 0, 100);
  return round3(p - (p * d) / 100);
}
function pubCategory(c) {
  return { id: c.id, name: c.name || '', image: c.image || c.cover || '', order: num(c.order, 0), hidden: c.hidden === true };
}
function pubService(s) {
  const qty = !!s.enableQuantity;
  const auto = !!s.autoDelivery && !qty;
  const min = int(s.qtyMin, 30) || 30;
  return {
    id: s.id,
    title: s.title || '',
    category: s.category || '',
    price: num(s.price),
    discount: clamp(int(s.discount), 0, 100),
    finalPrice: finalPrice(s),
    image: s.image || '',
    description: s.description || '',
    fieldType: FIELD_TYPES.includes(s.fieldType || s.type) ? (s.fieldType || s.type) : 'id',
    fieldEnabled: s.fieldEnabled !== false && !auto,
    fieldLabel: s.fieldCustomLabel || '',
    enableQuantity: qty,
    qtyMin: min,
    qtyMax: Math.max(min, int(s.qtyMax, 100) || 100),
    unitPrice: qty ? round3(num(s.price) / min) : null,
    auto,
    stock: auto ? Math.max(0, int(s.stockAvailable)) : null,
    sold: Math.max(0, int(s.soldCount)),
    badge: s.badge || '',
    order: num(s.order, 0),
    active: s.status !== false,
  };
}
const CATALOG_KEY = 'https://gl-cache.internal/catalog-v3';
const CONFIG_KEY = 'https://gl-cache.internal/config-v3';
async function buildCatalog(env) {
  const [cats, svcs] = await Promise.all([fsQuery(env, 'categories', { limit: 1000 }), fsQuery(env, 'services', { limit: 3000 })]);
  const categories = cats.map(pubCategory).filter((c) => !c.hidden).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ar'));
  const catIds = new Set(categories.map((c) => c.id));
  const services = svcs.map(pubService).filter((s) => s.active && catIds.has(s.category));
  services.forEach((s) => delete s.active);
  return { categories, services, at: Date.now() };
}
// كاش بطبقتين: ذاكرة النسخة (يشتغل دائماً) + كاش الحافة (يشتغل على الدومينات الخاصة)
const MEM = new Map();
async function purgeCache() {
  MEM.delete(CATALOG_KEY); MEM.delete(CONFIG_KEY);
  try { await caches.default.delete(CATALOG_KEY); await caches.default.delete(CONFIG_KEY); } catch {}
}
async function cached(key, ttl, build) {
  const m = MEM.get(key);
  if (m && m.exp > Date.now()) return m.data;
  try {
    const hit = await caches.default.match(key);
    if (hit) { const data = await hit.json(); MEM.set(key, { data, exp: Date.now() + ttl * 1000 }); return data; }
  } catch {}
  const data = await build();
  MEM.set(key, { data, exp: Date.now() + ttl * 1000 });
  try { await caches.default.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` } })); } catch {}
  return data;
}

/* ============================== الإشعارات و FCM ============================== */

const siteUrl = (env) => env.SITE_URL || DEFAULT_SITE_URL;

function wNotify(env, uid, title, body, type = 'info', ref = '') {
  if (uid === 'all') return wCreate(env, `broadcasts/${randId()}`, { title, body, type, ref, createdAt: SERVER_TIME });
  return wCreate(env, `users/${uid}/notifications/${randId()}`, { title, body, type, ref, createdAt: SERVER_TIME });
}
async function sendPush(env, tokens, { title, body, link }) {
  const pid = (await sa(env)).project_id;
  const tok = await gToken(env);
  await Promise.all(tokens.map(async (t) => {
    try {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title, body },
            webpush: {
              notification: { icon: siteUrl(env) + 'assets/img/icon-192.png', badge: siteUrl(env) + 'assets/img/badge-72.png', dir: 'rtl', lang: 'ar' },
              fcm_options: { link: link || siteUrl(env) },
            },
          },
        }),
      });
      if (r.status === 404 || r.status === 400) {
        const j = await r.json().catch(() => ({}));
        const code = JSON.stringify(j);
        if (code.includes('UNREGISTERED') || code.includes('INVALID_ARGUMENT')) await fsCommit(env, [wDelete(env, t._path)]);
      }
    } catch (e) { console.error('push', e.message); }
  }));
}
async function pushUser(env, uid, msg) {
  try {
    const tokens = await fsQuery(env, 'push_tokens', { where: [['uid', '==', uid]], limit: 10 });
    if (tokens.length) await sendPush(env, tokens, { link: siteUrl(env) + '#/notifications', ...msg });
  } catch (e) { console.error('pushUser', e.message); }
}
async function pushAdmins(env, msg) {
  try {
    const tokens = await fsQuery(env, 'push_tokens', { where: [['admin', '==', true]], limit: 30 });
    if (tokens.length) await sendPush(env, tokens, { link: siteUrl(env) + 'admin.html', ...msg });
  } catch (e) { console.error('pushAdmins', e.message); }
}

/* ============================== المصادقة ============================== */

function adminUids(env) {
  return String(env.ADMIN_UIDS || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}
const isAdmin = (env, uid) => adminUids(env).includes(uid);

async function authUser(req, env) {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) throw new HttpError(401, 'سجّل الدخول أولاً');
  return deps.verifyIdToken(env, m[1]);
}
async function authAdmin(req, env) {
  const u = await authUser(req, env);
  if (!isAdmin(env, u.uid)) throw new HttpError(403, 'غير مصرح لك');
  return u;
}
async function idtk(env, path, body, { admin = false } = {}) {
  const pid = (await sa(env)).project_id;
  const host = env.AUTH_EMULATOR_HOST ? `http://${env.AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const url = admin ? `${host}/v1/projects/${pid}/${path}` : `${host}/v1/${path}?key=${env.FIREBASE_WEB_API_KEY || WEB_API_KEY}`;
  const headers = { 'content-type': 'application/json', referer: siteUrl(env) };
  if (admin) headers.authorization = `Bearer ${await gToken(env)}`;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('idtk ' + (j?.error?.message || r.status)); e.idtk = String(j?.error?.message || ''); throw e; }
  return j;
}

async function findUsersByPhone(env, phone, limit = 2) {
  return fsQuery(env, 'users', { where: [['phone', 'in', phoneVariants(phone)]], limit });
}

async function handleSignup(req, env, body, ip) {
  rateLimit('su:' + ip, 6, 10 * 60e3);
  const name = str(body.name, { min: 2, max: 40, field: 'الاسم' });
  const phone = normPhone(str(body.phone, { min: 9, max: 20, field: 'رقم الهاتف' }));
  if (!isLyPhone(phone)) throw bad('رقم الهاتف غير صحيح (مثال: 0912345678)');
  const email = str(body.email, { min: 5, max: 100, field: 'البريد الإلكتروني' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad('البريد الإلكتروني غير صحيح');
  const password = str(body.password, { min: 8, max: 64, field: 'كلمة المرور', trim: false });
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) throw bad('كلمة المرور يجب أن تحتوي على حروف وأرقام');
  await deps.verifyCaptcha(env, body.captcha, ip);

  if ((await findUsersByPhone(env, phone, 1)).length) throw bad('رقم الهاتف مسجّل مسبقاً');
  let uid;
  try {
    uid = (await idtk(env, 'accounts', { email, password, displayName: name }, { admin: true })).localId;
  } catch (e) {
    if (e.idtk.includes('EMAIL_EXISTS')) throw bad('البريد الإلكتروني مسجّل مسبقاً');
    if (e.idtk.includes('WEAK_PASSWORD')) throw bad('كلمة المرور ضعيفة');
    throw e;
  }
  await fsCommit(env, [wCreate(env, `users/${uid}`, {
    name, username: name, phone, email, balance: 0, wallet_balance: 0, role: 'user', createdAt: SERVER_TIME, source: 'v2',
  })]);
  return { customToken: await customToken(env, uid) };
}

async function handleLogin(req, env, body, ip) {
  rateLimit('li:' + ip, 12, 5 * 60e3);
  const identifier = str(body.identifier, { min: 3, max: 100, field: 'البريد أو رقم الهاتف' });
  const password = str(body.password, { min: 1, max: 64, field: 'كلمة المرور', trim: false });
  const asAdmin = body.admin === true;
  await deps.verifyCaptcha(env, body.captcha, ip);
  rateLimit('lid:' + identifier.toLowerCase(), 8, 15 * 60e3);

  const wrong = bad('بيانات الدخول غير صحيحة');
  let email = identifier.toLowerCase();
  if (!identifier.includes('@')) {
    const users = await findUsersByPhone(env, identifier, 2);
    if (users.length !== 1 || !users[0].email) throw users.length > 1 ? bad('هذا الرقم مرتبط بأكثر من حساب، سجّل الدخول بالبريد') : wrong;
    email = String(users[0].email).toLowerCase();
  }
  let res;
  try {
    res = await idtk(env, 'accounts:signInWithPassword', { email, password, returnSecureToken: true });
  } catch (e) {
    if (e.idtk.includes('USER_DISABLED')) throw new HttpError(403, 'هذا الحساب موقوف');
    if (e.idtk.includes('TOO_MANY_ATTEMPTS')) throw new HttpError(429, 'محاولات كثيرة، حاول لاحقاً');
    if (/INVALID|NOT_FOUND|PASSWORD|MISSING/.test(e.idtk)) throw wrong;
    throw e;
  }
  const uid = res.localId;
  if (asAdmin) {
    if (!isAdmin(env, uid)) throw new HttpError(403, 'هذا الحساب لا يملك صلاحية الإدارة');
  } else {
    const u = await fsGet(env, `users/${uid}`);
    if (!u) {
      await fsCommit(env, [wCreate(env, `users/${uid}`, {
        name: res.displayName || email.split('@')[0], username: res.displayName || email.split('@')[0],
        phone: '', email, balance: 0, wallet_balance: 0, role: 'user', createdAt: SERVER_TIME, source: 'v2',
      })]).catch(() => {});
    } else if (u.blocked === true) throw new HttpError(403, 'هذا الحساب موقوف، تواصل مع الدعم');
  }
  return { customToken: await customToken(env, uid) };
}

/* ============================== المستخدم ============================== */

async function requireProfile(env, uid) {
  const u = await fsGet(env, `users/${uid}`);
  if (!u) throw new HttpError(403, 'الحساب غير مكتمل، سجّل الدخول من جديد');
  if (u.blocked === true) throw new HttpError(403, 'هذا الحساب موقوف، تواصل مع الدعم');
  return u;
}
function pubUser(u, uid) {
  return {
    uid, name: u.name || u.username || '', phone: u.phone || '', email: u.email || '',
    balance: round3(num(u.balance)), createdAt: u.createdAt || null,
  };
}
async function unreadCount(env, uid, readAt) {
  const since = tsMs(readAt);
  const [mine, all] = await Promise.all([
    fsQuery(env, 'notifications', { parent: `users/${uid}`, orderBy: [['createdAt', 'desc']], limit: 30, select: ['createdAt'] }),
    fsQuery(env, 'broadcasts', { orderBy: [['createdAt', 'desc']], limit: 30, select: ['createdAt'] }),
  ]);
  return [...mine, ...all].filter((n) => tsMs(n.createdAt) > since).length;
}

async function handleMe(env, uid) {
  const u = await requireProfile(env, uid);
  return { ...pubUser(u, uid), unread: await unreadCount(env, uid, u.notifReadAt), admin: isAdmin(env, uid) };
}
async function handleUpdateMe(env, uid, body) {
  const u = await requireProfile(env, uid);
  const upd = {};
  if (body.name !== undefined) { upd.name = str(body.name, { min: 2, max: 40, field: 'الاسم' }); upd.username = upd.name; }
  if (body.phone !== undefined) {
    const p = normPhone(str(body.phone, { min: 9, max: 20, field: 'رقم الهاتف' }));
    if (!isLyPhone(p)) throw bad('رقم الهاتف غير صحيح');
    if (normPhone(u.phone) !== p) {
      const others = (await findUsersByPhone(env, p, 2)).filter((x) => x.id !== uid);
      if (others.length) throw bad('رقم الهاتف مستخدم في حساب آخر');
    }
    upd.phone = p;
  }
  if (!Object.keys(upd).length) throw bad('لا يوجد ما يتم تحديثه');
  await fsCommit(env, [wUpdate(env, `users/${uid}`, upd, { exists: true })]);
  return { ok: true };
}

/* ============================== الطلبات ============================== */

function priceItem(s, item) {
  const p = pubService(s);
  if (s.status === false) throw bad(`الخدمة "${p.title}" غير متاحة حالياً`);
  let qty, total;
  if (p.enableQuantity) {
    qty = int(item.quantity);
    if (!(qty >= p.qtyMin && qty <= p.qtyMax)) throw bad(`الكمية لـ "${p.title}" يجب أن تكون بين ${p.qtyMin} و ${p.qtyMax}`);
    total = round3((num(s.price) / p.qtyMin) * qty * (1 - p.discount / 100));
  } else {
    qty = int(item.quantity, 1);
    if (!(qty >= 1 && qty <= 10)) throw bad('الكمية يجب أن تكون بين 1 و 10');
    total = round3(p.finalPrice * qty);
  }
  if (!(total > 0)) throw bad(`سعر "${p.title}" غير صالح حالياً`);
  let input = '';
  if (p.fieldEnabled) {
    input = str(item.input, { min: 2, max: 200, field: p.fieldLabel || 'بيانات الطلب' });
  }
  return { p, qty, total, input };
}

async function handleCreateOrder(env, uid, body, ctx) {
  rateLimit('ord:' + uid, 20, 60e3);
  const settings = await getSettings(env);
  if (settings.maintenance && !isAdmin(env, uid)) throw new HttpError(503, 'المتجر في وضع الصيانة حالياً');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 20) throw bad('السلة فارغة أو كبيرة جداً');
  const idem = str(body.idem, { min: 8, max: 64, field: 'معرف الطلب' });
  if (!/^[\w-]+$/.test(idem)) throw bad('معرف الطلب غير صالح');
  const contactPhone = str(body.contactPhone, { max: 30, field: 'رقم التواصل' });
  const serviceIds = [...new Set(items.map((i) => str(i.serviceId, { min: 1, max: 64, field: 'الخدمة' })))];
  if (serviceIds.some((id) => !/^[\w-]+$/.test(id))) throw bad('خدمة غير صالحة');

  const result = await fsTx(env, async (tx) => {
    const idemPath = `idem/${uid}_${idem}`;
    const [user, idemDoc, ...svcDocs] = await fsGetMany(env, [`users/${uid}`, idemPath, ...serviceIds.map((id) => `services/${id}`)], tx);
    if (!user) throw new HttpError(403, 'الحساب غير مكتمل');
    if (user.blocked === true) throw new HttpError(403, 'هذا الحساب موقوف');
    if (idemDoc) return { writes: [], result: { ...idemDoc.result, duplicate: true } };
    const svcMap = new Map(svcDocs.map((s, i) => [serviceIds[i], s]));

    const lines = items.map((it) => {
      const s = svcMap.get(String(it.serviceId).trim());
      if (!s) throw bad('إحدى الخدمات لم تعد متوفرة، حدّث السلة');
      return { ...priceItem(s, it), sid: s.id, svc: s };
    });
    const total = round3(lines.reduce((a, l) => a + l.total, 0));
    const balance = round3(num(user.balance));
    if (balance < total) throw new HttpError(402, `رصيدك غير كافٍ. المطلوب ${total.toFixed(2)} د.ل`);

    // حجز الأكواد للخدمات التلقائية
    const need = new Map();
    for (const l of lines) if (l.p.auto) need.set(l.sid, (need.get(l.sid) || 0) + l.qty);
    const pool = new Map();
    for (const [sid, q] of need) {
      const codes = await fsQuery(env, 'stock', { where: [['serviceId', '==', sid], ['status', '==', 'available']], limit: q, tx });
      if (codes.length < q) throw new HttpError(409, `الكمية المطلوبة من "${svcMap.get(sid).title}" غير متوفرة حالياً`);
      pool.set(sid, codes);
    }

    const writes = [];
    const orders = [];
    const now = new Date();
    for (const l of lines) {
      const oid = randId();
      const auto = l.p.auto;
      const codes = auto ? pool.get(l.sid).splice(0, l.qty) : [];
      writes.push(wCreate(env, `orders/${oid}`, {
        userId: uid,
        userName: user.name || user.username || '',
        userEmail: user.email || '',
        serviceId: l.sid,
        serviceTitle: l.p.title,
        serviceImage: l.p.image,
        serviceType: l.p.fieldType,
        targetInput: auto ? 'تسليم تلقائي' : l.p.enableQuantity ? (l.input ? `${l.input} — ${l.qty} قطعة` : `${l.qty} قطعة`) : (l.input || 'مباشر'),
        quantity: l.qty,
        contactPhone: contactPhone || user.phone || '',
        unitPrice: new Dbl(round3(l.total / l.qty)),
        totalPrice: new Dbl(l.total),
        status: auto ? 'completed' : 'pending',
        delivery: auto ? 'auto' : 'manual',
        codes: codes.map((c) => ({ k: c.k || 'a', iv: c.iv, ct: c.ct })),
        createdAt: SERVER_TIME,
        completedAt: auto ? SERVER_TIME : null,
        source: 'v2',
      }));
      for (const c of codes) writes.push(wUpdate(env, `stock/${c.id}`, { status: 'sold', orderId: oid, soldTo: uid, soldAt: SERVER_TIME }, { exists: true }));
      writes.push(wUpdate(env, `services/${l.sid}`, { soldCount: new Inc(l.qty), ...(auto ? { stockAvailable: new Inc(-l.qty) } : {}) }));
      if (auto) writes.push(wNotify(env, uid, 'تم تسليم طلبك', `${l.p.title} — الكود جاهز في طلباتي`, 'order', oid));
      orders.push({ id: oid, title: l.p.title, total: l.total, status: auto ? 'completed' : 'pending', auto });
    }
    const newBal = round3(balance - total);
    writes.push(wUpdate(env, `users/${uid}`, { balance: new Dbl(newBal) }, { exists: true }));
    writes.push(wCreate(env, `wallet_logs/${randId()}`, { uid, delta: new Dbl(-total), balanceAfter: new Dbl(newBal), reason: 'order', ref: orders.map((o) => o.id).join(','), createdAt: SERVER_TIME }));
    const result = { orders, total, balance: newBal, at: now.toISOString() };
    writes.push(wCreate(env, idemPath, { uid, result, createdAt: SERVER_TIME }));
    return { writes, result };
  });

  if (!result.duplicate) {
    const manual = result.orders.filter((o) => !o.auto);
    if (manual.length) ctx.waitUntil(pushAdmins(env, { title: 'طلب جديد', body: manual.map((o) => `${o.title} — ${o.total.toFixed(2)} د.ل`).join('\n') }));
    if (result.orders.some((o) => o.auto)) ctx.waitUntil(pushUser(env, uid, { title: 'تم تسليم طلبك', body: 'الكود جاهز في صفحة طلباتي' }));
  }
  return result;
}

function pubOrder(o) {
  return {
    id: o.id, serviceId: o.serviceId || '', title: o.serviceTitle || '', image: o.serviceImage || '',
    input: o.targetInput || '', quantity: int(o.quantity, 1), total: round3(num(o.totalPrice)),
    status: o.status || 'pending', delivery: o.delivery || 'manual', createdAt: o.createdAt || null,
    hasCodes: Array.isArray(o.codes) && o.codes.length > 0, note: o.deliveryNote || '', reason: o.rejectReason || '',
    contactPhone: o.contactPhone || '',
  };
}
async function handleMyOrders(env, uid) {
  const list = await fsQuery(env, 'orders', { where: [['userId', '==', uid]], limit: 1000 });
  return { orders: list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).slice(0, 300).map(pubOrder) };
}
async function decryptCodes(env, o) {
  const codes = [];
  for (const c of o.codes || []) { const t = await decSecret(env, c); if (t !== null) codes.push(t); }
  return codes;
}
async function handleOrderDetail(env, uid, id, admin = false) {
  if (!/^[\w-]{1,64}$/.test(id)) throw bad('طلب غير صالح');
  const o = await fsGet(env, `orders/${id}`);
  if (!o || (!admin && o.userId !== uid)) throw new HttpError(404, 'الطلب غير موجود');
  const out = { ...pubOrder(o), codes: o.status === 'completed' || admin ? await decryptCodes(env, o) : [] };
  if (admin) Object.assign(out, { userId: o.userId, userName: o.userName || '', userEmail: o.userEmail || '' });
  return out;
}

/* ============================== الإيداعات ============================== */

async function handleCreateDeposit(env, uid, body, ctx) {
  rateLimit('dep:' + uid, 6, 10 * 60e3);
  const settings = await getSettings(env);
  if (settings.maintenance && !isAdmin(env, uid)) throw new HttpError(503, 'المتجر في وضع الصيانة حالياً');
  const user = await requireProfile(env, uid);
  const method = str(body.method, { min: 1, max: 20, field: 'طريقة الإيداع' });
  const pm = settings.payments[method];
  if (!PAYMENT_KEYS.includes(method) || !pm || !pm.enabled) throw bad('طريقة الإيداع غير متاحة');

  const pending = await fsQuery(env, 'deposits', { where: [['userId', '==', uid], ['status', '==', 'pending']], limit: 6, select: ['status'] });
  if (pending.length >= 5) throw bad('لديك 5 طلبات إيداع قيد المراجعة، انتظر معالجتها');

  const range = { min: num(settings.depositMin, 1), max: num(settings.depositMax, 5000) };
  const doc = {
    userId: uid, userName: user.name || user.username || '', userEmail: user.email || '',
    method, provider: pm.label, status: 'pending', createdAt: SERVER_TIME, source: 'v2',
  };
  if (method === 'libyana' || method === 'madar') {
    const phone = normPhone(str(body.phone, { min: 9, max: 20, field: 'رقم هاتفك' }));
    if (!isLyPhone(phone)) throw bad('رقم الهاتف غير صحيح');
    doc.userPhone = phone;
    doc.amount = new Dbl(money(body.amount, { ...range }));
  } else if (method === 'cards') {
    const cp = str(body.cardProvider, { min: 1, max: 20, field: 'نوع الكرت' });
    if (!['libyana', 'madar'].includes(cp)) throw bad('نوع الكرت غير صالح');
    const code = str(body.cardCode, { min: 8, max: 30, field: 'رقم الكرت' }).replace(/[\s-]/g, '');
    if (!/^\d{8,24}$/.test(code)) throw bad('رقم الكرت يجب أن يكون أرقاماً فقط');
    doc.provider = `كرت ${cp === 'libyana' ? 'ليبيانا' : 'مدار'}`;
    doc.card_code = '•••• ' + code.slice(-4);
    doc.cardSecret = await encSecret(env, code);
    doc.amount = new Dbl(money(body.amount, { ...range }));
  } else if (method === 'onepay' || method === 'lypay') {
    doc.senderName = str(body.senderName, { min: 2, max: 60, field: 'اسم المحوّل' });
    doc.amount = new Dbl(money(body.amount, { ...range }));
  } else if (method === 'crypto') {
    doc.card_code = str(body.cryptoId, { min: 3, max: 80, field: 'معرّف الحساب' });
    const usd = money(body.usd, { min: 1, max: 10000, field: 'المبلغ بالدولار' });
    doc.crypto_amount = new Dbl(usd);
    doc.amount = new Dbl(round3(usd * num(settings.usdRate, 12)));
  }
  doc.userPhone = doc.userPhone || user.phone || '';
  const id = randId();
  await fsCommit(env, [wCreate(env, `deposits/${id}`, doc)]);
  ctx.waitUntil(pushAdmins(env, { title: 'طلب إيداع جديد', body: `${doc.provider} — ${doc.amount.v.toFixed(2)} د.ل — ${doc.userName}` }));
  return { id, amount: doc.amount.v };
}
function pubDeposit(d, admin = false) {
  const o = {
    id: d.id, method: d.method || '', provider: d.provider || '', amount: round3(num(d.amount)),
    approvedAmount: d.approvedAmount !== undefined && d.approvedAmount !== null ? round3(num(d.approvedAmount)) : null,
    status: d.status || 'pending', createdAt: d.createdAt || null, reason: d.rejectReason || '',
    ref: d.card_code || d.senderName || d.userPhone || '', crypto: d.crypto_amount ? num(d.crypto_amount) : null,
  };
  if (admin) Object.assign(o, { userId: d.userId, userName: d.userName || '', userEmail: d.userEmail || '', userPhone: d.userPhone || '', senderName: d.senderName || '', hasSecret: !!d.cardSecret });
  return o;
}
async function handleMyDeposits(env, uid) {
  const list = await fsQuery(env, 'deposits', { where: [['userId', '==', uid]], limit: 500 });
  return { deposits: list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).slice(0, 200).map((d) => pubDeposit(d)) };
}

/* ============================== الإشعارات للمستخدم ============================== */

async function handleNotifications(env, uid) {
  const u = await requireProfile(env, uid);
  const since = tsMs(u.notifReadAt);
  const [mine, all] = await Promise.all([
    fsQuery(env, 'notifications', { parent: `users/${uid}`, orderBy: [['createdAt', 'desc']], limit: 60 }),
    fsQuery(env, 'broadcasts', { orderBy: [['createdAt', 'desc']], limit: 30 }),
  ]);
  const list = [...mine, ...all]
    .map((n) => ({ id: n.id, title: n.title || '', body: n.body || '', type: n.type || 'info', ref: n.ref || '', createdAt: n.createdAt, unread: tsMs(n.createdAt) > since }))
    .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
    .slice(0, 80);
  if (list.some((n) => n.unread)) await fsCommit(env, [wUpdate(env, `users/${uid}`, { notifReadAt: SERVER_TIME }, { exists: true })]);
  return { notifications: list };
}
async function handlePushRegister(env, uid, body, asAdmin) {
  const token = str(body.token, { min: 20, max: 4096, field: 'token' });
  const id = await hmacId(env, 'push:' + token);
  await fsCommit(env, [wUpdate(env, `push_tokens/${id}`, { uid, token, admin: !!asAdmin, createdAt: SERVER_TIME }, { replace: true })]);
  return { ok: true };
}

/* ============================== لوحة الإدارة ============================== */

function wAdminLog(env, adminUid, action, ref, data = {}) {
  return wCreate(env, `admin_logs/${randId()}`, { uid: adminUid, action, ref, data, createdAt: SERVER_TIME });
}

async function handleStats(env) {
  return cached('https://gl-cache.internal/stats-v3', 60, async () => {
    const since = new Date(Date.now() - 30 * 864e5);
    // كل جزء يُحسب لوحده: لو جزء فشل، الباقي يظهر عادي مع تنبيه
    const parts = [
      ['orders', () => fsQuery(env, 'orders', { where: [['createdAt', '>=', since]], limit: 8000, select: ['createdAt', 'totalPrice', 'status', 'serviceTitle', 'serviceId', 'delivery'] }), []],
      ['deposits', () => fsQuery(env, 'deposits', { where: [['createdAt', '>=', since]], limit: 8000, select: ['createdAt', 'amount', 'approvedAmount', 'status', 'provider', 'method'] }), []],
      ['users', () => fsAgg(env, 'users', [], { n: ['count'], bal: ['sum', 'balance'] }), { n: 0, bal: 0 }],
      ['pendingOrders', () => fsAgg(env, 'orders', [['status', '==', 'pending']], { c: ['count'] }), { c: 0 }],
      ['pendingDeposits', () => fsAgg(env, 'deposits', [['status', '==', 'pending']], { c: ['count'] }), { c: 0 }],
      ['revenueAll', () => fsAgg(env, 'orders', [['status', '==', 'completed']], { c: ['count'], s: ['sum', 'totalPrice'] }), { c: 0, s: 0 }],
      ['stock', () => fsAgg(env, 'stock', [['status', '==', 'available']], { c: ['count'] }), { c: 0 }],
    ];
    const settled = await Promise.allSettled(parts.map(([, fn]) => fn()));
    const warnings = [];
    const [orders, deposits, usersAgg0, pendO, pendD, revAll, stockAgg] = settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.error('stats part', parts[i][0], r.reason?.message);
      warnings.push(`${parts[i][0]}: ${String(r.reason?.message || r.reason).slice(0, 220)}`);
      return parts[i][2];
    });
    const usersAgg = { count: usersAgg0.n, balance: usersAgg0.bal };
    const dayKey = (iso) => new Date(tsMs(iso) + TZ_OFFSET_MS).toISOString().slice(0, 10);
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const k = new Date(Date.now() + TZ_OFFSET_MS - i * 864e5).toISOString().slice(0, 10);
      days.push({ day: k, revenue: 0, orders: 0, deposits: 0 });
    }
    const dmap = new Map(days.map((d) => [d.day, d]));
    const top = new Map();
    let autoCount = 0;
    for (const o of orders) {
      const d = dmap.get(dayKey(o.createdAt));
      if (o.status === 'completed') {
        const v = num(o.totalPrice);
        if (d) { d.revenue = round3(d.revenue + v); }
        const k = o.serviceTitle || '—';
        const t = top.get(k) || { title: k, count: 0, revenue: 0 };
        t.count++; t.revenue = round3(t.revenue + v); top.set(k, t);
        if (o.delivery === 'auto') autoCount++;
      }
      if (d && o.status !== 'rejected') d.orders++;
    }
    const methods = new Map();
    for (const dp of deposits) {
      if (dp.status !== 'approved') continue;
      const v = num(dp.approvedAmount ?? dp.amount);
      const d = dmap.get(dayKey(dp.createdAt));
      if (d) d.deposits = round3(d.deposits + v);
      const k = dp.provider || dp.method || '—';
      methods.set(k, round3((methods.get(k) || 0) + v));
    }
    const todayK = days[days.length - 1].day;
    const sumDays = (n, f) => round3(days.slice(-n).reduce((a, d) => a + d[f], 0));
    return {
      kpi: {
        revenueToday: dmap.get(todayK).revenue, revenue7: sumDays(7, 'revenue'), revenue30: sumDays(30, 'revenue'),
        revenueAll: round3(revAll.s), ordersCompletedAll: revAll.c, pendingOrders: pendO.c, pendingDeposits: pendD.c,
        users: usersAgg.count, balances: round3(usersAgg.balance), deposits30: sumDays(30, 'deposits'), stockAvailable: stockAgg.c,
        autoOrders30: autoCount,
      },
      days,
      top: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      methods: [...methods.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      warnings,
      at: Date.now(),
    };
  });
}

async function handleAdminOrders(env, url) {
  const status = url.searchParams.get('status') || 'all';
  let list;
  if (status === 'pending') list = await fsQuery(env, 'orders', { where: [['status', '==', 'pending']], limit: 1000 });
  else list = await fsQuery(env, 'orders', { orderBy: [['createdAt', 'desc']], limit: 400 });
  if (status !== 'all' && status !== 'pending') list = list.filter((o) => o.status === status);
  list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  return { orders: list.slice(0, 400).map((o) => ({ ...pubOrder(o), userId: o.userId || '', userName: o.userName || '', userEmail: o.userEmail || '' })) };
}
async function handleOrderComplete(env, admin, id, body, ctx) {
  const note = str(body.note, { max: 300, field: 'الملاحظة' });
  const delivery = str(body.delivery, { max: 2000, field: 'بيانات التسليم' });
  const encd = delivery ? await encSecret(env, delivery) : null;
  const o = await fsTx(env, async (tx) => {
    const o = await fsGet(env, `orders/${id}`, tx);
    if (!o) throw new HttpError(404, 'الطلب غير موجود');
    if (o.status !== 'pending') throw bad('تمت معالجة هذا الطلب مسبقاً');
    const upd = { status: 'completed', completedAt: SERVER_TIME, processedBy: admin.uid, deliveryNote: note };
    if (encd) upd.codes = [...(o.codes || []), encd];
    const writes = [wUpdate(env, `orders/${id}`, upd, { exists: true }), wAdminLog(env, admin.uid, 'order.complete', id)];
    if (o.userId) writes.push(wNotify(env, o.userId, 'تم تنفيذ طلبك', `${o.serviceTitle || 'طلبك'}${note ? ' — ' + note : ''}`, 'order', id));
    return { writes, result: o };
  });
  if (o.userId) ctx.waitUntil(pushUser(env, o.userId, { title: 'تم تنفيذ طلبك', body: o.serviceTitle || '' }));
  return { ok: true };
}
async function handleOrderReject(env, admin, id, body, ctx) {
  const reason = str(body.reason, { max: 300, field: 'سبب الرفض' });
  const o = await fsTx(env, async (tx) => {
    const o = await fsGet(env, `orders/${id}`, tx);
    if (!o) throw new HttpError(404, 'الطلب غير موجود');
    if (o.status !== 'pending') throw bad('تمت معالجة هذا الطلب مسبقاً');
    const amount = round3(num(o.totalPrice));
    const writes = [wUpdate(env, `orders/${id}`, { status: 'rejected', rejectReason: reason, processedAt: SERVER_TIME, processedBy: admin.uid }, { exists: true })];
    if (o.userId && amount > 0) {
      const u = await fsGet(env, `users/${o.userId}`, tx);
      if (u) {
        writes.push(wUpdate(env, `users/${o.userId}`, { balance: new Inc(amount) }, { exists: true }));
        writes.push(wCreate(env, `wallet_logs/${randId()}`, { uid: o.userId, delta: new Dbl(amount), balanceAfter: new Dbl(round3(num(u.balance) + amount)), reason: 'refund', ref: id, createdAt: SERVER_TIME }));
        writes.push(wNotify(env, o.userId, 'تم رفض طلبك وإرجاع المبلغ', `${o.serviceTitle || ''} — أُرجع ${amount.toFixed(2)} د.ل لمحفظتك${reason ? ' — ' + reason : ''}`, 'order', id));
      }
    }
    writes.push(wAdminLog(env, admin.uid, 'order.reject', id, { amount, reason }));
    return { writes, result: o };
  });
  if (o.userId) ctx.waitUntil(pushUser(env, o.userId, { title: 'تم رفض طلبك وإرجاع المبلغ', body: o.serviceTitle || '' }));
  return { ok: true };
}
async function handleOrdersDelete(env, admin, body) {
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 200) : [];
  if (!ids.length) throw bad('لم يتم تحديد طلبات');
  const docs = await fsGetMany(env, ids.filter((i) => /^[\w-]{1,64}$/.test(i)).map((i) => `orders/${i}`));
  const deletable = docs.filter((o) => o && o.status !== 'pending');
  await fsCommit(env, [...deletable.map((o) => wDelete(env, `orders/${o.id}`)), wAdminLog(env, admin.uid, 'orders.delete', '', { count: deletable.length })]);
  return { deleted: deletable.length, skipped: ids.length - deletable.length };
}

async function handleAdminDeposits(env, url) {
  const status = url.searchParams.get('status') || 'pending';
  let list;
  if (status === 'pending') list = await fsQuery(env, 'deposits', { where: [['status', '==', 'pending']], limit: 1000 });
  else list = await fsQuery(env, 'deposits', { orderBy: [['createdAt', 'desc']], limit: 400 });
  if (status !== 'all' && status !== 'pending') list = list.filter((d) => d.status === status);
  list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  return { deposits: list.slice(0, 400).map((d) => pubDeposit(d, true)) };
}
async function handleDepositSecret(env, admin, id) {
  const d = await fsGet(env, `deposits/${id}`);
  if (!d) throw new HttpError(404, 'غير موجود');
  const code = d.cardSecret ? await decSecret(env, d.cardSecret) : d.card_code || '';
  await fsCommit(env, [wAdminLog(env, admin.uid, 'deposit.reveal', id)]);
  return { code: code || '' };
}
async function handleDepositApprove(env, admin, id, body, ctx) {
  const override = body.amount !== undefined && body.amount !== null && body.amount !== '' ? money(body.amount, { min: 0.001, max: 100000 }) : null;
  const d = await fsTx(env, async (tx) => {
    const d = await fsGet(env, `deposits/${id}`, tx);
    if (!d) throw new HttpError(404, 'الإيداع غير موجود');
    if (d.status !== 'pending') throw bad('تمت معالجة هذا الإيداع مسبقاً');
    const amount = override ?? round3(num(d.amount));
    if (!(amount > 0)) throw bad('المبلغ غير صالح');
    const u = await fsGet(env, `users/${d.userId}`, tx);
    if (!u) throw bad('حساب المستخدم غير موجود');
    const after = round3(num(u.balance) + amount);
    return {
      writes: [
        wUpdate(env, `deposits/${id}`, { status: 'approved', approvedAmount: new Dbl(amount), processedAt: SERVER_TIME, processedBy: admin.uid }, { exists: true }),
        wUpdate(env, `users/${d.userId}`, { balance: new Inc(amount) }, { exists: true }),
        wCreate(env, `wallet_logs/${randId()}`, { uid: d.userId, delta: new Dbl(amount), balanceAfter: new Dbl(after), reason: 'deposit', ref: id, createdAt: SERVER_TIME }),
        wNotify(env, d.userId, 'تمت إضافة رصيد', `تم إيداع ${amount.toFixed(2)} د.ل في محفظتك`, 'deposit', id),
        wAdminLog(env, admin.uid, 'deposit.approve', id, { amount }),
      ],
      result: { ...d, amount },
    };
  });
  ctx.waitUntil(pushUser(env, d.userId, { title: 'تمت إضافة رصيد', body: `${d.amount.toFixed(2)} د.ل` }));
  return { ok: true };
}
async function handleDepositReject(env, admin, id, body, ctx) {
  const reason = str(body.reason, { max: 300, field: 'سبب الرفض' });
  const d = await fsTx(env, async (tx) => {
    const d = await fsGet(env, `deposits/${id}`, tx);
    if (!d) throw new HttpError(404, 'الإيداع غير موجود');
    if (d.status !== 'pending') throw bad('تمت معالجة هذا الإيداع مسبقاً');
    return {
      writes: [
        wUpdate(env, `deposits/${id}`, { status: 'rejected', rejectReason: reason, processedAt: SERVER_TIME, processedBy: admin.uid }, { exists: true }),
        wNotify(env, d.userId, 'تم رفض طلب الإيداع', reason || 'تواصل مع الدعم للمزيد', 'deposit', id),
        wAdminLog(env, admin.uid, 'deposit.reject', id, { reason }),
      ],
      result: d,
    };
  });
  ctx.waitUntil(pushUser(env, d.userId, { title: 'تم رفض طلب الإيداع', body: reason || '' }));
  return { ok: true };
}

async function handleAdminCatalog(env) {
  const [cats, svcs] = await Promise.all([fsQuery(env, 'categories', { limit: 1000 }), fsQuery(env, 'services', { limit: 3000 })]);
  return {
    categories: cats.map(pubCategory).sort((a, b) => a.order - b.order),
    services: svcs.map((s) => ({ ...pubService(s), autoDelivery: !!s.autoDelivery, stockAvailable: int(s.stockAvailable) })).sort((a, b) => a.order - b.order),
  };
}
async function handleSaveCategory(env, admin, body) {
  const data = {
    name: str(body.name, { min: 1, max: 40, field: 'اسم القسم' }),
    image: imageUrl(body.image),
    order: int(body.order, 0),
    hidden: bool(body.hidden),
  };
  let id = body.id ? str(body.id, { max: 64 }) : '';
  if (id && !/^[\w-]+$/.test(id)) throw bad('معرّف غير صالح');
  if (id) await fsCommit(env, [wUpdate(env, `categories/${id}`, data, { exists: true }), wAdminLog(env, admin.uid, 'category.update', id)]);
  else { id = randId(); await fsCommit(env, [wCreate(env, `categories/${id}`, { ...data, createdAt: SERVER_TIME }), wAdminLog(env, admin.uid, 'category.create', id)]); }
  await purgeCache();
  return { id };
}
async function handleDeleteCategory(env, admin, id) {
  const svcs = await fsQuery(env, 'services', { where: [['category', '==', id]], limit: 1, select: ['category'] });
  if (svcs.length) throw bad('القسم يحتوي على خدمات، انقلها أو احذفها أولاً');
  await fsCommit(env, [wDelete(env, `categories/${id}`), wAdminLog(env, admin.uid, 'category.delete', id)]);
  await purgeCache();
  return { ok: true };
}
async function handleSaveService(env, admin, body) {
  const fieldType = FIELD_TYPES.includes(body.fieldType) ? body.fieldType : 'id';
  const data = {
    title: str(body.title, { min: 1, max: 80, field: 'اسم الخدمة' }),
    category: str(body.category, { min: 1, max: 64, field: 'القسم' }),
    price: new Dbl(money(body.price, { min: 0, max: 100000, field: 'السعر' })),
    discount: clamp(int(body.discount), 0, 90),
    image: imageUrl(body.image),
    description: str(body.description, { max: 1500, field: 'الوصف' }),
    status: bool(body.status),
    fieldType, type: fieldType,
    fieldEnabled: bool(body.fieldEnabled),
    fieldCustomLabel: str(body.fieldCustomLabel, { max: 60, field: 'عنوان الحقل' }),
    enableQuantity: bool(body.enableQuantity),
    autoDelivery: bool(body.autoDelivery) && !bool(body.enableQuantity),
    badge: str(body.badge, { max: 16, field: 'الشارة' }),
    order: int(body.order, 0),
  };
  if (data.enableQuantity) {
    data.qtyMin = clamp(int(body.qtyMin, 30), 1, 1e7);
    data.qtyMax = clamp(int(body.qtyMax, 100), data.qtyMin, 1e8);
  }
  if (!(await fsGet(env, `categories/${data.category}`))) throw bad('القسم غير موجود');
  let id = body.id ? str(body.id, { max: 64 }) : '';
  if (id && !/^[\w-]+$/.test(id)) throw bad('معرّف غير صالح');
  if (id) await fsCommit(env, [wUpdate(env, `services/${id}`, data, { exists: true }), wAdminLog(env, admin.uid, 'service.update', id)]);
  else {
    id = randId();
    await fsCommit(env, [wCreate(env, `services/${id}`, { ...data, stockAvailable: 0, soldCount: 0, createdAt: SERVER_TIME }), wAdminLog(env, admin.uid, 'service.create', id)]);
  }
  await purgeCache();
  return { id };
}
async function handleDeleteService(env, admin, id) {
  const avail = await fsQuery(env, 'stock', { where: [['serviceId', '==', id], ['status', '==', 'available']], limit: 1, select: ['status'] });
  if (avail.length) throw bad('الخدمة فيها أكواد متاحة، احذف الأكواد أولاً');
  await fsCommit(env, [wDelete(env, `services/${id}`), wAdminLog(env, admin.uid, 'service.delete', id)]);
  await purgeCache();
  return { ok: true };
}
async function handleStockList(env, id) {
  const list = await fsQuery(env, 'stock', { where: [['serviceId', '==', id]], limit: 2000, select: ['status', 'hint', 'addedAt', 'soldAt', 'orderId'] });
  list.sort((a, b) => (a.status === b.status ? tsMs(b.addedAt) - tsMs(a.addedAt) : a.status === 'available' ? -1 : 1));
  return {
    available: list.filter((c) => c.status === 'available').length,
    sold: list.filter((c) => c.status === 'sold').length,
    codes: list.slice(0, 500).map((c) => ({ id: c.id, status: c.status, hint: c.hint || '', addedAt: c.addedAt, soldAt: c.soldAt || null, orderId: c.orderId || '' })),
  };
}
async function handleStockAdd(env, admin, id, body) {
  const svc = await fsGet(env, `services/${id}`);
  if (!svc) throw new HttpError(404, 'الخدمة غير موجودة');
  const raw = Array.isArray(body.codes) ? body.codes : [];
  const codes = [...new Set(raw.map((c) => (typeof c === 'string' ? c.trim() : '')).filter((c) => c.length >= 3 && c.length <= 500))];
  if (!codes.length) throw bad('أدخل كوداً واحداً على الأقل');
  if (codes.length > 400) throw bad('الحد الأقصى 400 كود في المرة الواحدة');
  const ids = await Promise.all(codes.map((c) => hmacId(env, 'code:' + c)));
  const existing = await fsGetMany(env, ids.map((x) => `stock/${x}`));
  const writes = [];
  let added = 0;
  for (let i = 0; i < codes.length; i++) {
    if (existing[i]) continue;
    const e = await encSecret(env, codes[i]);
    const c = codes[i];
    writes.push(wCreate(env, `stock/${ids[i]}`, { serviceId: id, status: 'available', ...e, hint: (c.length > 6 ? '••••' : '') + c.slice(-4), addedAt: SERVER_TIME, addedBy: admin.uid }));
    added++;
  }
  if (added) {
    writes.push(wUpdate(env, `services/${id}`, { stockAvailable: new Inc(added) }, { exists: true }));
    writes.push(wAdminLog(env, admin.uid, 'stock.add', id, { added }));
    await fsCommit(env, writes);
    await purgeCache();
  }
  return { added, duplicates: codes.length - added };
}
async function handleStockDelete(env, admin, codeId) {
  if (!/^[a-f0-9]{40}$/.test(codeId)) throw bad('معرّف غير صالح');
  await fsTx(env, async (tx) => {
    const c = await fsGet(env, `stock/${codeId}`, tx);
    if (!c) throw new HttpError(404, 'الكود غير موجود');
    if (c.status !== 'available') throw bad('لا يمكن حذف كود مباع');
    return { writes: [wDelete(env, `stock/${codeId}`), wUpdate(env, `services/${c.serviceId}`, { stockAvailable: new Inc(-1) }), wAdminLog(env, admin.uid, 'stock.delete', codeId)] };
  });
  await purgeCache();
  return { ok: true };
}

async function handleUpload(env, admin, body, reqUrl) {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
  if (!m) throw bad('صيغة الصورة غير مدعومة (WebP / JPG / PNG)');
  const bytes = b64ToBytes(m[2]);
  if (bytes.length > 700 * 1024) throw bad('حجم الصورة كبير، الحد 700KB');
  const sig = [...bytes.slice(0, 12)];
  const isPng = sig[0] === 0x89 && sig[1] === 0x50;
  const isJpg = sig[0] === 0xff && sig[1] === 0xd8;
  const isWebp = sig[0] === 0x52 && sig[1] === 0x49 && sig[8] === 0x57 && sig[9] === 0x45;
  const ok = (m[1] === 'image/png' && isPng) || (m[1] === 'image/jpeg' && isJpg) || (m[1] === 'image/webp' && isWebp);
  if (!ok) throw bad('ملف الصورة تالف أو غير صحيح');
  const id = randId(24);
  await fsCommit(env, [
    wCreate(env, `media/${id}`, { type: m[1], size: bytes.length, b64: m[2], createdAt: SERVER_TIME, by: admin.uid }),
  ]);
  return { url: `${new URL(reqUrl).origin}/img/${id}` };
}
const IMG_MEM = new Map();
async function serveImage(env, id, req, ctx) {
  if (!/^[A-Za-z0-9]{24}$/.test(id)) return new Response('Not found', { status: 404 });
  const cache = caches.default;
  const key = new Request(new URL(req.url).toString(), { method: 'GET' });
  try { const hit = await cache.match(key); if (hit) return hit; } catch {}
  let d = IMG_MEM.get(id);
  if (!d) {
    d = await fsGet(env, `media/${id}`);
    if (!d || !d.b64) return new Response('Not found', { status: 404 });
    d = { type: d.type, bytes: b64ToBytes(d.b64) };
    IMG_MEM.set(id, d);
    if (IMG_MEM.size > 150) IMG_MEM.delete(IMG_MEM.keys().next().value);
  }
  const res = new Response(d.bytes, {
    headers: {
      'content-type': d.type,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'access-control-allow-origin': '*',
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return res;
}

async function handleAdminUsers(env, url) {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 60);
  const users = await cached('https://gl-cache.internal/users-v3', 30, async () =>
    (await fsQuery(env, 'users', { limit: 5000, select: ['name', 'username', 'phone', 'email', 'balance', 'createdAt', 'blocked'] }))
      .map((u) => ({ uid: u.id, name: u.name || u.username || '', phone: u.phone || '', email: u.email || '', balance: round3(num(u.balance)), createdAt: u.createdAt || null, blocked: u.blocked === true })));
  let list = users;
  if (q) list = users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.phone.includes(q) || u.uid === q);
  list = [...list].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  return { total: users.length, users: list.slice(0, 150) };
}
async function handleAdminUserDetail(env, uid) {
  const u = await fsGet(env, `users/${uid}`);
  if (!u) throw new HttpError(404, 'المستخدم غير موجود');
  const [orders, deposits, logs] = await Promise.all([
    fsQuery(env, 'orders', { where: [['userId', '==', uid]], limit: 500 }),
    fsQuery(env, 'deposits', { where: [['userId', '==', uid]], limit: 500 }),
    fsQuery(env, 'wallet_logs', { where: [['uid', '==', uid]], limit: 500 }),
  ]);
  const byDate = (a, b) => tsMs(b.createdAt) - tsMs(a.createdAt);
  return {
    user: { ...pubUser(u, uid), blocked: u.blocked === true },
    orders: orders.sort(byDate).slice(0, 50).map(pubOrder),
    deposits: deposits.sort(byDate).slice(0, 50).map((d) => pubDeposit(d, true)),
    logs: logs.sort(byDate).slice(0, 50).map((l) => ({ delta: num(l.delta), after: num(l.balanceAfter), reason: l.reason || '', note: l.note || '', createdAt: l.createdAt })),
    spent: round3(orders.filter((o) => o.status === 'completed').reduce((a, o) => a + num(o.totalPrice), 0)),
  };
}
async function handleAdjustBalance(env, admin, uid, body) {
  const delta = money(body.delta, { min: -100000, max: 100000, field: 'المبلغ' });
  if (delta === 0) throw bad('المبلغ لا يمكن أن يكون صفراً');
  const note = str(body.note, { max: 200, field: 'السبب' });
  const after = await fsTx(env, async (tx) => {
    const u = await fsGet(env, `users/${uid}`, tx);
    if (!u) throw new HttpError(404, 'المستخدم غير موجود');
    const after = round3(num(u.balance) + delta);
    if (after < 0) throw bad('الرصيد لا يمكن أن يصبح سالباً');
    const writes = [
      wUpdate(env, `users/${uid}`, { balance: new Dbl(after) }, { exists: true }),
      wCreate(env, `wallet_logs/${randId()}`, { uid, delta: new Dbl(delta), balanceAfter: new Dbl(after), reason: 'admin', note, by: admin.uid, createdAt: SERVER_TIME }),
      wAdminLog(env, admin.uid, 'user.balance', uid, { delta, note }),
    ];
    if (delta > 0) writes.push(wNotify(env, uid, 'تمت إضافة رصيد', `تمت إضافة ${delta.toFixed(2)} د.ل لمحفظتك${note ? ' — ' + note : ''}`, 'deposit'));
    return { writes, result: after };
  });
  return { balance: after };
}
async function handleBlockUser(env, admin, uid, body) {
  const blocked = bool(body.blocked);
  await fsCommit(env, [wUpdate(env, `users/${uid}`, { blocked }, { exists: true }), wAdminLog(env, admin.uid, blocked ? 'user.block' : 'user.unblock', uid)]);
  return { ok: true };
}
async function handleBroadcast(env, admin, body, ctx) {
  const title = str(body.title, { min: 2, max: 80, field: 'العنوان' });
  const text = str(body.body, { min: 2, max: 400, field: 'نص الإشعار' });
  const target = body.target === 'all' ? 'all' : str(body.target, { min: 1, max: 128, field: 'المستخدم' });
  if (target !== 'all' && !(await fsGet(env, `users/${target}`))) throw bad('المستخدم غير موجود');
  await fsCommit(env, [wNotify(env, target, title, text, 'admin'), wAdminLog(env, admin.uid, 'notify', target, { title })]);
  if (target === 'all') {
    ctx.waitUntil((async () => {
      const tokens = await fsQuery(env, 'push_tokens', { where: [['admin', '==', false]], limit: 3000 });
      for (let i = 0; i < tokens.length; i += 50) await sendPush(env, tokens.slice(i, i + 50), { title, body: text, link: siteUrl(env) + '#/notifications' });
    })());
  } else ctx.waitUntil(pushUser(env, target, { title, body: text }));
  return { ok: true };
}
async function handleSaveSettings(env, admin, body) {
  const cur = await getSettings(env);
  const s = { ...cur };
  if (body.maintenance !== undefined) s.maintenance = bool(body.maintenance);
  if (body.maintenanceMsg !== undefined) s.maintenanceMsg = str(body.maintenanceMsg, { max: 300, field: 'رسالة الصيانة' });
  if (body.maintenanceUntil !== undefined) {
    const v = str(body.maintenanceUntil, { max: 40 });
    s.maintenanceUntil = v && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : '';
  }
  if (body.announcement !== undefined) s.announcement = str(body.announcement, { max: 200, field: 'الإعلان' });
  if (body.usdRate !== undefined) s.usdRate = money(body.usdRate, { min: 1, max: 100, field: 'سعر الدولار' });
  if (body.depositMin !== undefined) s.depositMin = money(body.depositMin, { min: 0.5, max: 100000, field: 'أقل إيداع' });
  if (body.depositMax !== undefined) s.depositMax = money(body.depositMax, { min: 1, max: 1000000, field: 'أعلى إيداع' });
  if (s.depositMax < s.depositMin) throw bad('أعلى إيداع أقل من أقل إيداع');
  if (body.supportWhatsapp !== undefined) s.supportWhatsapp = str(body.supportWhatsapp, { max: 20, field: 'رقم الدعم' }).replace(/[^\d+]/g, '');
  if (body.social && typeof body.social === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS.social)) {
      if (body.social[k] !== undefined) {
        const v = str(body.social[k], { max: 200, field: 'رابط' });
        if (v && !/^https:\/\/[^\s"'<>]+$/.test(v)) throw bad('روابط التواصل يجب أن تبدأ بـ https://');
        s.social[k] = v;
      }
    }
  }
  if (body.payments && typeof body.payments === 'object') {
    for (const k of PAYMENT_KEYS) {
      const p = body.payments[k];
      if (!p || typeof p !== 'object') continue;
      s.payments[k] = {
        enabled: bool(p.enabled),
        label: str(p.label, { min: 1, max: 40, field: 'اسم الطريقة' }),
        number: str(p.number, { max: 60, field: 'الرقم/الحساب' }),
        note: str(p.note, { max: 200, field: 'الملاحظة' }),
        image: imageUrl(p.image),
      };
    }
  }
  if (Array.isArray(body.banners)) {
    s.banners = body.banners.slice(0, 8).map((b) => {
      const ctaType = CTA_TYPES.includes(b.ctaType) ? b.ctaType : 'none';
      return {
        image: imageUrl(b.image),
        title: str(b.title, { max: 60, field: 'عنوان البانر' }),
        subtitle: str(b.subtitle, { max: 80, field: 'وصف البانر' }),
        ctaType,
        ctaLabel: str(b.ctaLabel, { max: 20, field: 'نص الزر' }),
        ctaValue: ctaValue(ctaType, b.ctaValue),
      };
    }).filter((b) => b.image);
  }
  if (body.support && typeof body.support === 'object') {
    const phones = Array.isArray(body.support.phones) ? body.support.phones.slice(0, 6) : [];
    const channels = Array.isArray(body.support.channels) ? body.support.channels.slice(0, 10) : [];
    s.support = {
      phones: phones.map((p) => ({
        label: str(p.label, { max: 30, field: 'اسم الرقم' }),
        number: phoneDigits(p.number, 'رقم الدعم'),
        whatsapp: bool(p.whatsapp),
        call: bool(p.call),
      })).filter((p) => p.number),
      channels: channels.map((c) => {
        const type = CHANNEL_TYPES.includes(c.type) ? c.type : 'website';
        const url = str(c.url, { max: 300, field: 'رابط القناة' });
        if (url && !/^https:\/\/[^\s"'<>]+$/.test(url)) throw bad('روابط القنوات يجب أن تبدأ بـ https://');
        return { type, label: str(c.label, { max: 30, field: 'اسم القناة' }), url };
      }).filter((c) => c.url),
    };
  }
  await fsCommit(env, [wUpdate(env, 'settings/site', s, { replace: true }), wAdminLog(env, admin.uid, 'settings.update', 'site')]);
  await purgeCache();
  return { settings: s };
}

/* ============================== الراوتر ============================== */

function corsHeaders(req, env) {
  const origin = req.headers.get('origin') || '';
  const h = {
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (allowedOrigins(env).includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
function json(req, env, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...corsHeaders(req, env),
      ...extra,
    },
  });
}

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

route('GET', '/api/health', async () => ({ ok: true }));
route('GET', '/api/config', async ({ env }) => cached(CONFIG_KEY, 30, async () => {
  const s = await getSettings(env);
  return { turnstileSiteKey: env.TURNSTILE_SITE_KEY || '', vapidKey: env.FCM_VAPID_PUBLIC_KEY || '', settings: s };
}));
route('GET', '/api/catalog', async ({ env }) => cached(CATALOG_KEY, 30, () => buildCatalog(env)));
route('POST', '/api/auth/signup', ({ req, env, body, ip }) => handleSignup(req, env, body, ip));
route('POST', '/api/auth/login', ({ req, env, body, ip }) => handleLogin(req, env, body, ip));

route('GET', '/api/me', async ({ req, env }) => handleMe(env, (await authUser(req, env)).uid));
route('PATCH', '/api/me', async ({ req, env, body }) => handleUpdateMe(env, (await authUser(req, env)).uid, body));
route('POST', '/api/orders', async ({ req, env, body, ctx }) => handleCreateOrder(env, (await authUser(req, env)).uid, body, ctx));
route('GET', '/api/orders', async ({ req, env }) => handleMyOrders(env, (await authUser(req, env)).uid));
route('GET', '/api/orders/([\\w-]+)', async ({ req, env, m }) => handleOrderDetail(env, (await authUser(req, env)).uid, m[1]));
route('POST', '/api/deposits', async ({ req, env, body, ctx }) => handleCreateDeposit(env, (await authUser(req, env)).uid, body, ctx));
route('GET', '/api/deposits', async ({ req, env }) => handleMyDeposits(env, (await authUser(req, env)).uid));
route('GET', '/api/notifications', async ({ req, env }) => handleNotifications(env, (await authUser(req, env)).uid));
route('POST', '/api/push', async ({ req, env, body }) => {
  const u = await authUser(req, env);
  return handlePushRegister(env, u.uid, body, body.admin === true && isAdmin(env, u.uid));
});

const A = (fn) => async (c) => {
  const admin = await authAdmin(c.req, c.env);
  try { return await fn({ ...c, admin }); }
  catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('ADMIN ERR', c.url.pathname, e && e.stack ? e.stack : e);
    // التفاصيل تظهر للأدمن فقط (بعد التحقق من الصلاحية) لتسهيل التشخيص
    throw new HttpError(500, 'خطأ داخلي: ' + String(e && e.message ? e.message : e).slice(0, 300));
  }
};
route('GET', '/api/admin/me', A(async ({ admin }) => ({ uid: admin.uid, email: admin.email })));
route('GET', '/api/admin/stats', A(({ env }) => handleStats(env)));
route('GET', '/api/admin/orders', A(({ env, url }) => handleAdminOrders(env, url)));
route('GET', '/api/admin/orders/([\\w-]+)', A(({ env, admin, m }) => handleOrderDetail(env, admin.uid, m[1], true)));
route('POST', '/api/admin/orders/([\\w-]+)/complete', A(({ env, admin, m, body, ctx }) => handleOrderComplete(env, admin, m[1], body, ctx)));
route('POST', '/api/admin/orders/([\\w-]+)/reject', A(({ env, admin, m, body, ctx }) => handleOrderReject(env, admin, m[1], body, ctx)));
route('POST', '/api/admin/orders-delete', A(({ env, admin, body }) => handleOrdersDelete(env, admin, body)));
route('GET', '/api/admin/deposits', A(({ env, url }) => handleAdminDeposits(env, url)));
route('GET', '/api/admin/deposits/([\\w-]+)/secret', A(({ env, admin, m }) => handleDepositSecret(env, admin, m[1])));
route('POST', '/api/admin/deposits/([\\w-]+)/approve', A(({ env, admin, m, body, ctx }) => handleDepositApprove(env, admin, m[1], body, ctx)));
route('POST', '/api/admin/deposits/([\\w-]+)/reject', A(({ env, admin, m, body, ctx }) => handleDepositReject(env, admin, m[1], body, ctx)));
route('GET', '/api/admin/catalog', A(({ env }) => handleAdminCatalog(env)));
route('POST', '/api/admin/categories', A(({ env, admin, body }) => handleSaveCategory(env, admin, body)));
route('DELETE', '/api/admin/categories/([\\w-]+)', A(({ env, admin, m }) => handleDeleteCategory(env, admin, m[1])));
route('POST', '/api/admin/services', A(({ env, admin, body }) => handleSaveService(env, admin, body)));
route('DELETE', '/api/admin/services/([\\w-]+)', A(({ env, admin, m }) => handleDeleteService(env, admin, m[1])));
route('GET', '/api/admin/services/([\\w-]+)/stock', A(({ env, m }) => handleStockList(env, m[1])));
route('POST', '/api/admin/services/([\\w-]+)/stock', A(({ env, admin, m, body }) => handleStockAdd(env, admin, m[1], body)));
route('DELETE', '/api/admin/stock/([\\w-]+)', A(({ env, admin, m }) => handleStockDelete(env, admin, m[1])));
route('POST', '/api/admin/upload', A(({ env, admin, body, req }) => handleUpload(env, admin, body, req.url)));
route('GET', '/api/admin/users', A(({ env, url }) => handleAdminUsers(env, url)));
route('GET', '/api/admin/users/([\\w-]+)', A(({ env, m }) => handleAdminUserDetail(env, m[1])));
route('POST', '/api/admin/users/([\\w-]+)/balance', A(({ env, admin, m, body }) => handleAdjustBalance(env, admin, m[1], body)));
route('POST', '/api/admin/users/([\\w-]+)/block', A(({ env, admin, m, body }) => handleBlockUser(env, admin, m[1], body)));
route('POST', '/api/admin/notify', A(({ env, admin, body, ctx }) => handleBroadcast(env, admin, body, ctx)));
route('GET', '/api/admin/settings', A(async ({ env }) => ({ settings: await getSettings(env) })));
route('POST', '/api/admin/settings', A(({ env, admin, body }) => handleSaveSettings(env, admin, body)));

const deps = { verifyIdToken, verifyCaptcha };

async function handle(req, env, ctx) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
  const img = /^\/img\/([A-Za-z0-9]+)$/.exec(url.pathname);
  if (img && req.method === 'GET') return serveImage(env, img[1], req, ctx);

  const origin = req.headers.get('origin');
  if (req.method !== 'GET' && (!origin || !allowedOrigins(env).includes(origin))) return json(req, env, { error: 'Forbidden origin' }, 403);

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    try {
      let body = {};
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        const len = int(req.headers.get('content-length'), 0);
        const max = url.pathname === '/api/admin/upload' ? 1_100_000 : 64_000;
        if (len > max) throw new HttpError(413, 'الطلب كبير جداً');
        const text = await req.text();
        if (text.length > max) throw new HttpError(413, 'الطلب كبير جداً');
        try { body = text ? JSON.parse(text) : {}; } catch { throw bad('بيانات غير صالحة'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('بيانات غير صالحة');
      }
      const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
      const data = await r.handler({ req, env, ctx, url, body, m, ip });
      return json(req, env, data);
    } catch (e) {
      if (e instanceof HttpError) return json(req, env, { error: e.message }, e.status);
      console.error('ERR', req.method, url.pathname, e && e.stack ? e.stack : e);
      return json(req, env, { error: 'حدث خطأ غير متوقع، حاول مرة أخرى' }, 500);
    }
  }
  return json(req, env, { error: 'Not found' }, 404);
}

export default {
  fetch(req, env, ctx) { return handle(req, env, ctx); },
};
