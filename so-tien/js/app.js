// Sổ Tiền — giao diện chính
import * as U from './util.js';
import * as S from './store.js';
import { store } from './store.js';
import * as Sync from './sync.js';
import * as X from './export.js';

const APP_VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = U.esc;
const coarse = matchMedia('(pointer: coarse)').matches;

const ui = {
  route: 'home',
  month: U.monthKey(U.todayStr()),
  q: '',
  fcat: '',
  year: new Date().getFullYear(),
  exRange: 'month',
  exFrom: '',
  exTo: '',
  selDay: null,
  catKind: 'expense',
  catOpen: false,
  pendingRender: false,
};

// ---------------- Biểu tượng ----------------
const ICON = {
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" width="24" height="24"><path d="M9 6h10.5A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-6-6z"/><path d="m12 9.5 5 5M17 9.5l-5 5" stroke-linecap="round"/></svg>',
};

// ---------------- Tiện ích giao diện ----------------
const catOf = (id) => S.catMap().get(id);
const accOf = (id) => S.accMap().get(id);
const isCurMonth = (mk) => mk === U.monthKey(U.todayStr());

function monthSwitch() {
  return `<div class="msw">
    <button type="button" data-act="month" data-d="-1" aria-label="Tháng trước">${ICON.left}</button>
    <strong>${U.monthLabel(ui.month)}</strong>
    <button type="button" data-act="month" data-d="1" aria-label="Tháng sau">${ICON.right}</button>
  </div>`;
}
function syncChip() {
  const st = Sync.getStatus();
  return `<button type="button" class="sync" data-act="syncChip" data-s="${st.status}" title="${esc(st.message || '')}"><i></i><span>${esc(Sync.statusText(st))}</span></button>`;
}
function updateSyncChips() {
  const st = Sync.getStatus();
  for (const el of $$('.sync')) {
    el.dataset.s = st.status;
    el.title = st.message || '';
    el.querySelector('span').textContent = Sync.statusText(st);
  }
  const box = $('#syncBox');
  if (box && !box.contains(document.activeElement)) box.innerHTML = syncBoxInner();
}

function toast(msg, opts = {}) {
  const root = $('#toast');
  const id = U.uid();
  root.innerHTML = `<div class="toast" data-id="${id}"><span>${esc(msg)}</span>${opts.action ? `<button type="button" data-act="toastAction">${esc(opts.label || 'Hoàn tác')}</button>` : ''}</div>`;
  toast.action = opts.action || null;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    if (root.firstElementChild?.dataset.id === id) root.innerHTML = '';
    toast.action = null;
  }, opts.ms || 5000);
}

function txTitle(t) {
  if (t.type === 'transfer') return `${accOf(t.accountId)?.name || '?'} → ${accOf(t.toAccountId)?.name || '?'}`;
  if (t.type === 'adjust') return 'Điều chỉnh số dư';
  return catOf(t.categoryId)?.name || 'Chưa phân loại';
}
function txIcon(t) {
  if (t.type === 'transfer') return '⇄';
  if (t.type === 'adjust') return '⚖️';
  return catOf(t.categoryId)?.icon || '•';
}
function txAmountHtml(t) {
  const a = Number(t.amount) || 0;
  if (t.type === 'expense') return `<span class="amt">−${U.fmt(a)}</span>`;
  if (t.type === 'income') return `<span class="amt pos">+${U.fmt(a)}</span>`;
  if (t.type === 'adjust') return `<span class="amt ${a < 0 ? 'neg' : 'pos'}">${U.signed(a)}</span>`;
  return `<span class="amt" style="color:var(--muted)">${U.fmt(a)}</span>`;
}
function txItem(t, showDate = false) {
  const acc = t.type === 'transfer' ? '' : accOf(t.accountId)?.name;
  const sub = [showDate ? U.shortDate(t.date) : '', t.note, acc].filter(Boolean).map(esc).join(' – ');
  return `<li><button type="button" class="rowbtn" data-act="editTx" data-id="${t.id}">
    <span class="ic" aria-hidden="true">${txIcon(t)}</span>
    <span class="tx-main"><span class="t1">${esc(txTitle(t))}</span>${sub ? `<span class="t2">${sub}</span>` : ''}${t.expr ? `<span class="expr">${esc(t.expr)}</span>` : ''}</span>
    ${txAmountHtml(t)}
  </button></li>`;
}

// ---------------- Màn hình: Tổng quan ----------------
function vHome() {
  const mk = ui.month;
  const st = S.monthStats(mk);
  const set = store.data.settings;
  const today = U.todayStr();
  const cur = isCurMonth(mk);
  const days = U.daysInMonth(mk);
  const elapsed = cur ? new Date().getDate() : mk < U.monthKey(today) ? days : 0;
  const avg = elapsed ? st.expense / elapsed : 0;
  const hasAny = S.txs().length > 0;

  // Ngân sách
  let budget = '';
  if (set.budget > 0) {
    const remain = set.budget - st.expense;
    const pct = Math.min(100, (st.expense / set.budget) * 100);
    const left = cur ? days - elapsed : 0;
    budget = `<div class="hero-budget">
      <div class="meter ${remain < 0 ? 'over' : ''}" role="img" aria-label="Đã dùng ${Math.round(pct)}% ngân sách"><i style="width:${pct}%"></i></div>
      <p>${remain >= 0 ? `Còn <b>${U.fmt(remain)} ₫</b> trong ngân sách ${U.short(set.budget)}` : `Vượt ngân sách <b>${U.fmt(-remain)} ₫</b>`}${cur && left > 0 ? `, còn ${left} ngày nữa hết tháng.` : '.'}</p>
    </div>`;
  }

  // Dải ngày trong tháng
  const logged = S.loggedDays(mk);
  const max = Math.max(1, ...st.byDay.values());
  let missing = 0;
  const bars = [];
  for (let d = 1; d <= days; d++) {
    const ds = `${mk}-${String(d).padStart(2, '0')}`;
    const v = st.byDay.get(ds) || 0;
    let s = 'past';
    if (ds > today) s = 'future';
    else if (ds === today) s = 'today';
    if (s !== 'future' && !logged.has(ds)) {
      if (s !== 'today') {
        s = 'empty';
        missing++;
      }
    }
    const h = v ? Math.max(6, (v / max) * 100) : 0;
    bars.push(
      `<button type="button" class="d" data-act="stripDay" data-date="${ds}" data-s="${s}" style="--h:${h}%" aria-pressed="${ui.selDay === ds}" aria-label="${d}/${+mk.slice(5)}: ${s === 'empty' ? 'chưa ghi' : U.money(v)}"><i></i></button>`,
    );
  }
  const cap = stripCaption(mk, st, missing);

  const statsHtml = `<dl class="hero-stats">
      ${cur ? `<div><dt>Hôm nay</dt><dd>${U.fmt(st.byDay.get(today) || 0)}</dd></div>` : `<div><dt>Số giao dịch</dt><dd>${st.count}</dd></div>`}
      <div><dt>Trung bình/ngày</dt><dd>${U.fmt(avg)}</dd></div>
      <div><dt>Thu nhập</dt><dd>${U.fmt(st.income)}</dd></div>
    </dl>`;

  const hero = `<section class="hero" aria-label="Tóm tắt tháng">
    <div class="hero-top">${monthSwitch()}${syncChip()}</div>
    <p class="hero-k">Đã chi ${cur ? 'trong tháng này' : 'trong ' + U.monthLabel(mk).toLowerCase()}</p>
    <p class="hero-amt">${U.fmt(st.expense)}<span>₫</span></p>
    ${budget}
    <div class="strip" role="group" aria-label="Chi tiêu từng ngày">${bars.join('')}</div>
    <div class="strip-axis" aria-hidden="true"><span>1</span><span>${Math.ceil(days / 2)}</span><span>${days}</span></div>
    <div class="strip-cap" id="stripCap">${cap}</div>
    ${statsHtml}
  </section>`;

  const welcome = !hasAny
    ? `<section class="welcome">
      <h2>Bắt đầu ghi chép</h2>
      <p>Bấm nút + để ghi khoản chi đầu tiên. Nếu đã có dữ liệu từ file Excel cũ, vào Cài đặt để nhập file chuyển đổi. Để dùng chung giữa điện thoại và máy tính, hãy kết nối GitHub.</p>
      <div class="btns"><button class="btn" type="button" data-act="openAdd">Ghi khoản đầu tiên</button><a class="btn-ghost" href="#/settings">Mở Cài đặt</a></div>
    </section>`
    : '';

  return `${hero}${welcome}<div class="cols"><div>${quickBlock()}${billsBlock(mk)}${catBlock(mk, st)}${splitBlock(st)}</div><div>${incomeBlock(mk, st)}${walletBlock()}</div></div>`;
}

function stripCaption(mk, st, missing) {
  if (ui.selDay && U.monthKey(ui.selDay) === mk) {
    const v = st.byDay.get(ui.selDay) || 0;
    const logged = S.loggedDays(mk).has(ui.selDay);
    const label = U.dayLabel(ui.selDay);
    const future = ui.selDay > U.todayStr();
    return `<span>${esc(label)}: ${logged ? `chi <b>${U.money(v)}</b>` : future ? 'chưa tới' : 'chưa ghi khoản nào'}</span>
      ${future ? '' : `<button type="button" class="mini" data-act="addForDay" data-date="${ui.selDay}">Ghi cho ngày này</button>`}
      ${logged ? `<button type="button" class="mini" data-act="seeDay" data-date="${ui.selDay}">Xem</button>` : ''}`;
  }
  if (missing > 0) return `<span>${missing} ngày chưa ghi (chấm rỗng). Chạm vào một ngày để ghi bù.</span>`;
  if (isCurMonth(mk)) return `<span>Chạm vào cột để xem chi tiêu từng ngày.</span>`;
  return '';
}

