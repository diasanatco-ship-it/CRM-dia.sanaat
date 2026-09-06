import { DB } from '../db.js';
import { money, num, esc, toast } from '../utils.js';
import { validateProduct } from '../validators.js';

export async function renderProducts(App) {
  const rows = await DB.all('products');
  App.setView(`<div class="page-title-row"><h1 class="page-title">اجناس و محصولات</h1><button class="btn btn-primary" id="add-product">+ کالا</button></div><div class="search"><span>⌕</span><input id="search" placeholder="جستجوی کالا..."></div><div id="list" class="list"></div>`);

  const draw = f => document.getElementById('list').innerHTML = (rows.filter(x => (x.name + ' ' + (x.code || '')).includes(f || '')).map(x => {
    const low = (x.stock || 0) <= (x.minStock || 0) && (x.minStock || 0) > 0;
    return `<div class="list-item"><div class="list-main"><div class="list-title">${esc(x.name)} ${low ? '<span class="badge badge-warn">موجودی کم</span>' : ''}</div><div class="list-sub">${esc(x.code || 'بدون کد')} · موجودی: ${num(x.stock || 0)} ${esc(x.unit || 'عدد')}</div></div><div class="list-value">${money(x.salePrice || 0)}<div class="btn-row"><button class="btn btn-secondary edit" data-id="${x.id}">ویرایش</button><button class="btn btn-danger del" data-id="${x.id}">حذف</button></div></div></div>`;
  }).join('') || '<div class="empty">کالایی ثبت نشده است.</div>');
  draw(''); document.getElementById('search').oninput = e => draw(e.target.value.trim()); document.getElementById('add-product').onclick = () => form();
  document.querySelectorAll('.edit').forEach(b => b.onclick = () => form(rows.find(x => x.id == b.dataset.id)));
  document.querySelectorAll('.del').forEach(b => b.onclick = async () => { if (confirm('این کالا حذف شود؟')) { await DB.delete('products', Number(b.dataset.id)); toast('کالا حذف شد'); renderProducts(App); } });

  function form(x = {}) {
    const r = document.getElementById('modal-root');
    r.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>${x.id ? 'ویرایش کالا' : 'کالای جدید'}</h3><button class="close">×</button></div><form id="f" class="form-grid" novalidate>
    <div class="field"><label>نام کالا</label><input name="name" required value="${esc(x.name)}"></div><div class="field"><label>کد کالا</label><input name="code" value="${esc(x.code)}"></div>
    <div class="field"><label>واحد</label><input name="unit" value="${esc(x.unit || 'عدد')}"></div><div class="field"><label>دسته‌بندی</label><input name="category" value="${esc(x.category)}" list="cat-list"></div>
    <div class="field"><label>قیمت خرید</label><input name="purchasePrice" type="number" min="0" inputmode="numeric" value="${x.purchasePrice || 0}"></div><div class="field"><label>قیمت فروش</label><input name="salePrice" type="number" min="0" inputmode="numeric" value="${x.salePrice || 0}"></div>
    <div class="field"><label>موجودی</label><input name="stock" type="number" min="0" inputmode="numeric" value="${x.stock || 0}"></div><div class="field"><label>حداقل موجودی</label><input name="minStock" type="number" min="0" value="${x.minStock || 0}"></div>
    <div class="field full"><label>توضیحات</label><textarea name="notes">${esc(x.notes)}</textarea></div><div class="field full"><button class="btn btn-primary">ذخیره</button></div></form>
    <datalist id="cat-list"><option>کابل</option><option>کلید و پریز</option><option>فیوز و محافظت</option><option>روشنایی و LED</option><option>ترانس</option><option>تابلو برق</option><option>سیم</option><option>لوازم برق صنعتی</option></datalist>
    </div></div>`;
    r.querySelector('.close').onclick = () => r.innerHTML = '';
    r.querySelector('#f').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const result = validateProduct(d);
      if (!result.valid) { toast(result.errors[0].message, 'error'); return; }
      ['purchasePrice', 'salePrice', 'stock', 'minStock'].forEach(k => d[k] = Number(d[k] || 0));
      if (x.id) d.id = x.id;
      await DB.put('products', d);
      r.innerHTML = ''; toast('کالا ذخیره شد'); renderProducts(App);
    };
  }
}
