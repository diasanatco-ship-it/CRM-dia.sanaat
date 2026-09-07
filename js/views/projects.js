import {DB} from '../db.js';
import {money,esc,toast,icon,showValidationErrors,PROJECT_STATUS_LABELS,faLabel,invoicePaidAmount} from '../utils.js';
import {PROJECT_STATUS,validateProject} from '../validators.js';
import {pageHeader,emptyState,actionMenu,openModal,closeModal,bindActionMenus} from '../components.js';

export async function renderProjects(App){
  const [rows,customers,invoices,transactions]=await Promise.all([DB.all('projects'),DB.all('customers'),DB.all('invoices'),DB.all('transactions')]);
  App.setView(`${pageHeader('پروژه‌ها',{action:'پروژه جدید',actionId:'add'})}<div id="list" class="list"><div class="skeleton"></div><div class="skeleton"></div></div>`);
  const list=document.getElementById('list');
  const cname=id=>customers.find(c=>c.id==id)?.name||'بدون مشتری';
  const projectFinancials=x=>{
    const ps=invoices.filter(i=>String(i.projectId)===String(x.id)&&i.status!=='cancelled');
    const billed=ps.reduce((s,i)=>s+(Number(i.total)||0),0);
    const received=ps.reduce((s,i)=>s+invoicePaidAmount(i,transactions),0)+transactions.filter(t=>String(t.projectId)===String(x.id)&&t.type==='customer_payment'&&!t.invoiceId).reduce((s,t)=>s+(Number(t.amount)||0),0);
    const costs=transactions.filter(t=>String(t.projectId)===String(x.id)&&['expense','supplier_payment','other_expense'].includes(t.type)).reduce((s,t)=>s+(Number(t.amount)||0),0)+(Number(x.cost)||0);
    return {billed,received,costs,profit:billed-costs};
  };
  list.innerHTML=rows.map(x=>{const f=projectFinancials(x);return `<div class="list-item project-item"><div class="list-main"><div class="list-title">${esc(x.name)}</div><div class="list-sub">${esc(cname(x.customerId))} · ${faLabel(PROJECT_STATUS_LABELS,x.status||'active')}</div><div class="project-mini-stats"><span>فروش ${money(f.billed)}</span><span>دریافت ${money(f.received)}</span><span>هزینه ${money(f.costs)}</span><span class="${f.profit>=0?'green':'red'}">سود تقریبی ${money(f.profit)}</span></div></div><div class="list-value"><small>بودجه</small>${money(x.budget||0)}</div>${actionMenu(x.id)}</div>`;}).join('')||emptyState('پروژه‌ای ثبت نشده','پروژه‌های برق ساختمان و صنعتی را ثبت کنید.','افزودن پروژه','add-empty');
  bindActionMenus(list,{edit:id=>form(rows.find(x=>x.id==id)),delete:async id=>{const has=invoices.some(i=>String(i.projectId)===String(id))||transactions.some(t=>String(t.projectId)===String(id));if(confirm(has?'این پروژه داده مالی مرتبط دارد. حذف آن فقط اطلاعات پروژه را حذف می‌کند و تراکنش‌ها/فاکتورها باقی می‌مانند. ادامه؟':'این پروژه حذف شود؟')){await DB.delete('projects',Number(id));toast('پروژه حذف شد');renderProjects(App);}}});
  list.querySelector('#add-empty')?.addEventListener('click',()=>form());
  document.getElementById('add').onclick=()=>form();
  function form(x={}){
    const m=openModal(`<div class="modal-head"><h3>${x.id?'ویرایش پروژه':'پروژه جدید'}</h3><button class="close">${icon('x','')}</button></div><form id="f" class="form-grid" novalidate><div class="field full"><label>نام پروژه</label><input name="name" autofocus value="${esc(x.name||'')}"></div><div class="field"><label>مشتری</label><select name="customerId"><option value="">بدون مشتری</option>${customers.map(c=>`<option value="${c.id}" ${x.customerId==c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>وضعیت</label><select name="status">${PROJECT_STATUS.map(s=>`<option value="${s}" ${(x.status||'active')===s?'selected':''}>${faLabel(PROJECT_STATUS_LABELS,s)}</option>`).join('')}</select></div><div class="field"><label>تاریخ شروع</label><input name="startDate" type="date" value="${x.startDate||''}"></div><div class="field"><label>تاریخ پایان</label><input name="endDate" type="date" value="${x.endDate||''}"></div><div class="field"><label>بودجه</label><input name="budget" type="text" inputmode="decimal" value="${x.budget||0}"></div><div class="field"><label>هزینه دستی/قدیمی</label><input name="cost" type="text" inputmode="decimal" value="${x.cost||0}"></div><div class="field full"><label>توضیحات</label><textarea name="description">${esc(x.description||x.notes||'')}</textarea></div><div class="field full"><button class="btn btn-primary btn-block">${icon('check','')}ذخیره</button></div></form>`);
    const f=m.querySelector('#f');
    f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));d.customerId=d.customerId?Number(d.customerId):null;const v=validateProject(d);if(showValidationErrors(f,v))return;d.budget=Number(d.budget||0);d.cost=Number(d.cost||0);if(x.id)d.id=x.id;await DB.put('projects',d);closeModal();toast('پروژه ذخیره شد');renderProjects(App);};
  }
}