function quickBlock() {
  const picks = S.quickPicks(8);
  if (!picks.length) return '';
  return `<section class="blk"><div class="blk-h"><h2>Ghi nhanh hôm nay</h2></div>
    <div class="quick">${picks
      .map((p) => {
        const c = catOf(p.categoryId);
        return `<button type="button" class="qchip" data-act="quick" data-cat="${p.categoryId}" data-amt="${p.amount}" data-acc="${p.accountId || ''}"><span class="e" aria-hidden="true">${c.icon}</span>${esc(c.name)} <b>${U.short(p.amount)}</b></button>`;
      })
      .join('')}</div>
    <p class="hint">Chạm một lần là ghi xong vào hôm nay. Các khoản bạn hay ghi sẽ tự xuất hiện ở đây.</p>
  </section>`;
}

function billsBlock(mk) {
  if (!isCurMonth(mk)) return '';
  const list = S.recurringStatus(mk);
  if (!list.length) return '';
  const unpaid = list.filter((r) => !r.paid);
  const total = unpaid.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return `<section class="blk"><div class="blk-h"><h2>Hóa đơn tháng này</h2><span class="hint">${unpaid.length ? `Còn ${unpaid.length} khoản, ${U.money(total)}` : 'Đã trả hết'}</span></div>
    <ul class="rows panel">${list
      .map((r) => {
        const c = catOf(r.categoryId);
        return `<li><span class="ic" aria-hidden="true">${c?.icon || '🧾'}</span><span class="grow"><span class="t1">${esc(r.name)}</span><span class="t2">Ngày ${r.day || 1} hằng tháng${accOf(r.accountId) ? ' – ' + esc(accOf(r.accountId).name) : ''}</span></span>
        <span class="amt">${U.fmt(r.amount)}</span>
        ${r.paid ? '<span class="ok-note">Đã trả</span>' : `<button type="button" class="chip" data-act="payBill" data-id="${r.id}">Đã trả</button>`}</li>`;
      })
      .join('')}</ul></section>`;
}

function catBlock(mk, st) {
  const entries = [...st.byCat.entries()].sort((a, b) => b[1] - a[1]);
  const withBudget = S.categories('expense').filter((c) => c.budget > 0 && !st.byCat.has(c.id));
  if (!entries.length && !withBudget.length) {
    return `<section class="blk"><div class="blk-h"><h2>Chi theo danh mục</h2></div><p class="hint">Chưa có khoản chi nào trong ${U.monthLabel(mk).toLowerCase()}.</p></section>`;
  }
  const max = Math.max(1, ...entries.map((e) => e[1]));
  const rows = [...entries, ...withBudget.map((c) => [c.id, 0])].map(([id, v]) => {
    const c = catOf(id) || { name: 'Chưa phân loại', icon: '•' };
    const pct = st.expense ? Math.round((v / st.expense) * 100) : 0;
    let width = (v / max) * 100;
    let note = '';
    let over = false;
    if (c.budget > 0) {
      width = Math.min(100, (v / c.budget) * 100);
      over = v > c.budget;
      note = over ? `<div class="bar-note over">Vượt ${U.money(v - c.budget)} so với ngân sách ${U.short(c.budget)}</div>` : `<div class="bar-note">Còn ${U.money(c.budget - v)} trong ngân sách ${U.short(c.budget)}</div>`;
    }
    return `<li><button type="button" data-act="filterCat" data-id="${id}">
      <div class="bar-top"><span aria-hidden="true">${c.icon}</span><span class="nm">${esc(c.name)}</span><span class="v">${U.fmt(v)}</span><span class="p">${pct}%</span></div>
      <div class="track ${over ? 'over' : ''}"><i class="${c.group === 'nonessential' ? 'non' : ''}" style="width:${Math.max(width, v ? 1.5 : 0)}%"></i></div>${note}
    </button></li>`;
  });
  return `<section class="blk"><div class="blk-h"><h2>Chi theo danh mục</h2><a class="lnk" href="#/tx">Xem sổ chi</a></div><ul class="bars">${rows.join('')}</ul></section>`;
}

function splitBlock(st) {
  if (!st.expense) return '';
  const e = st.essential;
  const n = st.nonessential;
  const pe = Math.round((e / st.expense) * 100);
  return `<section class="blk"><div class="blk-h"><h2>Thiết yếu và không thiết yếu</h2></div>
    <div class="split" role="img" aria-label="Thiết yếu ${pe}%, không thiết yếu ${100 - pe}%">${e ? `<i class="e" style="width:${(e / st.expense) * 100}%"></i>` : ''}${n ? `<i class="n" style="width:${(n / st.expense) * 100}%"></i>` : ''}</div>
    <div class="legend"><span style="--c:var(--teal)">Thiết yếu <b>${U.fmt(e)}</b> (${pe}%)</span><span style="--c:var(--gold)">Không thiết yếu <b>${U.fmt(n)}</b> (${100 - pe}%)</span></div>
  </section>`;
}

function incomeBlock(mk, st) {
  const target = store.data.settings.incomeTarget || 0;
  if (!target && !st.income) return '';
  const src = [...st.byIncomeCat.entries()].sort((a, b) => b[1] - a[1]);
  const pct = target ? Math.min(100, (st.income / target) * 100) : 0;
  return `<section class="blk"><div class="blk-h"><h2>Thu nhập ${U.monthLabel(mk, false).toLowerCase()}</h2><span class="hint">${target ? `Mục tiêu ${U.short(target)}` : ''}</span></div>
    <div class="panel" style="padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><span style="font-size:24px;font-weight:650;letter-spacing:-.02em" class="num">${U.fmt(st.income)} ₫</span>${target ? `<span class="hint">${Math.round((st.income / target) * 100)}%</span>` : ''}</div>
      ${target ? `<div class="track" style="margin:10px 0 4px"><i style="width:${pct}%"></i></div><p class="hint">${st.income >= target ? 'Đã đạt mục tiêu tháng.' : `Còn thiếu ${U.money(target - st.income)}.`}</p>` : ''}
      ${src.length ? `<ul class="rows" style="margin-top:6px">${src.map(([id, v]) => `<li><span class="ic" aria-hidden="true">${catOf(id)?.icon || '💰'}</span><span class="grow t1">${esc(catOf(id)?.name || 'Khác')}</span><span class="amt pos">+${U.fmt(v)}</span></li>`).join('')}</ul>` : ''}
    </div></section>`;
}

function walletBlock() {
  const accs = S.accounts();
  if (!accs.length) return '';
  const bal = S.balances();
  const w = S.worth();
  const row = (a) => {
    const v = bal.get(a.id) || 0;
    return `<li><button type="button" class="rowbtn" data-act="reconcile" data-id="${a.id}" title="Cập nhật số dư thực tế">
      <span class="ic" aria-hidden="true">${a.icon || '💳'}</span><span class="grow"><span class="t1">${esc(a.name)}</span>${a.type === 'debt' && a.note ? `<span class="t2">${esc(a.note)}</span>` : ''}</span>
      <span class="amt ${v < 0 ? 'neg' : ''}">${a.type === 'debt' ? U.fmt(-v) : U.fmt(v)}</span></button></li>`;
  };
  const assets = accs.filter((a) => a.type !== 'debt' && a.type !== 'fund');
  const debts = accs.filter((a) => a.type === 'debt');
  const funds = accs.filter((a) => a.type === 'fund');
  const avg = S.avgMonthlyExpense();
  const goal = store.data.settings.runwayGoal || 6;
  const months = avg > 0 ? Math.max(0, w.liquid) / avg : 0;
  const runway =
    avg > 0
      ? `<div class="runway">
      <div class="big">${String(Math.round(months * 10) / 10).replace('.', ',')} tháng</div>
      <p>Số tiền đang có đủ sống chừng đó tháng, với mức chi trung bình ${U.short(avg)}/tháng.</p>
      <div class="meter" role="img" aria-label="${Math.round(Math.min(100, (months / goal) * 100))}% mục tiêu ${goal} tháng"><i style="width:${Math.min(100, (months / goal) * 100)}%"></i></div>
      <p>Mục tiêu ${goal} tháng cần ${U.short(avg * goal)}${w.liquid < avg * goal ? `, còn thiếu ${U.short(avg * goal - Math.max(0, w.liquid))}` : ', đã đạt'}.</p>
    </div>`
      : '';
  return `<section class="blk"><div class="blk-h"><h2>Ví và tài sản</h2><a class="lnk" href="#/settings" data-scroll="accounts">Quản lý</a></div>
    <ul class="rows panel">${assets.map(row).join('')}<li class="sumrow"><span class="grow t1">Tổng tài sản</span><span class="amt">${U.fmt(w.assets)}</span></li></ul>
    ${debts.length ? `<div class="blk-h" style="margin-top:18px"><h2>Khoản nợ</h2><span class="hint">Tổng ${U.money(-w.debts)}</span></div><ul class="rows panel">${debts.map(row).join('')}</ul>` : ''}
    ${funds.length ? `<div class="blk-h" style="margin-top:18px"><h2>Quỹ riêng</h2><span class="hint">Không tính vào chi tiêu cá nhân</span></div><ul class="rows panel">${funds.map(row).join('')}</ul>` : ''}
    <ul class="rows panel" style="margin-top:12px"><li class="sumrow"><span class="grow t1">Tài sản ròng (tài sản − nợ)</span><span class="amt ${w.net < 0 ? 'neg' : ''}">${U.fmt(w.net)}</span></li></ul>
    ${runway}
    <p class="hint">Chạm vào một ví để cập nhật số dư thực tế, app tự ghi phần chênh lệch.</p>
  </section>`;
}

