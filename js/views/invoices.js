import { DB, getSettings } from '../db.js';
import { money, num, dateFa, esc, toast, invoiceToImage, amountToWordsFa, printWithClass, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, faLabel, icon, showValidationErrors, guardSubmit, todayISO, newToken, bindAmountInput, jalaliFromISO, isoFromJalali, jalaliMonthNames, jalaliIsLeap } from '../utils.js';
import { INVOICE_STATUS, validateInvoice, validateAmount, validateCustomer, toNumber, toMoney, findDuplicate } from '../validators.js';
import { invoiceSnapshot, checkInvoiceSave, legacyMigrationTx, planInvoicePayment, isoFromTimestamp } from '../finance.js';
import { calculateInvoice, invoiceStatusFromPayment } from '../invoice-engine.js';
import { planInvoiceStock, planSalesReturn, movementOps, stockCacheOps, bookedForInvoice, invoiceStockActive } from '../inventory.js';
import { openRefundModal } from './payment-modal.js';
import { navigate } from '../router.js';
import { pageHeader, emptyState, openModal, closeModal, actionMenu, bindActionMenus } from '../components.js';

function calculateTotals(items, discount, taxEnabled, taxPercent, discountType='amount', extraCosts=0) {
  const result = calculateInvoice(items, { discount, discountType, taxEnabled, taxPercent, extraCosts });
  return { ...result, lineTotals: result.items.map(i => i.total) };
}

function deriveInvoiceStatus(status, paidAmount, total) {
  return invoiceStatusFromPayment(status, paidAmount, total);
}

function invoiceStatusClass(status) { return INVOICE_STATUS_BADGE[status] || 'muted'; }

function jalaliDaysInMonth(year, month) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return jalaliIsLeap(Number(year)) ? 30 : 29;
}

function jalaliDateControls(existing) {
  const iso = existing?.date || (existing?.createdAt ? isoFromTimestamp(existing.createdAt) : todayISO());
  const [jy,jm,jd] = jalaliFromISO(iso) || jalaliFromISO(todayISO());
  const years = Array.from(new Set([jy, ...Array.from({length: 11}, (_,i) => jy - 5 + i)])).sort((a,b)=>a-b);
  return {
    iso, jy, jm, jd,
    years: years.map(y=>`<option value="${y}" ${y===jy?'selected':''}>${num(y)}</option>`).join(''),
    months: jalaliMonthNames.map((name,i)=>`<option value="${i+1}" ${i+1===jm?'selected':''}>${name}</option>`).join(''),
    days: Array.from({length:31},(_,i)=>i+1).map(d=>`<option value="${d}" ${d===jd?'selected':''}>${num(d)}</option>`).join('')
  };
}

