// Xuất dữ liệu: Excel (.xlsx), CSV (mở bằng Google Sheets), sao lưu JSON; và nhập JSON.
import * as S from './store.js';
import { store } from './store.js';
import { buildXlsx } from './xlsx-lite.js';
import { addDays, todayStr, monthKey, download } from './util.js';
import { colName } from './xlsx-lite.js';

const TYPE_LABEL = { expense: 'Chi', income: 'Thu', transfer: 'Chuyển khoản', adjust: 'Điều chỉnh số dư' };

function inRange(t, from, to) {
  return (!from || t.date >= from) && (!to || t.date <= to);
}
function rangeTx(from, to) {
  return S.txs()
    .filter((t) => inRange(t, from, to))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
}
const catName = (id) => S.catMap().get(id)?.name || '';
const accName = (id) => S.accMap().get(id)?.name || '';
const groupName = (id) => {
  const c = S.catMap().get(id);
  if (!c || c.kind !== 'expense') return '';
  return S.GROUPS[c.group] || S.GROUPS.essential;
};

function txRows(list) {
  const head = ['Ngày', 'Loại', 'Danh mục', 'Nhóm', 'Số tiền', 'Ví', 'Đến ví', 'Ghi chú'].map((v) => ({ v, s: 'header' }));
  const rows = [head];
  for (const t of list) {
    rows.push([
      { v: t.date, t: 'd' },
      TYPE_LABEL[t.type] || t.type,
      catName(t.categoryId),
      groupName(t.categoryId),
      { v: Number(t.amount) || 0, s: 'money' },
      accName(t.accountId),
      t.type === 'transfer' ? accName(t.toAccountId) : '',
      t.note || '',
    ]);
  }
  return rows;
}

function sumF(col, r1, r2) {
  return `SUM(${col}${r1}:${col}${r2})`;
}

/** Sheet giống "Daily Expense" cũ: mỗi ngày 1 dòng, mỗi danh mục 1 cột */
function dailySheet(list, from, to) {
  const exp = S.categories('expense');
  const inc = S.categories('income');
  const usedExp = exp.filter((c) => list.some((t) => t.categoryId === c.id));
  const usedInc = inc.filter((c) => list.some((t) => t.categoryId === c.id));
  const head = ['Ngày', 'Tổng chi', ...usedExp.map((c) => c.name), 'Tổng thu', ...usedInc.map((c) => c.name)].map((v) => ({ v, s: 'header' }));
  const byDay = new Map();
  for (const t of list) {
    if (!S.countsInStats(t)) continue;
    const d = byDay.get(t.date) || new Map();
    d.set(t.categoryId, (d.get(t.categoryId) || 0) + (Number(t.amount) || 0));
    byDay.set(t.date, d);
  }
  const rows = [head];
  const start = from || list[0]?.date;
  let end = to || list[list.length - 1]?.date;
  if (end && end > todayStr()) end = todayStr() > (start || '') ? todayStr() : end;
  if (start && end) {
    for (let d = start, guard = 0; d <= end && guard < 5000; d = addDays(d, 1), guard++) {
      const m = byDay.get(d) || new Map();
      const e = usedExp.map((c) => m.get(c.id) || 0);
      const i = usedInc.map((c) => m.get(c.id) || 0);
      const cell = (v) => (v ? { v, s: 'money' } : '');
      rows.push([{ v: d, t: 'd' }, { v: e.reduce((a, b) => a + b, 0), s: 'money' }, ...e.map(cell), { v: i.reduce((a, b) => a + b, 0), s: 'money' }, ...i.map(cell)]);
    }
  }
  const n = rows.length;
  if (n > 1) {
    const total = [{ v: 'Tổng', s: 'bold' }];
    for (let c = 1; c < head.length; c++) {
      let v = 0;
      for (let r = 1; r < n; r++) v += Number(rows[r][c]?.v || 0);
      total.push({ f: sumF(colName(c), 2, n), v, s: 'moneyBold' });
    }
    rows.push(total);
  }
  return { name: 'Theo ngày', rows, widths: [12, 13, ...usedExp.map(() => 13), 13, ...usedInc.map(() => 13)], freezeCols: 1 };
}

