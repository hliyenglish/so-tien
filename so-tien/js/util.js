// Các hàm tiện ích dùng chung: định dạng tiền, ngày tháng, đọc số tiền gõ tắt.

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const z2 = (n) => String(n).padStart(2, '0');

/** Ngày theo giờ máy, dạng YYYY-MM-DD */
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
export const monthKey = (s) => s.slice(0, 7);
export function shiftMonth(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}`;
}
export function daysInMonth(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthLabel(mk, withYear = true) {
  const [y, m] = mk.split('-');
  return withYear ? `Tháng ${+m}/${y}` : `Tháng ${+m}`;
}
const WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export function dayLabel(s) {
  const t = todayStr();
  if (s === t) return 'Hôm nay';
  if (s === addDays(t, -1)) return 'Hôm qua';
  const d = parseDate(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${WD[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}${sameYear ? '' : '/' + d.getFullYear()}`;
}
export function shortDate(s) {
  const d = parseDate(s);
  return `${z2(d.getDate())}/${z2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function timeLabel(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const t = `${z2(d.getHours())}:${z2(d.getMinutes())}`;
  return todayStr(d) === todayStr() ? t : `${t} ${d.getDate()}/${d.getMonth() + 1}`;
}

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
export const fmt = (n) => nf.format(Math.round(n || 0)).replace('-', '−');
export const money = (n) => `${fmt(n)} ₫`;
export function signed(n) {
  if (n > 0) return `+${fmt(n)}`;
  if (n < 0) return `−${fmt(-n)}`;
  return '0';
}
/** 1.250.000 -> 1,25tr ; 45.000 -> 45k */
export function short(n) {
  const a = Math.abs(n || 0);
  const s = n < 0 ? '−' : '';
  const t = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
  if (a >= 1e9) return s + t(a / 1e9) + ' tỷ';
  if (a >= 1e6) return s + t(a / 1e6) + 'tr';
  if (a >= 1e3) return s + t(a / 1e3) + 'k';
  return s + a;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MULT = {
  k: 1e3, n: 1e3, ng: 1e3, nghin: 1e3, 'nghìn': 1e3, 'ngàn': 1e3, ngan: 1e3,
  tr: 1e6, m: 1e6, cu: 1e6, 'củ': 1e6, trieu: 1e6, 'triệu': 1e6,
  ty: 1e9, 'tỷ': 1e9, 'tỉ': 1e9, ti: 1e9, b: 1e9,
};

function parseTerm(t) {
  const m = t.match(/^(\d+(?:[.,]\d+)*)([a-zà-ỹđ]+)?(\d+)?$/);
  if (!m) return NaN;
  const [, num, suf, tail] = m;
  let base;
  if (/^\d{1,3}([.,]\d{3})+$/.test(num)) base = Number(num.replace(/[.,]/g, ''));
  else base = Number(num.replace(',', '.'));
  if (Number.isNaN(base)) return NaN;
  if (!suf) return tail ? NaN : base;
  const mul = MULT[suf];
  if (!mul) return NaN;
  if (tail) {
    if (/[.,]/.test(num)) return NaN;
    base = Number(`${num}.${tail}`);
  }
  return base * mul;
}

/**
 * Đọc số tiền người dùng gõ. Hỗ trợ:
 *  15000, 15.000, 15k, 1,5tr, 1tr2, 2k5, 15k+25k, =30000+45000, 200k-50k
 * Trả về số nguyên (đồng) hoặc NaN.
 */
export function parseAmount(input) {
  if (input == null) return NaN;
  const s = String(input)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/vnđ|vnd|đ|₫/g, (x) => (x === 'đ' ? '' : ''))
    .replace(/[−–]/g, '-')
    .replace(/^=/, '');
  if (!s) return NaN;
  const terms = s.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== s) return NaN;
  let total = 0;
  for (const t of terms) {
    const sign = t[0] === '-' ? -1 : 1;
    const v = parseTerm(t.replace(/^[+-]/, ''));
    if (Number.isNaN(v)) return NaN;
    total += sign * v;
  }
  return Math.round(total);
}

/** Có phải biểu thức nhiều số hạng không (để hiện "= tổng") */
export const isExpression = (s) =>
  /[+\-−]\s*\d/.test(
    String(s || '')
      .trim()
      .replace(/^=/, '')
      .replace(/^[+\-−]/, ''),
  );

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu */
export function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}
