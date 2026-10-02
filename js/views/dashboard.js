import { DB } from '../db.js';
import { money, num, dateFa, esc, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, faLabel, icon } from '../utils.js';
import { totalReceivables, financialSummary, receiptEvents, refundEvents, effectiveTimestamp, isExpenseType, safeAmount } from '../finance.js';
import { openReceivePaymentModal } from './payment-modal.js';
import { pageHeader } from '../components.js';
import { navigate } from '../router.js';

export async function renderDashboard(App) {
  const [invoices,transactions,products,customers,allocations]=await Promise.all([DB.all('invoices'),DB.all('transactions'),DB.all('products'),DB.all('customers'),DB.all('paymentAllocations')]);
  const now=new Date(); const monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime(), nextMonthStart=new Date(now.getFullYear(),now.getMonth()+1,1).getTime();
  const inMonthTs=t=>Number.isFinite(t)&&t>=monthStart&&t<nextMonthStart;
  const valid=invoices.filter(i=>i.status!=='cancelled');
  const sales=valid.reduce((s,i)=>s+safeAmount(i.total),0);
  // sales belong to the invoice date; receipts and expenses belong to THEIR OWN date (payment/transaction date), all from central finance rules
  const salesMonth=valid.filter(i=>inMonthTs(effectiveTimestamp(i))).reduce((s,i)=>s+safeAmount(i.total),0);
  // received = NET of refunds (money handed back to customers), all from central finance rules
  const received=financialSummary(invoices,transactions,allocations).received;
  const receiptsList=receiptEvents(invoices,transactions,allocations).filter(e=>e.kind==='customer_payment');
  const refundsList=refundEvents(invoices,transactions);
  const receivedMonth=receiptsList.filter(e=>inMonthTs(e.date)).reduce((s,e)=>s+e.amount,0)-refundsList.filter(e=>inMonthTs(e.date)).reduce((s,e)=>s+e.amount,0);
  const expenses=transactions.filter(t=>isExpenseType(t.type)).reduce((s,t)=>s+safeAmount(t.amount),0);
  const expensesMonth=transactions.filter(t=>isExpenseType(t.type)&&inMonthTs(effectiveTimestamp(t))).reduce((s,t)=>s+safeAmount(t.amount),0);
  const receivable=totalReceivables(customers,invoices,transactions,allocations);
  const stockValue=products.reduce((s,p)=>s+(Number(p.stock)||0)*(Number(p.purchasePrice)||0),0);
  const latest=valid.sort((a,b)=>b.createdAt-a.createdAt).slice(0,5);
  App.setView(`${pageHeader('داشبورد')}
    <div class="dashboard-welcome card card-pad"><div><small>وضعیت کسب‌وکار</small><h2>خلاصه امروز</h2><p>اعداد واقعی از اطلاعات ثبت‌شده شما محاسبه می‌شوند.</p></div><div class="dashboard-ring">${num(valid.length)}</div></div>
    <div class="stats-grid dashboard-kpis">
      <button class="card stat stat-action" data-dashboard-target="sales"><div class="stat-label">فروش این ماه</div><div class="stat-value">${money(salesMonth)}</div><div class="stat-meta">فروش کل: ${money(sales)}</div></button>
      <button class="card stat stat-action" data-dashboard-target="received"><div class="stat-label">دریافت این ماه</div><div class="stat-value green">${money(receivedMonth)}</div><div class="stat-meta">دریافت کل: ${money(received)}</div></button>
      <button class="card stat stat-action" data-dashboard-target="expenses"><div class="stat-label">هزینه این ماه</div><div class="stat-value red">${money(expensesMonth)}</div><div class="stat-meta">هزینه کل: ${money(expenses)}</div></button>
      <button class="card stat stat-action" data-dashboard-target="receivables"><div class="stat-label">مطالبات مشتریان</div><div class="stat-value red">${money(Math.max(0,receivable))}</div><div class="stat-meta">برای مشاهده بدهکاران لمس کنید</div></button>
    </div>
    <div class="section-title">دسترسی سریع</div><div class="quick-grid">${[['#/invoices?new=1','file-plus','فاکتور جدید'],['#/customers?new=1','users','مشتری جدید'],['receive','wallet','ثبت دریافت'],['#/accounting?new=expense','wallet','ثبت هزینه'],['#/products?new=1','box-plus','افزودن کالا'],['#/services?new=1','briefcase','افزودن خدمت']].map(x=>`<button class="quick" ${x[0]==='receive'?'id="qa-receive"':`data-route="${x[0]}"`}><span class="qicon">${icon(x[1],'')}</span><small>${x[2]}</small></button>`).join('')}</div>
    <div class="section-title-row"><div class="section-title-compact">آخرین فاکتورها</div><button class="btn btn-ghost" id="all-invoices">همه</button></div>
    <div class="list dashboard-invoices">${latest.map(i=>`<button class="dashboard-invoice-card" data-invoice="${i.id}"><span class="invoice-card-icon">${icon('file-text','')}</span><span class="list-main"><strong>فاکتور ${esc(i.number)}</strong><small>${esc(i.customerName||'مشتری آزاد')} · ${dateFa(i.date||i.createdAt)}</small></span><span class="list-value">${money(i.total)}<small class="badge badge-${INVOICE_STATUS_BADGE[i.status]||'muted'}">${faLabel(INVOICE_STATUS_LABELS,i.status)}</small></span></button>`).join('')||'<div class="empty">هنوز فاکتوری ثبت نشده است.</div>'}</div>`);
  document.getElementById('all-invoices').onclick=()=>navigate('#/invoices');
  // opens the SAME receive-payment workflow as the customer page (with a customer picker)
  document.getElementById('qa-receive').onclick=()=>openReceivePaymentModal({onDone:()=>renderDashboard(App)});
  document.querySelectorAll('[data-invoice]').forEach(b=>b.onclick=()=>navigate('#/invoices/'+b.dataset.invoice));
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=e=>{e.preventDefault();navigate(b.dataset.route)});
  document.querySelectorAll('[data-dashboard-target]').forEach(b=>b.onclick=()=>{const map={sales:'#/reports?type=sales',received:'#/reports?type=income',expenses:'#/reports?type=expense',receivables:'#/reports?type=debtors'};navigate(map[b.dataset.dashboardTarget]);});
}
