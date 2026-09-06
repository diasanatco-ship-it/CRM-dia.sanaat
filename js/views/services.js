import { DB } from '../db.js';
import { money, esc, toast } from '../utils.js';
import { validateService } from '../validators.js';

const CATEGORIES = ['برق ساختمان', 'برق صنعتی', 'تابلو برق', 'روشنایی و نورپردازی', 'خدمات مهندسی', 'تعمیرات و عیب‌یابی'];

export async function renderServices(App) {
  const rows = await DB.all('services');
  App.setView(`<div class="page-title-row"><h1 class="page-title">خدمات</h1><button class="btn btn-primary" id="add">+ خدمت</button></div><div class="list" id="list"></div>`);
  document.getElementById('list').innerHTML = (rows.map(x => `<div class="list-item"><div class="list-main"><div class="list-title">${esc(x.name)}</div><div class="list-sub">${esc(x.category || 'عمومی')} · واحد: ${esc(x.unit || 'مورد')}</div></div><div class="list-value">${money(x.price || 0)}<div class="btn-row"><button class="btn btn-secondary edit" data-id="${x.id}">ویرایش</button><button class="btn btn-danger del" data-id="${x.id}">حذف</button></div></div></div>`).join('') || '<div class="empty">خدمتی ثبت نشده است.</div>');
  document.getElementById('add').onclick = () => form();
  document.querySelectorAll('.edit').forEach(b => b.onclick = () => form(rows.find(x => x.id == b.dataset.id)));
  document.querySelectorAll('.del').forEach(b => b.onclick = async () => { if (confirm('این خدمت حذف شود؟')) { await DB.delete('services', Number(b.dataset.id)); toast('خدمت حذف شد'); renderServices(App); } });

  function form(x = {}) {
    const r = document.getElementById('modal-root');
    r.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>${x.id ? 'ویرایش خدمت' : 'خدمت جدید'}</h3><button class="close">×</button></div><form id="f" class="form-grid" novalidate>
    <div class="field full"><label>نام خدمت</label><input name="name" required value="${esc(x.name)}"></div>
    <div class="field"><label>دسته‌بندی</label><select name="category">${CATEGORIES.map(c => `<option ${x.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>واحد</label><input name="unit" value="${esc(x.unit || 'مورد')}"></div>
    <div class="field"><label>قیمت پایه</label><input name="price" type="number" min="0" value="${x.price || 0}"></div>
    <div class="field full"><label>توضیحات</label><textarea name="description">${esc(x.description)}</textarea></div>
    <div class="field full"><button class="btn btn-primary">ذخیره</button></div></form></div></div>`;
    r.querySelector('.close').onclick = () => r.innerHTML = '';
    r.querySelector('#f').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const result = validateService(d);
      if (!result.valid) { toast(result.errors[0].message, 'error'); return; }
      d.price = Number(d.price || 0);
      if (x.id) d.id = x.id;
      await DB.put('services', d);
      r.innerHTML = ''; toast('خدمت ذخیره شد'); renderServices(App);
    };
  }
}
