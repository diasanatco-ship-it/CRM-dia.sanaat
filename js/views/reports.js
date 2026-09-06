import { DB } from '../db.js';
import { money, num, dateFa, esc, isIncomeType, INVOICE_STATUS_LABELS, faLabel } from '../utils.js';
import { INVOICE_STATUS } from '../validators.js';

function filterRow(dt, customerId, status, from, to, rowCustomerId, rowStatus) {
  if (from && dt < new Date(from).getTime()) return false;
  if (to && dt > new Date(to).getTime() + 86399999) return false;
  if (customerId && String(rowCustomerId) !== String(customerId)) return false;
  if (status && rowStatus !== status) return false;
  return true;
}

export async function renderReports(App) {
  const [customers, invoices, transactions] = await Promise.all([DB.all('customers'), DB.all('invoices'), DB.all('transactions')]);

  App.setView(`<h1 class="page-title">گزارش‌ها</h1><div class="more-grid">
  <button class="card more-card" id="r-sales"><strong>گزارش فروش</strong><small>خلاصه فاکتورهای فروش</small></button>
  <button class="card more-card" id="r-income"><strong>گزارش درآمد</strong><small>دریافت‌های ثبت‌شده</small></button>
  <button class="card more-card" id="r-expense"><strong>گزارش هزینه</strong><small>هزینه‌ها و پرداخت‌ها</small></button>
  <button class="card more-card" id="r-debtors"><strong>گزارش بدهکاران</strong><small>مانده حساب مشتریان</small></button>
  <button class="card more-card" id="r-invoices"><strong>گزارش فاکتورها</strong><small>فهرست کامل با فیلتر</small></button>
  <button class="card more-card" id="r-customer"><strong>صورتحساب مشتری</strong><small>مانده و گردش حساب</small></button>
  </div><div id="report-area" style="margin-top:18px"></div>`);

  const area = () => document.getElementById('report-area');
  const filterBar = (withStatus) => `<div class="card card-pad"><div class="form-grid">
    <div class="field"><label>از تاریخ</label><input type="date" id="f-from"></div>
    <div class="field"><label>تا تاریخ</label><input type="date" id="f-to"></div>
    <div class="field"><label>مشتری</label><select id="f-customer"><option value="">همه</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    ${withStatus ? `<div class="field"><label>وضعیت</label><select id="f-status"><option value="">همه</option>${INVOICE_STATUS.map(s => `<option value="${s}">${faLabel(INVOICE_STATUS_LABELS, s)}</option>`).join('')}</select></div>` : ''}
    <div class="field full"><button class="btn btn-primary" id="apply-filter" type="button">اعمال فیلتر</button></div>
  </div></div><div id="filtered-out" style="margin-top:12px"></div>`;
  const readFilters = () => ({ from: document.getElementById('f-from')?.value, to: document.getElementById('f-to')?.value, customerId: document.getElementById('f-customer')?.value, status: document.getElementById('f-status')?.value });

  document.getElementById('r-sales').onclick = () => { area().innerHTML = filterBar(true); document.getElementById('apply-filter').onclick = () => salesReport(readFilters()); salesReport({}); };
  document.getElementById('r-income').onclick = () => { area().innerHTML = filterBar(false); document.getElementById('apply-filter').onclick = () => incomeExpenseReport(readFilters(), true); incomeExpenseReport({}, true); };
  document.getElementById('r-expense').onclick = () => { area().innerHTML = filterBar(false); document.getElementById('apply-filter').onclick = () => incomeExpenseReport(readFilters(), false); incomeExpenseReport({}, false); };
  document.getElementById('r-debtors').onclick = () => debtorsReport();
  document.getElementById('r-invoices').onclick = () => { area().innerHTML = filterBar(true); document.getElementById('apply-filter').onclick = () => invoicesReport(readFilters()); invoicesReport({}); };
  document.getElementById('r-customer').onclick = () => customerReport();

  function salesReport(f) {
    const rows = invoices.filter(i => filterRow(i.createdAt, f.customerId, f.status, f.from, f.to, i.customerId, i.status));
    const total = rows.reduce((s, i) => s + i.total, 0), paid = rows.reduce((s, i) => s + (i.paidAmount || 0), 0);
    document.getElementById('filtered-out').innerHTML = `<div class="card card-pad"><h3>گزارش فروش</h3><p>تعداد فاکتورها: <strong>${num(rows.length)}</strong></p><p>فروش کل: <strong>${money(total)}</strong></p><p>دریافت‌شده: <strong class="green">${money(paid)}</strong></p><p>مطالبات: <strong class="red">${money(total - paid)}</strong></p></div>`;
  }
  function incomeExpenseReport(f, wantIncome) {
    const rows = transactions.filter(t => isIncomeType(t.type) === wantIncome && filterRow(t.createdAt, f.customerId, null, f.from, f.to, t.customerId, null));
    const total = rows.reduce((s, t) => s + t.amount, 0);
    document.getElementById('filtered-out').innerHTML = `<div class="card card-pad"><h3>${wantIncome ? 'گزارش درآمد' : 'گزارش هزینه'}</h3><p>تعداد تراکنش: <strong>${num(rows.length)}</strong></p><p>مجموع: <strong class="${wantIncome ? 'green' : 'red'}">${money(total)}</strong></p></div>
    <div class="list" style="margin-top:10px">${rows.sort((a, b) => b.createdAt - a.createdAt).map(t => `<div class="list-item"><div class="list-main"><span>${esc(t.description)}</span><div class="list-sub">${dateFa(t.createdAt)}</div></div><strong>${money(t.amount)}</strong></div>`).join('') || '<div class="empty">موردی یافت نشد.</div>'}</div>`;
  }
  function debtorsReport() {
    area().innerHTML = `<div id="filtered-out"></div>`;
    const list = customers.map(c => {
      const its = invoices.filter(i => i.customerId === c.id && i.status !== 'cancelled');
      const bal = its.reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0);
      return { c, bal };
    }).filter(x => x.bal > 0).sort((a, b) => b.bal - a.bal);
    const total = list.reduce((s, x) => s + x.bal, 0);
    document.getElementById('filtered-out').innerHTML = `<div class="card card-pad"><h3>گزارش بدهکاران</h3><p>مجموع مطالبات: <strong class="red">${money(total)}</strong></p></div>
    <div class="list" style="margin-top:10px">${list.map(x => `<div class="list-item"><div class="list-main"><span>${esc(x.c.name)}</span></div><strong class="red">${money(x.bal)}</strong></div>`).join('') || '<div class="empty">بدهکاری ثبت نشده است.</div>'}</div>`;
  }
  function invoicesReport(f) {
    const rows = invoices.filter(i => filterRow(i.createdAt, f.customerId, f.status, f.from, f.to, i.customerId, i.status)).sort((a, b) => b.createdAt - a.createdAt);
    document.getElementById('filtered-out').innerHTML = `<div class="list">${rows.map(i => `<div class="list-item"><div class="list-main"><div class="list-title">فاکتور ${esc(i.number)}</div><div class="list-sub">${esc(i.customerName || 'مشتری آزاد')} · ${dateFa(i.createdAt)} · ${faLabel(INVOICE_STATUS_LABELS, i.status)}</div></div><strong>${money(i.total)}</strong></div>`).join('') || '<div class="empty">فاکتوری یافت نشد.</div>'}</div>`;
  }
  function customerReport() {
    area().innerHTML = `<div class="card card-pad"><div class="field"><label>انتخاب مشتری</label><select id="cr"><option value="">انتخاب کنید</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div id="crout" style="margin-top:14px"></div></div>`;
    document.getElementById('cr').onchange = e => {
      const c = customers.find(x => x.id == e.target.value);
      const its = invoices.filter(i => i.customerId == c?.id);
      const total = its.reduce((s, i) => s + i.total, 0), paid = its.reduce((s, i) => s + (i.paidAmount || 0), 0);
      document.getElementById('crout').innerHTML = c ? `<h3>${esc(c.name)}</h3><div class="stats-grid"><div class="card stat"><div class="stat-label">جمع فاکتورها</div><div class="stat-value">${money(total)}</div></div><div class="card stat"><div class="stat-label">پرداختی</div><div class="stat-value green">${money(paid)}</div></div><div class="card stat"><div class="stat-label">مانده</div><div class="stat-value red">${money(total - paid)}</div></div></div><div class="section-title">فاکتورها</div><div class="list">${its.map(i => `<div class="list-item"><span>فاکتور ${esc(i.number)} · ${dateFa(i.createdAt)}</span><strong>${money(i.total)}</strong></div>`).join('') || '<div class="empty">فاکتوری ندارد.</div>'}</div><button class="btn btn-secondary" id="open-full" style="margin-top:10px">مشاهده صورتحساب کامل</button>` : '';
      const openBtn = document.getElementById('open-full');
      if (openBtn) openBtn.onclick = () => location.hash = '#/customers/' + c.id;
    };
  }
}