function invoiceCard(i) {
  return `<article class="list-item invoice-list-card" data-invoice-id="${i.id}">
    <button class="invoice-card-hit" data-open-invoice="${i.id}" aria-label="مشاهده فاکتور ${esc(i.number)}">
      <span class="invoice-card-icon">${icon('file-text','')}</span>
      <span class="list-main"><span class="list-title">فاکتور ${esc(i.number)}</span><span class="list-sub">${esc(i.customerName || 'مشتری آزاد')} · ${dateFa(i.date||i.createdAt)}</span></span>
      <span class="list-value">${money(i.total)}<small class="badge badge-${invoiceStatusClass(i.status)}">${faLabel(INVOICE_STATUS_LABELS, i.status)}</small></span>
    </button>
    ${actionMenu(i.id)}
  </article>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fast invoice entry — UI helpers.
// Pure UI: money / stock / status rules stay in finance.js, inventory.js, invoice-engine.js.
// ─────────────────────────────────────────────────────────────────────────────
const DRAFT_KEY = 'dia.invoice.draft';
const DRAFT_MAX_AGE = 24 * 3600 * 1000;
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹', AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

// Search normaliser: Persian/Arabic digits + letters, ZWNJ, diacritics → one canonical form,
// so «لامپ ۱۲ وات» finds «لامپ 12 وات» and «كابل» finds «کابل».
const normSearch = s => String(s ?? '').toLowerCase()
  .replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d))
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u200c\u200d\s]+/g, ' ').trim();

// 0 = exact, 1 = word starts with query, 2 = contains, -1 = no match (every typed word must match)
function matchRank(name, query) {
  const t = normSearch(query).split(' ').filter(Boolean);
  if (!t.length) return 1;
  const n = normSearch(name);
  if (!t.every(x => n.includes(x))) return -1;
  if (n === t.join(' ')) return 0;
  return (n.startsWith(t[0]) || n.includes(' ' + t[0])) ? 1 : 2;
}

// how often each customer / catalog item appears on past (non-cancelled) invoices → "frequent first" lists
function usageCounts(invoices) {
  const items = new Map(), customers = new Map();
  (invoices || []).forEach(inv => {
    if (inv.status === 'cancelled') return;
    if (inv.customerId != null) customers.set(String(inv.customerId), (customers.get(String(inv.customerId)) || 0) + 1);
    (inv.items || []).forEach(it => {
      if (it.itemId == null || it.type === 'manual') return;
      const k = `${it.type}:${it.itemId}`;
      items.set(k, (items.get(k) || 0) + 1);
    });
  });
  return { items, customers };
}

// Small accessible combobox used by customer / project / item pickers.
// Keeps the existing .invoice-results / .invoice-result classes. Keyboard: ↑ ↓ Enter Esc.
function makeCombo({ input, panel, registry, getQuery, getList, renderItem, onPick, onEnter, autoActive = false }) {
  let list = [], active = -1;
  const buttons = () => [...panel.querySelectorAll('.invoice-result')];
  const paint = () => buttons().forEach((b, i) => { const on = i === active; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); if (on) b.scrollIntoView?.({ block: 'nearest' }); });
  const self = {
    wrap: panel.parentElement,
    get isOpen() { return !panel.hidden; },
    open() {
      registry.forEach(c => { if (c !== self) c.close(); });
      list = getList(getQuery());
      panel.innerHTML = list.length
        ? list.map((o, i) => `<button type="button" class="invoice-result${o.cls ? ' ' + o.cls : ''}" role="option" aria-selected="false" data-i="${i}">${renderItem(o)}</button>`).join('')
        : '<div class="hint empty-result">موردی پیدا نشد.</div>';
      active = autoActive && getQuery().trim() ? list.findIndex(o => !o.isCreate) : -1;
      panel.hidden = false; input.setAttribute('aria-expanded', 'true'); paint();
      requestAnimationFrame(() => panel.scrollIntoView?.({ block: 'nearest' }));
    },
    close() { panel.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); },
    move(d) {
      if (panel.hidden) { self.open(); return; }
      if (!list.length) return;
      active = active < 0 ? (d > 0 ? 0 : list.length - 1) : (active + d + list.length) % list.length;
      paint();
    },
    pick(i) { const o = list[i]; if (!o) return; self.close(); onPick(o); },
    get first() { return list.find(o => !o.isCreate) || null; },
    get list() { return list; }
  };
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-autocomplete', 'list');
  panel.addEventListener('click', e => { const b = e.target.closest('.invoice-result'); if (b) self.pick(Number(b.dataset.i)); });
  input.addEventListener('focus', () => self.open());
  input.addEventListener('click', () => { if (panel.hidden) self.open(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); self.move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); self.move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!panel.hidden && active >= 0) self.pick(active); else onEnter?.(self); }
    else if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); e.stopPropagation(); self.close(); }
    else if (e.key === 'Tab') self.close();
  });
  registry.push(self);
  return self;
}

const minutesAgoFa = ts => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'چند لحظه پیش';
  if (m < 60) return `${num(m)} دقیقه پیش`;
  return `${num(Math.round(m / 60))} ساعت پیش`;
};
const readDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!d || d.v !== 1 || !Array.isArray(d.rows) || Date.now() - d.savedAt > DRAFT_MAX_AGE) { if (d) localStorage.removeItem(DRAFT_KEY); return null; }
    return d.rows.some(r => (r.text || '').trim() || toNumber(r.price) > 0) ? d : null;
  } catch (_) { return null; }
};
const writeDraft = d => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (_) {} };
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} };

let presetProject = null;
export async function renderInvoices(App, opts = {}) {
  presetProject = null;
  const [rows, customers, products, services, projects, settings, transactions, allocations, movements] = await Promise.all([
    DB.all('invoices'), DB.all('customers'), DB.all('products'), DB.all('services'), DB.all('projects'), getSettings(), DB.all('transactions'), DB.all('paymentAllocations'), DB.all('stockMovements')
  ]);
  App.setView(`${pageHeader('فاکتورها', { action: 'فاکتور جدید', actionId: 'add' })}
    <div class="invoice-list-summary"><span><strong>${num(rows.length)}</strong> فاکتور</span><span>مجموع فروش <strong>${money(rows.filter(x => x.status !== 'cancelled').reduce((s,x)=>s+(x.total||0),0))}</strong></span></div>
    <div class="search"><img class="icon" src="./assets/icons/search.svg" alt=""><input id="search" placeholder="جستجوی شماره فاکتور یا مشتری"></div>
    <div id="list" class="list"><div class="skeleton"></div><div class="skeleton"></div></div>`);

  const list = document.getElementById('list');
  const draw = (filter = '') => {
    const q = filter.trim().toLocaleLowerCase('fa-IR');
    const rs = rows.filter(x => `${x.number} ${x.customerName || ''}`.toLocaleLowerCase('fa-IR').includes(q)).sort((a,b)=>b.createdAt-a.createdAt);
    list.innerHTML = rs.map(invoiceCard).join('') || emptyState('فاکتوری ثبت نشده', 'برای شروع یک فاکتور فروش ایجاد کنید.', 'فاکتور جدید', 'add-empty');
    list.querySelectorAll('[data-open-invoice]').forEach(b => b.onclick = () => navigate(`#/invoices/${b.dataset.openInvoice}`));
    bindActionMenus(list, {
      edit: id => { const x = rows.find(r => String(r.id) === String(id)); if (x) { closeModal(); navigate(`#/invoices?edit=${encodeURIComponent(x.id)}`); } },
      delete: async id => { const x=rows.find(r=>String(r.id)===String(id)); if(!x)return;
        const snap=invoiceSnapshot(x,transactions,allocations);
        // an invoice that ever touched the stock ledger is never hard-deleted: its history must stay intact (cancel instead)
        const hasStockHistory=movements.some(m=>(m.sourceType==='invoice'||m.sourceType==='sales_return')&&String(m.sourceId)===String(x.id));
        if(x.status==='draft'&&snap.paid===0&&!hasStockHistory){if(confirm('این پیش‌نویس حذف شود؟')){await DB.delete('invoices',Number(id));toast('پیش‌نویس حذف شد');renderInvoices(App);}return;}
        if(x.status==='cancelled'){toast('این فاکتور قبلاً لغو شده است.');return;}
        const note=snap.paid>0?`\nمبلغ ${money(snap.paid)} که قبلاً دریافت شده است حذف نمی‌شود؛ به‌عنوان بستانکاری مشتری در گردش حساب باقی می‌ماند.`:'';
        if(confirm('فاکتور لغو شود؟ فاکتورهای ثبت‌شده حذف نمی‌شوند و فقط لغو می‌شوند.'+note)){
          const cancelled={...x,status:'cancelled',paidAmount:snap.paid,remainingAmount:0,cancelledAt:Date.now()};
          // cancelling reverses exactly what the ledger holds for this invoice (nothing if already reversed) in the same transaction
          const sp=planInvoiceStock({invoice:cancelled,invoiceId:x.id,movements,products,date:todayISO()});
          if(!sp.ok){toast(sp.error,'error');return;}
          await DB.atomic([{store:'invoices',action:'put',data:cancelled},...movementOps(sp.drafts),...stockCacheOps(products,movements,sp.drafts)]);
          toast('فاکتور لغو شد');renderInvoices(App);}
      }
    });
    list.querySelector('#add-empty')?.addEventListener('click', () => form());
  };
  draw();
  document.getElementById('search').oninput = e => draw(e.target.value);
  document.getElementById('add').onclick = () => form();
  if (opts.newForCustomer) form(Number(opts.newForCustomer));
  if (opts.newBlank) { presetProject = opts.newProject || null; form(opts.newCustomer ? Number(opts.newCustomer) : null); }
  if (opts.editId) { const x=rows.find(r=>String(r.id)===String(opts.editId)); if(x) form(null,x); }

  function nextNumber() {
    const seqs = rows.map(r => Number(r.seq) || 0);
    const base = Number(settings.invoiceStart) || 1001;
    let seq = Math.max(base, ...seqs.map(x => x + 1), base);
    // legacy invoices may have no `seq`: never hand out a number that already exists
    while (findDuplicate(rows, 'number', (settings.invoicePrefix || '') + seq)) seq++;
    return { seq, number: (settings.invoicePrefix || '') + seq };
  }

  function form(preselected = null, existing = null) {
    const legacyTaxEnabled = existing?.taxEnabled ?? (Number(existing?.tax||0) > 0);
    const legacyTaxPercent = existing?.taxPercent ?? (legacyTaxEnabled && Number(existing?.taxableAmount||0) > 0 ? (Number(existing.tax||0) / Number(existing.taxableAmount||1)) * 100 : settings.taxPercent);
    const taxEnabled = existing ? !!legacyTaxEnabled : !!settings.taxEnabled;
    const taxPercent = Number.isFinite(Number(legacyTaxPercent)) ? Math.max(0,Math.min(100,Number(legacyTaxPercent))) : Number(settings.taxPercent)||0;
    const existingLinkedPaid = existing ? invoiceSnapshot(existing, transactions, allocations).paid : 0;
    const jd = jalaliDateControls(existing);
    const usage = usageCounts(rows);
    const nz = v => (Number(v) ? v : '');
    // a project opened from its own page also pre-selects that project's customer
    const presetProjectRow = !existing && presetProject ? projects.find(p => String(p.id) === String(presetProject)) : null;
    const selCustomerId = existing?.customerId ?? preselected ?? presetProjectRow?.customerId ?? null;
    const selProjectId = existing?.projectId || presetProject || null;
    const selCustomer = customers.find(c => String(c.id) === String(selCustomerId));
    const selProject = projects.find(p => String(p.id) === String(selProjectId));
    // new invoice: only «draft» / «issued» (paid / partially_paid are derived from the payment, cancelled makes no sense for a new record)
    // existing invoice with received money can no longer be a draft
    const statusList = existing ? INVOICE_STATUS.filter(s => !(s === 'draft' && existingLinkedPaid > 0)) : ['draft', 'issued'];
    const m = openModal(`<div class="modal-head"><div class="modal-head-text"><h3>${existing ? 'ویرایش فاکتور' : 'فاکتور فروش جدید'}</h3><small class="invoice-preview-number">شماره: ${esc(existing ? existing.number : nextNumber().number)}</small></div><button class="close" aria-label="بستن">${icon('x','')}</button></div>
      <form id="invoice-form" class="invoice-editor" novalidate>
        <div id="draft-banner" class="draft-banner" hidden></div>
        <div class="form-grid invoice-head-grid">
          <div class="field"><label>مشتری</label><div class="invoice-search-wrap combo-wrap"><select name="customerId" class="sr-select" tabindex="-1" aria-hidden="true"><option value="">مشتری آزاد</option>${customers.filter(c=>!c.archived||String(selCustomerId)===String(c.id)).map(c=>`<option value="${c.id}" ${String(selCustomerId)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select><input id="customer-input" class="combo-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" placeholder="مشتری آزاد — جستجو یا انتخاب" aria-label="مشتری" value="${esc(selCustomer?.name||'')}"><div class="invoice-results" hidden></div></div></div>
          <div class="field"><label>پروژه</label><div class="invoice-search-wrap combo-wrap"><select name="projectId" class="sr-select" tabindex="-1" aria-hidden="true"><option value="">بدون پروژه</option>${projects.filter(p=>!p.archived||String(selProjectId||'')===String(p.id)).map(p=>`<option value="${p.id}" ${String(selProjectId||'')===String(p.id)?'selected':''}>${esc(p.name)}</option>`).join('')}</select><input id="project-input" class="combo-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" placeholder="بدون پروژه" aria-label="پروژه" value="${esc(selProject?.name||'')}"><div class="invoice-results" hidden></div></div></div>
          <div class="field head-date"><label>تاریخ فاکتور</label><input type="hidden" name="date" value="${jd.iso}"><div class="jalali-date-picker" data-jalali-picker><select name="jYear" aria-label="سال">${jd.years}</select><select name="jMonth" aria-label="ماه">${jd.months}</select><select name="jDay" aria-label="روز">${jd.days}</select></div><small class="field-hint">${num(jd.jy)}/${String(jd.jm).padStart(2,'0')}/${String(jd.jd).padStart(2,'0')} شمسی</small></div>
          <div class="field"><label>وضعیت</label><select name="status">${statusList.map(s=>`<option value="${s}" ${(existing?.status||'issued')===s?'selected':''}>${faLabel(INVOICE_STATUS_LABELS,s)}</option>`).join('')}</select></div>
        </div>
        <div class="section-title-row"><div class="section-title-compact">اقلام فاکتور</div><button type="button" class="btn btn-secondary" id="add-item">${icon('plus','')}افزودن ردیف</button></div>
        <div id="items"></div>
        <div class="section-title">تخفیف، مالیات و پرداخت</div>
        <div class="form-grid">
          <div class="field"><label>نوع تخفیف کلی</label><select name="discountType"><option value="amount" ${(existing?.discountType||'amount')==='amount'?'selected':''}>مبلغ ثابت</option><option value="percent" ${existing?.discountType==='percent'?'selected':''}>درصدی</option></select></div>
          <div class="field"><label id="discount-label">تخفیف کلی</label><input name="discount" class="amount-input" type="text" inputmode="${existing?.discountType==='percent'?'decimal':'numeric'}" placeholder="۰" value="${nz(existing?.discountInput ?? existing?.discount)}"></div>
          ${taxEnabled?`<div class="field"><label>مالیات ${num(taxPercent)}٪</label><input id="tax-preview" disabled value="۰ ریال"></div>`:''}
          <div class="field"><label>هزینه‌های جانبی</label><input name="extraCosts" class="amount-input" type="text" inputmode="numeric" placeholder="۰" value="${nz(existing?.extraCosts)}"></div>
          <div class="field"><label>مبلغ پرداختی</label><small id="paid-hint" class="field-hint">${existing?'پرداخت‌های ثبت‌شده از گردش حساب خوانده می‌شوند.':''}</small><input name="paidAmount" class="amount-input" type="text" inputmode="numeric" placeholder="۰" aria-describedby="paid-hint" value="${existing?nz(existingLinkedPaid):''}"></div>
        </div>
        <div class="field mt-3"><label>توضیحات</label><textarea name="notes">${esc(existing?.notes||'')}</textarea></div>
        <div class="card card-pad mt-3"><div class="invoice-total"><span>جمع اقلام</span><span id="subtotal">۰ ریال</span></div><div class="invoice-total"><span>تخفیف</span><span id="discount-preview">۰ ریال</span></div>${taxEnabled?`<div class="invoice-total"><span>مالیات</span><span id="tax-total">۰ ریال</span></div>`:''}<div class="invoice-total"><span>مبلغ نهایی</span><strong id="sum">۰ ریال</strong></div></div>
      </form>
      <div class="sticky-invoice-footer"><div class="sticky-invoice-inner">
        <button type="button" class="btn btn-secondary btn-icon" id="footer-add-row" aria-label="افزودن ردیف">+</button>
        <div class="sticky-total"><small id="footer-meta">۰ ردیف</small><strong id="sticky-sum">۰ ریال</strong><small id="sticky-words" class="sticky-words"></small></div>
        ${existing?'':'<button type="button" class="btn btn-secondary" id="save-next">ثبت + بعدی</button>'}
        <button type="button" class="btn btn-primary" id="save-invoice">${existing?'ذخیره تغییرات':'ثبت فاکتور'}</button>
      </div></div>`);
    const f = m.querySelector('#invoice-form'), itemsEl = m.querySelector('#items'), backdrop = m.parentElement;
    backdrop.classList.add('invoice-backdrop');
    const rowsEls = () => [...itemsEl.querySelectorAll('.invoice-row')];
    const combos = [];

    // ── Jalali date (unchanged behaviour) ────────────────────────────────────
    const dateHidden=f.querySelector('[name=date]'), datePicker=f.querySelector('[data-jalali-picker]'), dateHint=f.querySelector('.field-hint');
    const syncJalaliDate=()=>{
      const jy=Number(f.jYear.value), jm=Number(f.jMonth.value), max=jalaliDaysInMonth(jy,jm);
      [...f.jDay.options].forEach(o=>o.hidden=Number(o.value)>max);
      if(Number(f.jDay.value)>max) f.jDay.value=String(max);
      dateHidden.value=isoFromJalali(jy,jm,Number(f.jDay.value));
      if(dateHint) dateHint.textContent=`${num(jy)}/${String(jm).padStart(2,'0')}/${String(f.jDay.value).padStart(2,'0')} شمسی`;
    };
    datePicker?.querySelectorAll('select').forEach(s=>s.addEventListener('change',syncJalaliDate));
    syncJalaliDate();

    // ── generic helpers ──────────────────────────────────────────────────────
    const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    const clearErr = field => { field?.querySelectorAll('.field-error').forEach(x => x.remove()); field?.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid')); };
    const focusSel = el => { try { el.focus({ preventScroll: true }); el.setSelectionRange?.(0, String(el.value).length); el.select?.(); } catch (_) {} };
    const scrollToRow = (row, delay = 120) => setTimeout(() => row.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), delay);

    // ── customer + project pickers (real <select>s stay the source of truth; the combobox is the UI) ──
    const custSel = f.customerId, projSel = f.projectId;
    const custInput = m.querySelector('#customer-input'), projInput = m.querySelector('#project-input');
    const nameOfCustomer = id => customers.find(c => String(c.id) === String(id))?.name || '';
    const nameOfProject = id => projects.find(p => String(p.id) === String(id))?.name || '';
    const fireChange = sel => sel.dispatchEvent(new Event('change', { bubbles: true }));
    const firstBlankSearch = () => rowsEls().find(r => !r.querySelector('.item-search').value.trim())?.querySelector('.item-search') || null;
    const goToItems = () => { const s = firstBlankSearch(); if (s) s.focus({ preventScroll: true }); };

    custSel.addEventListener('change', () => {
      custInput.value = nameOfCustomer(custSel.value);
      clearErr(custSel.closest('.field'));
      const p = projects.find(x => String(x.id) === String(projSel.value));
      if (p && custSel.value && p.customerId && String(p.customerId) !== String(custSel.value)) { projSel.value = ''; fireChange(projSel); }
    });
    projSel.addEventListener('change', () => {
      projInput.value = nameOfProject(projSel.value);
      clearErr(projSel.closest('.field'));
      const p = projects.find(x => String(x.id) === String(projSel.value));
      if (p?.customerId && !custSel.value && customers.some(c => String(c.id) === String(p.customerId))) { custSel.value = String(p.customerId); fireChange(custSel); }
    });
    const typedQuery = (input, sel, nameOf) => (sel.value && normSearch(input.value) === normSearch(nameOf(sel.value))) ? '' : input.value;
    const custCombo = makeCombo({
      input: custInput, panel: custInput.nextElementSibling, registry: combos, autoActive: true,
      getQuery: () => typedQuery(custInput, custSel, nameOfCustomer),
      getList: q => {
        const base = customers.filter(c => !c.archived || String(c.id) === String(custSel.value));
        const sc = c => usage.customers.get(String(c.id)) || 0;
        const hits = base.map(c => ({ c, r: matchRank(c.name, q) })).filter(x => x.r >= 0)
          .sort((a, b) => a.r - b.r || sc(b.c) - sc(a.c) || String(a.c.name).localeCompare(String(b.c.name), 'fa')).slice(0, 10)
          .map(({ c }) => ({ kind: 'customer', id: c.id, name: c.name, sub: c.mobile || c.phone || '' }));
        const out = q.trim() ? hits : [{ kind: 'none', name: 'مشتری آزاد', sub: 'بدون ثبت مشتری' }, ...hits];
        if (q.trim() && !base.some(c => normSearch(c.name) === normSearch(q))) out.push({ kind: 'create', name: q.trim(), isCreate: true, cls: 'is-create' });
        return out;
      },
      renderItem: o => o.kind === 'create' ? `<span>＋ ساخت مشتری «${esc(o.name)}»</span>` : `<span>${esc(o.name)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>`,
      onPick: async o => {
        if (o.kind === 'none') { custSel.value = ''; fireChange(custSel); }
        else if (o.kind === 'customer') { custSel.value = String(o.id); fireChange(custSel); }
        else if (o.kind === 'create') {
          const v = validateCustomer({ name: o.name });
          if (!v.valid) { toast(v.errors[0]?.message || 'نام مشتری معتبر نیست', 'error'); return; }
          try {
            const id = await DB.add('customers', { name: o.name, status: 'active' });
            customers.push({ id, name: o.name, status: 'active', createdAt: Date.now() });
            custSel.add(new Option(o.name, String(id)));
            custSel.value = String(id); fireChange(custSel);
          } catch (err) { console.error(err); toast('ساخت مشتری انجام نشد.', 'error'); return; }
        }
        goToItems();
      },
      onEnter: () => { if (!custInput.value.trim()) goToItems(); }
    });
    custInput.addEventListener('input', () => {
      if (custSel.value && normSearch(custInput.value) !== normSearch(nameOfCustomer(custSel.value))) custSel.value = '';
      clearErr(custSel.closest('.field')); custCombo.open();
    });
    const projCombo = makeCombo({
      input: projInput, panel: projInput.nextElementSibling, registry: combos, autoActive: true,
      getQuery: () => typedQuery(projInput, projSel, nameOfProject),
      getList: q => {
        const cid = custSel.value;
        const base = projects.filter(p => (!p.archived || String(p.id) === String(projSel.value)) && (!cid || !p.customerId || String(p.customerId) === String(cid)));
        const hits = base.map(p => ({ p, r: matchRank(p.name, q) })).filter(x => x.r >= 0).sort((a, b) => a.r - b.r || String(a.p.name).localeCompare(String(b.p.name), 'fa')).slice(0, 10)
          .map(({ p }) => ({ kind: 'project', id: p.id, name: p.name, sub: nameOfCustomer(p.customerId) }));
        return q.trim() ? hits : [{ kind: 'none', name: 'بدون پروژه' }, ...hits];
      },
      renderItem: o => `<span>${esc(o.name)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>`,
      onPick: o => { projSel.value = o.kind === 'none' ? '' : String(o.id); fireChange(projSel); goToItems(); },
      onEnter: () => { if (!projInput.value.trim()) goToItems(); }
    });
    projInput.addEventListener('input', () => {
      if (projSel.value && normSearch(projInput.value) !== normSearch(nameOfProject(projSel.value))) projSel.value = '';
      clearErr(projSel.closest('.field')); projCombo.open();
    });
    // typed text that was never picked must not silently become «مشتری آزاد» / «بدون پروژه»
    const resolveTyped = (input, sel, list, label) => {
      const t = input.value.trim();
      if (!t || sel.value) return null;
      const hit = list.find(x => normSearch(x.name) === normSearch(t));
      if (hit) { sel.value = String(hit.id); fireChange(sel); return null; }
      return { field: sel.name, message: `${label} را از فهرست انتخاب کنید (یا متن را پاک کنید).` };
    };

    // ── catalog + rows ───────────────────────────────────────────────────────
    const catalog = [...products.filter(p=>!p.archived).map(p=>({type:'product',id:p.id,name:p.name,unit:p.unit||'عدد',price:Number(p.salePrice)||0,stock:Number(p.stock)||0})), ...services.filter(s=>!s.archived).map(s=>({type:'service',id:s.id,name:s.name,unit:s.unit||'مورد',price:Number(s.price)||0}))];
    const catalogFind = (type, id) => catalog.find(c => c.type === type && String(c.id) === String(id)) || null;
    const useCount = c => usage.items.get(`${c.type}:${c.id}`) || 0;
    const kindLabel = t => t === 'product' ? 'کالا' : t === 'service' ? 'خدمت' : 'دستی';
    const perRowName = row => row.querySelector('.item-search').value.trim();
    const isBlankRow = row => !perRowName(row) && !toNumber(row.querySelector('.price').value) && !toNumber(row.querySelector('.rdisc').value);

    const readRow = row => {
      const it = row._item || {}, manual = !row._item;
      return { type: manual ? 'manual' : (it.type || 'product'), itemId: it.id ?? it.itemId ?? null, name: perRowName(row), unit: it.unit || 'مورد',
        quantity: toNumber(row.querySelector('.qty').value), unitPrice: toNumber(row.querySelector('.price').value),
        discountType: row.querySelector('.rdtype')?.value || it.discountType || 'amount',
        discountInput: toNumber(row.querySelector('.rdisc').value), discount: toNumber(row.querySelector('.rdisc').value) };
    };
    const readItems = rs => (rs || rowsEls()).map(readRow);

    const paintBadge = row => {
      const badge = row.querySelector('.kind-badge'), wrap = row.querySelector('.item-wrap');
      if (!perRowName(row)) { badge.hidden = true; wrap.classList.remove('has-badge'); return; }
      const it = row._item, kind = !it || it.type === 'manual' ? 'manual' : it.type;
      badge.dataset.kind = row.dataset.short === '1' ? 'short' : kind;
      badge.textContent = kind === 'product' ? (row.dataset.short === '1' ? 'کمبود موجودی' : `کالا · ${num(it.stock ?? 0)}`) : kind === 'service' ? 'خدمت' : 'قلم دستی';
      badge.title = kind === 'manual' ? 'قلم دستی: موجودی انبار کم نمی‌شود' : '';
      badge.hidden = false; wrap.classList.add('has-badge');
    };

    const addRow = (init = {}, { focus = false } = {}) => {
      const row = document.createElement('div'); row.className = 'invoice-row';
      const linked = init.item ? { ...init.item, id: init.item.id ?? init.item.itemId ?? null } : null;
      if (linked && linked.type === 'product' && linked.stock === undefined) linked.stock = catalogFind('product', linked.id)?.stock;
      const dtype = init.discountType === 'percent' ? 'percent' : 'amount';
      const hasDisc = Number(init.discountInput) > 0;
      row.innerHTML = `<div class="row-top"><span class="row-index" aria-hidden="true"></span>
        <div class="invoice-search-wrap item-wrap"><input class="item-search" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" placeholder="نام کالا یا خدمت…" aria-label="نام کالا یا خدمت" value="${esc(init.name ?? linked?.name ?? '')}"><span class="kind-badge" hidden></span><div class="invoice-results" hidden></div></div>
        <button type="button" class="btn-remove" aria-label="حذف ردیف">×</button></div>
        <div class="row-bottom"><div class="qty-stepper"><button type="button" class="qty-dec" aria-label="کاهش تعداد" tabindex="-1">−</button><input class="qty" type="text" inputmode="decimal" aria-label="تعداد" value="${esc(init.quantity ?? 1)}"><button type="button" class="qty-inc" aria-label="افزایش تعداد" tabindex="-1">+</button></div>
        <input class="price" type="text" inputmode="numeric" aria-label="قیمت واحد" placeholder="قیمت واحد" value="${esc(init.unitPrice ? init.unitPrice : '')}">
        <output class="line-total" aria-label="جمع ردیف">۰</output>
        <button type="button" class="row-extras-toggle${hasDisc ? ' has-value' : ''}" aria-label="تخفیف ردیف" aria-expanded="${hasDisc}">٪</button></div>
        <div class="row-extras" ${hasDisc ? '' : 'hidden'}><select class="rdtype" aria-label="نوع تخفیف ردیف"><option value="amount" ${dtype === 'amount' ? 'selected' : ''}>مبلغ</option><option value="percent" ${dtype === 'percent' ? 'selected' : ''}>درصد</option></select><input class="rdisc amount-input" type="text" inputmode="${dtype === 'percent' ? 'decimal' : 'numeric'}" aria-label="تخفیف ردیف" placeholder="تخفیف ردیف" value="${esc(hasDisc ? init.discountInput : '')}"></div>
        <div class="stock-hint" hidden></div><div class="row-errors" role="alert"></div>`;
      row._item = linked;
      itemsEl.appendChild(row);
      const search = row.querySelector('.item-search'), qty = row.querySelector('.qty'), price = row.querySelector('.price');
      const rdisc = row.querySelector('.rdisc'), rdtype = row.querySelector('.rdtype'), toggle = row.querySelector('.row-extras-toggle'), extras = row.querySelector('.row-extras');
      bindAmountInput(qty, { allowDecimal: true }); bindAmountInput(price, { allowDecimal: false }); bindAmountInput(rdisc, { allowDecimal: true });

      // item picker: frequent items first when empty, otherwise ranked matches; Enter never silently picks a "first guess"
      const itemCombo = makeCombo({
        input: search, panel: row.querySelector('.invoice-results'), registry: combos,
        getQuery: () => (row._item && normSearch(search.value) === normSearch(row._item.name || '')) ? '' : search.value,
        getList: q => catalog.map(c => ({ c, r: matchRank(c.name, q) })).filter(x => x.r >= 0)
          .sort((a, b) => a.r - b.r || useCount(b.c) - useCount(a.c) || String(a.c.name).localeCompare(String(b.c.name), 'fa')).slice(0, 8)
          .map(({ c }) => ({ ...c, cls: c.type === 'product' && c.stock <= 0 ? 'is-out' : '' })),
        renderItem: x => `<span>${esc(x.name)}<small>${x.type === 'product' ? 'کالا' : 'خدمت'} · ${esc(x.unit)}${x.type === 'product' ? ` · موجودی ${num(x.stock)}` : ''}</small></span><strong>${money(x.price)}</strong>`,
        onPick: x => {
          row._item = { type: x.type, id: x.id, name: x.name, unit: x.unit, price: x.price, stock: x.stock, quantity: 1, unitPrice: x.price, discount: 0 };
          search.value = x.name; setVal(qty, '1'); setVal(price, String(x.price));
          paintBadge(row); refreshTotals(); focusSel(qty); scrollToRow(row, 250);   // synchronous focus keeps the iOS keyboard up
        },
        onEnter: self => {
          const t = search.value.trim(); if (!t) return;
          const exact = self.list.filter(o => normSearch(o.name) === normSearch(t));
          if (exact.length === 1) { self.pick(self.list.indexOf(exact[0])); return; }
          self.close(); focusSel(qty);   // typed text stays a manual line
        }
      });
      search.addEventListener('focus', () => { if (row._item) setTimeout(() => { try { search.select(); } catch (_) {} }, 0); });
      search.addEventListener('input', () => {
        // typing over a picked product turns the line into a manual one: badge says so, stock will NOT be deducted
        if (row._item && normSearch(search.value) !== normSearch(row._item.name || '')) row._item = null;
        search.removeAttribute('aria-invalid'); if (!row.querySelector('[aria-invalid]')) row.querySelector('.row-errors').innerHTML = ''; paintBadge(row); itemCombo.open(); refreshTotals();
      });

      // qty stepper: tap = ±1, hold = fast repeat (×5 after a second)
      const step = (dir, amt = 1) => {
        const cur = toNumber(qty.value, 0) || 0; let next = cur + dir * amt;
        if (dir < 0 && next < 1) { if (cur > 1) next = 1; else return; }
        setVal(qty, String(Math.round(next * 1000) / 1000));
      };
      [[row.querySelector('.qty-dec'), -1], [row.querySelector('.qty-inc'), 1]].forEach(([btn, dir]) => {
        let t = null, iv = null, n = 0, pointerUsed = false;
        const stop = () => { clearTimeout(t); clearInterval(iv); t = iv = null; };
        btn.addEventListener('pointerdown', e => {
          e.preventDefault(); pointerUsed = true; n = 0; step(dir, 1);
          try { btn.setPointerCapture(e.pointerId); } catch (_) {}
          t = setTimeout(() => { iv = setInterval(() => { n++; step(dir, n > 8 ? 5 : 1); }, 90); }, 350);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, stop));
        btn.addEventListener('contextmenu', e => e.preventDefault());
        btn.addEventListener('click', e => { if (pointerUsed) { pointerUsed = false; return; } step(dir, 1); });   // keyboard / assistive tech
      });

      // keyboard flow (desktop / iPad keyboards; iPhone number pads have no Return key, so touch paths never depend on it)
      qty.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); focusSel(price); } });
      price.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const next = row.nextElementSibling; if (next?.classList.contains('invoice-row')) next.querySelector('.item-search').focus(); else addRowAndFocus(); } });
      rdisc.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
      qty.addEventListener('focus', () => setTimeout(() => { try { qty.select(); } catch (_) {} }, 0));

      toggle.addEventListener('click', () => {
        const open = extras.hidden;
        if (!open && toNumber(rdisc.value) > 0) { rdisc.focus(); return; }   // a row with a discount never hides it
        extras.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) rdisc.focus({ preventScroll: true });
      });
      rdtype.addEventListener('change', () => { setVal(rdisc, ''); rdisc.inputMode = rdtype.value === 'percent' ? 'decimal' : 'numeric'; });

      row.querySelectorAll('input,select').forEach(i => {
        const touch = e => { if (e.target.matches('.item-search')) return; e.target.removeAttribute('aria-invalid'); if (!row.querySelector('[aria-invalid]')) row.querySelector('.row-errors').innerHTML = ''; refreshTotals(); };
        i.addEventListener('input', touch); i.addEventListener('change', touch);
      });
      rdisc.addEventListener('input', () => toggle.classList.toggle('has-value', toNumber(rdisc.value) > 0));

      row.querySelector('.btn-remove').addEventListener('click', () => {
        const filled = !isBlankRow(row);
        if (!filled) { row.remove(); if (!rowsEls().length) addRow(); refreshTotals(); return; }
        // filled rows get a 6-second undo instead of a confirm dialog
        const ph = document.createElement('div'); ph.className = 'row-undo';
        ph.innerHTML = `<span>«${esc(perRowName(row) || 'ردیف')}» حذف شد</span><button type="button">بازگردانی</button>`;
        row.replaceWith(ph); if (!rowsEls().length) addRow(); refreshTotals();
        const timer = setTimeout(() => ph.remove(), 6000);
        ph.querySelector('button').addEventListener('click', () => { clearTimeout(timer); ph.replaceWith(row); refreshTotals(); });
      });
      paintBadge(row);
      if (focus) { search.focus({ preventScroll: true }); scrollToRow(row, 80); }
      return row;
    };
    const addRowAndFocus = () => { const r = addRow({}, { focus: true }); refreshTotals(); return r; };
    const initFromSaved = it => ({ item: { ...it }, name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, discountType: it.discountType, discountInput: it.discountInput ?? it.discount });

    // ── totals, stock preview ────────────────────────────────────────────────
    const stockInvoicePreview = z => {
      const paidNow = Math.max(existingLinkedPaid, toMoney(f.paidAmount.value));
      return { items: readItems(), status: deriveInvoiceStatus(f.status.value, f.status.value === 'draft' ? 0 : paidNow, z.total), number: existing?.number || '', id: existing?.id ?? null, stockTracked: existing ? existing.stockTracked === true : true };
    };
    const applyShortages = (shortages = [], { scroll = false } = {}) => {
      let first = null;
      rowsEls().forEach(r => {
        const it = r._item, s = it && it.type === 'product' ? shortages.find(x => String(x.productId) === String(it.id)) : null;
        const hint = r.querySelector('.stock-hint'), qty = r.querySelector('.qty');
        if (s) {
          r.dataset.short = '1'; qty.setAttribute('aria-invalid', 'true');
          hint.hidden = false; hint.className = 'stock-hint danger'; hint.textContent = `موجودی کافی نیست — موجودی: ${num(s.available)}، درخواستی: ${num(s.needed)}`;
          first = first || r;
        } else if (r.dataset.short === '1') {
          delete r.dataset.short; qty.removeAttribute('aria-invalid'); hint.hidden = true; hint.textContent = '';
        }
        paintBadge(r);
      });
      if (scroll && first) { first.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
    };
    let stockRaf = 0;
    const refreshStock = z => { cancelAnimationFrame(stockRaf); stockRaf = requestAnimationFrame(() => { if (!m.isConnected) return; const sp = planInvoiceStock({ invoice: stockInvoicePreview(z), invoiceId: existing?.id ?? null, movements, products, date: todayISO() }); applyShortages(sp.ok ? [] : (sp.shortages || [])); }); };
    const refreshTotals = () => {
      const rs = rowsEls(), its = readItems(rs);
      const d = toNumber(f.discount.value), extra = toNumber(f.extraCosts?.value);
      const z = calculateTotals(its, d, taxEnabled, taxPercent, f.discountType?.value || 'amount', extra);
      rs.forEach((r, i) => { r.querySelector('.row-index').textContent = num(i + 1); r.querySelector('.line-total').textContent = money(z.lineTotals[i] ?? 0, ''); });
      m.querySelector('#subtotal').textContent = money(z.subtotal);
      m.querySelector('#discount-preview').textContent = money(z.discountTotal);
      m.querySelector('#sum').textContent = money(z.total);
      m.querySelector('#sticky-sum').textContent = money(z.total);
      m.querySelector('#footer-meta').textContent = `${num(rs.filter(r => !isBlankRow(r)).length)} ردیف`;
      m.querySelector('#sticky-words').textContent = z.total > 0 ? amountToWordsFa(z.total) : '';
      if (taxEnabled) { m.querySelector('#tax-preview').value = money(z.tax); m.querySelector('#tax-total').textContent = money(z.tax); }
      const label = m.querySelector('#discount-label'); if (label) label.textContent = f.discountType.value === 'percent' ? 'تخفیف کلی (٪)' : 'تخفیف کلی (ریال)';
      refreshStock(z);
      return z;
    };

    // ── global fields ────────────────────────────────────────────────────────
    bindAmountInput(f.discount, { allowDecimal: true }); bindAmountInput(f.extraCosts, { allowDecimal: false }); bindAmountInput(f.paidAmount, { allowDecimal: false });
    f.discount.addEventListener('input', refreshTotals); f.extraCosts?.addEventListener('input', refreshTotals); f.paidAmount.addEventListener('input', refreshTotals);
    f.discountType.addEventListener('change', () => { setVal(f.discount, ''); f.discount.inputMode = f.discountType.value === 'percent' ? 'decimal' : 'numeric'; refreshTotals(); });   // 5000 ریال must never turn into "5000٪"
    const paidHint = m.querySelector('#paid-hint');
    const syncPaidState = () => {
      const isDraft = f.status.value === 'draft';
      f.paidAmount.disabled = isDraft;
      if (isDraft) f.paidAmount.value = '';
      paidHint.textContent = isDraft ? 'پیش‌نویس پرداخت نمی‌گیرد و موجودی انبار را کم نمی‌کند.' : (existing ? 'پرداخت‌های ثبت‌شده از گردش حساب خوانده می‌شوند.' : '');
      refreshTotals();
    };
    f.status.addEventListener('change', syncPaidState);

    // ── rows from the start ──────────────────────────────────────────────────
    if (existing?.items?.length) existing.items.forEach(it => addRow(initFromSaved(it))); else addRow();
    m.querySelector('#add-item').onclick = addRowAndFocus;
    m.querySelector('#footer-add-row').onclick = addRowAndFocus;
    m.querySelector('.close').onclick = closeModal;
    syncPaidState();

    // ── draft auto-save / recovery (new invoices only) ───────────────────────
    let draftPending = false, draftTimer = 0;
    const snapshot = () => ({ v: 1, savedAt: Date.now(), customerId: custSel.value, projectId: projSel.value, date: dateHidden.value, dateIsToday: dateHidden.value === todayISO(),
      status: f.status.value, discountType: f.discountType.value, discount: f.discount.value, extraCosts: f.extraCosts?.value || '', paidAmount: f.paidAmount.value, notes: f.notes.value,
      rows: rowsEls().map(r => ({ item: r._item && r._item.type !== 'manual' ? { type: r._item.type, id: r._item.id } : null, text: r.querySelector('.item-search').value, qty: r.querySelector('.qty').value, price: r.querySelector('.price').value, rdtype: r.querySelector('.rdtype').value, rdisc: r.querySelector('.rdisc').value })) });
    const saveDraftNow = () => { if (!m.isConnected || existing || draftPending) return; const s = snapshot(); if (s.rows.some(r => r.text.trim() || toNumber(r.price) > 0)) writeDraft(s); else clearDraft(); };
    const scheduleDraft = () => { if (existing || draftPending) return; clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftNow, 500); };
    f.addEventListener('input', scheduleDraft); f.addEventListener('change', scheduleDraft);
    const restoreDraft = d => {
      if (d.customerId && customers.some(c => String(c.id) === String(d.customerId))) { custSel.value = String(d.customerId); fireChange(custSel); }
      if (d.projectId && projects.some(p => String(p.id) === String(d.projectId))) { projSel.value = String(d.projectId); fireChange(projSel); }
      if (!d.dateIsToday && d.date) { const j = jalaliFromISO(d.date); if (j) { f.jYear.value = String(j[0]); f.jMonth.value = String(j[1]); f.jDay.value = String(j[2]); syncJalaliDate(); } }
      if (statusList.includes(d.status)) f.status.value = d.status;
      f.discountType.value = d.discountType === 'percent' ? 'percent' : 'amount'; f.discount.inputMode = f.discountType.value === 'percent' ? 'decimal' : 'numeric';
      setVal(f.discount, d.discount || ''); if (f.extraCosts) setVal(f.extraCosts, d.extraCosts || ''); f.notes.value = d.notes || '';
      itemsEl.innerHTML = '';
      d.rows.forEach(r => { const c = r.item ? catalogFind(r.item.type, r.item.id) : null; addRow({ item: c ? { ...c, quantity: 1, unitPrice: 0, discount: 0 } : null, name: r.text, quantity: r.qty, unitPrice: toNumber(r.price) || '', discountType: r.rdtype, discountInput: toNumber(r.rdisc) || '' }); });
      if (!rowsEls().length) addRow();
      syncPaidState(); if (!f.paidAmount.disabled) setVal(f.paidAmount, d.paidAmount || '');
      refreshTotals();
    };
    if (!existing) {
      const d = readDraft(), banner = m.querySelector('#draft-banner');
      if (d) {
        draftPending = true; banner.hidden = false;
        banner.innerHTML = `<span>پیش‌نویس ذخیره‌شده · ${minutesAgoFa(d.savedAt)} · ${num(d.rows.filter(r => (r.text || '').trim() || toNumber(r.price) > 0).length)} ردیف</span><span class="draft-actions"><button type="button" class="btn btn-primary" data-draft="restore">بازیابی</button><button type="button" class="btn btn-ghost" data-draft="discard">شروع تازه</button></span>`;
        banner.addEventListener('click', e => {
          const b = e.target.closest('[data-draft]'); if (!b) return;
          draftPending = false; banner.hidden = true;
          if (b.dataset.draft === 'restore') restoreDraft(d); else clearDraft();
        });
      }
    }

    // ── keyboard-aware layout (iOS: fixed elements ignore the on-screen keyboard) ──
    const vv = window.visualViewport;
    const fitViewport = () => {
      if (!m.isConnected) { vv?.removeEventListener('resize', fitViewport); vv?.removeEventListener('scroll', fitViewport); return; }
      const kbOpen = window.innerHeight - vv.height > 100;
      backdrop.classList.toggle('kb-open', kbOpen);
      if (kbOpen) { backdrop.style.top = `${vv.offsetTop}px`; backdrop.style.height = `${vv.height}px`; backdrop.style.bottom = 'auto'; }
      else { backdrop.style.top = ''; backdrop.style.height = ''; backdrop.style.bottom = ''; }
    };
    if (vv) { vv.addEventListener('resize', fitViewport); vv.addEventListener('scroll', fitViewport); fitViewport(); }
    m.addEventListener('focusin', e => { const t = e.target; if (t.matches?.('input,textarea,select') && !t.closest('.invoice-results')) setTimeout(() => t.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 320); });

    // one document-level listener closes every open result list when focus / tap leaves it
    const outside = e => {
      if (!m.isConnected) { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside, true); return; }
      combos.forEach(c => { if (c.isOpen && !c.wrap.contains(e.target)) c.close(); });
    };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', outside, true);

    // ── submit ───────────────────────────────────────────────────────────────
    const ITEM_ERR = /^items\[(\d+)\]\.(.+)$/;
    const renderItemErrors = (keptRows, errors) => {
      const fieldSel = { quantity: '.qty', unitPrice: '.price', discount: '.rdisc', name: '.item-search', itemId: '.item-search', type: '.item-search' };
      const byRow = new Map();
      errors.forEach(e => { const [, idx, field] = e.field.match(ITEM_ERR) || []; const row = keptRows[Number(idx)]; if (!row) return; if (!byRow.has(row)) byRow.set(row, []); byRow.get(row).push({ field, message: e.message }); });
      let firstInput = null;
      byRow.forEach((list, row) => {
        row.querySelector('.row-errors').innerHTML = list.map(x => `<div class="field-error">${esc(x.message)}</div>`).join('');
        list.forEach(x => {
          const el = row.querySelector(fieldSel[x.field] || '.item-search');
          if (x.field === 'discount') { row.querySelector('.row-extras').hidden = false; row.querySelector('.row-extras-toggle').setAttribute('aria-expanded', 'true'); }
          el?.setAttribute('aria-invalid', 'true'); firstInput = firstInput || el;
        });
      });
      if (firstInput) { firstInput.closest('.invoice-row').scrollIntoView?.({ block: 'center', behavior: 'smooth' }); try { firstInput.focus({ preventScroll: true }); } catch (_) {} }
      return byRow.size;
    };
    const clearRowErrors = () => rowsEls().forEach(r => { r.querySelector('.row-errors').innerHTML = ''; r.querySelectorAll('[aria-invalid]').forEach(x => { if (!(x.matches('.qty') && r.dataset.short === '1')) x.removeAttribute('aria-invalid'); }); });

    let submitMode = 'save';
    const btnSave = m.querySelector('#save-invoice'), btnNext = m.querySelector('#save-next');
    const setBusy = (on, mode) => [btnSave, btnNext].filter(Boolean).forEach(b => {
      if (on) { b.dataset.orig = b.innerHTML; b.disabled = true; if ((mode === 'next') === (b === btnNext)) b.innerHTML = '<span class="spinner"></span> در حال ثبت…'; }
      else if (b.dataset.orig !== undefined) { b.innerHTML = b.dataset.orig; delete b.dataset.orig; b.disabled = false; }
    });

    const submit = async mode => {
      clearRowErrors();
      const keptRows = rowsEls().filter(r => !isBlankRow(r));   // untouched trailing rows never block saving
      const its = readItems(keptRows), rawDiscount = toNumber(f.discount.value), rawExtra = toNumber(f.extraCosts?.value), fd = Object.fromEntries(new FormData(f));
      const z = calculateTotals(its, rawDiscount, taxEnabled, taxPercent, fd.discountType || 'amount', rawExtra);
      const partyErrors = [resolveTyped(custInput, custSel, customers, 'مشتری'), resolveTyped(projInput, projSel, projects, 'پروژه')].filter(Boolean);
      if (partyErrors.length) { showValidationErrors(f, { valid: false, errors: partyErrors }); f.querySelector('.field-error')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); return; }
      fd.customerId = custSel.value; fd.projectId = projSel.value;
      // a draft never takes payment (it would be upgraded to paid and deduct stock): the field is disabled, treat it as 0
      const paidRaw = fd.status === 'draft' ? '0' : fd.paidAmount;
      // the paid field must be a whole, non-negative Rial amount (validated on the raw text, never silently coerced)
      if(showValidationErrors(f,validateAmount(paidRaw,'paidAmount',{allowDecimal:false})))return;
      const paidAmount=toMoney(paidRaw);
      const before=existing?invoiceSnapshot(existing,transactions,allocations):null, recorded=before?before.paid:0;
      const derived=deriveInvoiceStatus(fd.status,paidAmount,z.total);
      const data={invoiceNumber:existing?.number||nextNumber().number,customerId:fd.customerId?Number(fd.customerId):null,projectId:fd.projectId?Number(fd.projectId):null,date:fd.date,items:z.items.map(({lineSubtotal,...i})=>i),discount:z.discountTotal,discountType:z.discountType,discountInput:z.discountInput,extraCosts:z.extraCosts,tax:z.tax,paidAmount,status:derived,total:z.total,remainingAmount:z.remainingAmount,allowOverpayment:false};
      // money policy lives in finance.js: paid can never go down, total can never drop below what was received, no silent truncation
      const policyError=existing?checkInvoiceSave({existing,snapshot:before,newTotal:z.total,paidInput:paidAmount,finalStatus:fd.status==='cancelled'?'cancelled':derived,customerId:data.customerId,projectId:data.projectId}):null;
      if(policyError){toast(policyError,'error');return;}
      const v=validateInvoice(data);
      const itemErrs=v.errors.filter(e=>ITEM_ERR.test(e.field)), rest=v.errors.filter(e=>!ITEM_ERR.test(e.field));
      const bad=showValidationErrors(f,{valid:!rest.length,errors:rest});
      const badRows=renderItemErrors(keptRows,itemErrs);
      if(bad||badRows){ if(badRows&&!bad)toast(`${num(badRows)} ردیف نیاز به اصلاح دارد — زیر هر ردیف دلیلش نوشته شده.`,'error'); else if(rest.some(e=>e.field==='items'))rowsEls()[0]?.querySelector('.item-search').focus(); return; }
      if(!existing&&findDuplicate(rows,'number',data.invoiceNumber)){toast('شماره فاکتور تکراری است.','error');return;}
      const customer=customers.find(c=>c.id===data.customerId);
      const finalPaid=Math.max(recorded,paidAmount), delta=Math.max(0,finalPaid-recorded);
      const finalStatus=deriveInvoiceStatus(fd.status,finalPaid,z.total);
      const row={...(existing||{}),number:data.invoiceNumber,seq:existing?.seq||nextNumber().seq,customerId:data.customerId,projectId:data.projectId,customerName:customer?.name||'مشتری آزاد',items:data.items,discount:data.discount,discountType:data.discountType,discountInput:data.discountInput,extraCosts:data.extraCosts,tax:data.tax,taxableAmount:z.taxableAmount,taxEnabled,taxPercent,total:data.total,paidAmount:finalPaid,remainingAmount:finalStatus==='cancelled'?0:Math.max(0,z.total-finalPaid),status:finalStatus,notes:fd.notes||'',date:data.date,createdAt:existing?.createdAt||Date.now()};
      // payment date: creating an invoice => the invoice date; adding a payment while editing => today (when the money really arrived)
      const payment=delta>0?{type:'customer_payment',amount:delta,customerId:data.customerId,party:customer?.name||'مشتری آزاد',description:existing?'دریافت هنگام ویرایش فاکتور':'دریافت هنگام ثبت فاکتور',projectId:row.projectId||null,date:existing?todayISO():data.date}:null;
      // inventory: new invoices are tracked from now on; legacy (pre-ledger) invoices stay untracked and never touch stock
      if(!existing) row.stockTracked=true;
      const sp=planInvoiceStock({invoice:row,invoiceId:existing?.id??null,movements,products,date:todayISO()});
      if(!sp.ok){ if(sp.shortages?.length) applyShortages(sp.shortages,{scroll:true}); toast(sp.error,'error');return;}
      if(existing){
        const ops=[{store:'invoices',action:'put',data:row},...movementOps(sp.drafts),...stockCacheOps(products,movements,sp.drafts)];
        // legacy invoice (paidAmount without payment transactions): convert it ONCE into a real payment so it is never counted twice
        if(before.linkedCount===0&&before.legacyPaid>0) ops.push({store:'transactions',action:'add',data:legacyMigrationTx(existing,existing.customerName||customer?.name)});
        if(payment) ops.push({store:'transactions',action:'add',data:{...payment,invoiceId:existing.id}});
        await DB.atomic(ops);
      } else {
        row.id=await DB.saveInvoiceWithPayment(row,payment,sp.drafts,stockCacheOps(products,movements,sp.drafts));
      }
      clearTimeout(draftTimer); clearDraft();
      closeModal();
      const summary=`${num(its.length)} ردیف · ${money(z.total)}${finalStatus!=='cancelled'&&finalStatus!=='draft'&&z.total-finalPaid>0?` · مانده ${money(z.total-finalPaid)}`:''}`;
      if(mode==='next'&&!existing){
        toast(`فاکتور ${row.number} ثبت شد · ${summary}`);
        // reload everything (stock + next number) and open a fresh form for the same customer / project
        renderInvoices(App,{newBlank:'1',newProject:data.projectId,newCustomer:data.customerId});
      } else { toast(existing?'فاکتور ویرایش شد':`فاکتور ${row.number} ثبت شد · ${summary}`); navigate(`#/invoices/${row.id}`); }
    };
    f.onsubmit=guardSubmit(async()=>{ const mode=submitMode; submitMode='save'; setBusy(true,mode); try{ await submit(mode); } finally{ setBusy(false); } });
    btnSave.onclick=()=>{ submitMode='save'; f.requestSubmit(); };
    if(btnNext) btnNext.onclick=()=>{ submitMode='next'; f.requestSubmit(); };
    refreshTotals();
  }
}

export async function renderInvoiceDetail(App, params) {
  const id=Number(params.id);
  const [invoice,settings,customer,transactions,projects,allocations,movements,products]=await Promise.all([DB.get('invoices',id),getSettings(), DB.get('customers', id), DB.all('transactions'), DB.all('projects'), DB.all('paymentAllocations'), DB.all('stockMovements'), DB.all('products')]);
  if(!invoice){
    App.setView(`${emptyState('فاکتور پیدا نشد','این فاکتور وجود ندارد.')}<button class="btn btn-secondary" data-route="#/invoices">بازگشت به فاکتورها</button>`);
    return;
  }
  const [allCustomers]=await Promise.all([DB.all('customers')]);
  const actualCustomer=allCustomers.find(c=>String(c.id)===String(invoice.customerId))||null;
  const actualProject=projects.find(p=>String(p.id)===String(invoice.projectId))||null;
  const taxEnabled=invoice.taxEnabled ?? (Number(invoice.tax||0)>0);
  const taxPercent=Number(invoice.taxPercent ?? (taxEnabled && Number(invoice.taxableAmount||0)>0 ? (Number(invoice.tax||0)/Number(invoice.taxableAmount||1))*100 : settings.taxPercent)) || 0;
  const computed=calculateTotals(invoice.items||[],invoice.discountInput ?? invoice.discount ?? 0,taxEnabled,taxPercent,invoice.discountType||'amount',invoice.extraCosts||0);
  const storedTotal=Number.isFinite(Number(invoice.total)) ? Number(invoice.total) : computed.total;
  const snap=invoiceSnapshot({...invoice,total:storedTotal},transactions,allocations);
  const effectivePaid=snap.paid;
  const displayInvoice={...invoice,taxEnabled,taxPercent,total:storedTotal,paidAmount:effectivePaid,discount:Number.isFinite(Number(invoice.discount))?Number(invoice.discount):computed.discount,tax:Number.isFinite(Number(invoice.tax))?Number(invoice.tax):computed.tax,taxableAmount:Number.isFinite(Number(invoice.taxableAmount))?Number(invoice.taxableAmount):computed.taxableAmount,status:snap.status};
  const balance=snap.remaining;
  const bookedMap=bookedForInvoice(invoice.id,movements);
  const canReturnGoods=invoice.stockTracked===true&&invoiceStockActive(invoice.status)&&[...bookedMap.values()].some(v=>v>0);
  App.setView(`${pageHeader('فاکتور',{back:true,subtitle:`شماره ${invoice.number}`})}
    <div class="invoice-action-bar">
      <div class="invoice-action-status"><span class="badge badge-${invoiceStatusClass(displayInvoice.status)}">${faLabel(INVOICE_STATUS_LABELS,displayInvoice.status)}</span><strong class="invoice-detail-total">${money(displayInvoice.total)}</strong><small>${balance?`مانده ${money(balance)}`:'تسویه کامل'}${snap.refunded>0?` · برگشت وجه ${money(snap.refunded)}`:''}</small></div>
      <div class="invoice-action-buttons">
        <button class="btn btn-primary" id="print-invoice">${icon('printer','')}چاپ A4</button>
        <button class="btn btn-secondary" id="image-invoice">${icon('image','')}تصویر / اشتراک</button>
        ${displayInvoice.status!=='cancelled'&&balance>0?`<button class="btn btn-secondary" id="payment-invoice">${icon('wallet','')}ثبت دریافت</button>`:''}
        ${snap.paid>0?`<button class="btn btn-ghost" id="refund-invoice">${icon('wallet','')}برگشت وجه</button>`:''}
        ${canReturnGoods?`<button class="btn btn-ghost" id="return-invoice">${icon('box','')}برگشت کالا</button>`:''}
        <button class="btn btn-ghost" id="edit-invoice">${icon('edit','')}ویرایش</button>
      </div>
    </div>
    <div class="invoice-finance-strip">
      <div><small>مبلغ فاکتور</small><strong>${money(displayInvoice.total)}</strong></div>
      <div><small>دریافت‌شده</small><strong class="green">${money(effectivePaid)}</strong></div>
      <div><small>مانده</small><strong class="${balance?'red':'green'}">${money(balance)}</strong></div>
      <div><small>برگشت وجه</small><strong>${money(snap.refunded)}</strong></div>
    </div>
    <div class="invoice-feature-hint"><span>${icon('check','')}</span><span><strong>فاکتور آماده استفاده است</strong><small>چاپ A4، خروجی تصویر برای اشتراک، ثبت دریافت و مدیریت برگشت‌ها از همین صفحه در دسترس است.</small></span></div>
    <article id="invoice-print" class="invoice-paper detail-invoice">${invoiceMarkup(displayInvoice,settings,actualCustomer,actualProject)}</article>`);
  document.querySelector('[data-back]')?.addEventListener('click',()=>history.length>1?history.back():navigate('#/invoices'));
  document.getElementById('print-invoice').onclick=()=>printWithClass('printing-invoice');
  document.getElementById('image-invoice').onclick=async()=>{try{const r=await invoiceToImage(document.getElementById('invoice-print'),`DIA-Invoice-${invoice.number}.png`);if(r?.shared)toast('تصویر فاکتور برای اشتراک آماده شد');else if(r?.downloaded)toast('تصویر فاکتور آماده شد');}catch(e){toast(e.message||'خروجی تصویر ناموفق بود','error');}};
  document.getElementById('edit-invoice').onclick=()=>editInvoice(displayInvoice);
  document.getElementById('payment-invoice')?.addEventListener('click',()=>openPaymentModal(displayInvoice));
  document.getElementById('refund-invoice')?.addEventListener('click',()=>openRefundModal({invoiceId:invoice.id,onDone:()=>renderInvoiceDetail(App,{id:invoice.id})}));
  document.getElementById('return-invoice')?.addEventListener('click',()=>openReturnModal());
  function openReturnModal(){
    const lines=[...bookedMap.entries()].filter(([,q])=>q>0).map(([pid,q])=>({pid,q,p:products.find(x=>String(x.id)===pid)}));
    const token=newToken();
    const m=openModal(`<div class="modal-head"><h3>برگشت کالا از فروش</h3><button class="close">${icon('x','')}</button></div><form id="return-form" class="form-grid" novalidate><div class="field full"><label>کالا</label><select name="productId">${lines.map(l=>`<option value="${l.pid}">${esc(l.p?.name||'کالا')} — قابل برگشت ${num(l.q)}</option>`).join('')}</select></div><div class="field full"><label>مقدار برگشتی</label><input name="quantity" type="text" inputmode="decimal" autofocus></div><div class="field full"><small class="field-hint">این ثبت فقط موجودی کالا را اصلاح می‌کند. برگشت پول به مشتری جداگانه با «برگشت وجه» ثبت می‌شود.</small></div><div class="field full"><button class="btn btn-primary btn-block">${icon('check','')}ثبت برگشت کالا</button></div></form>`);
    const f=m.querySelector('#return-form');m.querySelector('.close').onclick=closeModal;
    f.onsubmit=guardSubmit(async()=>{
      if(showValidationErrors(f,validateAmount(f.quantity.value,'quantity',{required:true,allowZero:false})))return;
      const [fm,fp]=await Promise.all([DB.all('stockMovements'),DB.all('products')]);
      const realProductId=(fp.find(x=>String(x.id)===String(f.productId.value))||{}).id??f.productId.value;
      const plan=planSalesReturn({invoice,invoiceId:invoice.id,productId:realProductId,quantity:toNumber(f.quantity.value),movements:fm,date:todayISO(),token});
      if(!plan.ok){toast(plan.error,'error');return;}
      await DB.atomic([...movementOps(plan.drafts),...stockCacheOps(fp,fm,plan.drafts)]);
      closeModal();toast('برگشت کالا ثبت شد');renderInvoiceDetail(App,{id:invoice.id});
    });
  }
  function openPaymentModal(current){
    const remaining=invoiceSnapshot(current,transactions,allocations).remaining;
    const m=openModal(`<div class="modal-head"><h3>ثبت دریافت</h3><button class="close">${icon('x','')}</button></div><form id="payment-form" class="form-grid" novalidate><div class="field full"><label>مانده فاکتور</label><input value="${money(remaining)}" disabled></div><div class="field full"><label>مبلغ دریافت</label><input name="amount" type="text" inputmode="decimal" autofocus value="${remaining||''}"></div><div class="field full"><label>توضیحات</label><input name="notes" placeholder="مثلاً کارت به کارت"></div><div class="field full"><button class="btn btn-primary btn-block">${icon('check','')}ثبت دریافت</button></div></form>`);
    const f=m.querySelector('#payment-form');m.querySelector('.close').onclick=closeModal;
    f.onsubmit=guardSubmit(async()=>{
      const fd=new FormData(f);
      if(showValidationErrors(f,validateAmount(fd.get('amount'),'amount',{required:true,allowZero:false,allowDecimal:false})))return;
      const customerName=actualCustomer?.name||current.customerName||'مشتری آزاد';
      // one central planner: policy (no overpayment / cancelled), legacy migration (no double count) and cache update, all atomic
      const plan=planInvoicePayment({invoice:current,transactions,allocations,amount:toMoney(fd.get('amount')),date:todayISO(),description:fd.get('notes')||`دریافت فاکتور ${current.number}`,customerName});
      if(!plan.ok){toast(plan.error,'error');return;}
      await DB.atomic(plan.ops);closeModal();toast('دریافت ثبت شد');renderInvoiceDetail(App,{id:current.id});
    });
  }
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=e=>{e.preventDefault();navigate(b.dataset.route)});
}

async function editInvoice(invoice){ navigate(`#/invoices?edit=${encodeURIComponent(invoice.id)}`); }

function invoiceMarkup(x,settings,customer=null,project=null){
  const items=(x.items||[]).map((i,k)=>({
    index:k+1,name:i.name||'—',qty:Number(i.quantity)||0,unit:i.unit||'مورد',unitPrice:Number(i.unitPrice)||0,discount:Number(i.discount)||0,
    total:Math.max(0,(Number(i.quantity)||0)*(Number(i.unitPrice)||0)-(Number(i.discount)||0))
  }));
  const subtotal=items.reduce((s,i)=>s+i.total,0);
  const paid=Math.max(0,Number(x.paidAmount)||0);
  const balance=Math.max(0,(Number(x.total)||0)-paid);
  const sellerLines=[settings.phone,settings.address].filter(Boolean);
  const customerLines=[customer?.phone||customer?.mobile,customer?.address].filter(Boolean);
  return `<div class="invoice-brand-row invoice-brand-row-classic">
      <div class="invoice-side-label"><span>نسخه مشتری</span><small>سیستم حسابداری DIA</small></div>
      <div class="invoice-brand">
        <img class="invoice-logo" src="./assets/apple-touch-icon.png" alt="">
        <div><div class="invoice-business-name">${esc(settings.businessName||'DIA Sanat')}</div><div class="invoice-business-sub">${esc(settings.ownerName||'تأسیسات الکتریکی و نورپردازی')}</div></div>
      </div>
      <div class="invoice-title-block"><div class="invoice-doc-label">فاکتور فروش</div><div class="invoice-doc-number">شماره: <strong>${esc(x.number)}</strong></div></div>
    </div>
    <div class="invoice-document-title"><div class="invoice-doc-label">فاکتور فروش</div><div class="invoice-doc-number">شماره: <strong>${esc(x.number)}</strong></div></div>
    <div class="invoice-accent"></div>
    <div class="invoice-parties-grid">
      <div class="invoice-party-card"><div class="invoice-party-title">فروشنده</div><strong>${esc(settings.businessName||'DIA Sanat')}</strong>${sellerLines.map(v=>`<span>${esc(v)}</span>`).join('')}</div>
      <div class="invoice-party-card"><div class="invoice-party-title">خریدار / طرف حساب</div><strong>${esc(x.customerName||customer?.name||'مشتری آزاد')}</strong>${customerLines.map(v=>`<span>${esc(v)}</span>`).join('')}</div>
      <div class="invoice-meta-card"><div><span>تاریخ</span><strong>${dateFa(x.date||x.createdAt)}</strong></div><div><span>وضعیت</span><strong>${faLabel(INVOICE_STATUS_LABELS,x.status)}</strong></div></div>
    </div>
    ${project?`<div class="invoice-project-card"><div><span>پروژه</span><strong>${esc(project.name)}</strong></div>${project.location||project.address?`<div><span>موقعیت / آدرس</span><strong>${esc(project.location||project.address)}</strong></div>`:''}${project.description||project.notes?`<div class="project-description"><span>شرح پروژه</span><strong>${esc(project.description||project.notes)}</strong></div>`:''}</div>`:''}
    <div class="invoice-section-label">شرح کالا و خدمات</div>
    <div class="invoice-table-wrap"><table class="invoice-table clean-invoice-table"><thead><tr><th class="col-index">ردیف</th><th>شرح کالا / خدمت</th><th class="num-col">تعداد</th><th class="unit-col">واحد</th><th class="money-col">قیمت واحد</th><th class="money-col discount-col">تخفیف</th><th class="money-col">مبلغ</th></tr></thead><tbody>${items.length?items.map(i=>`<tr><td class="col-index">${num(i.index)}</td><td class="item-name">${esc(i.name)}</td><td class="num-col">${num(i.qty)}</td><td class="unit-col">${esc(i.unit)}</td><td class="money-col">${money(i.unitPrice,'')}</td><td class="money-col discount-col">${money(i.discount,'')}</td><td class="money-col total-col">${money(i.total,'')}</td></tr>`).join(''):`<tr><td colspan="7" class="invoice-empty-row">موردی برای نمایش ثبت نشده است.</td></tr>`}</tbody></table></div>
    <div class="invoice-bottom-grid">
      <div class="invoice-words-block"><span>مبلغ به حروف</span><strong>${esc(amountToWordsFa(x.total))}</strong>${x.notes?`<div class="invoice-notes-block"><span>توضیحات و شرایط</span><p>${esc(x.notes)}</p></div>`:''}</div>
      <div class="invoice-summary-box">
        <div><span>جمع اقلام</span><strong>${money(subtotal)}</strong></div>
        <div><span>تخفیف کلی</span><strong>${money(x.discount||0)}</strong></div>
        ${x.taxEnabled?`<div><span>مالیات ${num(x.taxPercent||0)}٪</span><strong>${money(x.tax||0)}</strong></div>`:''}
        ${(Number(x.extraCosts)||0)>0?`<div><span>هزینه‌های جانبی</span><strong>${money(x.extraCosts)}</strong></div>`:''}
        <div class="grand"><span>مبلغ نهایی</span><strong>${money(x.total)}</strong></div>
        <div><span>پرداخت‌شده</span><strong class="green">${money(paid)}</strong></div>
        <div class="balance-row"><span>مانده</span><strong class="${balance?'red':'green'}">${money(balance)}</strong></div>
      </div>
    </div>
    <div class="invoice-payment-note"><strong>وضعیت پرداخت:</strong> ${balance?'این فاکتور دارای مانده است.':'این فاکتور تسویه شده است.'}</div>
    <div class="invoice-footer-note">${esc(settings.invoiceNote||'از انتخاب شما سپاسگزاریم.')}</div>
    <div class="invoice-signatures"><div><span>امضای خریدار</span><div></div></div><div><span>مهر و امضای فروشنده</span><div></div></div></div>`;
}
