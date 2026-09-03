export const money=n=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+' تومان';
export const num=n=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0));
export const dateFa=d=>new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
export const uid=()=>Date.now()+Math.floor(Math.random()*1000);
export const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
export function toast(msg){const r=document.getElementById('toast-root');r.innerHTML='<div class="toast">'+esc(msg)+'</div>';setTimeout(()=>r.innerHTML='',2200)}
export function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
export function downloadJSON(data,name){downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name)}
export async function invoiceToImage(el,name='invoice.png'){
 const rect=el.getBoundingClientRect(), scale=2, canvas=document.createElement('canvas');
 canvas.width=rect.width*scale;canvas.height=rect.height*scale;const c=canvas.getContext('2d');c.scale(scale,scale);
 c.fillStyle='#fffefa';c.fillRect(0,0,rect.width,rect.height);
 const xml=new XMLSerializer().serializeToString(el);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+rect.width+'" height="'+rect.height+'"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,Tahoma,sans-serif;direction:rtl;width:100%;height:100%;">'+xml+'</div></foreignObject></svg>';
 const img=new Image();img.onload=()=>{c.drawImage(img,0,0);canvas.toBlob(b=>downloadBlob(b,name),'image/png')};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
