import {route,startRouter} from './router.js';
import {DB} from './db.js';
import {renderDashboard} from './views/dashboard.js';
import {renderCustomers} from './views/customers.js';
import {renderProducts} from './views/products.js';
import {renderServices} from './views/services.js';
import {renderProjects} from './views/projects.js';
import {renderInvoices} from './views/invoices.js';
import {renderAccounting} from './views/accounting.js';
import {renderReports} from './views/reports.js';
import {renderSettings} from './views/settings.js';
const view=()=>document.getElementById('view');
const setView=html=>view().innerHTML=html;
export const App={view,setView};
route('#/dashboard',()=>renderDashboard(App));
route('#/customers',()=>renderCustomers(App));
route('#/products',()=>renderProducts(App));
route('#/services',()=>renderServices(App));
route('#/projects',()=>renderProjects(App));
route('#/invoices',()=>renderInvoices(App));
route('#/accounting',()=>renderAccounting(App));
route('#/reports',()=>renderReports(App));
route('#/settings',()=>renderSettings(App));
route('#/more',()=>{App.setView(`<h1 class="page-title">بیشتر</h1><div class="more-grid">
<a class="card more-card" href="#/services"><strong>خدمات</strong><small>خدمات برق ساختمان و صنعتی</small></a>
<a class="card more-card" href="#/projects"><strong>پروژه‌ها</strong><small>مدیریت پروژه‌های اجرایی</small></a>
<a class="card more-card" href="#/accounting"><strong>حسابداری</strong><small>درآمد، هزینه، دریافت و پرداخت</small></a>
<a class="card more-card" href="#/reports"><strong>گزارش‌ها</strong><small>گزارش مالی و صورتحساب مشتری</small></a>
<a class="card more-card" href="#/settings"><strong>تنظیمات و پشتیبان</strong><small>بکاپ و بازیابی اطلاعات</small></a>
</div>`)});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-route]'); if(b) location.hash=b.dataset.route;
});
document.addEventListener('DOMContentLoaded',()=>{
 startRouter();
 if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
});
