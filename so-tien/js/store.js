// Dữ liệu của app: lưu trong máy (localStorage), gộp (merge) khi đồng bộ GitHub,
// và các phép tính số dư / thống kê.
import { uid, todayStr, monthKey, addDays, shiftMonth } from './util.js';

const KEY = 'pf.data.v1';

// ---- Mặc định (updatedAt = 1 để mọi bản đã sửa/nhập đều được ưu tiên khi gộp) ----
const A = (id, name, type, icon, order, extra = {}) => ({ id, name, type, icon, opening: 0, order, updatedAt: 1, ...extra });
const C = (id, name, kind, group, icon, order) => ({ id, name, kind, group, icon, budget: 0, order, updatedAt: 1 });

export const ACCOUNT_TYPES = {
  cash: 'Tiền mặt',
  bank: 'Ngân hàng',
  ewallet: 'Ví điện tử',
  saving: 'Tiết kiệm / đầu tư',
  debt: 'Khoản nợ (mình đang nợ)',
  fund: 'Quỹ riêng (không tính vào chi tiêu cá nhân)',
};
export const GROUPS = { essential: 'Thiết yếu', nonessential: 'Không thiết yếu' };

export function defaultData() {
  return {
    v: 1,
    settings: { budget: 0, incomeTarget: 0, runwayGoal: 6, updatedAt: 1 },
    accounts: [
      A('a_cash', 'Tiền mặt', 'cash', '💵', 1),
      A('a_momo', 'Momo', 'ewallet', '📱', 2),
      A('a_acb', 'ACB', 'bank', '🏦', 3),
      A('a_paypal', 'PayPal', 'ewallet', '🌐', 4),
    ],
    categories: [
      C('c_meals', 'Ăn uống', 'expense', 'essential', '🍚', 1),
      C('c_coffee', 'Cà phê & đồ uống', 'expense', 'essential', '☕', 2),
      C('c_parking', 'Gửi xe', 'expense', 'essential', '🅿️', 3),
      C('c_rent', 'Tiền nhà', 'expense', 'essential', '🏠', 4),
      C('c_fuel', 'Xăng & sửa xe', 'expense', 'essential', '🛵', 5),
      C('c_internet', 'Internet, wifi, ngân hàng', 'expense', 'essential', '🌐', 6),
      C('c_laundry', 'Giặt ủi', 'expense', 'essential', '🧺', 7),
      C('c_phone', 'Điện thoại, 5G', 'expense', 'essential', '📶', 8),
      C('c_hair', 'Cắt tóc', 'expense', 'essential', '💈', 9),
      C('c_spotify', 'Spotify, Soundcloud', 'expense', 'essential', '🎵', 10),
      C('c_family', 'Gia đình', 'expense', 'essential', '👨‍👩‍👧', 11),
      C('c_medical', 'Y tế', 'expense', 'essential', '💊', 12),
      C('c_paperwork', 'Giấy tờ hành chính', 'expense', 'essential', '📄', 13),
      C('c_invest', 'Đầu tư, học tập', 'expense', 'essential', '📈', 14),
      C('c_debtpay', 'Trả nợ, cho mượn', 'expense', 'essential', '🤝', 15),
      C('c_networking', 'Cafe, party, networking', 'expense', 'nonessential', '🥂', 20),
      C('c_snack', 'Ăn vặt', 'expense', 'nonessential', '🍿', 21),
      C('c_sport', 'Thể thao', 'expense', 'nonessential', '🏸', 22),
      C('c_movies', 'Phim ảnh', 'expense', 'nonessential', '🎬', 23),
      C('c_grab', 'Grab, taxi', 'expense', 'nonessential', '🚕', 24),
      C('c_netflix', 'Netflix', 'expense', 'nonessential', '📺', 25),
      C('c_game', 'Game', 'expense', 'nonessential', '🎮', 26),
      C('c_shopping', 'Mua sắm', 'expense', 'nonessential', '🛍️', 27),
      C('c_other', 'Khác', 'expense', 'nonessential', '📦', 28),
      C('i_english', 'Dạy tiếng Anh', 'income', null, '🎓', 1),
      C('i_affiliate', 'Affiliate, kênh sách', 'income', null, '📚', 2),
      C('i_other', 'Thu nhập khác', 'income', null, '💰', 3),
      C('i_family', 'Gia đình cho', 'income', null, '🎁', 4),
      C('i_debt', 'Vay, được trả nợ', 'income', null, '🤝', 5),
      C('i_refund', 'Hoàn tiền', 'income', null, '↩️', 6),
    ],
    tx: [],
    recurring: [],
  };
}

const COLLS = ['accounts', 'categories', 'tx', 'recurring'];

function normalize(d) {
  const base = defaultData();
  const out = { v: 1, settings: { ...base.settings, ...(d?.settings || {}) } };
  for (const k of COLLS) out[k] = Array.isArray(d?.[k]) ? d[k].filter((r) => r && r.id) : base[k];
  return out;
}

