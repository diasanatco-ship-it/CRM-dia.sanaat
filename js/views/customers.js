import { DB } from '../db.js';
import { money, esc, toast } from '../utils.js';
import { validateCustomer } from '../validators.js';
import { navigate } from '../router.js';

export async function renderCustomers(App) {
  const [customers, invoices] = await Promise.all([DB.all('customers'), DB.all('invoices')]);
  const balanceOf = id => invoices.filter(i => i.customerId === id && i.status !== 'cancelled').reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0);

  App.setView(`<div class="page-title-row"><h1 class="page-title">مشتریان</h1><button class="btn btn-primary" id="add-customer">+ مشتری</button></div>
  <div class="search"><span>⌕</span><input id="customer-search" placeholder="جستجوی مشتری..."></div>
  <div id="customer-list" class="list"></div>`);

  const draw = filter => {
    const f = (filter || '').trim();
    const filtered = customers.filter(c => (c.name + ' ' + (c.mobile || '') + ' ' + (c.customerCode || '')).includes(f));
    document.getElementById('customer-list').innerHTML = filtered.map(c => {
      const bal = balanceOf(c.id);
      return `<div class="list-item"><div class="list-main clickable" data-open="${c.id}"><div class="list-title">${esc(c.name)}</div><div class="list-sub">${esc(c.customerCode || '—')} · ${esc(c.mobile || 'بدون شماره')} · ${esc(c.type || 'حقیقی')}</div></div>
      <div class="list-value"><span class="${bal > 0 ? 'red' : (bal < 0 ? 'green' : '')}">${bal !== 0 ? money(Math.abs(bal)) : '—'}</span><br><small class="stat-meta">${bal > 0 ? 'بدهکار' : (bal < 0 ? 'بستانکار' : 'تسویه')}</small>
      <div class="btn-row"><button class="btn btn-secondary edit-c" data-id="${c.id}">ویرایش</button><button class="btn btn-danger del-c" data-id="${c.id}">حذف</button></div></div></div>`;
    }).join('') || '<div class="empty">مشتری‌ای پیدا نشد.</div>';
    document.querySelectorAll('[data-open]').forEach(el => el.onclick = () => navigate('#/customers/' + el.dataset.open));
    document.querySelectorAll('.edit-c').forEach(b => b.onclick = e => { e.stopPropagation(); form(customers.find(c => c.id == b.dataset.id)); });
    document.querySelectorAll('.del-c').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const id = Number(b.dataset.id);
      const hasInvoices = invoices.some(i => i.customerId === id);
      const msg = hasInvoices ? 'این مشتری دارای فاکتور ثبت‌شده است. حذف مشتری، فاکتورهای او را تغییر نمی‌دهد اما ارتباط آن‌ها از دست می‌رود. آیا مطمئن هستید؟' : 'آیا از حذف این مشتری مطمئن هستید؟';
      if (confirm(msg)) { await DB.delete('customers', id); toast('مشتری حذف شد'); renderCustomers(App); }
    });
  };
  draw('');
  document.getElementById('customer-search').oninput = e => draw(e.target.value);
  document.getElementById('add-customer').onclick = () => form();

  function nextCode() {
    const nums = customers.map(c => Number(String(c.customerCode || '').replace(/\D/g, '')) || 0);
    return 'C-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0');
  }

  function form(c = {}) {
    const r = document.getElementById('modal-root');
    r.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>${c.id ? 'ویرایش مشتری' : 'مشتری جدید'}</h3><button class="close no-print">×</button></div>
    <form id="customer-form" class="form-grid" novalidate>
      <div class="field"><label>نام / نام شرکت</label><input name="name" required value="${esc(c.name)}"></div>
      <div class="field"><label>کد مشتری</label><input name="customerCode" value="${esc(c.customerCode || (c.id ? '' : nextCode()))}"></div>
      <div class="field"><label>موبایل</label><input name="mobile" inputmode="tel" value="${esc(c.mobile)}"></div>
      <div class="field"><label>نوع</label><select name="type"><option ${c.type === 'حقیقی' || !c.type ? 'selected' : ''}>حقیقی</option><option ${c.type === 'حقوقی' ? 'selected' : ''}>حقوقی</option></select></div>
      <div class="field full"><label>آدرس</label><textarea name="address">${esc(c.address)}</textarea></div>
      <div class="field full"><label>توضیحات</label><textarea name="notes">${esc(c.notes)}</textarea></div>
      <div class="field full"><button class="btn btn-primary" type="submit">ذخیره</button></div>
    </form></div></div>`;
    r.querySelector('.close').onclick = () => r.innerHTML = '';
    r.querySelector('#customer-form').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const result = validateCustomer(d);
      if (!result.valid) { toast(result.errors[0].message, 'error'); return; }
      if (c.id) d.id = c.id;
      await DB.put('customers', d);
      r.innerHTML = ''; toast('مشتری ذخیره شد'); renderCustomers(App);
    };
  }
}
