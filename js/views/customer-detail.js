import { DB } from '../db.js';
import { money, num, dateFa, esc, printWithClass, faLabel, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE } from '../utils.js';
import { navigate } from '../router.js';

export async function renderCustomerDetail(App, params) {
  const id = Number(params.id);
  const [customer, invoices, transactions] = await Promise.all([DB.get('customers', id), DB.all('invoices'), DB.all('transactions')]);
  if (!customer) { App.setView('<div class="empty">مشتری پیدا نشد.</div><button class="btn btn-secondary" id="back">بازگشت</button>'); document.getElementById('back').onclick = () => navigate('#/customers'); return; }

  const custInvoices = invoices.filter(i => i.customerId === id).sort((a, b) => a.createdAt - b.createdAt);
  const custPayments = transactions.filter(t => t.type === 'customer_payment' && t.customerId === id).sort((a, b) => a.createdAt - b.createdAt);

  // گردش حساب: هر فاکتور بدهکار می‌کند، هر دریافت جداگانه بستانکار می‌کند
  const ledger = [];
  custInvoices.forEach(i => ledger.push({ date: i.createdAt, desc: 'فاکتور ' + i.number, debit: i.total || 0, credit: 0 }));
  custPayments.forEach(t => ledger.push({ date: t.createdAt, desc: t.description || 'دریافت وجه', debit: 0, credit: t.amount || 0 }));
  ledger.sort((a, b) => a.date - b.date);
  let running = 0;
  ledger.forEach(row => { running += row.debit - row.credit; row.balance = running; });

  const totalInvoiced = custInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaidOnInvoices = custInvoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const totalDirectPayments = custPayments.reduce((s, t) => s + t.amount, 0);
  const balance = totalInvoiced - totalPaidOnInvoices - totalDirectPayments;

  App.setView(`<div class="page-title-row"><button class="btn btn-secondary no-print" id="back">← بازگشت</button><h1 class="page-title">${esc(customer.name)}</h1><button class="btn btn-primary no-print" id="print-statement">🖨 چاپ</button></div>
  <div id="statement">
    <div class="card card-pad">
      <div class="invoice-meta">
        ${customer.customerCode ? 'کد مشتری: <strong>' + esc(customer.customerCode) + '</strong><br>' : ''}
        ${customer.mobile ? 'موبایل: ' + esc(customer.mobile) + '<br>' : ''}
        ${customer.address ? 'آدرس: ' + esc(customer.address) : ''}
      </div>
    </div>
    <div class="section-title">خلاصه حساب</div>
    <div class="stats-grid">
      <div class="card stat"><div class="stat-label">جمع فاکتورها</div><div class="stat-value">${money(totalInvoiced)}</div></div>
      <div class="card stat"><div class="stat-label">پرداختی</div><div class="stat-value green">${money(totalPaidOnInvoices + totalDirectPayments)}</div></div>
      <div class="card stat"><div class="stat-label">${balance >= 0 ? 'بدهکار' : 'بستانکار'}</div><div class="stat-value ${balance >= 0 ? 'red' : 'green'}">${money(Math.abs(balance))}</div></div>
    </div>
    <div class="section-title">فاکتورها</div>
    <div class="list">${custInvoices.length ? custInvoices.map(i => `<div class="list-item"><div class="list-main"><div class="list-title">فاکتور ${num(i.number)}</div><div class="list-sub">${dateFa(i.createdAt)} · <span class="badge badge-${INVOICE_STATUS_BADGE[i.status] || 'muted'}">${faLabel(INVOICE_STATUS_LABELS, i.status)}</span></div></div><div class="list-value">${money(i.total)}</div></div>`).join('') : '<div class="empty">فاکتوری ندارد.</div>'}</div>
    <div class="section-title">گردش حساب</div>
    <div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th></tr></thead><tbody>
      ${ledger.length ? ledger.map(r => `<tr><td>${dateFa(r.date)}</td><td>${esc(r.desc)}</td><td>${r.debit ? money(r.debit) : '—'}</td><td>${r.credit ? money(r.credit) : '—'}</td><td>${money(Math.abs(r.balance))} ${r.balance >= 0 ? '(بدهکار)' : '(بستانکار)'}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center">تراکنشی ثبت نشده است.</td></tr>'}
    </tbody></table></div>
  </div>`);

  document.getElementById('back').onclick = () => navigate('#/customers');
  document.getElementById('print-statement').onclick = () => printWithClass('printing-statement');
}
