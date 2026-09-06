import { route,onNavigate,startRouter,navigate } from './router.js';
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
const view=()=>document.getElementById('view');
const setView=html=>{view().innerHTML=html;window.scrollTo(0,0);};
export const App={view,setView};
route('#/dashboard',()=>renderDashboard(App));route('#/customers',()=>renderCustomers(App));route('#/customers/:id',p=>renderCustomerDetail(App,p));
route('#/products',()=>renderProducts(App));route('#/services',()=>renderServices(App));route('#/projects',()=>renderProjects(App));route('#/invoices',()=>renderInvoices(App));route('#/invoices/new/:customerId',p=>renderInvoices(App,{newForCustomer:p.customerId}));
route('#/accounting',()=>renderAccounting(App));route('#/reports',()=>renderReports(App));route('#/settings',()=>renderSettings(App));
const MORE=['#/services','#/projects','#/accounting','#/reports','#/settings'];
function syncNav(hash){const base=hash.split('?')[0];const active=base.startsWith('#/customers')?'#/customers':MORE.some(r=>base.startsWith(r))?'#/more':base;document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.route===active));}
onNavigate(syncNav);
document.addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b){e.preventDefault();navigate(b.dataset.route);return;}const more=e.target.closest('[data-more]');if(more){e.preventDefault();openMoreSheet();}});
function openMoreSheet(){const root=document.getElementById('modal-root');root.innerHTML=`<div class="sheet-backdrop" data-sheet-close><section class="bottom-sheet" role="dialog" aria-modal="true" aria-label="بیشتر"><div class="sheet-handle"></div><div class="sheet-title">بیشتر</div><div class="sheet-grid">${[['#/services','briefcase','خدمات','برق ساختمان و صنعتی'],['#/projects','folder','پروژه‌ها','مدیریت پروژه'],['#/accounting','wallet','حسابداری','درآمد و هزینه'],['#/reports','chart','گزارش‌ها','گزارش‌های مالی'],['#/settings','settings','تنظیمات','پشتیبان و تنظیمات']].map(x=>`<button class="sheet-item" data-route="${x[0]}">${iconName(x[1])}<span><b>${x[2]}</b><small>${x[3]}</small></span></button>`).join('')}</div></section></div>`;root.querySelector('[data-sheet-close]').addEventListener('click',e=>{if(e.target===e.currentTarget)root.innerHTML='';});root.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>root.innerHTML=''));}
function iconName(n){return `<img class="icon icon-lg" src="./assets/icons/${n}.svg" alt="" aria-hidden="true">`;}
function online(){const e=document.getElementById('online-indicator');if(!e)return;e.textContent=navigator.onLine?'آنلاین':'آفلاین';e.className='online-indicator '+(navigator.onLine?'is-online':'is-offline');}
window.addEventListener('online',online);window.addEventListener('offline',online);
document.addEventListener('DOMContentLoaded',()=>{startRouter();online();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});});