// ---- Gộp hai bản dữ liệu: bản nào sửa sau (updatedAt lớn hơn) thì thắng ----
function mergeColl(a = [], b = []) {
  const m = new Map();
  for (const r of a) m.set(r.id, r);
  for (const r of b) {
    const cur = m.get(r.id);
    if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) m.set(r.id, r);
  }
  return [...m.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
export function mergeData(a, b) {
  a = normalize(a);
  b = normalize(b);
  const out = { v: 1 };
  out.settings = (b.settings.updatedAt || 0) > (a.settings.updatedAt || 0) ? b.settings : a.settings;
  for (const k of COLLS) out[k] = mergeColl(a[k], b[k]);
  return out;
}

// ---- Ghi ra JSON ổn định (khóa sắp xếp, mỗi bản ghi 1 dòng → lịch sử GitHub dễ đọc) ----
function stable(o) {
  if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
  if (o && typeof o === 'object') {
    return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  }
  return JSON.stringify(o);
}
export function serialize(d) {
  d = normalize(d);
  const lines = ['{', `"v":1,`, `"settings":${stable(d.settings)},`];
  COLLS.forEach((k, i) => {
    const rows = [...d[k]].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)).map(stable);
    lines.push(`"${k}":[` + (rows.length ? '\n' + rows.join(',\n') + '\n' : '') + ']' + (i < COLLS.length - 1 ? ',' : ''));
  });
  lines.push('}');
  return lines.join('\n');
}

// ---- Kho dữ liệu ----
const listeners = new Set();
let version = 0;
let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Không đọc được dữ liệu trong máy', e);
  }
  return defaultData();
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Không lưu được vào máy', e);
  }
}

export const store = {
  get data() {
    return data;
  },
  get version() {
    return version;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Thay toàn bộ dữ liệu (sau khi đồng bộ / nhập). local=true nghĩa là có thay đổi cần đẩy lên. */
  replace(next, { local = false } = {}) {
    data = normalize(next);
    version++;
    persist();
    listeners.forEach((fn) => fn({ local }));
  },
  _changed() {
    version++;
    persist();
    listeners.forEach((fn) => fn({ local: true }));
  },
  upsert(coll, rec) {
    const now = Date.now();
    const r = { ...rec, id: rec.id || uid(), updatedAt: Math.max(now, (rec.updatedAt || 0) + 1) };
    if (coll === 'tx' && !r.createdAt) r.createdAt = now;
    const arr = data[coll];
    const i = arr.findIndex((x) => x.id === r.id);
    if (i >= 0) arr[i] = r;
    else arr.push(r);
    this._changed();
    return r;
  },
  remove(coll, id) {
    const arr = data[coll];
    const i = arr.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const old = arr[i];
    const updatedAt = Math.max(Date.now(), (old.updatedAt || 0) + 1);
    // Giao dịch: chỉ giữ "bia mộ" để thiết bị khác biết mà xóa theo.
    // Ví/danh mục: giữ tên để giao dịch cũ vẫn hiển thị đúng.
    arr[i] = coll === 'tx' ? { id, deleted: true, updatedAt } : { ...old, deleted: true, updatedAt };
    this._changed();
    return old;
  },
  setSettings(patch) {
    data.settings = { ...data.settings, ...patch, updatedAt: Math.max(Date.now(), (data.settings.updatedAt || 0) + 1) };
    this._changed();
  },
  importData(other) {
    const merged = mergeData(data, other);
    // Đánh dấu là thay đổi cục bộ để đẩy lên GitHub
    this.replace(merged, { local: true });
  },
  resetLocal() {
    data = defaultData();
    version++;
    persist();
    listeners.forEach((fn) => fn({ local: false }));
  },
};

// ---- Truy vấn (có nhớ đệm theo version) ----
let cache = { v: -1 };
function memo(key, fn) {
  if (cache.v !== version) cache = { v: version };
  if (!(key in cache)) cache[key] = fn();
  return cache[key];
}

export const live = (arr) => arr.filter((r) => !r.deleted);
export const accounts = () =>
  memo('accounts', () => live(data.accounts).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'vi')));
export const categories = (kind) =>
  memo('cats:' + kind, () =>
    live(data.categories)
      .filter((c) => !kind || c.kind === kind)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'vi')),
  );
export const catMap = () => memo('catMap', () => new Map(data.categories.map((c) => [c.id, c])));
export const accMap = () => memo('accMap', () => new Map(data.accounts.map((a) => [a.id, a])));
export const txs = () =>
  memo('txs', () =>
    live(data.tx).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0))),
  );
export const recurring = () => memo('rec', () => live(data.recurring).sort((a, b) => (a.day || 1) - (b.day || 1)));

/** Ví có bị loại khỏi thống kê cá nhân không (quỹ riêng) */
function isSeparate(accId) {
  const a = accMap().get(accId);
  return !!a && a.type === 'fund';
}
/** Giao dịch có tính vào thống kê chi tiêu/thu nhập cá nhân không */
export const countsInStats = (t) => (t.type === 'expense' || t.type === 'income') && !isSeparate(t.accountId);

