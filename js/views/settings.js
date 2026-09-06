import { DB, exportDatabase, importDatabase, getSettings, saveSettings, stores } from '../db.js';
import { downloadJSON, toast, esc, num } from '../utils.js';
import { validateSettings } from '../validators.js';

export async function renderSettings(App) {
  const s = await getSettings();
  App.setView(`<h1 class="page-title">تنظیمات</h1><div class="list">

  <div class="card card-pad">
    <h3>اطلاعات کسب‌وکار</h3>
    <form id="business-form" class="form-grid" novalidate>
      <div class="field full"><label>نام کسب‌وکار</label><input name="businessName" value="${esc(s.businessName)}"></div>
      <div class="field"><label>نام صاحب کسب‌وکار</label><input name="ownerName" value="${esc(s.ownerName)}"></div>
      <div class="field"><label>شماره تماس</label><input name="phone" value="${esc(s.phone)}" inputmode="tel"></div>
      <div class="field full"><label>آدرس</label><textarea name="address">${esc(s.address)}</textarea></div>
      <div class="field full"><label>توضیحات پایین فاکتور</label><textarea name="invoiceNote">${esc(s.invoiceNote)}</textarea></div>
      <div class="field full"><button class="btn btn-primary" type="submit">ذخیره اطلاعات کسب‌وکار</button></div>
    </form>
  </div>

  <div class="card card-pad">
    <h3>شماره‌گذاری و مالیات فاکتور</h3>
    <form id="invoice-form" class="form-grid" novalidate>
      <div class="field"><label>واحد پول</label><input name="currency" value="${esc(s.currency)}"></div>
      <div class="field"><label>پیشوند شماره فاکتور</label><input name="invoicePrefix" value="${esc(s.invoicePrefix)}" placeholder="مثلاً: INV-"></div>
      <div class="field"><label>شماره شروع فاکتور بعدی</label><input name="invoiceStart" type="number" min="1" value="${num(s.invoiceStart)}"></div>
      <div class="field"><label>مالیات بر ارزش افزوده</label><select name="taxEnabled"><option value="0" ${!s.taxEnabled ? 'selected' : ''}>غیرفعال</option><option value="1" ${s.taxEnabled ? 'selected' : ''}>فعال</option></select></div>
      <div class="field"><label>درصد مالیات</label><input name="taxPercent" type="number" min="0" max="100" value="${num(s.taxPercent)}"></div>
      <div class="field full"><button class="btn btn-primary" type="submit">ذخیره تنظیمات فاکتور</button></div>
    </form>
  </div>

  <div class="card card-pad">
    <h3>پشتیبان‌گیری</h3>
    <p class="hint">اطلاعات این نسخه فقط روی همین دستگاه و در IndexedDB ذخیره می‌شود. با پاک شدن مرورگر، اطلاعات از بین می‌رود مگر این‌که بکاپ گرفته باشید. توصیه می‌شود مرتب بکاپ بگیرید.</p>
    <div class="btn-row"><button class="btn btn-primary" id="export">خروجی پشتیبان (JSON)</button><label class="btn btn-secondary" for="import">بازیابی پشتیبان</label><input id="import" type="file" accept=".json,application/json" hidden></div>
  </div>

  <div class="card card-pad">
    <h3>اطلاعات برنامه</h3>
    <p class="hint">نسخه V1 · Offline First · HTML / CSS / Vanilla JS / IndexedDB / PWA · بدون نیاز به سرور</p>
  </div>

  <div class="card card-pad">
    <h3>حذف اطلاعات</h3>
    <p class="hint">این عملیات برگشت‌پذیر نیست؛ قبل از آن حتماً بکاپ بگیرید.</p>
    <button class="btn btn-danger" id="clear">حذف تمام اطلاعات</button>
  </div>
  </div>`);

  document.getElementById('business-form').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const result = validateSettings(d);
    if (!result.valid) { toast(result.errors[0].message, 'error'); return; }
    await saveSettings(d); toast('اطلاعات کسب‌وکار ذخیره شد');
  };
  document.getElementById('invoice-form').onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const d = { ...fd, taxEnabled: fd.taxEnabled === '1', taxPercent: Number(fd.taxPercent || 0), invoiceStart: Number(fd.invoiceStart || 1001) };
    const result = validateSettings(d);
    if (!result.valid) { toast(result.errors[0].message, 'error'); return; }
    await saveSettings(d); toast('تنظیمات فاکتور ذخیره شد');
  };
  document.getElementById('export').onclick = async () => { const d = await exportDatabase(); downloadJSON(d, 'DIA-Backup-' + new Date().toISOString().slice(0, 10) + '.json'); toast('فایل پشتیبان آماده شد'); };
  document.getElementById('import').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !d.stores) { toast('فایل پشتیبان معتبر نیست.', 'error'); return; }
      if (confirm('اطلاعات فعلی با این فایل پشتیبان جایگزین می‌شود. آیا مطمئن هستید؟')) { await importDatabase(d); toast('بازیابی انجام شد'); renderSettings(App); }
    } catch { toast('فایل پشتیبان معتبر نیست.', 'error'); }
  };
  document.getElementById('clear').onclick = async () => {
    if (confirm('همه اطلاعات (مشتریان، فاکتورها، تراکنش‌ها و ...) برای همیشه حذف شود؟')) {
      if (confirm('این عملیات غیرقابل بازگشت است. یک‌بار دیگر تأیید کنید.')) {
        for (const st of stores) await DB.clear(st);
        toast('تمام اطلاعات حذف شد'); renderSettings(App);
      }
    }
  };
}