// ---------------- Màn hình: Sổ giao dịch ----------------
function vTx() {
  const exp = S.categories('expense');
  const inc = S.categories('income');
  const opt = (c) => `<option value="${c.id}" ${ui.fcat === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`;
  return `<div class="pagehead"><h1>Sổ chi</h1>${syncChip()}</div>
    <div class="toolbar">${monthSwitch()}
      <div class="filters">
        <input class="inp" type="search" data-on="q" value="${esc(ui.q)}" placeholder="Tìm ghi chú, danh mục" aria-label="Tìm kiếm" />
        <select class="inp" data-on="fcat" aria-label="Lọc theo danh mục">
          <option value="">Mọi danh mục</option>
          <optgroup label="Chi">${exp.map(opt).join('')}</optgroup>
          <optgroup label="Thu">${inc.map(opt).join('')}</optgroup>
          <option value="__transfer" ${ui.fcat === '__transfer' ? 'selected' : ''}>⇄ Chuyển khoản, điều chỉnh</option>
        </select>
      </div>
    </div>
    <div id="txList">${txListHtml()}</div>`;
}

function txListHtml() {
  const q = U.fold(ui.q.trim());
  let list = S.txs();
  const searching = !!q;
  if (!searching) list = list.filter((t) => U.monthKey(t.date) === ui.month);
  if (ui.fcat === '__transfer') list = list.filter((t) => t.type === 'transfer' || t.type === 'adjust');
  else if (ui.fcat) list = list.filter((t) => t.categoryId === ui.fcat);
  if (q) {
    list = list.filter((t) => U.fold(`${t.note || ''} ${txTitle(t)} ${accOf(t.accountId)?.name || ''} ${t.amount}`).includes(q));
  }
  let inc = 0,
    exp = 0;
  for (const t of list) {
    if (!S.countsInStats(t)) continue;
    if (t.type === 'income') inc += +t.amount || 0;
    else if (t.type === 'expense') exp += +t.amount || 0;
  }
  const sum = `<dl class="sum3"><div><dt>Thu</dt><dd class="pos">+${U.fmt(inc)}</dd></div><div><dt>Chi</dt><dd>−${U.fmt(exp)}</dd></div><div><dt>Còn lại</dt><dd class="${inc - exp < 0 ? 'neg' : ''}">${U.signed(inc - exp)}</dd></div></dl>`;
  const note = searching ? `<p class="hint">Đang tìm trong mọi tháng: ${list.length} kết quả.</p>` : '';
  if (!list.length) {
    return `${sum}${note}<div class="empty"><p>${searching || ui.fcat ? 'Không có giao dịch nào khớp bộ lọc.' : `Chưa có giao dịch nào trong ${U.monthLabel(ui.month).toLowerCase()}.`}</p>${searching || ui.fcat ? '<button class="btn-ghost" type="button" data-act="clearFilter">Bỏ lọc</button>' : '<button class="btn" type="button" data-act="openAdd">Ghi khoản mới</button>'}</div>`;
  }
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const LIMIT = 400;
  let shown = 0;
  const html = [];
  for (const [d, arr] of groups) {
    if (shown >= LIMIT) break;
    const dayExp = arr.filter((t) => t.type === 'expense' && S.countsInStats(t)).reduce((a, t) => a + (+t.amount || 0), 0);
    html.push(`<section class="day"><div class="day-h"><strong>${esc(U.dayLabel(d))}</strong><span>${dayExp ? 'Chi ' + U.fmt(dayExp) : ''}</span></div><ul class="rows">${arr.map((t) => txItem(t)).join('')}</ul></section>`);
    shown += arr.length;
  }
  if (shown < list.length) html.push(`<p class="hint">Đang hiện ${shown}/${list.length} giao dịch. Thu hẹp tìm kiếm để xem thêm.</p>`);
  return sum + note + html.join('');
}

