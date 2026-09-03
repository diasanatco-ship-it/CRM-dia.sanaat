import {DB} from '../db.js';import {money,num,dateFa,esc} from '../utils.js';
export async function renderDashboard(App){
 const [customers,products,invoices,transactions,projects]=await Promise.all([DB.all('customers'),DB.all('products'),DB.all('invoices'),DB.all('transactions'),DB.all('projects')]);
 const sales=invoices.reduce((s,x)=>s+(x.total||0),0), paid=invoices.reduce((s,x)=>s+(x.paid||0),0), receivable=sales-paid;
 const expenses=transactions.filter(x=>x.type==='expense').reduce((s,x)=>s+(x.amount||0),0);
 const stock=products.reduce((s,x)=>s+(x.stock||0)*(x.sellPrice||0),0);
 const recent=[...invoices].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,5);
 App.setView(`<h1 class="page-title">داشبورد</h1>
 <div class="card kpi-wide"><div class="stat-label">خلاصه وضعیت</div><div class="stat-value green">${money(sales-paid)}</div><div class="stat-meta">مانده مطالبات</div></div>
 <div class="section-title">وضعیت مالی</div>
 <div class="stats-grid">
  <div class="card stat"><div class="stat-label">فروش کل</div><div class="stat-value green">${money(sales)}</div><div class="stat-meta">${num(invoices.length)} فاکتور</div></div>
  <div class="card stat"><div class="stat-label">دریافت‌شده</div><div class="stat-value">${money(paid)}</div><div class="stat-meta">از فاکتورها</div></div>
  <div class="card stat"><div class="stat-label">هزینه‌ها</div><div class="stat-value red">${money(expenses)}</div><div class="stat-meta">ثبت‌شده</div></div>
  <div class="card stat"><div class="stat-label">موجودی کالا</div><div class="stat-value">${money(stock)}</div><div class="stat-meta">${num(products.length)} قلم</div></div>
  <div class="card stat"><div class="stat-label">مشتریان</div><div class="stat-value">${num(customers.length)}</div><div class="stat-meta">مشتری ثبت‌شده</div></div>
  <div class="card stat"><div class="stat-label">پروژه‌های فعال</div><div class="stat-value">${num(projects.filter(p=>p.status!=='تمام شده').length)}</div><div class="stat-meta">در حال پیگیری</div></div>
 </div>
 <div class="section-title">دسترسی سریع</div>
 <div class="quick-grid">
 ${[['#/invoices','▤','فاکتور'],['#/customers','♙','مشتری'],['#/products','□','اجناس'],['#/services','⚡','خدمات'],['#/projects','⌂','پروژه'],['#/accounting','₮','هزینه/درآمد'],['#/reports','▥','گزارش'],['#/settings','⚙','پشتیبان']].map(x=>`<button class="quick" data-route="${x[0]}"><span class="qicon">${x[1]}</span><small>${x[2]}</small></button>`).join('')}
 </div>
 <div class="section-title">آخرین فاکتورها</div>
 <div class="list">${recent.length?recent.map(i=>`<div class="list-item"><div class="list-main"><div class="list-title">فاکتور ${num(i.number)}</div><div class="list-sub">${esc(i.customerName||'مشتری آزاد')} · ${dateFa(i.createdAt)}</div></div><div class="list-value">${money(i.total)}<br><span class="badge ${i.paid>=i.total?'badge-paid':'badge-unpaid'}">${i.paid>=i.total?'پرداخت شده':'باقی‌مانده'}</span></div></div>`).join(''):'<div class="empty">هنوز فاکتوری ثبت نشده است.</div>'}</div>`);
}
