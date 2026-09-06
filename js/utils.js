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
  if(!el) throw new Error('محتوای فاکتور پیدا نشد.');
  await document.fonts?.ready;
  const rect=el.getBoundingClientRect();
  const scale=Math.min(3,Math.max(2.2,window.devicePixelRatio||2));
  const clone=el.cloneNode(true);
  clone.style.width=`${rect.width}px`;clone.style.margin='0';clone.style.boxShadow='none';clone.style.position='static';clone.style.transform='none';
  const sourceNodes=[el,...el.querySelectorAll('*')], cloneNodes=[clone,...clone.querySelectorAll('*')];
  const props=['box-sizing','display','position','width','height','min-height','max-width','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left','border','border-top','border-right','border-bottom','border-left','border-radius','background','background-color','color','font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-decoration','vertical-align','direction','white-space','overflow','flex','flex-direction','align-items','justify-content','gap','grid-template-columns','grid-template-rows','grid-column','opacity'];
  sourceNodes.forEach((src,i)=>{const dst=cloneNodes[i];if(!dst)return;const cs=getComputedStyle(src);props.forEach(prop=>dst.style.setProperty(prop,cs.getPropertyValue(prop)));});
  clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const xml=new XMLSerializer().serializeToString(clone);
  const width=Math.ceil(rect.width),height=Math.ceil(rect.height);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fffdfa"/><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background:#fffdfa;direction:rtl;font-family:Arial,Tahoma,sans-serif;">${xml}</div></foreignObject></svg>`;
  const rasterize=()=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const ctx=canvas.getContext('2d');if(!ctx)return reject(new Error('Canvas در این مرورگر در دسترس نیست.'));ctx.fillStyle='#fffdfa';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,0,0);ctx.drawImage(img,0,0,width,height);canvas.toBlob(b=>b?resolve(b):reject(new Error('تبدیل تصویر ناموفق بود.')),'image/png',1);};img.onerror=()=>reject(new Error('foreignObject failed'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
  try{downloadBlob(await rasterize(),name);return;}catch(_){
    // iOS Safari can reject SVG foreignObject. Fall back to a native canvas render.
    const canvas=document.createElement('canvas');
    const w=Math.max(900,Math.ceil(rect.width*2)), h=Math.max(1200,Math.ceil(rect.height*2)); canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d'); if(!ctx)throw new Error('مرورگر امکان ساخت تصویر را ندارد.');
    ctx.fillStyle='#fffdfa';ctx.fillRect(0,0,w,h);ctx.fillStyle='#263330';ctx.direction='rtl';ctx.textAlign='right';
    const right=w-70; let y=85;
    const text=(t,size,bold=false)=>{ctx.font=`${bold?'700':'400'} ${size}px DIAFont, Tahoma, Arial, sans-serif`;ctx.fillStyle='#263330';ctx.fillText(String(t||''),right,y);y+=size*1.75;};
    text('فاکتور فروش',32,true); text(`شماره: ${el.querySelector('.invoice-number strong')?.textContent||''}`,20); text(`تاریخ: ${el.querySelector('.invoice-number')?.textContent?.match(/تاریخ:\s*([^\n]+)/)?.[1]||''}`,18);
    y+=18; ctx.strokeStyle='#087f70';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(70,y);ctx.lineTo(w-70,y);ctx.stroke();y+=45;
    text(`طرف حساب: ${el.querySelector('.invoice-meta')?.textContent?.replace(/طرف حساب/,'').trim()||'مشتری آزاد'}`,20,true);y+=10;
    const cells=[...el.querySelectorAll('.invoice-table tbody tr')]; text('اقلام فاکتور',22,true); cells.forEach((r,i)=>{const td=[...r.children].map(x=>x.textContent.trim()); text(`${i+1}. ${td[1]||''} — ${td[2]||''} ${td[3]||''} — ${td[6]||''} تومان`,17);});
    y+=15; ctx.strokeStyle='#dce4e0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(70,y);ctx.lineTo(w-70,y);ctx.stroke();y+=40;
    [...el.querySelectorAll('.invoice-summary-grid>div')].forEach(d=>{const spans=d.querySelectorAll('span,strong');if(spans.length>=2)text(`${spans[0].textContent}: ${spans[1].textContent}`,18, d.classList.contains('invoice-grand-total'));});
    const notes=el.querySelector('.invoice-notes')?.textContent;if(notes){y+=10;text(notes,17);}
    canvas.toBlob(b=>{if(!b)throw new Error('ساخت PNG ناموفق بود.');downloadBlob(b,name);},'image/png',1);
  }
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
export const isExpenseType=t=>t==='expense'||t==='supplier_payment'||t==='other_expense';
export function buildCustomerLedger(invoices=[],transactions=[],customerId){
  const cid=String(customerId);
  const its=invoices.filter(i=>String(i.customerId)===cid&&i.status!=='cancelled');
  const pays=transactions.filter(t=>String(t.customerId)===cid&&t.type==='customer_payment');
  const ledger=[];
  its.forEach(i=>{
    ledger.push({date:i.date?new Date(i.date).getTime():i.createdAt,desc:`فاکتور ${i.number}`,debit:Number(i.total)||0,credit:0,ref:i.id,kind:'invoice'});
    if(Number(i.paidAmount)>0) ledger.push({date:i.updatedAt||i.createdAt,desc:`دریافت فاکتور ${i.number}`,debit:0,credit:Number(i.paidAmount)||0,ref:i.id,kind:'payment'});
  });
  pays.forEach(t=>ledger.push({date:t.createdAt,desc:t.description||'دریافت وجه',debit:0,credit:Number(t.amount)||0,ref:t.id,kind:'payment'}));
  ledger.sort((a,b)=>a.date-b.date||String(a.kind).localeCompare(String(b.kind)));
  let running=0; ledger.forEach(r=>{running+=r.debit-r.credit;r.balance=running;});
  const total=its.reduce((s,i)=>s+(Number(i.total)||0),0);
  const paid=its.reduce((s,i)=>s+(Number(i.paidAmount)||0),0)+pays.reduce((s,t)=>s+(Number(t.amount)||0),0);
  return {invoices:its,transactions:pays,ledger,total,paid,balance:total-paid};
}
export function totalReceivables(customers=[],invoices=[],transactions=[]){
  return customers.reduce((sum,c)=>sum+Math.max(0,buildCustomerLedger(invoices,transactions,c.id).balance),0);
}

export const faLabel=(map,code)=>map[code]||code||'—';
export function clearFieldErrors(form){form.querySelectorAll('.field-error').forEach(x=>x.remove());form.querySelectorAll('[aria-invalid]').forEach(x=>x.removeAttribute('aria-invalid'));}
export function showValidationErrors(form,result){clearFieldErrors(form);if(result.valid)return false;result.errors.forEach(e=>{const field=form.querySelector(`[name="${CSS.escape(e.field)}"]`);if(field){field.setAttribute('aria-invalid','true');const msg=document.createElement('div');msg.className='field-error';msg.textContent=e.message;field.closest('.field')?.appendChild(msg);}});form.querySelector('[aria-invalid]')?.focus();return true;}
