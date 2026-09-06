import { DB } from '../db.js';
import { money, num, dateFa, esc, printWithClass, faLabel, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, icon, buildCustomerLedger, toast } from '../utils.js';
import { normalizeAmountInput } from '../validators.js';
import { openModal, closeModal } from '../components.js';
import { navigate } from '../router.js';
import { pageHeader, emptyState } from '../components.js';

export async function renderCustomerDetail(App, params) {
  const id=Number(params.id);
  const [customer,invoices,transactions]=await Promise.all([DB.get('customers',id),DB.all('invoices'),DB.all('transactions')]);
  if(!customer){App.setView(`${emptyState('مشتری پیدا نشد','این مشتری وجود ندارد.')}<button class="btn btn-secondary" data-route="#/customers">بازگشت</button>`);return;}
  const account=buildCustomerLedger(invoices,transactions,id);
  const custInvoices=account.invoices;
  const ledger=account.ledger;
  const total=account.total,paid=account.paid,balance=account.balance;
  App.setView(`${pageHeader(customer.name,{back:true,action:'فاکتور جدید',actionId:'new-customer-invoice',subtitle:customer.mobile||customer.customerCode||''})}
    <div class="client-hero card card-pad"><div class="client-avatar">${esc((customer.name||'?').trim().charAt(0))}</div><div><strong>${esc(customer.name)}</strong><div class="list-sub">${esc(customer.companyName||'مشتری')} ${customer.mobile?' · '+esc(customer.mobile):''}</div></div></div>
    <div class="stats-grid client-kpis"><div class="card stat"><div class="stat-label">جمع فاکتورها</div><div class="stat-value">${money(total)}</div></div><div class="card stat"><div class="stat-label">دریافت‌شده</div><div class="stat-value green">${money(paid)}</div></div><div class="card stat"><div class="stat-label">مانده حساب</div><div class="stat-value ${balance>=0?'red':'green'}">${money(Math.abs(balance))}</div><div class="stat-meta">${balance>=0?'بدهکار':'بستانکار'}</div></div></div>
    <div class="section-title-row"><div class="section-title-compact">فاکتورهای مشتری</div><div class="btn-row"><button class="btn btn-secondary" id="add-payment">${icon('wallet','')}ثبت دریافت</button><button class="btn btn-ghost" id="print-statement">${icon('printer','')}صورتحساب</button></div></div>
    <div id="statement" class="statement-page"><div class="client-invoice-list">${custInvoices.length?custInvoices.map(i=>`<button class="client-invoice-card" data-invoice="${i.id}"><span class="statement-icon">${icon('file-text','')}</span><span><strong>فاکتور ${esc(i.number)}</strong><small>${dateFa(i.date||i.createdAt)} · ${faLabel(INVOICE_STATUS_LABELS,i.status)}</small></span><b>${money(i.total)}</b></button>`).join(''):emptyState('فاکتوری ندارد','هنوز فاکتوری برای این مشتری ثبت نشده است.','فاکتور جدید','empty-invoice')}</div>
    <div class="section-title-row"><div class="section-title-compact">گردش حساب</div><span class="badge badge-${balance>0?'unpaid':'paid'}">${balance>0?'مانده بدهی':'تسویه'}</span></div>
    <div class="ledger-list">${ledger.length?ledger.map(r=>`<article class="ledger-card"><div class="ledger-top"><span class="ledger-kind ${r.kind==='invoice'?'debit':'credit'}">${icon(r.kind==='invoice'?'file-text':'wallet','')} ${r.kind==='invoice'?'فاکتور':'دریافت'}</span><time>${dateFa(r.date)}</time></div><div class="ledger-body"><strong>${esc(r.desc)}</strong><span class="ledger-amount ${r.debit?'red':'green'}">${r.debit?money(r.debit):money(r.credit)}</span></div><div class="ledger-bottom"><span>مانده</span><b class="${r.balance>=0?'red':'green'}">${money(Math.abs(r.balance))} ${r.balance>=0?'بدهکار':'بستانکار'}</b></div></article>`).join(''):'<div class="empty">گردش حسابی ثبت نشده است.</div>'}</div></div>`);
  document.querySelector('[data-back]')?.addEventListener('click',()=>history.length>1?history.back():navigate('#/customers'));
  document.getElementById('new-customer-invoice').onclick=()=>navigate('#/invoices/new/'+id);
  document.getElementById('empty-invoice')?.addEventListener('click',()=>navigate('#/invoices/new/'+id));
  document.getElementById('print-statement').onclick=()=>printWithClass('printing-statement');
  document.getElementById('add-payment').onclick=()=>{
    const m=openModal(`<div class="modal-head"><h3>ثبت دریافت از ${esc(customer.name)}</h3><button class="close">${icon('x','')}</button></div><form id="customer-payment" class="form-grid" novalidate><div class="field full"><label>مانده حساب</label><input value="${money(Math.max(0,balance))}" disabled></div><div class="field full"><label>مبلغ دریافت</label><input name="amount" type="text" inputmode="decimal" autofocus></div><div class="field full"><label>شرح</label><input name="description" placeholder="مثلاً دریافت بابت حساب"></div><div class="field full"><button class="btn btn-primary btn-block">${icon('check','')}ثبت دریافت</button></div></form>`);
    const f=m.querySelector('#customer-payment');m.querySelector('.close').onclick=closeModal;f.onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(f));const amount=Number(normalizeAmountInput(fd.amount))||0;if(amount<=0){toast('مبلغ دریافت باید بیشتر از صفر باشد.','error');return;}if(amount>Math.max(0,balance)){toast('مبلغ دریافت از مانده حساب بیشتر است.','error');return;}await DB.add('transactions',{type:'customer_payment',amount,customerId:id,party:customer.name,description:fd.description||'دریافت وجه'});closeModal();toast('دریافت ثبت شد');renderCustomerDetail(App,params);};
  };
  document.querySelectorAll('[data-invoice]').forEach(b=>b.onclick=()=>navigate('#/invoices/'+b.dataset.invoice));
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=e=>{e.preventDefault();navigate(b.dataset.route)});
}
