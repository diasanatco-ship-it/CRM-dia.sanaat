import { route, onNavigate, startRouter, navigate } from './router.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCustomers } from './views/customers.js';
import { renderCustomerDetail } from './views/customer-detail.js';
import { renderProducts } from './views/products.js';
import { renderServices } from './views/services.js';
import { renderProjects } from './views/projects.js';
import { renderInvoices } from './views/invoices.js';
import { renderAccounting } from './views/accounting.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';

const view = () => document.getElementById('view');
const setView = html => { view().innerHTML = html; view().scrollTop = 0; };
export const App = { view, setView };

route('#/dashboard', () => renderDashboard(App));
route('#/customers', () => renderCustomers(App));
route('#/customers/:id', p => renderCustomerDetail(App, p));
route('#/products', () => renderProducts(App));
route('#/services', () => renderServices(App));
route('#/projects', () => renderProjects(App));
route('#/invoices', () => renderInvoices(App));
route('#/accounting', () => renderAccounting(App));
route('#/reports', () => renderReports(App));
route('#/settings', () => renderSettings(App));
route('#/more', () => App.setView(`<h1 class="page-title">بیشتر</h1><div class="more-grid">
<a class="card more-card" href="#/services"><strong>خدمات</strong><small>خدمات برق ساختمان و صنعتی</small></a>
<a class="card more-card" href="#/projects"><strong>پروژه‌ها</strong><small>مدیریت پروژه‌های اجرایی</small></a>
<a class="card more-card" href="#/accounting"><strong>حسابداری</strong><small>درآمد، هزینه، دریافت و پرداخت</small></a>
<a class="card more-card" href="#/reports"><strong>گزارش‌ها</strong><small>گزارش مالی و صورتحساب مشتری</small></a>
<a class="card more-card" href="#/settings"><strong>تنظیمات و پشتیبان</strong><small>بکاپ و بازیابی اطلاعات</small></a>
</div>`));

// همگام‌سازی وضعیت فعال نوار پایین با مسیر جاری (بدون رفرش صفحه)
const MORE_ROUTES = ['#/services', '#/projects', '#/accounting', '#/reports', '#/settings'];
function syncNav(hash) {
  const top = hash.startsWith('#/customers') ? '#/customers' : (MORE_ROUTES.some(r => hash.startsWith(r)) ? '#/more' : hash);
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.route === top));
}
onNavigate(syncNav);

document.addEventListener('click', e => {
  const b = e.target.closest('[data-route]');
  if (b) navigate(b.dataset.route);
});

function updateOnlineIndicator() {
  const el = document.getElementById('online-indicator');
  if (!el) return;
  el.textContent = navigator.onLine ? 'آنلاین' : 'آفلاین';
  el.className = 'online-indicator ' + (navigator.onLine ? 'is-online' : 'is-offline');
}
window.addEventListener('online', updateOnlineIndicator);
window.addEventListener('offline', updateOnlineIndicator);

document.addEventListener('DOMContentLoaded', () => {
  startRouter();
  updateOnlineIndicator();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
});
