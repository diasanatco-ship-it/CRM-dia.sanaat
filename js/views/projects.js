import { DB } from '../db.js';
import { money, esc, toast, PROJECT_STATUS_LABELS, faLabel } from '../utils.js';
import { PROJECT_STATUS, validateProject } from '../validators.js';

export async function renderProjects(App) {
  const [rows, customers] = await Promise.all([DB.all('projects'), DB.all('customers')]);
  App.setView(`<div class="page-title-row"><h1 class="page-title">پروژه‌ها</h1><button class="btn btn-primary" id="add">+ پروژه</button></div><div class="list" id="list"></div>`);
  const cname = id => customers.find(c => c.id == id)?.name || 'بدون مشتری';
  document.getElementById('list').innerHTML = (rows.map(x => `<div class="list-item"><div class="list-main"><div class="list-title">${esc(x.name)}</div><div class="list-sub">${esc(cname(x.customerId))} · ${faLabel(PROJECT_STATUS_LABELS, x.status || 'active')}</div></div><div class="list-value">${money(x.budget || 0)}<br><button class="btn btn-secondary edit" data-id="${x.id}">ویرایش</button></div></div>`).join('') || '<div class="empty">پروژه‌ای ثبت نشده است.</div>');
  document.getElementById('add').onclick = () => form();
  document.querySelectorAll('.edit').forEach(b => b.onclick = () => form(rows.find(x => x.id == b.dataset.id)));

  function form(x = {}) {
    const r = document.getElementById('modal-root');
    r.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>${x.id ? 'ویرایش پروژه' : 'پروژه جدید'}</h3><button class="close">×</button></div><form id="f" class="form-grid" novalidate>
    <div class="field full"><label>نام پروژه</label><input name="name" required value="${esc(x.name)}"></div>
    <div class="field"><label>مشتری</label><select name="customerId"><option value="">بدون مشتری</option>${customers.map(c => `<option value="${c.id}" ${x.customerId == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>وضعیت</label><select name="status">${PROJECT_STATUS.map(s => `<option value="${s}" ${(x.status || 'active') === s ? 'selected' : ''}>${faLabel(PROJECT_STATUS_LABELS, s)}</option>`).join('')}</select></div>
    <div class="field"><label>تاریخ شروع</label><input name="startDate" type="date" value="${x.startDate || ''}"></div>
    <div class="field"><label>تاریخ پایان</label><input name="endDate" type="date" value="${x.endDate || ''}"></div>
    <div class="field"><label>مبلغ قرارداد (بودجه)</label><input name="budget" type="number" min="0" value="${x.budget || 0}"></div>
    <div class="field"><label>هزینه پروژه</label><input name="cost" type="number" min="0" value="${x.cost || 0}"></div>
    <div class="field full"><label>توضیحات</label><textarea name="description">${esc(x.description || x.notes)}</textarea></div>
    <div class="field full"><button class="btn btn-primary">ذخیره</button></div></form></div></div>`;
    r.querySelector('.close').onclick = () => r.innerHTML = '';
    r.querySelector('#f').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      d.customerId = d.customerId ? Number(d.customerId) : null;
      const result = validateProject(d);
      if (!result.valid) { toast(result.errors[0].message, 'error'); return; }
      d.budget = Number(d.budget || 0); d.cost = Number(d.cost || 0);
      if (x.id) d.id = x.id;
      await DB.put('projects', d);
      r.innerHTML = ''; toast('پروژه ذخیره شد'); renderProjects(App);
    };
  }
}