// ---------------- Màn hình: Báo cáo ----------------
function vReports() {
  const y = ui.year;
  const curMk = U.monthKey(U.todayStr());
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    if (mk > curMk) break;
    months.push(mk);
  }
  const stats = months.map((mk) => [mk, S.monthStats(mk)]).filter(([, s]) => s.count > 0);
  const maxExp = Math.max(1, ...stats.map(([, s]) => s.expense));
  const tot = stats.reduce((a, [, s]) => ({ i: a.i + s.income, e: a.e + s.expense }), { i: 0, e: 0 });
  const yearTable = stats.length
    ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Tháng</th><th>Thu</th><th>Chi</th><th>Còn lại</th><th>Tiết kiệm</th></tr></thead><tbody>
      ${stats
        .map(([mk, s]) => {
          const rate = s.income ? Math.round(((s.income - s.expense) / s.income) * 100) + '%' : '–';
          return `<tr><td><button class="lnk" type="button" data-act="gotoMonth" data-mk="${mk}">${U.monthLabel(mk, false)}</button></td><td class="pos">${U.fmt(s.income)}</td><td><span class="cellbar" style="width:${Math.round((s.expense / maxExp) * 56)}px"></span>${U.fmt(s.expense)}</td><td class="${s.net < 0 ? 'neg' : ''}">${U.signed(s.net)}</td><td>${rate}</td></tr>`;
        })
        .join('')}
      </tbody><tfoot><tr><td>Cả năm</td><td>${U.fmt(tot.i)}</td><td>${U.fmt(tot.e)}</td><td>${U.signed(tot.i - tot.e)}</td><td>${tot.i ? Math.round(((tot.i - tot.e) / tot.i) * 100) + '%' : '–'}</td></tr></tfoot></table></div>`
    : `<p class="hint">Chưa có dữ liệu trong năm ${y}.</p>`;

  const catTable = (kind) => {
    const cats = S.categories(kind).filter((c) => stats.some(([, s]) => (kind === 'expense' ? s.byCat : s.byIncomeCat).has(c.id)));
    if (!cats.length) return '<p class="hint">Chưa có dữ liệu.</p>';
    return `<div class="tblwrap"><table class="tbl"><thead><tr><th>Danh mục</th>${stats.map(([mk]) => `<th>T${+mk.slice(5)}</th>`).join('')}<th>Tổng</th><th>TB/tháng</th></tr></thead><tbody>
      ${cats
        .map((c) => {
          const vals = stats.map(([, s]) => (kind === 'expense' ? s.byCat : s.byIncomeCat).get(c.id) || 0);
          const sum = vals.reduce((a, b) => a + b, 0);
          return `<tr><td>${c.icon} ${esc(c.name)}</td>${vals.map((v) => `<td class="${v ? '' : 'z'}">${v ? U.short(v) : '–'}</td>`).join('')}<td><b>${U.short(sum)}</b></td><td>${U.short(sum / stats.length)}</td></tr>`;
        })
        .join('')}</tbody></table></div>`;
  };

  const r = ui.exRange;
  const chip = (k, label) => `<button type="button" class="chip" data-act="exRange" data-k="${k}" aria-pressed="${r === k}">${label}</button>`;
  const share = coarse && X.canShareFiles();
  return `<div class="pagehead"><h1>Báo cáo</h1>${syncChip()}</div>
    <div class="msw" style="margin-left:-8px"><button type="button" data-act="year" data-d="-1" aria-label="Năm trước">${ICON.left}</button><strong>Năm ${y}</strong><button type="button" data-act="year" data-d="1" aria-label="Năm sau">${ICON.right}</button></div>
    <section class="blk"><div class="blk-h"><h2>Từng tháng</h2></div>${yearTable}</section>
    <section class="blk"><div class="blk-h"><h2>Chi theo danh mục</h2><span class="hint">đơn vị: k = nghìn, tr = triệu</span></div>${catTable('expense')}</section>
    <section class="blk"><div class="blk-h"><h2>Thu theo nguồn</h2></div>${catTable('income')}</section>
    <section class="blk" id="export"><div class="blk-h"><h2>Xuất file để lưu trữ</h2></div>
      <div class="panel" style="padding:16px">
        <span class="lbl">Khoảng thời gian</span>
        <div class="chips">${chip('month', U.monthLabel(ui.month))}${chip('year', 'Năm ' + y)}${chip('all', 'Toàn bộ')}${chip('custom', 'Tự chọn')}</div>
        ${r === 'custom' ? `<div class="grid2" style="margin-top:12px"><label class="field"><span>Từ ngày</span><input type="date" data-on="exFrom" value="${ui.exFrom}"></label><label class="field"><span>Đến ngày</span><input type="date" data-on="exTo" value="${ui.exTo}"></label></div>` : '<div style="height:14px"></div>'}
        <div class="btns">
          <button class="btn" type="button" data-act="exportXlsx">Tải file Excel (.xlsx)</button>
          ${share ? '<button class="btn-ghost" type="button" data-act="shareXlsx">Gửi file Excel qua Drive, Zalo…</button>' : ''}
          <button class="btn-ghost" type="button" data-act="exportCsv">Tải CSV cho Google Sheets</button>
        </div>
        <p class="hint" style="margin-top:12px">File Excel có 4 sheet: Giao dịch, Theo ngày (giống bảng Daily Expense cũ), Theo tháng, Số dư ví. Để mở bằng Google Sheets: vào Google Drive, chọn Mới → Tải tệp lên, chọn file .xlsx rồi mở bằng Google Trang tính.</p>
      </div>
    </section>`;
}

function exportRange() {
  const r = ui.exRange;
  if (r === 'month') return { from: ui.month + '-01', to: `${ui.month}-${U.daysInMonth(ui.month)}` };
  if (r === 'year') return { from: `${ui.year}-01-01`, to: `${ui.year}-12-31` };
  if (r === 'custom') return { from: ui.exFrom || undefined, to: ui.exTo || undefined };
  return {};
}

// ---------------- Màn hình: Cài đặt ----------------
function syncBoxInner() {
  const cfg = Sync.getConfig();
  const st = Sync.getStatus();
  if (!cfg) {
    return `<p style="margin-top:0">Chưa kết nối. Dữ liệu đang chỉ nằm trên trình duyệt của thiết bị này.</p>
      <ol class="steps">
        <li>Tạo một repo <b>riêng tư (Private)</b> trên GitHub, ví dụ <code>so-tien-data</code>, tích chọn "Add a README file".</li>
        <li>Tạo token dạng Fine-grained tại <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>: chọn "Only select repositories" → repo vừa tạo, mục Permissions → Contents: <b>Read and write</b>.</li>
        <li>Dán thông tin vào ô dưới và bấm Kết nối. Làm lại bước 3 trên mỗi thiết bị (điện thoại, máy tính).</li>
      </ol>
      ${syncFormHtml({})}`;
  }
  return `<div class="status-line">${syncChip()}<span class="hint" style="margin:0">Repo <b>${esc(cfg.owner)}/${esc(cfg.repo)}</b>, file <code>${esc(cfg.path)}</code>, nhánh ${esc(cfg.branch)}</span></div>
    ${st.status === 'error' || st.status === 'offline' ? `<p class="err">${esc(st.message)}</p>` : ''}
    <div class="btns"><button class="btn" type="button" data-act="syncNow">Đồng bộ ngay</button><button class="btn-ghost" type="button" data-act="editSync">Sửa kết nối</button><button class="btn-danger" type="button" data-act="disconnect">Ngắt kết nối trên máy này</button></div>
    <p class="hint" style="margin-top:12px">Mỗi lần thay đổi, app tự lưu lên GitHub sau vài giây. Khi mở app trên thiết bị khác, dữ liệu mới nhất được tải về và gộp lại. Lịch sử từng lần lưu xem ở tab Commits của repo.</p>`;
}
function syncFormHtml(cfg) {
  return `<form id="syncForm" autocomplete="off">
    <div class="grid2">
      <label class="field"><span>Tên tài khoản GitHub</span><input name="owner" value="${esc(cfg.owner || '')}" placeholder="vd: hliyenglish" required autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>Tên repo dữ liệu</span><input name="repo" value="${esc(cfg.repo || 'so-tien-data')}" required autocapitalize="off" spellcheck="false"></label>
    </div>
    <label class="field"><span>Token (Fine-grained)</span><input name="token" type="password" value="${esc(cfg.token || '')}" placeholder="github_pat_…" required autocapitalize="off" spellcheck="false"><small>Token chỉ lưu trong trình duyệt của thiết bị này, không gửi đi đâu khác ngoài GitHub.</small></label>
    <details class="adv"><summary>Tùy chọn nâng cao</summary>
      <div class="grid2">
        <label class="field"><span>Nhánh</span><input name="branch" value="${esc(cfg.branch || '')}" placeholder="tự nhận"></label>
        <label class="field"><span>Tên file</span><input name="path" value="${esc(cfg.path || 'data.json')}"></label>
      </div>
      <label class="field"><span>Tên thiết bị (hiện trong lịch sử)</span><input name="device" value="${esc(cfg.device || (coarse ? 'điện thoại' : 'máy tính'))}"></label>
    </details>
    <p class="err" id="syncErr" role="alert"></p>
    <div class="btns"><button class="btn" type="submit">Kết nối</button>${cfg.owner ? '<button class="btn-ghost" type="button" data-act="cancelEditSync">Hủy</button>' : ''}</div>
  </form>`;
}

function vSettings() {
  const accs = S.accounts();
  const bal = S.balances();
  const set = store.data.settings;
  const cats = S.categories(ui.catKind);
  const recs = S.recurring();
  const theme = localStorage.getItem('pf.theme') || 'system';
  const tb = (k, l) => `<button type="button" data-act="theme" data-k="${k}" aria-pressed="${theme === k}">${l}</button>`;
  return `<div class="pagehead"><h1>Cài đặt</h1>${syncChip()}</div>

  <section class="set" id="sync"><h2>Đồng bộ qua GitHub</h2>
    <p>Lưu dữ liệu vào một repo GitHub riêng tư của bạn để dùng chung giữa điện thoại và máy tính, và giữ lịch sử mọi lần thay đổi.</p>
    <div class="panel" id="syncBox">${syncBoxInner()}</div>
  </section>

  <section class="set" id="accounts"><h2>Ví, tài khoản và khoản nợ</h2>
    <p>Số dư được tính tự động từ số dư ban đầu và các giao dịch. Khoản nợ (Nam, A Toàn…) ghi số tiền mình đang nợ; khi trả nợ, dùng "Chuyển" từ ví sang khoản nợ.</p>
    <ul class="rows panel list">${accs
      .map((a) => {
        const v = bal.get(a.id) || 0;
        return `<li><button type="button" class="rowbtn" data-act="editAcc" data-id="${a.id}"><span class="ic" aria-hidden="true">${a.icon || '💳'}</span><span class="grow"><span class="t1">${esc(a.name)}</span><span class="t2">${esc(S.ACCOUNT_TYPES[a.type] || a.type)}</span></span><span class="amt ${v < 0 ? 'neg' : ''}">${U.fmt(a.type === 'debt' ? -v : v)}</span></button>
        <button type="button" class="chip" data-act="reconcile" data-id="${a.id}" aria-label="Cập nhật số dư thực tế của ${esc(a.name)}">Cập nhật</button></li>`;
      })
      .join('')}</ul>
    <div class="btns" style="margin-top:10px"><button class="btn-ghost" type="button" data-act="addAcc">Thêm ví hoặc khoản nợ</button></div>
  </section>

  <section class="set" id="cats"><h2>Danh mục</h2>
    <p>Đặt ngân sách tháng cho từng danh mục nếu muốn được nhắc khi chi vượt.</p>
    <div class="seg" style="margin-bottom:10px"><button type="button" data-act="catKind" data-k="expense" aria-pressed="${ui.catKind === 'expense'}">Khoản chi</button><button type="button" data-act="catKind" data-k="income" aria-pressed="${ui.catKind === 'income'}">Khoản thu</button></div>
    <details class="list-toggle" ${ui.catOpen ? 'open' : ''} data-on-toggle="catOpen"><summary>${ui.catOpen ? 'Thu gọn' : `Xem và sửa ${cats.length} danh mục ${ui.catKind === 'expense' ? 'chi' : 'thu'}`}</summary>
    <ul class="rows panel list">${cats
      .map(
        (c) =>
          `<li><button type="button" class="rowbtn" data-act="editCat" data-id="${c.id}"><span class="ic" aria-hidden="true">${c.icon}</span><span class="grow"><span class="t1">${esc(c.name)}</span><span class="t2">${c.kind === 'expense' ? S.GROUPS[c.group] || S.GROUPS.essential : 'Khoản thu'}${c.budget ? ' – ngân sách ' + U.short(c.budget) + '/tháng' : ''}</span></span></button></li>`,
      )
      .join('')}</ul></details>
    <div class="btns" style="margin-top:10px"><button class="btn-ghost" type="button" data-act="addCat">Thêm danh mục</button></div>
  </section>

  <section class="set" id="bills"><h2>Hóa đơn định kỳ</h2>
    <p>Các khoản trả hằng tháng như Spotify, FPT, điện thoại. Trang Tổng quan sẽ nhắc và chỉ cần bấm "Đã trả".</p>
    ${recs.length ? `<ul class="rows panel list">${recs.map((r) => `<li><button type="button" class="rowbtn" data-act="editBill" data-id="${r.id}"><span class="ic" aria-hidden="true">${catOf(r.categoryId)?.icon || '🧾'}</span><span class="grow"><span class="t1">${esc(r.name)}</span><span class="t2">Ngày ${r.day || 1} hằng tháng${r.active === false ? ' – đang tắt' : ''}</span></span><span class="amt">${U.fmt(r.amount)}</span></button></li>`).join('')}</ul>` : ''}
    <div class="btns" style="margin-top:10px"><button class="btn-ghost" type="button" data-act="addBill">Thêm hóa đơn</button></div>
  </section>

  <section class="set" id="goals"><h2>Ngân sách và mục tiêu</h2>
    <form class="panel" id="goalForm">
      <div class="grid2">
        <label class="field"><span>Ngân sách chi mỗi tháng</span><input name="budget" inputmode="text" value="${set.budget ? U.fmt(set.budget) : ''}" placeholder="vd: 6tr"></label>
        <label class="field"><span>Mục tiêu thu nhập mỗi tháng</span><input name="incomeTarget" inputmode="text" value="${set.incomeTarget ? U.fmt(set.incomeTarget) : ''}" placeholder="vd: 9tr"></label>
      </div>
      <label class="field"><span>Mục tiêu quỹ dự phòng (số tháng sống được)</span><input name="runwayGoal" type="number" min="1" max="60" value="${set.runwayGoal || 6}"></label>
      <div class="btns"><button class="btn" type="submit">Lưu mục tiêu</button></div>
    </form>
  </section>

  <section class="set" id="data"><h2>Dữ liệu</h2>
    <p>Nhập file JSON (bản sao lưu, hoặc file chuyển đổi từ Excel cũ). Dữ liệu được gộp, không ghi đè.</p>
    <div class="btns"><button class="btn-ghost" type="button" data-act="import">Nhập file JSON</button><button class="btn-ghost" type="button" data-act="exportJson">Tải bản sao lưu JSON</button><a class="btn-ghost" href="#/reports" data-scroll="export">Xuất Excel</a><button class="btn-danger" type="button" data-act="wipe">Xóa dữ liệu trên máy này</button></div>
  </section>

  <section class="set"><h2>Giao diện</h2>
    <div class="seg">${tb('system', 'Theo máy')}${tb('light', 'Sáng')}${tb('dark', 'Tối')}</div>
    <p class="hint" style="margin-top:14px">Sổ Tiền ${APP_VERSION}. Cài ra màn hình chính: trên iPhone bấm Chia sẻ → Thêm vào MH chính; trên Android mở menu Chrome → Cài đặt ứng dụng. Phím tắt trên máy tính: N để ghi khoản mới.</p>
  </section>`;
}

// ---------------- Vẽ trang ----------------
const VIEWS = { home: vHome, tx: vTx, reports: vReports, settings: vSettings };

function render() {
  ui.pendingRender = false;
  const view = $('#view');
  view.innerHTML = (VIEWS[ui.route] || vHome)();
  for (const a of $$('.nav [data-route]')) a.setAttribute('aria-current', a.dataset.route === ui.route ? 'page' : 'false');
}
function requestRender() {
  const ae = document.activeElement;
  if (ae && $('#view').contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) {
    ui.pendingRender = true;
    return;
  }
  render();
}
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (ui.pendingRender) requestRender();
  }, 50);
});

function go(route, scrollId) {
  if (location.hash !== '#/' + route) location.hash = '#/' + route;
  else {
    render();
  }
  if (scrollId) setTimeout(() => document.getElementById(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
function onRoute() {
  const r = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'home';
  ui.route = VIEWS[r] ? r : 'home';
  render();
  window.scrollTo(0, 0);
  if (/[?&]add=1/.test(location.hash)) {
    history.replaceState(null, '', '#/' + ui.route);
    openSheet();
  }
}

// ---------------- Bảng ghi giao dịch ----------------
let sh = null;

function openSheet(opts = {}) {
  const t = opts.id ? S.txs().find((x) => x.id === opts.id) : null;
  sh = {
    id: t?.id || null,
    type: t?.type || opts.type || 'expense',
    expr: t ? t.expr || String(t.amount) : '',
    categoryId: t?.categoryId || opts.categoryId || null,
    accountId: t?.accountId || opts.accountId || null,
    toAccountId: t?.toAccountId || null,
    date: t?.date || opts.date || U.todayStr(),
    note: t?.note || '',
    accTouched: !!t,
    legacy: !!t && !t.accountId && t.type !== 'transfer',
    recurringId: t?.recurringId || null,
    createdAt: t?.createdAt || null,
    lastFocus: document.activeElement,
  };
  if (!sh.accountId && !sh.legacy) sh.accountId = S.lastAccountFor(sh.categoryId);
  $('#toast').innerHTML = '';
  toast.action = null;
  renderSheet();
  document.body.classList.add('lock');
  if (!coarse) setTimeout(() => $('#amtInput')?.focus(), 30);
}
function closeSheet() {
  $('#sheet-root').innerHTML = '';
  document.body.classList.remove('lock');
  const f = sh?.lastFocus;
  sh = null;
  if (f && document.contains(f)) f.focus?.();
}

function sheetCatsHtml() {
  const kind = sh.type === 'income' ? 'income' : 'expense';
  const usage = S.categoryUsage();
  const list = [...S.categories(kind)].sort((a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0) || (a.order ?? 99) - (b.order ?? 99));
  return `<span class="lbl" id="catLbl">Danh mục</span><div class="cats" role="group" aria-labelledby="catLbl">${list
    .map((c) => `<button type="button" class="cat" data-act="pickCat" data-id="${c.id}" aria-pressed="${sh.categoryId === c.id}"><span class="e" aria-hidden="true">${c.icon}</span><span>${esc(c.name)}</span></button>`)
    .join('')}</div>`;
}
function accChips(act, selected, exclude) {
  return S.accounts()
    .filter((a) => a.id !== exclude)
    .map((a) => `<button type="button" class="chip" data-act="${act}" data-id="${a.id}" aria-pressed="${selected === a.id}"><span aria-hidden="true">${a.icon || '💳'}</span>${esc(a.name)}</button>`)
    .join('');
}
function amtPreview() {
  const e = (sh.expr || '').trim();
  if (!e) return { text: sh.type === 'adjust' ? 'Số âm nếu số dư giảm' : 'Gõ tắt được: 25k, 1tr8, 15k+25k', bad: false };
  const v = U.parseAmount(e);
  if (Number.isNaN(v)) return { text: 'Chưa hiểu số tiền này', bad: true };
  return { text: (U.isExpression(e) ? '= ' : '') + U.money(v), bad: false };
}
function renderSheet() {
  const t = sh.type;
  const title = sh.id ? 'Sửa giao dịch' : 'Ghi giao dịch mới';
  const seg =
    t === 'adjust'
      ? '<strong>Điều chỉnh số dư</strong>'
      : `<div class="seg" role="group" aria-label="Loại giao dịch">${[
          ['expense', 'Chi'],
          ['income', 'Thu'],
          ['transfer', 'Chuyển'],
        ]
          .map(([k, l]) => `<button type="button" data-act="sheetType" data-k="${k}" aria-pressed="${t === k}">${l}</button>`)
          .join('')}</div>`;
  const pv = amtPreview();
  const today = U.todayStr();
  const yest = U.addDays(today, -1);
  let body = '';
  if (t === 'transfer') {
    body = `<span class="lbl">Từ ví</span><div class="hscroll">${accChips('pickAcc', sh.accountId)}</div>
      <span class="lbl">Đến ví (hoặc khoản nợ cần trả)</span><div class="hscroll">${accChips('pickTo', sh.toAccountId, sh.accountId)}</div>`;
  } else if (t === 'adjust') {
    body = `<span class="lbl">Ví</span><div class="hscroll">${accChips('pickAcc', sh.accountId)}</div>`;
  } else {
    body = `${sheetCatsHtml()}<span class="lbl">${t === 'income' ? 'Nhận vào ví' : 'Trả bằng'}</span><div class="hscroll">${accChips('pickAcc', sh.accountId)}</div>${
      sh.legacy && !sh.accountId ? '<p class="hint" style="margin:-6px 0 12px">Khoản này nhập từ Excel cũ nên không gắn ví, không ảnh hưởng số dư hiện tại.</p>' : ''
    }`;
  }
  const keys = [
    ['1'], ['2'], ['3'], ['back'],
    ['4'], ['5'], ['6'], ['+'],
    ['7'], ['8'], ['9'], ['-'],
    ['000'], ['0'], ['k'], ['save'],
  ];
  const keyHtml = keys
    .map(([k]) => {
      if (k === 'back') return `<button type="button" data-act="key" data-k="back" aria-label="Xóa lùi">${ICON.back}</button>`;
      if (k === 'save') return `<button type="submit" class="go">Lưu</button>`;
      if (k === '+' || k === '-') return `<button type="button" class="op" data-act="key" data-k="${k}" aria-label="${k === '+' ? 'cộng' : 'trừ'}">${k === '-' ? '−' : '+'}</button>`;
      if (k === '000' || k === 'k') return `<button type="button" class="sm" data-act="key" data-k="${k}">${k}</button>`;
      return `<button type="button" data-act="key" data-k="${k}">${k}</button>`;
    })
    .join('');
  $('#sheet-root').innerHTML = `<div class="sheet-wrap" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="sheet-bg" data-act="closeSheet"></div>
    <form class="sheet" id="sheetForm" autocomplete="off" novalidate>
      <header class="sheet-h">
        <button type="button" class="icon-btn" data-act="closeSheet" aria-label="Đóng">${ICON.close}</button>
        ${seg}
        <button type="submit" class="save-top">Lưu</button>
      </header>
      <div class="amt-box" data-type="${t}">
        <div class="amt-line"><input id="amtInput" value="${esc(sh.expr)}" placeholder="0" aria-label="Số tiền" ${coarse ? 'inputmode="none"' : 'inputmode="decimal"'} enterkeyhint="done" autocomplete="off"><span class="cur">₫</span></div>
        <output id="amtOut" class="amt-out ${pv.bad ? 'bad' : ''}">${esc(pv.text)}</output>
      </div>
      <div class="sheet-body">
        ${body}
        <div class="meta-row">
          <div class="date-row" role="group" aria-label="Ngày">
            <button type="button" class="chip" data-act="setDate" data-d="${today}" aria-pressed="${sh.date === today}">Hôm nay</button>
            <button type="button" class="chip" data-act="setDate" data-d="${yest}" aria-pressed="${sh.date === yest}">Hôm qua</button>
            <input type="date" id="dateInput" value="${sh.date}" aria-label="Chọn ngày khác" max="${U.addDays(today, 366)}">
          </div>
          <input id="noteInput" class="inp" value="${esc(sh.note)}" placeholder="${t === 'income' ? 'Ghi chú, vd: học viên Bảo' : 'Ghi chú (không bắt buộc)'}" maxlength="160" aria-label="Ghi chú" enterkeyhint="done">
        </div>
        <p class="sheet-err" id="sheetErr" role="alert"></p>
        ${sh.id ? '<button type="button" class="link-danger" data-act="deleteTx">Xóa giao dịch này</button>' : ''}
      </div>
      <div class="keypad">${keyHtml}</div>
    </form>
  </div>`;
}
function updateAmt() {
  const pv = amtPreview();
  const out = $('#amtOut');
  if (out) {
    out.textContent = pv.text;
    out.classList.toggle('bad', pv.bad);
  }
}
function setPressed(act, id) {
  for (const b of $$(`#sheet-root [data-act="${act}"]`)) b.setAttribute('aria-pressed', String(b.dataset.id === id || b.dataset.d === id));
}
function sheetError(msg) {
  const el = $('#sheetErr');
  if (el) el.textContent = msg;
  return false;
}
function saveSheet() {
  sh.expr = $('#amtInput').value;
  sh.note = $('#noteInput').value;
  sh.date = $('#dateInput').value || sh.date;
  const amt = U.parseAmount(sh.expr);
  if (sh.type === 'adjust') {
    if (Number.isNaN(amt) || amt === 0) return sheetError('Nhập số tiền điều chỉnh (khác 0).');
  } else if (!(amt > 0)) return sheetError(Number.isNaN(amt) ? 'Chưa hiểu số tiền. Ví dụ hợp lệ: 25000, 25k, 1tr8, 15k+25k.' : 'Nhập số tiền lớn hơn 0.');
  if ((sh.type === 'expense' || sh.type === 'income') && !sh.categoryId) return sheetError('Chọn một danh mục.');
  if (!sh.accountId && !sh.legacy) return sheetError('Chọn ví.');
  if (sh.type === 'transfer' && (!sh.toAccountId || sh.toAccountId === sh.accountId)) return sheetError('Chọn ví nhận khác với ví chuyển đi.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sh.date)) return sheetError('Ngày chưa hợp lệ.');
  const rec = {
    id: sh.id || undefined,
    type: sh.type,
    amount: amt,
    date: sh.date,
    accountId: sh.accountId || undefined,
    note: sh.note.trim() || undefined,
  };
  if (sh.type === 'expense' || sh.type === 'income') rec.categoryId = sh.categoryId;
  if (sh.type === 'transfer') rec.toAccountId = sh.toAccountId;
  if (U.isExpression(sh.expr)) rec.expr = sh.expr.trim().replace(/^=/, '');
  if (sh.recurringId) rec.recurringId = sh.recurringId;
  if (sh.createdAt) rec.createdAt = sh.createdAt;
  const isNew = !sh.id;
  const saved = store.upsert('tx', rec);
  closeSheet();
  toast(`${isNew ? 'Đã ghi' : 'Đã sửa'} ${txTitle(saved)} ${U.money(amt)}${saved.date !== U.todayStr() ? ' (' + U.dayLabel(saved.date).toLowerCase() + ')' : ''}`, isNew ? { action: () => store.remove('tx', saved.id) } : {});
  return true;
}
function pressKey(k) {
  const inp = $('#amtInput');
  let v = inp.value;
  if (k === 'back') v = v.slice(0, -1);
  else if (k === '+' || k === '-') {
    if (!v && k === '-' && sh.type === 'adjust') v = '-';
    else if (v && !/[+\-]$/.test(v)) v += k;
    else if (v) v = v.slice(0, -1) + k;
  } else if (k === 'k') {
    if (/\d$/.test(v)) v += 'k';
  } else if (k === '000') {
    if (/\d$/.test(v)) v += '000';
  } else v += k;
  inp.value = v;
  sh.expr = v;
  updateAmt();
}

// ---------------- Hộp thoại form chung ----------------
let modal = null;
const EMOJIS = ['🍚', '☕', '🍜', '🍿', '🛵', '⛽', '🅿️', '🏠', '💡', '🌐', '📶', '🎵', '📺', '🎮', '🏸', '🎬', '🚕', '💊', '💈', '🧺', '👨‍👩‍👧', '🎁', '📚', '🎓', '💼', '💰', '🏦', '💵', '📱', '💳', '🤝', '📉', '🛍️', '✈️', '🐶', '❤️'];

function openForm(opt) {
  modal = opt;
  const f = (fd) => {
    const val = fd.value ?? '';
    const id = 'f_' + fd.name;
    if (fd.type === 'select') {
      return `<label class="field"><span>${fd.label}</span><select id="${id}" name="${fd.name}">${fd.options
        .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`)
        .join('')}</select>${fd.hint ? `<small>${fd.hint}</small>` : ''}</label>`;
    }
    if (fd.type === 'emoji') {
      return `<div class="field"><label for="${id}" style="font-size:14px;font-weight:550;color:var(--ink-2)">${fd.label}</label><input id="${id}" name="${fd.name}" value="${esc(val)}" maxlength="12" style="font-size:22px;width:90px"><div class="emoji-sug">${EMOJIS.map((e) => `<button type="button" data-act="pickEmoji" data-e="${e}" aria-label="Chọn ${e}">${e}</button>`).join('')}</div></div>`;
    }
    const type = fd.type === 'number' ? 'number' : fd.type === 'date' ? 'date' : 'text';
    const extra = fd.type === 'money' ? 'inputmode="text" autocomplete="off"' : fd.type === 'number' ? `min="${fd.min ?? ''}" max="${fd.max ?? ''}"` : '';
    return `<label class="field"><span>${fd.label}</span><input id="${id}" name="${fd.name}" type="${type}" value="${esc(val)}" placeholder="${esc(fd.placeholder || '')}" ${fd.required ? 'required' : ''} ${extra}>${fd.hint ? `<small>${fd.hint}</small>` : ''}</label>`;
  };
  $('#modal-root').innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <div class="modal-bg" data-act="closeModal"></div>
    <form class="modal-card" id="modalForm" novalidate autocomplete="off">
      <h2 id="mTitle">${esc(opt.title)}</h2>
      ${opt.lead ? `<p class="lead">${opt.lead}</p>` : ''}
      ${(opt.fields || []).map(f).join('')}
      <p class="err" id="modalErr" role="alert"></p>
      <div class="modal-actions">${opt.onDelete ? `<button type="button" class="btn-danger" data-act="modalDelete">${esc(opt.deleteLabel || 'Xóa')}</button>` : ''}<span class="sp"></span>
        <button type="button" class="btn-ghost" data-act="closeModal">Hủy</button><button type="submit" class="${opt.danger ? 'btn-danger' : 'btn'}">${esc(opt.submit || 'Lưu')}</button></div>
    </form></div>`;
  document.body.classList.add('lock');
  setTimeout(() => ($('#modalForm input, #modalForm select') || $('#modalForm button[type=submit]'))?.focus(), 30);
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  modal = null;
  if (!sh) document.body.classList.remove('lock');
}
function confirmBox({ title, lead, ok = 'Đồng ý', danger = true, onOk }) {
  openForm({ title, lead, fields: [], submit: ok, danger, onSubmit: () => onOk() });
}
function moneyField(v) {
  if (v === '' || v == null) return 0;
  const n = U.parseAmount(v);
  return n;
}

// ---- Ví ----
function accForm(a) {
  const isNew = !a;
  a = a || { name: '', icon: '💳', type: 'bank', opening: 0 };
  const opening = a.type === 'debt' ? -(a.opening || 0) : a.opening || 0;
  openForm({
    title: isNew ? 'Thêm ví hoặc khoản nợ' : `Sửa ${a.name}`,
    fields: [
      { name: 'name', label: 'Tên', value: a.name, required: true, placeholder: 'vd: Techcombank, Nợ Hiếu' },
      { name: 'icon', label: 'Biểu tượng', type: 'emoji', value: a.icon },
      { name: 'type', label: 'Loại', type: 'select', value: a.type, options: Object.entries(S.ACCOUNT_TYPES) },
      { name: 'opening', label: 'Số dư ban đầu', type: 'money', value: opening ? U.fmt(opening) : '', placeholder: '0', hint: 'Với khoản nợ: nhập số tiền mình đang nợ (số dương). Có thể gõ 6tr6.' },
      { name: 'note', label: 'Ghi chú', value: a.note || '', placeholder: 'không bắt buộc' },
    ],
    onSubmit: (v) => {
      if (!v.name.trim()) return 'Nhập tên ví.';
      const o = moneyField(v.opening);
      if (Number.isNaN(o)) return 'Số dư ban đầu chưa hợp lệ.';
      const rec = { ...a, name: v.name.trim(), icon: v.icon.trim() || '💳', type: v.type, opening: v.type === 'debt' ? -Math.abs(o) : o, note: v.note.trim() || undefined };
      if (isNew) rec.order = 50 + S.accounts().length;
      store.upsert('accounts', rec);
      toast(isNew ? `Đã thêm ${rec.name}` : 'Đã lưu');
    },
    onDelete: isNew
      ? null
      : () => {
          const used = S.txs().some((t) => t.accountId === a.id || t.toAccountId === a.id);
          confirmBox({
            title: `Xóa ${a.name}?`,
            lead: used ? 'Ví này đã có giao dịch. Giao dịch cũ vẫn giữ nguyên nhưng ví sẽ không còn hiện trong danh sách.' : 'Thao tác này không hoàn tác được.',
            ok: 'Xóa ví',
            onOk: () => {
              store.remove('accounts', a.id);
              toast(`Đã xóa ${a.name}`);
            },
          });
          return 'keep';
        },
  });
}
function reconcileForm(id) {
  const a = accOf(id);
  if (!a) return;
  const cur = S.balances().get(id) || 0;
  const debt = a.type === 'debt';
  openForm({
    title: `Cập nhật số dư ${a.name}`,
    lead: `App đang tính: <b>${U.money(debt ? -cur : cur)}</b>${debt ? ' (đang nợ)' : ''}. Nhập con số thực tế, app tự ghi phần chênh lệch thành "Điều chỉnh số dư" (không tính vào chi tiêu).`,
    fields: [{ name: 'actual', label: debt ? 'Số tiền thực tế đang nợ' : 'Số dư thực tế hiện tại', type: 'money', value: U.fmt(debt ? -cur : cur), required: true }],
    submit: 'Cập nhật',
    onSubmit: (v) => {
      let actual = U.parseAmount(v.actual);
      if (Number.isNaN(actual)) return 'Số tiền chưa hợp lệ.';
      if (debt) actual = -Math.abs(actual);
      const diff = actual - cur;
      if (diff === 0) {
        toast('Số dư đã khớp, không cần điều chỉnh.');
        return;
      }
      const t = store.upsert('tx', { type: 'adjust', amount: diff, accountId: id, date: U.todayStr(), note: 'Điều chỉnh số dư' });
      toast(`Đã điều chỉnh ${a.name} ${U.signed(diff)} ₫`, { action: () => store.remove('tx', t.id) });
    },
  });
}

// ---- Danh mục ----
function catForm(c, kind) {
  const isNew = !c;
  c = c || { name: '', icon: '📦', kind: kind || 'expense', group: 'essential', budget: 0 };
  const fields = [
    { name: 'name', label: 'Tên danh mục', value: c.name, required: true },
    { name: 'icon', label: 'Biểu tượng', type: 'emoji', value: c.icon },
  ];
  if (c.kind === 'expense') {
    fields.push({ name: 'group', label: 'Nhóm', type: 'select', value: c.group || 'essential', options: Object.entries(S.GROUPS) });
    fields.push({ name: 'budget', label: 'Ngân sách mỗi tháng', type: 'money', value: c.budget ? U.fmt(c.budget) : '', placeholder: 'để trống nếu không cần', hint: 'Có thể gõ 1tr5, 500k.' });
  }
  openForm({
    title: isNew ? (c.kind === 'income' ? 'Thêm khoản thu' : 'Thêm danh mục chi') : `Sửa ${c.name}`,
    fields,
    onSubmit: (v) => {
      if (!v.name.trim()) return 'Nhập tên danh mục.';
      const rec = { ...c, name: v.name.trim(), icon: v.icon.trim() || '📦' };
      if (c.kind === 'expense') {
        const b = moneyField(v.budget);
        if (Number.isNaN(b)) return 'Ngân sách chưa hợp lệ.';
        rec.group = v.group;
        rec.budget = Math.max(0, b);
      }
      if (isNew) rec.order = 100 + S.categories(c.kind).length;
      store.upsert('categories', rec);
      toast(isNew ? `Đã thêm ${rec.name}` : 'Đã lưu');
    },
    onDelete: isNew
      ? null
      : () => {
          confirmBox({
            title: `Xóa danh mục ${c.name}?`,
            lead: 'Các giao dịch cũ thuộc danh mục này vẫn được giữ và vẫn hiện tên danh mục.',
            ok: 'Xóa danh mục',
            onOk: () => {
              store.remove('categories', c.id);
              toast(`Đã xóa ${c.name}`);
            },
          });
          return 'keep';
        },
  });
}

// ---- Hóa đơn định kỳ ----
function billForm(r) {
  const isNew = !r;
  r = r || { name: '', amount: 0, categoryId: 'c_spotify', accountId: S.lastAccountFor(), day: 1, active: true };
  openForm({
    title: isNew ? 'Thêm hóa đơn định kỳ' : `Sửa ${r.name}`,
    fields: [
      { name: 'name', label: 'Tên', value: r.name, required: true, placeholder: 'vd: Spotify, FPT' },
      { name: 'amount', label: 'Số tiền mỗi tháng', type: 'money', value: r.amount ? U.fmt(r.amount) : '', required: true, placeholder: 'vd: 65k' },
      { name: 'categoryId', label: 'Danh mục', type: 'select', value: r.categoryId, options: S.categories('expense').map((c) => [c.id, `${c.icon} ${c.name}`]) },
      { name: 'accountId', label: 'Trả bằng', type: 'select', value: r.accountId, options: S.accounts().map((a) => [a.id, a.name]) },
      { name: 'day', label: 'Ngày trả trong tháng', type: 'number', min: 1, max: 31, value: r.day || 1 },
      { name: 'active', label: 'Trạng thái', type: 'select', value: r.active === false ? '0' : '1', options: [['1', 'Đang dùng'], ['0', 'Tạm tắt']] },
    ],
    onSubmit: (v) => {
      const amt = U.parseAmount(v.amount);
      if (!v.name.trim()) return 'Nhập tên hóa đơn.';
      if (!(amt > 0)) return 'Số tiền chưa hợp lệ.';
      const day = Math.min(31, Math.max(1, parseInt(v.day, 10) || 1));
      store.upsert('recurring', { ...r, name: v.name.trim(), amount: amt, categoryId: v.categoryId, accountId: v.accountId, day, active: v.active === '1' });
      toast(isNew ? `Đã thêm ${v.name.trim()}` : 'Đã lưu');
    },
    onDelete: isNew
      ? null
      : () => {
          store.remove('recurring', r.id);
          toast(`Đã xóa ${r.name}`);
        },
  });
}

// ---------------- Xử lý sự kiện ----------------
const ACTIONS = {
  openAdd: () => openSheet({ date: isCurMonth(ui.month) || ui.route !== 'home' ? U.todayStr() : undefined }),
  closeSheet,
  closeModal,
  month: (el) => {
    ui.month = U.shiftMonth(ui.month, +el.dataset.d);
    ui.selDay = null;
    render();
  },
  year: (el) => {
    ui.year += +el.dataset.d;
    render();
  },
  gotoMonth: (el) => {
    ui.month = el.dataset.mk;
    go('home');
  },
  syncChip: () => {
    if (!Sync.getConfig()) go('settings', 'sync');
    else if (Sync.getStatus().status === 'error') go('settings', 'sync');
    else Sync.syncNow();
  },
  stripDay: (el) => {
    const d = el.dataset.date;
    ui.selDay = ui.selDay === d ? null : d;
    for (const b of $$('.strip .d')) b.setAttribute('aria-pressed', String(b.dataset.date === ui.selDay));
    const st = S.monthStats(ui.month);
    const missing = $$('.strip .d[data-s="empty"]').length;
    $('#stripCap').innerHTML = stripCaption(ui.month, st, missing);
  },
  addForDay: (el) => openSheet({ date: el.dataset.date }),
  seeDay: (el) => {
    ui.month = U.monthKey(el.dataset.date);
    ui.q = '';
    ui.fcat = '';
    go('tx');
    setTimeout(() => {
      const target = $$('.day').find((s) => s.querySelector('strong')?.textContent.startsWith(U.dayLabel(el.dataset.date)));
      target?.scrollIntoView({ block: 'start' });
    }, 80);
  },
  quick: (el) => {
    const amount = +el.dataset.amt;
    const t = store.upsert('tx', { type: 'expense', amount, categoryId: el.dataset.cat, accountId: el.dataset.acc || S.lastAccountFor(el.dataset.cat), date: U.todayStr() });
    toast(`Đã ghi ${txTitle(t)} ${U.money(amount)} hôm nay`, { action: () => store.remove('tx', t.id) });
  },
  payBill: (el) => {
    const r = S.recurring().find((x) => x.id === el.dataset.id);
    if (!r) return;
    const t = store.upsert('tx', { type: 'expense', amount: r.amount, categoryId: r.categoryId, accountId: r.accountId || S.lastAccountFor(r.categoryId), date: U.todayStr(), note: r.name, recurringId: r.id });
    toast(`Đã ghi ${r.name} ${U.money(r.amount)}`, { action: () => store.remove('tx', t.id) });
  },
  filterCat: (el) => {
    ui.fcat = el.dataset.id;
    ui.q = '';
    go('tx');
  },
  clearFilter: () => {
    ui.q = '';
    ui.fcat = '';
    render();
  },
  editTx: (el) => openSheet({ id: el.dataset.id }),
  reconcile: (el) => reconcileForm(el.dataset.id),
  toastAction: () => {
    const fn = toast.action;
    $('#toast').innerHTML = '';
    toast.action = null;
    if (fn) {
      fn();
      toast('Đã hoàn tác');
    }
  },
  // Sheet
  sheetType: (el) => {
    const k = el.dataset.k;
    if (k === sh.type) return;
    sh.expr = $('#amtInput').value;
    sh.note = $('#noteInput').value;
    sh.date = $('#dateInput').value || sh.date;
    sh.type = k;
    const cat = catOf(sh.categoryId);
    if (!cat || cat.kind !== (k === 'income' ? 'income' : 'expense')) sh.categoryId = null;
    if (k === 'transfer' && sh.toAccountId === sh.accountId) sh.toAccountId = null;
    renderSheet();
  },
  pickCat: (el) => {
    sh.categoryId = el.dataset.id;
    setPressed('pickCat', sh.categoryId);
    if (!sh.accTouched) {
      sh.accountId = S.lastAccountFor(sh.categoryId);
      setPressed('pickAcc', sh.accountId);
    }
    $('#sheetErr').textContent = '';
  },
  pickAcc: (el) => {
    sh.accountId = el.dataset.id;
    sh.accTouched = true;
    if (sh.type === 'transfer') {
      sh.expr = $('#amtInput').value;
      sh.note = $('#noteInput').value;
      sh.date = $('#dateInput').value || sh.date;
      if (sh.toAccountId === sh.accountId) sh.toAccountId = null;
      renderSheet();
    } else setPressed('pickAcc', sh.accountId);
  },
  pickTo: (el) => {
    sh.toAccountId = el.dataset.id;
    setPressed('pickTo', sh.toAccountId);
  },
  setDate: (el) => {
    sh.date = el.dataset.d;
    $('#dateInput').value = sh.date;
    setPressed('setDate', sh.date);
  },
  key: (el) => pressKey(el.dataset.k),
  deleteTx: () => {
    const id = sh.id;
    const old = store.remove('tx', id);
    closeSheet();
    if (old) toast('Đã xóa giao dịch', { action: () => store.upsert('tx', { ...old, deleted: undefined }) });
  },
  // Modal
  pickEmoji: (el) => {
    const inp = el.closest('.field').querySelector('input');
    inp.value = el.dataset.e;
  },
  modalDelete: () => {
    const fn = modal?.onDelete;
    closeModal();
    fn?.();
  },
  // Báo cáo
  exRange: (el) => {
    ui.exRange = el.dataset.k;
    if (ui.exRange === 'custom' && !ui.exFrom) {
      ui.exFrom = ui.month + '-01';
      ui.exTo = U.todayStr();
    }
    render();
    $('#export')?.scrollIntoView({ block: 'nearest' });
  },
  exportXlsx: async (el, e, share = false) => {
    el.disabled = true;
    try {
      const r = exportRange();
      const blob = await X.xlsxBlob(r);
      const res = await X.deliver(blob, `SoTien_${X.fileStamp(r.from, r.to)}.xlsx`, { share });
      if (res === 'downloaded') toast('Đã tải file Excel');
    } catch (err) {
      console.error(err);
      toast('Không tạo được file Excel: ' + err.message);
    } finally {
      el.disabled = false;
    }
  },
  shareXlsx: (el, e) => ACTIONS.exportXlsx(el, e, true),
  exportCsv: async () => {
    const r = exportRange();
    await X.deliver(X.csvBlob(r), `SoTien_${X.fileStamp(r.from, r.to)}.csv`);
    toast('Đã tải file CSV');
  },
  exportJson: async () => {
    await X.deliver(X.jsonBlob(), `SoTien_saoluu_${U.todayStr()}.json`);
    toast('Đã tải bản sao lưu');
  },
  import: () => $('#importFile').click(),
  wipe: () =>
    confirmBox({
      title: 'Xóa dữ liệu trên máy này?',
      lead: Sync.getConfig()
        ? 'Dữ liệu trong trình duyệt này sẽ bị xóa và kết nối GitHub trên máy này bị ngắt. Dữ liệu trên GitHub vẫn còn nguyên, kết nối lại là tải về được.'
        : 'Bạn chưa kết nối GitHub, nên dữ liệu sẽ mất hẳn. Hãy tải bản sao lưu JSON trước nếu cần.',
      ok: 'Xóa dữ liệu',
      onOk: () => {
        Sync.saveConfig(null);
        localStorage.removeItem('pf.syncstate.v1');
        store.resetLocal();
        toast('Đã xóa dữ liệu trên máy này');
      },
    }),
  // Cài đặt
  syncNow: async () => {
    const ok = await Sync.syncNow();
    toast(ok ? 'Đã đồng bộ với GitHub' : 'Đồng bộ chưa thành công: ' + (Sync.getStatus().message || ''));
  },
  editSync: () => {
    $('#syncBox').innerHTML = syncFormHtml(Sync.getConfig() || {});
  },
  cancelEditSync: () => {
    $('#syncBox').innerHTML = syncBoxInner();
  },
  disconnect: () =>
    confirmBox({
      title: 'Ngắt kết nối GitHub trên máy này?',
      lead: 'Dữ liệu vẫn còn trên máy này và trên GitHub. Token sẽ bị xóa khỏi trình duyệt này.',
      ok: 'Ngắt kết nối',
      onOk: () => {
        Sync.saveConfig(null);
        render();
        toast('Đã ngắt kết nối');
      },
    }),
  addAcc: () => accForm(null),
  editAcc: (el) => accForm(accOf(el.dataset.id)),
  catKind: (el) => {
    ui.catKind = el.dataset.k;
    ui.catOpen = true;
    render();
    $('#cats')?.scrollIntoView({ block: 'nearest' });
  },
  addCat: () => catForm(null, ui.catKind),
  editCat: (el) => catForm(catOf(el.dataset.id)),
  addBill: () => billForm(null),
  editBill: (el) => billForm(S.recurring().find((r) => r.id === el.dataset.id)),
  theme: (el) => {
    const k = el.dataset.k;
    if (k === 'system') {
      localStorage.removeItem('pf.theme');
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem('pf.theme', k);
      document.documentElement.dataset.theme = k;
    }
    render();
  },
};

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-scroll]');
  if (a) {
    e.preventDefault();
    go(a.getAttribute('href').slice(2), a.dataset.scroll);
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el, e);
  }
});

