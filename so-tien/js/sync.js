// Đồng bộ dữ liệu với một file JSON trong repo GitHub RIÊNG TƯ của bạn.
// Dùng GitHub REST API (Contents API) trực tiếp từ trình duyệt bằng token cá nhân.
import { store, mergeData, serialize } from './store.js';
import { timeLabel } from './util.js';

const CFG_KEY = 'pf.sync.v1';
const STATE_KEY = 'pf.syncstate.v1';
const API = 'https://api.github.com';

export function getConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (c && c.owner && c.repo && c.token) return { branch: 'main', path: 'data.json', device: '', ...c };
  } catch {}
  return null;
}
export function saveConfig(cfg) {
  if (!cfg) localStorage.removeItem(CFG_KEY);
  else localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  setStatus(cfg ? (state.dirty ? 'dirty' : 'idle') : 'off');
}

// ---- Trạng thái đồng bộ (hiển thị trên giao diện) ----
let state = { status: 'off', message: '', lastSyncAt: 0, dirty: false, sha: null };
try {
  state = { ...state, ...JSON.parse(localStorage.getItem(STATE_KEY) || '{}') };
} catch {}
state.status = getConfig() ? (state.dirty ? 'dirty' : 'idle') : 'off';
const statusListeners = new Set();
function saveState() {
  const { lastSyncAt, dirty, sha } = state;
  localStorage.setItem(STATE_KEY, JSON.stringify({ lastSyncAt, dirty, sha }));
}
function setStatus(status, message = '') {
  state.status = status;
  state.message = message;
  saveState();
  statusListeners.forEach((fn) => fn(getStatus()));
}
export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
export function getStatus() {
  return { ...state };
}
export function statusText(s = state) {
  switch (s.status) {
    case 'off':
      return 'Chỉ lưu trên máy này';
    case 'syncing':
      return 'Đang đồng bộ…';
    case 'dirty':
      return 'Chưa đồng bộ';
    case 'offline':
      return 'Mất mạng, sẽ đồng bộ sau';
    case 'error':
      return 'Lỗi đồng bộ';
    default:
      return s.lastSyncAt ? `Đã đồng bộ ${timeLabel(s.lastSyncAt)}` : 'Đã kết nối GitHub';
  }
}

// ---- Mã hóa base64 cho chuỗi UTF-8 (tiếng Việt) ----
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

class SyncError extends Error {
  constructor(message, { status = 0, conflict = false, offline = false } = {}) {
    super(message);
    this.status = status;
    this.conflict = conflict;
    this.offline = offline;
  }
}

async function call(url, opts = {}) {
  let r;
  try {
    r = await fetch(url, { cache: 'no-store', ...opts });
  } catch (e) {
    throw new SyncError('Không kết nối được GitHub (kiểm tra mạng).', { offline: true });
  }
  return r;
}
async function apiError(r, what) {
  let msg = '';
  try {
    msg = (await r.json()).message || '';
  } catch {}
  if (r.status === 401) return new SyncError('Token không hợp lệ hoặc đã hết hạn. Hãy tạo token mới.', { status: 401 });
  if (r.status === 403) {
    if (/rate limit/i.test(msg)) return new SyncError('GitHub tạm giới hạn số lần gọi. Thử lại sau ít phút.', { status: 403 });
    return new SyncError('Token chưa có quyền ghi (Contents: Read and write) cho repo này.', { status: 403 });
  }
  if (r.status === 404) return new SyncError('Không tìm thấy repo. Kiểm tra tên tài khoản, tên repo, và token đã chọn đúng repo chưa.', { status: 404 });
  if (r.status === 409 || r.status === 422) return new SyncError('Dữ liệu trên GitHub vừa thay đổi.', { status: r.status, conflict: true });
  return new SyncError(`${what}: GitHub trả lỗi ${r.status}${msg ? ' – ' + msg : ''}`, { status: r.status });
}

const headers = (cfg, accept = 'application/vnd.github+json') => ({ Authorization: `Bearer ${cfg.token}`, Accept: accept });
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const contentsUrl = (cfg) => `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encPath(cfg.path)}`;

