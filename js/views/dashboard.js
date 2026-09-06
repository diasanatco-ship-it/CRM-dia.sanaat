import { DB } from '../db.js';
import { money, num, dateFa, esc, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, faLabel, icon, totalReceivables } from '../utils.js';
import { pageHeader } from '../components.js';
import { navigate } from '../router.js';

export async function renderDashboard(App) {
  const [invoices,transactions,products,customers]=await Promise.all([DB.all('invoices'),DB.all('transactions'),DB.all('products'),DB.all('customers')]);
  const now=new Date(); const monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const valid=invoices.filter(i=>i.status!=='cancelled');
  const sales=valid.reduce((s,i)=>s+(i.total||0),0);
  const salesMonth=valid.filter(i=>i.createdAt>=monthStart).reduce((s,i)=>s+(i.total||0),0);
  const received=transactions.filter(t=>t.type==='customer_payment').reduce((s,t)=>s+(t.amount||0),0)+valid.reduce((s,i)=>s+(i.paidAmount||0),0);
  const receivedMonth=transactions.filter(t=>t.type==='customer_payment'&&t.createdAt>=monthStart).reduce((s,t)=>s+(t.amount||0),0)+valid.filter(i=>i.createdAt>=monthStart).reduce((s,i)=>s+(i.paidAmount||0),0);
  const expenses=transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+(t.amount||0),0);
  const expensesMonth=transactions.filter(t=>t.type==='expense'&&t.createdAt>=monthStart).reduce((s,t)=>s+(t.amount||0),0);
  const receivable=totalReceivables(customers,invoices,transactions);
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
    <div class="section-title">دسترسی سریع</div><div class="quick-grid">${[['#/invoices','file-plus','فاکتور جدید'],['#/customers','users','مشتری جدید'],['#/accounting','wallet','ثبت تراکنش'],['#/products','box-plus','افزودن کالا'],['#/services','briefcase','افزودن خدمت'],['#/reports','chart','گزارش‌ها']].map(x=>`<button class="quick" data-route="${x[0]}"><span class="qicon">${icon(x[1],'')}</span><small>${x[2]}</small></button>`).join('')}</div>
    <div class="section-title-row"><div class="section-title-compact">آخرین فاکتورها</div><button class="btn btn-ghost" id="all-invoices">همه</button></div>
    <div class="list dashboard-invoices">${latest.map(i=>`<button class="dashboard-invoice-card" data-invoice="${i.id}"><span class="invoice-card-icon">${icon('file-text','')}</span><span class="list-main"><strong>فاکتور ${esc(i.number)}</strong><small>${esc(i.customerName||'مشتری آزاد')} · ${dateFa(i.createdAt)}</small></span><span class="list-value">${money(i.total)}<small class="badge badge-${INVOICE_STATUS_BADGE[i.status]||'muted'}">${faLabel(INVOICE_STATUS_LABELS,i.status)}</small></span></button>`).join('')||'<div class="empty">هنوز فاکتوری ثبت نشده است.</div>'}</div>`);
  document.getElementById('all-invoices').onclick=()=>navigate('#/invoices');
  document.querySelectorAll('[data-invoice]').forEach(b=>b.onclick=()=>navigate('#/invoices/'+b.dataset.invoice));
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=e=>{e.preventDefault();navigate(b.dataset.route)});
  document.querySelectorAll('[data-dashboard-target]').forEach(b=>b.onclick=()=>{const map={sales:'#/reports?type=sales',received:'#/reports?type=income',expenses:'#/reports?type=expense',receivables:'#/reports?type=debtors'};navigate(map[b.dataset.dashboardTarget]);});
}