document.addEventListener(
  'toggle',
  (e) => {
    const d = e.target;
    if (d.dataset?.onToggle === 'catOpen') {
      ui.catOpen = d.open;
      d.querySelector('summary').textContent = d.open ? 'Thu gọn' : `Xem và sửa ${S.categories(ui.catKind).length} danh mục ${ui.catKind === 'expense' ? 'chi' : 'thu'}`;
    }
  },
  true,
);

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'amtInput' && sh) {
    sh.expr = el.value;
    updateAmt();
    return;
  }
  if (el.id === 'dateInput' && sh) {
    sh.date = el.value;
    setPressed('setDate', sh.date);
    return;
  }
  const k = el.dataset?.on;
  if (!k) return;
  if (k === 'q') {
    ui.q = el.value;
    $('#txList').innerHTML = txListHtml();
  } else if (k === 'fcat') {
    ui.fcat = el.value;
    $('#txList').innerHTML = txListHtml();
  } else if (k === 'exFrom' || k === 'exTo') ui[k] = el.value;
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.id === 'sheetForm') return saveSheet();
  if (form.id === 'modalForm' && modal) {
    const values = Object.fromEntries(new FormData(form).entries());
    const res = modal.onSubmit ? modal.onSubmit(values) : undefined;
    if (typeof res === 'string' && res !== 'keep') {
      $('#modalErr').textContent = res;
      return;
    }
    closeModal();
    return;
  }
  if (form.id === 'goalForm') {
    const v = Object.fromEntries(new FormData(form).entries());
    const budget = moneyField(v.budget);
    const incomeTarget = moneyField(v.incomeTarget);
    if (Number.isNaN(budget) || Number.isNaN(incomeTarget)) return toast('Số tiền chưa hợp lệ. Ví dụ: 6tr, 9.000.000');
    store.setSettings({ budget: Math.max(0, budget), incomeTarget: Math.max(0, incomeTarget), runwayGoal: Math.max(1, parseInt(v.runwayGoal, 10) || 6) });
    document.activeElement?.blur();
    toast('Đã lưu mục tiêu');
    return;
  }
  if (form.id === 'syncForm') {
    const v = Object.fromEntries(new FormData(form).entries());
    const err = $('#syncErr');
    const btn = form.querySelector('[type=submit]');
    const cfg = {
      owner: v.owner.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/.*$/, ''),
      repo: v.repo.trim().replace(/\.git$/, ''),
      token: v.token.trim(),
      branch: (v.branch || '').trim(),
      path: (v.path || 'data.json').trim().replace(/^\/+/, '') || 'data.json',
      device: (v.device || '').trim(),
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      err.textContent = 'Điền đủ tên tài khoản, tên repo và token.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Đang kiểm tra…';
    err.textContent = '';
    try {
      const info = await Sync.testConnection(cfg);
      if (!cfg.branch) cfg.branch = info.defaultBranch;
      Sync.saveConfig(cfg);
      const ok = await Sync.syncNow();
      document.activeElement?.blur();
      render();
      if (!info.private) toast('Cảnh báo: repo này đang Public, ai cũng xem được dữ liệu. Hãy đổi sang Private trong Settings của repo.', { ms: 12000 });
      else toast(ok ? 'Đã kết nối và đồng bộ với GitHub' : 'Đã kết nối, nhưng đồng bộ lỗi: ' + Sync.getStatus().message, { ms: 7000 });
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Kết nối';
    }
  }
});

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const d = await X.readImportFile(file);
    const before = S.txs().length;
    store.importData(d);
    const added = S.txs().length - before;
    toast(`Đã nhập ${file.name}: thêm ${added} giao dịch`, { ms: 7000 });
  } catch (err) {
    toast('Không nhập được: ' + err.message, { ms: 7000 });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modal) closeModal();
    else if (sh) closeSheet();
    return;
  }
  const tag = document.activeElement?.tagName;
  if (!sh && !modal && !/INPUT|SELECT|TEXTAREA/.test(tag || '') && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    ACTIONS.openAdd();
  }
});

// ---------------- Khởi động ----------------
store.subscribe(() => requestRender());
Sync.onStatus(updateSyncChips);
window.addEventListener('hashchange', onRoute);
onRoute();
Sync.init();

// Qua ngày mới khi app đang mở: vẽ lại để "Hôm nay" đúng
let lastDay = U.todayStr();
setInterval(() => {
  const d = U.todayStr();
  if (d !== lastDay) {
    if (ui.month === U.monthKey(lastDay)) ui.month = U.monthKey(d);
    lastDay = d;
    requestRender();
  }
}, 60000);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
}
