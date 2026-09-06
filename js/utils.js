export const money=(n,unit='تومان')=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+(unit?' '+unit:'');
export const num=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(Number(n)||0);
export const dateFa=d=>{if(!d)return '—';const dt=new Date(d);return Number.isNaN(dt.getTime())?'—':new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(dt);};
export const dateTimeFa=d=>{if(!d)return '—';const dt=new Date(d);return Number.isNaN(dt.getTime())?'—':new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(dt);};
export const uid=()=>Date.now()+Math.floor(Math.random()*100000);
export const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
export const icon=(name,label='',cls='icon')=>`<img class="${cls}" src="./assets/icons/${name}.svg" alt="${esc(label)}" aria-hidden="${label?'false':'true'}">`;
export const todayISO=()=>new Date().toISOString().slice(0,10);
export function toast(msg,kind=''){const r=document.getElementById('toast-root');if(!r)return;r.innerHTML=`<div class="toast ${kind?'toast-'+kind:''}" role="status">${esc(msg)}</div>`;clearTimeout(toast._t);toast._t=setTimeout(()=>r.innerHTML='',2600);}
export function downloadBlob(blob,name){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const downloadJSON=(data,name)=>downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name);
export function printWithClass(cls){document.body.classList.add(cls);const cleanup=()=>{document.body.classList.remove(cls);window.removeEventListener('afterprint',cleanup)};window.addEventListener('afterprint',cleanup);setTimeout(()=>window.print(),40);}
export async function invoiceToImage(el,name='invoice.png'){
  await document.fonts?.ready; const rect=el.getBoundingClientRect(); const scale=Math.min(3,Math.max(2,window.devicePixelRatio||2));
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(rect.width*scale);canvas.height=Math.ceil(rect.height*scale);
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fffdfa';ctx.fillRect(0,0,rect.width,rect.height);
  const clone=el.cloneNode(true);clone.style.width=rect.width+'px';clone.style.margin='0';clone.style.boxShadow='none';
  const xml=new XMLSerializer().serializeToString(clone);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${rect.width}" height="${rect.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,Tahoma,sans-serif;direction:rtl;background:#fffdfa;width:100%;height:100%;">${xml}</div></foreignObject></svg>`;
  return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>canvas.toBlob(b=>{if(!b)return reject(new Error('تبدیل تصویر ناموفق بود'));downloadBlob(b,name);resolve();},'image/png');img.onerror=()=>reject(new Error('مرورگر نتوانست فاکتور فارسی را به تصویر تبدیل کند. برای چاپ از گزینه چاپ استفاده کنید.'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
}
const Y=['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه'],D19=['ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده'],D=['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود'],H=['','صد','دویست','سیصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد'],S=['','هزار','میلیون','میلیارد','هزار میلیارد','میلیون میلیارد'];
function three(n){const a=[],h=Math.floor(n/100),d=Math.floor(n%100/10),y=n%10;if(h)a.push(H[h]);if(d===1)a.push(D19[y]);else{if(d)a.push(D[d]);if(y)a.push(Y[y]);}return a.join(' و ');}
export function numberToWordsFa(input){let n=Math.round(Math.abs(Number(input)||0));if(n===0)return 'صفر';const g=[];while(n){g.unshift(n%1000);n=Math.floor(n/1000)}return g.map((x,i)=>x?three(x)+(g.length-1-i?` ${S[g.length-1-i]}`:''):'').filter(Boolean).join(' و ');}
export const amountToWordsFa=(n,unit='تومان')=>numberToWordsFa(n)+' '+unit;
export const INVOICE_STATUS_LABELS={draft:'پیش‌نویس',issued:'صادر شده',partially_paid:'پرداخت جزئی',paid:'پرداخت شده',cancelled:'لغو شده'};
export const INVOICE_STATUS_BADGE={draft:'muted',issued:'info',partially_paid:'warn',paid:'paid',cancelled:'danger'};
export const PROJECT_STATUS_LABELS={planned:'در انتظار',active:'در حال اجرا',completed:'تمام شده',cancelled:'لغو شده'};
export const TRANSACTION_TYPE_LABELS={income:'درآمد',expense:'هزینه',customer_payment:'دریافت از مشتری',supplier_payment:'پرداخت به تأمین‌کننده',other_expense:'پرداخت سایر هزینه‌ها'};
export const isIncomeType=t=>t==='income'||t==='customer_payment';
export const faLabel=(map,code)=>map[code]||code||'—';
export function clearFieldErrors(form){form.querySelectorAll('.field-error').forEach(x=>x.remove());form.querySelectorAll('[aria-invalid]').forEach(x=>x.removeAttribute('aria-invalid'));}
export function showValidationErrors(form,result){clearFieldErrors(form);if(result.valid)return false;result.errors.forEach(e=>{const field=form.querySelector(`[name="${CSS.escape(e.field)}"]`);if(field){field.setAttribute('aria-invalid','true');const msg=document.createElement('div');msg.className='field-error';msg.textContent=e.message;field.closest('.field')?.appendChild(msg);}});form.querySelector('[aria-invalid]')?.focus();return true;}
