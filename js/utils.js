// utils.js — توابع کمکی مشترک (فرمت اعداد/تاریخ، توست، دانلود فایل، خروجی تصویر)
export const money = (n, unit = 'تومان') => new Intl.NumberFormat('fa-IR').format(Math.round(Number(n) || 0)) + (unit ? ' ' + unit : '');
export const num = n => new Intl.NumberFormat('fa-IR').format(Math.round(Number(n) || 0));
export const dateFa = d => d ? new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d)) : '—';
export const dateTimeFa = d => d ? new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—';
export const uid = () => Date.now() + Math.floor(Math.random() * 1000);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

export function toast(msg, kind = '') {
  const r = document.getElementById('toast-root');
  if (!r) return;
  r.innerHTML = `<div class="toast${kind ? ' toast-' + kind : ''}">${esc(msg)}</div>`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { r.innerHTML = ''; }, 2400);
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function downloadJSON(data, name) { downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name); }

// چاپ فقط یک بخش خاص از صفحه با افزودن یک کلاس موقت به body (سازگارتر از :has() در همه مرورگرها)
export function printWithClass(cls) {
  document.body.classList.add(cls);
  const cleanup = () => { document.body.classList.remove(cls); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 30);
}

// خروجی PNG از یک بلاک HTML (بدون کتابخانه خارجی، بدون وابستگی به CDN)
export async function invoiceToImage(el, name = 'invoice.png') {
  const rect = el.getBoundingClientRect(), scale = 2, canvas = document.createElement('canvas');
  canvas.width = rect.width * scale; canvas.height = rect.height * scale;
  const c = canvas.getContext('2d'); c.scale(scale, scale);
  c.fillStyle = '#fffefa'; c.fillRect(0, 0, rect.width, rect.height);
  const xml = new XMLSerializer().serializeToString(el);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + rect.width + '" height="' + rect.height + '"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,Tahoma,sans-serif;direction:rtl;width:100%;height:100%;">' + xml + '</div></foreignObject></svg>';
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { c.drawImage(img, 0, 0); canvas.toBlob(b => { if (b) { downloadBlob(b, name); resolve(); } else reject(new Error('تبدیل به تصویر ناموفق بود')); }, 'image/png'); };
    img.onerror = () => reject(new Error('تبدیل به تصویر ناموفق بود'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

// ---- تبدیل عدد به حروف فارسی (برای «مبلغ به حروف» در فاکتور) ----
const YEKAN = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const DAHGAN10_19 = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const DAHGAN = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const SADGAN = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALE = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد', 'میلیون میلیارد'];

function threeDigitToWords(n) {
  const parts = [];
  const s = Math.floor(n / 100), d = Math.floor((n % 100) / 10), y = n % 10;
  if (s) parts.push(SADGAN[s]);
  if (d === 1) parts.push(DAHGAN10_19[y]);
  else { if (d) parts.push(DAHGAN[d]); if (y) parts.push(YEKAN[y]); }
  return parts.join(' و ');
}
export function numberToWordsFa(input) {
  let n = Math.round(Math.abs(Number(input) || 0));
  if (n === 0) return 'صفر';
  const groups = [];
  while (n > 0) { groups.unshift(n % 1000); n = Math.floor(n / 1000); }
  const words = [];
  groups.forEach((g, i) => {
    if (!g) return;
    const scaleIdx = groups.length - 1 - i;
    const w = threeDigitToWords(g);
    words.push(scaleIdx ? (w + ' ' + SCALE[scaleIdx]) : w);
  });
  return words.join(' و ');
}
export const amountToWordsFa = (n, unit = 'تومان') => numberToWordsFa(n) + ' ' + unit;

// ---- ترجمه فارسی کدهای وضعیت/نوع (کدها در validators.js متمرکز هستند؛ ترجمه اینجا زندگی می‌کند) ----
export const INVOICE_STATUS_LABELS = { draft: 'پیش‌نویس', issued: 'صادر شده', partially_paid: 'پرداخت جزئی', paid: 'پرداخت شده', cancelled: 'لغو شده' };
export const INVOICE_STATUS_BADGE = { draft: 'muted', issued: 'info', partially_paid: 'warn', paid: 'paid', cancelled: 'danger' };
export const PROJECT_STATUS_LABELS = { planned: 'در انتظار', active: 'در حال اجرا', completed: 'تمام شده', cancelled: 'لغو شده' };
export const TRANSACTION_TYPE_LABELS = { income: 'درآمد', expense: 'هزینه', customer_payment: 'دریافت از مشتری', supplier_payment: 'پرداخت به تأمین‌کننده', other_expense: 'پرداخت سایر هزینه‌ها' };
export const isIncomeType = t => t === 'income' || t === 'customer_payment';
export const faLabel = (map, code) => map[code] || code;