async function getFile(cfg) {
  const url = `${contentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;
  const r = await call(url, { headers: headers(cfg) });
  if (r.status === 404) {
    // Có thể file chưa tồn tại (lần đầu) hoặc repo trống
    return null;
  }
  if (!r.ok) throw await apiError(r, 'Đọc dữ liệu');
  const j = await r.json();
  let text;
  if (j.content && j.encoding === 'base64') text = b64decode(j.content);
  else {
    // File > 1MB: GitHub không trả nội dung kèm, phải lấy bản thô
    const r2 = await call(url, { headers: headers(cfg, 'application/vnd.github.raw+json') });
    if (!r2.ok) throw await apiError(r2, 'Đọc dữ liệu');
    text = await r2.text();
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SyncError(`File ${cfg.path} trên GitHub không phải JSON hợp lệ.`);
  }
  return { sha: j.sha, data, text };
}

async function putFile(cfg, text, sha, message) {
  const body = { message, content: b64encode(text), branch: cfg.branch };
  if (sha) body.sha = sha;
  const opts = (b) => ({ method: 'PUT', headers: { ...headers(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  let r = await call(contentsUrl(cfg), opts(body));
  if (!r.ok && !sha && (r.status === 404 || r.status === 422)) {
    // Repo trống (chưa có nhánh): thử tạo file không chỉ định nhánh
    const { branch, ...noBranch } = body;
    const r2 = await call(contentsUrl(cfg), opts(noBranch));
    if (r2.ok) r = r2;
  }
  if (!r.ok) throw await apiError(r, 'Ghi dữ liệu');
  const j = await r.json();
  return j.content?.sha || null;
}

/** Kiểm tra kết nối: repo tồn tại, có phải riêng tư không, nhánh mặc định */
export async function testConnection(cfg) {
  const r = await call(`${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, { headers: headers(cfg) });
  if (!r.ok) throw await apiError(r, 'Kiểm tra repo');
  const j = await r.json();
  return { private: !!j.private, defaultBranch: j.default_branch || 'main', fullName: j.full_name, empty: j.size === 0 };
}

let running = null;
let again = false;
let timer = null;

function commitMessage(cfg) {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  const when = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  return `Cập nhật dữ liệu ${when}${cfg.device ? ' (' + cfg.device + ')' : ''}`;
}

/** Kéo dữ liệu từ GitHub, gộp với dữ liệu trong máy, đẩy bản gộp lên nếu có khác biệt. */
export async function syncNow() {
  const cfg = getConfig();
  if (!cfg) {
    setStatus('off');
    return false;
  }
  if (running) {
    again = true;
    return running;
  }
  clearTimeout(timer);
  running = (async () => {
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const startVersion = store.version;
        const remote = await getFile(cfg);
        const merged = remote ? mergeData(store.data, remote.data) : mergeData(store.data, {});
        const text = serialize(merged);
        let sha = remote?.sha || null;
        if (!remote || text !== serialize(remote.data)) {
          try {
            sha = await putFile(cfg, text, remote?.sha, commitMessage(cfg));
          } catch (e) {
            if (e.conflict && attempt < 3) continue; // máy khác vừa ghi → kéo lại và gộp tiếp
            throw e;
          }
        }
        // Gộp thêm lần nữa với dữ liệu hiện tại để không mất khoản vừa nhập trong lúc chờ mạng
        const changedMeanwhile = store.version !== startVersion;
        store.replace(mergeData(store.data, merged), { local: false });
        state.sha = sha;
        state.lastSyncAt = Date.now();
        state.dirty = changedMeanwhile;
        setStatus(changedMeanwhile ? 'dirty' : 'idle');
        if (changedMeanwhile) again = true;
        return true;
      }
      throw new SyncError('Không gộp được dữ liệu sau nhiều lần thử.');
    } catch (e) {
      console.warn('Đồng bộ lỗi', e);
      setStatus(e.offline ? 'offline' : 'error', e.message);
      return false;
    } finally {
      running = null;
      if (again) {
        again = false;
        schedule(1500);
      }
    }
  })();
  return running;
}

export function schedule(ms = 2500) {
  if (!getConfig()) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

/** Gọi khi dữ liệu trong máy thay đổi */
export function markDirty() {
  state.dirty = true;
  if (getConfig()) {
    if (state.status !== 'syncing') setStatus('dirty');
    schedule();
  } else saveState();
}

export function init() {
  store.subscribe(({ local }) => {
    if (local) markDirty();
  });
  if (getConfig()) syncNow();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getConfig() && Date.now() - state.lastSyncAt > 20000) syncNow();
  });
  window.addEventListener('online', () => {
    if (getConfig()) syncNow();
  });
}
