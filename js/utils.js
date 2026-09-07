export const money=(n,unit='تومان')=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+(unit?' '+unit:'');
export const num=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(Number(n)||0);
export const dateFa=d=>{if(!d)return '—';const dt=new Date(d);return Number.isNaN(dt.getTime())?'—':new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(dt);};
export const dateTimeFa=d=>{if(!d)return '—';const dt=new Date(d);return Number.isNaN(dt.getTime())?'—':new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(dt);};
export const uid=()=>Date.now()+Math.floor(Math.random()*100000);
export const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
export const icon=(name,label='',cls='icon')=>`<img class="${cls}" src="./assets/icons/${name}.svg" alt="${esc(label)}" aria-hidden="${label?'false':'true'}">`;
export const todayISO=()=>new Date().toISOString().slice(0,10);
export function toast(msg,kind=''){const r=document.getElementById('toast-root');if(!r)return;r.innerHTML=`<div class="toast ${kind?'toast-'+kind:''}" role="status">${esc(msg)}</div>`;clearTimeout(toast._t);toast._t=setTimeout(()=>r.innerHTML='',2600);}
export async function downloadBlob(blob,name){
  if(!blob) throw new Error('فایل خروجی ساخته نشد.');
  // iOS Safari often ignores <a download> for Blob URLs. Prefer the native
  // Share Sheet when a File can be shared, then fall back to opening the file.
  try{
    const file=new File([blob],name,{type:blob.type||'application/octet-stream'});
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:name});
      return {shared:true};
    }
  }catch(err){
    if(err?.name==='AbortError') return {cancelled:true};
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';
  document.body.appendChild(a);a.click();a.remove();
  // On Safari, opening the blob is a more reliable last resort than silently
  // failing a download attribute.
  setTimeout(()=>{try{window.open(url,'_blank','noopener')}catch(_){}},120);
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return {downloaded:true};
}
export const downloadJSON=(data,name)=>downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name);
export function printWithClass(cls){document.body.classList.add(cls);const cleanup=()=>{document.body.classList.remove(cls);window.removeEventListener('afterprint',cleanup)};window.addEventListener('afterprint',cleanup);setTimeout(()=>window.print(),40);}
export async function invoiceToImage(el,name='invoice.png'){
  if(!el) throw new Error('محتوای فاکتور پیدا نشد.');
  await document.fonts?.ready;
  const W=1600, PAD=70, CONTENT=W-PAD*2;
  const rows=[...el.querySelectorAll('.clean-invoice-table tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent.trim()));
  const info=[...el.querySelectorAll('.invoice-info-card')].map(card=>({label:card.querySelector('span')?.textContent?.trim()||'',value:card.querySelector('strong')?.textContent?.trim()||'',small:card.querySelector('small')?.textContent?.trim()||''}));
  const summary=[...el.querySelectorAll('.invoice-summary-box>div')].map(d=>({label:d.querySelector('span')?.textContent?.trim()||'',value:d.querySelector('strong')?.textContent?.trim()||'',grand:d.classList.contains('grand'),balance:d.classList.contains('balance-row')}));
  const business=el.querySelector('.invoice-business-name')?.textContent?.trim()||'DIA Business';
  const businessSub=el.querySelector('.invoice-business-sub')?.textContent?.trim()||'';
  const docLabel=el.querySelector('.invoice-doc-label')?.textContent?.trim()||'فاکتور فروش';
  const docNumber=el.querySelector('.invoice-doc-number')?.textContent?.trim()||'';
  const words=el.querySelector('.invoice-words-block>strong')?.textContent?.trim()||'';
  const notes=el.querySelector('.invoice-notes-block p')?.textContent?.trim()||'';
  const footer=el.querySelector('.invoice-footer-note')?.textContent?.trim()||'';
  const logoSrc=el.querySelector('.invoice-logo')?.getAttribute('src');
  const lineHeight=34;
  const wrap=(ctx,text,maxWidth)=>{const out=[];let line='';for(const word of String(text||'').split(/\s+/)){const test=line?line+' '+word:word;if(ctx.measureText(test).width<=maxWidth)line=test;else{if(line)out.push(line);line=word;}}if(line)out.push(line);return out.length?out:[''];};
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d'); if(!ctx)throw new Error('مرورگر امکان ساخت تصویر را ندارد.');
  let H=560 + Math.max(1,rows.length)*68 + 420 + Math.ceil(words.length/75)*28 + Math.ceil(notes.length/80)*28;
  H=Math.max(1900,Math.min(3600,H)); canvas.width=W*2; canvas.height=H*2; ctx.scale(2,2);
  const C={text:'#263330',muted:'#6f7c77',border:'#d7e1dc',soft:'#f3f6f3',primary:'#087f70',primarySoft:'#e7f3f0',white:'#ffffff'};
  ctx.fillStyle=C.white;ctx.fillRect(0,0,W,H);ctx.direction='rtl';ctx.textBaseline='middle';
  const rr=(x,y,w,h,r,fill,stroke)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}};
  const font=(size,bold=false)=>ctx.font=`${bold?'700':'400'} ${size}px DIAFont,Tahoma,Arial,sans-serif`;
  const textR=(text,x,y,size,bold=false,max=Infinity)=>{font(size,bold);ctx.fillStyle=C.text;const ls=wrap(ctx,text,max);ls.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));return ls.length*lineHeight;};
  // Header
  let y=74;
  if(logoSrc){try{const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=logoSrc;});rr(PAD,y-24,92,92,18,C.primarySoft);ctx.drawImage(img,PAD+10,y-14,72,72);}catch(_){} }
  textR(business,PAD+112,y+2,34,true,700);textR(businessSub,PAD+112,y+43,17,false,700);
  font(40,true);ctx.fillStyle=C.text;ctx.fillText(docLabel,W-PAD, y+4);
  font(18,false);ctx.fillStyle=C.muted;ctx.fillText(docNumber,W-PAD,y+52);
  y+=112;ctx.fillStyle=C.primary;ctx.fillRect(PAD,y,CONTENT,4);y+=34;
  // Info cards
  const cols=info.length>2?2:1, gap=14, iw=(CONTENT-gap*(cols-1))/cols, ih=82;
  info.forEach((it,i)=>{const col=i%cols,row=Math.floor(i/cols),x=W-PAD-iw-col*(iw+gap);const yy=y+row*(ih+gap);rr(x,yy,iw,ih,14,C.soft,C.border);textR(it.label,x+iw-18,yy+25,15,false,iw-36);textR(it.value,x+iw-18,yy+52,19,true,iw-36);if(it.small)textR(it.small,x+18,yy+52,13,false,iw-36);});
  y+=Math.ceil(info.length/cols)*(ih+gap)+28;
  font(20,true);ctx.fillStyle=C.text;ctx.fillText('جزئیات فاکتور',W-PAD,y);y+=28;
  // Table
  const tw=[72,430,120,120,255,220,255], headers=['ردیف','شرح کالا / خدمت','تعداد','واحد','قیمت واحد','تخفیف','مبلغ'];
  const tableX=PAD, tableW=tw.reduce((a,b)=>a+b,0), th=52, rh=64;
  rr(tableX,y,tableW,th+Math.max(1,rows.length)*rh,12,C.white,C.border);ctx.save();ctx.beginPath();ctx.roundRect(tableX,y,tableW,th+Math.max(1,rows.length)*rh,12);ctx.clip();ctx.fillStyle=C.soft;ctx.fillRect(tableX,y,tableW,th);ctx.restore();
  let x=tableX; for(let i=0;i<tw.length;i++){const w=tw[i], center=x+w/2; font(15,true);ctx.fillStyle=C.text;ctx.textAlign='center';ctx.fillText(headers[i],center,y+th/2);ctx.strokeStyle=C.border;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+th+Math.max(1,rows.length)*rh);ctx.stroke();x+=w;}ctx.textAlign='right';
  rows.forEach((r,ri)=>{const yy=y+th+ri*rh;ctx.strokeStyle=C.border;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tableX,yy);ctx.lineTo(tableX+tableW,yy);ctx.stroke();let xx=tableX;r.forEach((val,ci)=>{const w=tw[ci], align=(ci===1?'right':'center');ctx.textAlign=align;font(14,ci===6);ctx.fillStyle=C.text;const tx=ci===1?xx+w-12:xx+w/2;const ls=wrap(ctx,val,ci===1?w-24:w-12);ls.slice(0,2).forEach((ln,j)=>ctx.fillText(ln,tx,yy+rh/2+(j-(ls.length>1?.5:0))*22));xx+=w;});});
  y+=th+Math.max(1,rows.length)*rh+22;
  // Bottom blocks
  const leftW=CONTENT-390-gap, rightW=390, bx=PAD, rx=W-PAD-rightW, bh=230;
  rr(bx,y,leftW,bh,14,C.soft,C.border);textR('مبلغ به حروف',bx+leftW-20,y+30,14,false,leftW-40);textR(words,bx+leftW-20,y+70,19,true,leftW-40);
  if(notes){font(14,false);ctx.fillStyle=C.muted;ctx.fillText('توضیحات',bx+leftW-20,y+142);textR(notes,bx+leftW-20,y+178,15,false,leftW-40);}
  rr(rx,y,rightW,bh,14,C.white,C.border);summary.forEach((it,i)=>{const yy=y+16+i*38;if(it.grand){ctx.fillStyle=C.primarySoft;ctx.fillRect(rx,yy-18,rightW,48);}font(it.grand?17:14,it.grand);ctx.fillStyle=it.grand?C.primary:C.text;ctx.textAlign='right';ctx.fillText(it.label,rx+rightW-16,yy);ctx.textAlign='left';ctx.fillText(it.value,rx+16,yy);});
  y+=bh+24;
  rr(PAD,y,CONTENT,48,10,C.soft);font(14,false);ctx.fillStyle=C.muted;ctx.textAlign='center';ctx.fillText(footer,W/2,y+24);y+=82;
  // signatures
  const sw=(CONTENT-40)/2;[['امضای خریدار',PAD],['مهر و امضای فروشنده',PAD+sw+40]].forEach(([label,x0])=>{font(14,true);ctx.fillStyle=C.text;ctx.textAlign='center';ctx.fillText(label,x0+sw/2,y);ctx.strokeStyle='#b9c4bf';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x0+30,y+54);ctx.lineTo(x0+sw-30,y+54);ctx.stroke();});
  canvas.height=Math.min(canvas.height,Math.ceil((y+100)*2));
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('ساخت PNG ناموفق بود.')),'image/png',1));
  return downloadBlob(blob,name);
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
    const linked=pays.filter(t=>String(t.invoiceId)===String(i.id));
    const linkedPaid=linked.reduce((s,t)=>s+(Number(t.amount)||0),0);
    // New payments are stored as transactions and are the source of truth.
    // Legacy invoices without linked payment transactions keep their old paidAmount as a fallback.
    if(linked.length){
      linked.forEach(t=>ledger.push({date:t.createdAt||i.updatedAt||i.createdAt,desc:t.description||`دریافت فاکتور ${i.number}`,debit:0,credit:Number(t.amount)||0,ref:t.id,invoiceId:i.id,kind:'payment'}));
    }else if(Number(i.paidAmount)>0){
      ledger.push({date:i.updatedAt||i.createdAt,desc:`دریافت فاکتور ${i.number}`,debit:0,credit:Number(i.paidAmount)||0,ref:i.id,invoiceId:i.id,kind:'payment',legacy:true});
    }
  });
  pays.filter(t=>!t.invoiceId).forEach(t=>ledger.push({date:t.createdAt,desc:t.description||'دریافت وجه',debit:0,credit:Number(t.amount)||0,ref:t.id,kind:'payment'}));
  ledger.sort((a,b)=>a.date-b.date||String(a.kind).localeCompare(String(b.kind)));
  let running=0; ledger.forEach(r=>{running+=r.debit-r.credit;r.balance=running;});
  const total=its.reduce((s,i)=>s+(Number(i.total)||0),0);
  const paid=ledger.reduce((s,r)=>s+(Number(r.credit)||0),0);
  return {invoices:its,transactions:pays,ledger,total,paid,balance:total-paid};
}
export function invoicePaidAmount(invoice, transactions=[]){
  const linked=transactions.filter(t=>String(t.invoiceId)===String(invoice.id)&&t.type==='customer_payment');
  return linked.length ? linked.reduce((s,t)=>s+(Number(t.amount)||0),0) : Math.max(0,Number(invoice.paidAmount)||0);
}
export function financialSummary(invoices=[],transactions=[]){
  const valid=invoices.filter(i=>i.status!=='cancelled');
  const received=valid.reduce((sum,i)=>{
    return sum+invoicePaidAmount(i,transactions);
  },0) + transactions.filter(t=>t.type==='customer_payment'&&!t.invoiceId).reduce((s,t)=>s+(Number(t.amount)||0),0);
  return {sales:valid.reduce((s,i)=>s+(Number(i.total)||0),0),received};
}
export function totalReceivables(customers=[],invoices=[],transactions=[]){
  return customers.reduce((sum,c)=>sum+Math.max(0,buildCustomerLedger(invoices,transactions,c.id).balance),0);
}

export const faLabel=(map,code)=>map[code]||code||'—';
export function clearFieldErrors(form){form.querySelectorAll('.field-error').forEach(x=>x.remove());form.querySelectorAll('[aria-invalid]').forEach(x=>x.removeAttribute('aria-invalid'));}
export function showValidationErrors(form,result){clearFieldErrors(form);if(result.valid)return false;result.errors.forEach(e=>{const field=form.querySelector(`[name="${CSS.escape(e.field)}"]`);if(field){field.setAttribute('aria-invalid','true');const msg=document.createElement('div');msg.className='field-error';msg.textContent=e.message;field.closest('.field')?.appendChild(msg);}});form.querySelector('[aria-invalid]')?.focus();return true;}
