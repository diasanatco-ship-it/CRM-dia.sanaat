import {DB,exportDatabase,importDatabase} from '../db.js';import {downloadJSON,toast} from '../utils.js';
export async function renderSettings(App){
 App.setView(`<h1 class="page-title">تنظیمات</h1><div class="list">
 <div class="card card-pad"><h3>پشتیبان‌گیری</h3><p style="color:var(--muted);font-size:12px">اطلاعات این نسخه روی همین دستگاه و در IndexedDB ذخیره می‌شود. برای امنیت، مرتب بکاپ بگیرید.</p><div class="btn-row"><button class="btn btn-primary" id="export">خروجی پشتیبان</button><label class="btn btn-secondary" for="import">بازیابی پشتیبان</label><input id="import" type="file" accept=".json,application/json" hidden></div></div>
 <div class="card card-pad"><h3>اطلاعات برنامه</h3><p>نسخه V1 · Offline First · HTML / CSS / Vanilla JS / IndexedDB / PWA</p></div>
 <div class="card card-pad"><h3>حذف اطلاعات</h3><p style="color:var(--muted);font-size:12px">این عملیات برگشت‌پذیر نیست؛ قبل از آن حتماً بکاپ بگیرید.</p><button class="btn btn-danger" id="clear">حذف تمام اطلاعات</button></div>
 </div>`);
 document.getElementById('export').onclick=async()=>{const d=await exportDatabase();downloadJSON(d,'DIA-Backup-'+new Date().toISOString().slice(0,10)+'.json');toast('فایل پشتیبان آماده شد')};
 document.getElementById('import').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(confirm('اطلاعات فعلی با پشتیبان جایگزین شود؟')){await importDatabase(d);toast('بازیابی انجام شد');renderSettings(App)}}catch{alert('فایل پشتیبان معتبر نیست.')}};
 document.getElementById('clear').onclick=async()=>{if(confirm('همه اطلاعات حذف شود؟')){for(const s of ['customers','products','services','projects','invoices','transactions','accounts','settings'])await DB.clear(s);toast('تمام اطلاعات حذف شد');renderSettings(App)}}
}