export function balances() {
  return memo('bal', () => {
    const b = new Map(live(data.accounts).map((a) => [a.id, Number(a.opening) || 0]));
    const add = (id, v) => {
      if (id && b.has(id)) b.set(id, b.get(id) + v);
    };
    for (const t of txs()) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'expense') add(t.accountId, -amt);
      else if (t.type === 'income') add(t.accountId, amt);
      else if (t.type === 'transfer') {
        add(t.accountId, -amt);
        add(t.toAccountId, amt);
      } else if (t.type === 'adjust') add(t.accountId, amt);
    }
    return b;
  });
}

export function worth() {
  return memo('worth', () => {
    const bal = balances();
    let assets = 0,
      liquid = 0,
      debts = 0,
      funds = 0;
    for (const a of accounts()) {
      const v = bal.get(a.id) || 0;
      if (a.type === 'debt') debts += v;
      else if (a.type === 'fund') funds += v;
      else {
        assets += v;
        if (a.type !== 'saving') liquid += v;
      }
    }
    return { assets, liquid, debts, funds, net: assets + debts };
  });
}

export function monthStats(mk) {
  return memo('ms:' + mk, () => {
    const cm = catMap();
    const s = { income: 0, expense: 0, essential: 0, nonessential: 0, byCat: new Map(), byIncomeCat: new Map(), byDay: new Map(), count: 0 };
    for (const t of txs()) {
      if (monthKey(t.date) !== mk || !countsInStats(t)) continue;
      const amt = Number(t.amount) || 0;
      s.count++;
      if (t.type === 'expense') {
        s.expense += amt;
        const g = cm.get(t.categoryId)?.group === 'nonessential' ? 'nonessential' : 'essential';
        s[g] += amt;
        s.byCat.set(t.categoryId, (s.byCat.get(t.categoryId) || 0) + amt);
        s.byDay.set(t.date, (s.byDay.get(t.date) || 0) + amt);
      } else {
        s.income += amt;
        s.byIncomeCat.set(t.categoryId, (s.byIncomeCat.get(t.categoryId) || 0) + amt);
      }
    }
    s.net = s.income - s.expense;
    return s;
  });
}

/** Ngày đã có ghi chép (bất kỳ loại nào) trong tháng */
export function loggedDays(mk) {
  return memo('ld:' + mk, () => new Set(txs().filter((t) => monthKey(t.date) === mk).map((t) => t.date)));
}

/** Chi trung bình/tháng của 3 tháng đầy đủ gần nhất (dùng cho Runway) */
export function avgMonthlyExpense() {
  return memo('avg', () => {
    const cur = monthKey(todayStr());
    const vals = [];
    for (let i = 1; i <= 3; i++) {
      const v = monthStats(shiftMonth(cur, -i)).expense;
      if (v > 0) vals.push(v);
    }
    if (!vals.length) {
      const v = monthStats(cur).expense;
      const day = new Date().getDate();
      return v > 0 ? (v / day) * 30 : 0;
    }
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
}

/** Các khoản hay ghi (danh mục + số tiền) trong 60 ngày gần đây → nút ghi nhanh */
export function quickPicks(limit = 6) {
  return memo('qp', () => {
    const since = addDays(todayStr(), -60);
    const m = new Map();
    for (const t of txs()) {
      if (t.date < since || t.type !== 'expense' || !t.categoryId || t.recurringId) continue;
      const k = t.categoryId + '|' + t.amount;
      const cur = m.get(k) || { categoryId: t.categoryId, amount: t.amount, accountId: t.accountId, n: 0, last: '' };
      cur.n++;
      if (t.date >= cur.last) {
        cur.last = t.date;
        cur.accountId = t.accountId || cur.accountId;
      }
      m.set(k, cur);
    }
    return [...m.values()]
      .filter((x) => x.n >= 2 && catMap().get(x.categoryId) && !catMap().get(x.categoryId).deleted)
      .sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1))
      .slice(0, limit);
  });
}

/** Thứ tự danh mục theo mức độ hay dùng (90 ngày) */
export function categoryUsage() {
  return memo('cu', () => {
    const since = addDays(todayStr(), -90);
    const m = new Map();
    for (const t of txs()) if (t.date >= since && t.categoryId) m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
    return m;
  });
}

/** Ví dùng gần nhất cho danh mục (hoặc ví dùng gần nhất nói chung) */
export function lastAccountFor(categoryId) {
  const list = txs();
  const valid = (id) => id && accMap().get(id) && !accMap().get(id).deleted;
  const t1 = list.find((t) => t.categoryId === categoryId && valid(t.accountId));
  if (t1) return t1.accountId;
  const t2 = list.find((t) => valid(t.accountId) && t.type !== 'adjust');
  if (t2) return t2.accountId;
  return accounts().find((a) => a.type !== 'debt' && a.type !== 'fund')?.id || accounts()[0]?.id;
}

export function recurringStatus(mk) {
  const paid = new Set(txs().filter((t) => t.recurringId && monthKey(t.date) === mk).map((t) => t.recurringId));
  return recurring()
    .filter((r) => r.active !== false)
    .map((r) => ({ ...r, paid: paid.has(r.id) }));
}

export function monthsWithData() {
  return memo('mwd', () => [...new Set(txs().map((t) => monthKey(t.date)))].sort());
}