function monthlySheet(list) {
  const exp = S.categories('expense').filter((c) => list.some((t) => t.categoryId === c.id));
  const months = [...new Set(list.map((t) => monthKey(t.date)))].sort();
  const head = ['Tháng', 'Thu', 'Chi', 'Còn lại', 'Tỷ lệ tiết kiệm', 'Thiết yếu', 'Không thiết yếu', ...exp.map((c) => c.name)].map((v) => ({ v, s: 'header' }));
  const rows = [head];
  for (const mk of months) {
    // Chỉ tính các giao dịch trong khoảng đã chọn
    const inMonth = list.filter((t) => monthKey(t.date) === mk && S.countsInStats(t));
    const sum = (f) => inMonth.filter(f).reduce((a, t) => a + (Number(t.amount) || 0), 0);
    const income = sum((t) => t.type === 'income');
    const expense = sum((t) => t.type === 'expense');
    const ess = sum((t) => t.type === 'expense' && S.catMap().get(t.categoryId)?.group !== 'nonessential');
    const non = expense - ess;
    const [y, m] = mk.split('-');
    rows.push([
      `${m}/${y}`,
      { v: income, s: 'money' },
      { v: expense, s: 'money' },
      { v: income - expense, s: 'money' },
      income > 0 ? { v: Math.round(((income - expense) / income) * 100) / 100, s: 'percent' } : '',
      { v: ess, s: 'money' },
      { v: non, s: 'money' },
      ...exp.map((c) => {
        const v = sum((t) => t.type === 'expense' && t.categoryId === c.id);
        return v ? { v, s: 'money' } : '';
      }),
    ]);
  }
  const n = rows.length;
  if (n > 1) {
    const total = [{ v: 'Tổng', s: 'bold' }];
    for (let c = 1; c < head.length; c++) {
      if (c === 4) {
        total.push('');
        continue;
      }
      let v = 0;
      for (let r = 1; r < n; r++) v += Number(rows[r][c]?.v || 0);
      total.push({ f: sumF(colName(c), 2, n), v, s: 'moneyBold' });
    }
    rows.push(total);
  }
  return { name: 'Theo tháng', rows, widths: [10, 13, 13, 13, 14, 13, 15, ...exp.map(() => 13)], freezeCols: 1 };
}

function balanceSheet() {
  const bal = S.balances();
  const rows = [['Ví / tài khoản', 'Loại', 'Số dư hiện tại'].map((v) => ({ v, s: 'header' }))];
  for (const a of S.accounts()) rows.push([a.name, S.ACCOUNT_TYPES[a.type] || a.type, { v: bal.get(a.id) || 0, s: 'money' }]);
  const w = S.worth();
  rows.push([]);
  rows.push([{ v: 'Tổng tài sản', s: 'bold' }, '', { v: w.assets, s: 'moneyBold' }]);
  rows.push([{ v: 'Tổng nợ', s: 'bold' }, '', { v: w.debts, s: 'moneyBold' }]);
  rows.push([{ v: 'Tài sản ròng', s: 'bold' }, '', { v: w.net, s: 'moneyBold' }]);
  if (w.funds) rows.push([{ v: 'Quỹ riêng (không tính)', s: 'bold' }, '', { v: w.funds, s: 'moneyBold' }]);
  rows.push([]);
  rows.push([`Xuất lúc ${new Date().toLocaleString('vi-VN')}`]);
  return { name: 'Số dư ví', rows, widths: [28, 34, 16] };
}

export function fileStamp(from, to) {
  if (!from && !to) return `toan-bo_${todayStr()}`;
  if (from && to && from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01')) return from.slice(0, 7);
  return `${from || 'dau'}_den_${to || todayStr()}`;
}

export async function xlsxBlob({ from, to } = {}) {
  const list = rangeTx(from, to);
  return buildXlsx([
    { name: 'Giao dịch', rows: txRows(list), widths: [12, 16, 24, 16, 14, 14, 14, 40], filterRows: list.length },
    dailySheet(list, from, to),
    monthlySheet(list),
    balanceSheet(),
  ]);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function csvBlob({ from, to } = {}) {
  const list = rangeTx(from, to);
  const lines = [['Ngày', 'Loại', 'Danh mục', 'Nhóm', 'Số tiền', 'Ví', 'Đến ví', 'Ghi chú'].join(',')];
  for (const t of list) {
    lines.push(
      [t.date, TYPE_LABEL[t.type] || t.type, catName(t.categoryId), groupName(t.categoryId), Number(t.amount) || 0, accName(t.accountId), t.type === 'transfer' ? accName(t.toAccountId) : '', t.note || '']
        .map(csvCell)
        .join(','),
    );
  }
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function jsonBlob() {
  return new Blob([S.serialize(store.data)], { type: 'application/json' });
}

/** Tải về; nếu là điện thoại và chọn "chia sẻ" thì mở bảng chia sẻ (Drive, Zalo, Files…) */
export async function deliver(blob, filename, { share = false } = {}) {
  if (share && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancel';
      }
    }
  }
  download(blob, filename);
  return 'downloaded';
}
export const canShareFiles = () => {
  try {
    return !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
};

/** Đọc file JSON (bản sao lưu, hoặc file chuyển từ Excel cũ) */
export async function readImportFile(file) {
  const text = await file.text();
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('File không phải JSON hợp lệ.');
  }
  if (!d || typeof d !== 'object' || !Array.isArray(d.tx)) throw new Error('File này không phải dữ liệu của Sổ Tiền.');
  return d;
}
