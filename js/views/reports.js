import {DB} from '../db.js';import {money,num,dateFa,esc} from '../utils.js';
export async function renderReports(App){
 const [customers,invoices,transactions]=await Promise.all([DB.all('customers'),DB.all('invoices'),DB.all('transactions')]);
 App.setView(`<h1 class="page-title">گزارش‌ها</h1><div class="more-grid">
 <button class="card more-card" id="customer-report"><strong>صورتحساب مشتری</strong><small>فاکتورها، پرداخت‌ها و مانده حساب</small></button>
 <button class="card more-card" id="sales-report"><strong>گزارش فروش</strong><small>خلاصه فاکتورهای فروش</small></button>
 <button class="card more-card" id="finance-report"><strong>درآمد و هزینه</strong><small>گردش مالی ثبت‌شده</small></button>
 </div><div id="report-area" style="margin-top:18px"></div>`);
 document.getElementById('customer-report').onclick=()=>customerReport();document.getElementById('sales-report').onclick=()=>salesReport();document.getElementById('finance-report').onclick=()=>financeReport();
 function customerReport(){
  document.getElementById('report-area').innerHTML=`<div class="card card-pad"><div class="field"><label>انتخاب مشتری</label><select id="cr"><option value="">انتخاب کنید</option>${customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div id="crout" style="margin-top:14px"></div></div>`;
  document.getElementById('cr').onchange=e=>{const c=customers.find(x=>x.id==e.target.value);const its=invoices.filter(i=>i.customerId==c?.id);const total=its.reduce((s,i)=>s+i.total,0),paid=its.reduce((s,i)=>s+i.paid,0);document.getElementById('crout').innerHTML=c?`<h3>${esc(c.name)}</h3><div class="stats-grid"><div class="card stat"><div class="stat-label">جمع فاکتورها</div><div class="stat-value">${money(total)}</div></div><div class="card stat"><div class="stat-label">پرداختی</div><div class="stat-value green">${money(paid)}</div></div><div class="card stat"><div class="stat-label">مانده</div><div class="stat-value red">${money(total-paid)}</div></div></div><div class="section-title">فاکتورها</div><div class="list">${its.map(i=>`<div class="list-item"><span>فاکتور ${num(i.number)} · ${dateFa(i.createdAt)}</span><strong>${money(i.total)}</strong></div>`).join('')||'<div class="empty">فاکتوری ندارد.</div>'}</div>`:''}
 }
 function salesReport(){const total=invoices.reduce((s,i)=>s+i.total,0),paid=invoices.reduce((s,i)=>s+i.paid,0);document.getElementById('report-area').innerHTML=`<div class="card card-pad"><h3>گزارش فروش</h3><p>تعداد فاکتورها: <strong>${num(invoices.length)}</strong></p><p>فروش کل: <strong>${money(total)}</strong></p><p>دریافت‌شده: <strong>${money(paid)}</strong></p><p>مطالبات: <strong class="red">${money(total-paid)}</strong></p></div>`}
 function financeReport(){const income=transactions.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0),expense=transactions.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);document.getElementById('report-area').innerHTML=`<div class="card card-pad"><h3>درآمد و هزینه</h3><p>درآمد: <strong class="green">${money(income)}</strong></p><p>هزینه: <strong class="red">${money(expense)}</strong></p><p>خالص: <strong>${money(income-expense)}</strong></p></div>`}
}
