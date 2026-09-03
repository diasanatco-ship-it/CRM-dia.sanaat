import {DB} from '../db.js';import {money,num,esc,toast} from '../utils.js';
export async function renderCustomers(App){
 const customers=await DB.all('customers');
 App.setView(`<div class="page-title-row"><h1 class="page-title">مشتریان</h1><button class="btn btn-primary" id="add-customer">+ مشتری</button></div>
 <div class="search"><span>⌕</span><input id="customer-search" placeholder="جستجوی مشتری..."></div>
 <div id="customer-list" class="list"></div>`);
 const draw=filter=>document.getElementById('customer-list').innerHTML=(customers.filter(c=>(c.name+' '+(c.mobile||'')).includes(filter||'')).map(c=>`<div class="list-item"><div class="list-main"><div class="list-title">${esc(c.name)}</div><div class="list-sub">${esc(c.mobile||'بدون شماره')} · ${esc(c.type||'حقیقی')}</div></div><div class="btn-row"><button class="btn btn-secondary edit-c" data-id="${c.id}">ویرایش</button><button class="btn btn-danger del-c" data-id="${c.id}">حذف</button></div></div>`).join('')||'<div class="empty">مشتری‌ای پیدا نشد.</div>');
 draw('');
 document.getElementById('customer-search').oninput=e=>draw(e.target.value.trim());
 document.getElementById('add-customer').onclick=()=>form();
 document.querySelectorAll('.edit-c').forEach(b=>b.onclick=()=>form(customers.find(c=>c.id==b.dataset.id)));
 document.querySelectorAll('.del-c').forEach(b=>b.onclick=async()=>{if(confirm('مشتری حذف شود؟')){await DB.delete('customers',Number(b.dataset.id));toast('حذف شد');renderCustomers(App)}})
 function form(c={}){
  const r=document.getElementById('modal-root');r.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>${c.id?'ویرایش مشتری':'مشتری جدید'}</h3><button class="close" id="close">×</button></div>
  <form id="customer-form" class="form-grid"><div class="field"><label>نام / نام شرکت</label><input name="name" required value="${esc(c.name)}"></div><div class="field"><label>موبایل</label><input name="mobile" inputmode="tel" value="${esc(c.mobile)}"></div><div class="field"><label>نوع</label><select name="type"><option ${c.type==='حقیقی'?'selected':''}>حقیقی</option><option ${c.type==='حقوقی'?'selected':''}>حقوقی</option></select></div><div class="field"><label>شناسه / کد ملی</label><input name="identity" value="${esc(c.identity)}"></div><div class="field full"><label>آدرس</label><textarea name="address">${esc(c.address)}</textarea></div><div class="field full"><label>توضیحات</label><textarea name="notes">${esc(c.notes)}</textarea></div><div class="field full"><button class="btn btn-primary" type="submit">ذخیره</button></div></form></div></div>`;
  document.getElementById('close').onclick=()=>r.innerHTML='';document.getElementById('customer-form').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(c.id)d.id=c.id;await DB.put('customers',d);r.innerHTML='';toast('مشتری ذخیره شد');renderCustomers(App)}
 }
}
