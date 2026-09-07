import { DB, getSettings } from '../db.js';
import { money, num, dateFa, esc, toast, invoiceToImage, amountToWordsFa, printWithClass, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, faLabel, icon, showValidationErrors, todayISO } from '../utils.js';
import { INVOICE_STATUS, validateInvoice, normalizeAmountInput } from '../validators.js';
import { navigate } from '../router.js';
import { pageHeader, emptyState, openModal, closeModal, actionMenu, bindActionMenus } from '../components.js';

function calculateTotals(items, discount, taxEnabled, taxPercent) {
  const lineTotals = items.map(i => Math.max(0, Number(i.quantity)||0) * Math.max(0, Number(i.unitPrice)||0) - Math.max(0, Number(i.discount)||0));
  const subtotal = Math.round(lineTotals.reduce((s, v) => s + Math.max(0, v), 0));
  const safeDiscount = Math.min(Math.max(0, Math.round(Number(discount)||0)), subtotal);
  const after = subtotal - safeDiscount;
  const safeTaxPercent = Math.min(100, Math.max(0, Number(taxPercent)||0));
  const tax = taxEnabled ? Math.round(after * safeTaxPercent / 100) : 0;
  return { subtotal, discount: safeDiscount, after, tax, total: after + tax, lineTotals };
}

function deriveInvoiceStatus(status, paidAmount, total) {
  if (status === 'cancelled') return 'cancelled';
  const paid = Math.max(0, Math.round(Number(paidAmount)||0));
  const t = Math.max(0, Math.round(Number(total)||0));
  if (paid >= t && t > 0) return 'paid';
  if (paid > 0) return 'partially_paid';
  return status === 'draft' ? 'draft' : 'issued';
}

function invoiceStatusClass(status) { return INVOICE_STATUS_BADGE[status] || 'muted'; }

function invoiceCard(i) {
  return `<article class="list-item invoice-list-card" data-invoice-id="${i.id}">
    <button class="invoice-card-hit" data-open-invoice="${i.id}" aria-label="مشاهده فاکتور ${esc(i.number)}">
      <span class="invoice-card-icon">${icon('file-text','')}</span>
      <span class="list-main"><span class="list-title">فاکتور ${esc(i.number)}</span><span class="list-sub">${esc(i.customerName || 'مشتری آزاد')} · ${dateFa(i.date||i.createdAt)}</span></span>
      <span class="list-value">${money(i.total)}<small class="badge badge-${invoiceStatusClass(i.status)}">${faLabel(INVOICE_STATUS_LABELS, i.status)}</small></span>
    </button>
    ${actionMenu(i.id)}
  </article>`;
}

export async function renderInvoices(App, opts = {}) {
  const [rows, customers, products, services, settings] = await Promise.all([
    DB.all('invoices'), DB.all('customers'), DB.all('products'), DB.all('services'), getSettings()
  ]);
  App.setView(`${pageHeader('فاکتورها', { action: 'فاکتور جدید', actionId: 'add' })}
    <div class="invoice-list-summary"><span><strong>${num(rows.length)}</strong> فاکتور</span><span>مجموع فروش <strong>${money(rows.filter(x => x.status !== 'cancelled').reduce((s,x)=>s+(x.total||0),0))}</strong></span></div>
    <div class="search"><img class="icon" src="./assets/icons/search.svg" alt=""><input id="search" placeholder="جستجوی شماره فاکتور یا مشتری"></div>
    <div id="list" class="list"><div class="skeleton"></div><div class="skeleton"></div></div>`);

  const list = document.getElementById('list');
  const draw = (filter = '') => {
    const q = filter.trim().toLocaleLowerCase('fa-IR');
    const rs = rows.filter(x => `${x.number} ${x.customerName || ''}`.toLocaleLowerCase('fa-IR').includes(q)).sort((a,b)=>b.createdAt-a.createdAt);
    list.innerHTML = rs.map(invoiceCard).join('') || emptyState('فاکتوری ثبت نشده', 'برای شروع یک فاکتور فروش ایجاد کنید.', 'فاکتور جدید', 'add-empty');
    list.querySelectorAll('[data-open-invoice]').forEach(b => b.onclick = () => navigate(`#/invoices/${b.dataset.openInvoice}`));
    bindActionMenus(list, {
      edit: id => { const x = rows.find(r => String(r.id) === String(id)); if (x) form(null, x); },
      delete: async id => { const x=rows.find(r=>String(r.id)===String(id)); if(!x)return; if(x.status==='draft'){if(confirm('این پیش‌نویس حذف شود؟')){await DB.delete('invoices',Number(id));toast('پیش‌نویس حذف شد');renderInvoices(App);}} else {if(confirm('فاکتور لغو شود؟ فاکتورهای ثبت‌شده حذف نمی‌شوند و فقط لغو می‌شوند.')){await DB.put('invoices',{...x,status:'cancelled'});toast('فاکتور لغو شد');renderInvoices(App);}} }
    });
    list.querySelector('#add-empty')?.addEventListener('click', () => form());
  };
  draw();
  document.getElementById('search').oninput = e => draw(e.target.value);
  document.getElementById('add').onclick = () => form();
  if (opts.newForCustomer) form(Number(opts.newForCustomer));

  function nextNumber() {
    const seqs = rows.map(r => Number(r.seq) || 0);
    const base = Number(settings.invoiceStart) || 1001;
    const seq = Math.max(base, ...seqs.map(x => x + 1), base);
    return { seq, number: (settings.invoicePrefix || '') + seq };
  }

  function form(preselected = null, existing = null) {
    const m = openModal(`<div class="modal-head"><h3>${existing ? 'ویرایش فاکتور' : 'فاکتور فروش جدید'}</h3><button class="close">${icon('x','')}</button></div>
      <form id="invoice-form" class="invoice-editor" novalidate>
        <div class="form-grid">
          <div class="field"><label>مشتری</label><select name="customerId"><option value="">مشتری آزاد</option>${customers.map(c=>`<option value="${c.id}" ${String(existing?.customerId ?? preselected)===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>تاریخ</label><input name="date" type="date" value="${existing?.date || (existing?.createdAt ? new Date(existing.createdAt).toISOString().slice(0,10) : todayISO())}"></div>
          <div class="field"><label>وضعیت</label><select name="status">${INVOICE_STATUS.map(s=>`<option value="${s}" ${(existing?.status||'issued')===s?'selected':''}>${faLabel(INVOICE_STATUS_LABELS,s)}</option>`).join('')}</select></div>
        </div>
        <div class="section-title-row"><div class="section-title-compact">اقلام فاکتور</div><button type="button" class="btn btn-secondary" id="add-item">${icon('plus','')}افزودن ردیف</button></div>
        <div id="items"></div>
        <div class="section-title">تخفیف، مالیات و پرداخت</div>
        <div class="form-grid"><div class="field"><label>تخفیف کلی</label><input name="discount" type="text" inputmode="decimal" value="${existing?.discount||0}"></div>${settings.taxEnabled?`<div class="field"><label>مالیات ${num(settings.taxPercent)}٪</label><input id="tax-preview" disabled value="0 تومان"></div>`:''}<div class="field"><label>مبلغ پرداختی</label><input name="paidAmount" type="text" inputmode="decimal" value="${existing?.paidAmount||0}"></div></div>
        <div class="field mt-3"><label>توضیحات</label><textarea name="notes">${esc(existing?.notes||'')}</textarea></div>
        <div class="card card-pad mt-3"><div class="invoice-total"><span>جمع اقلام</span><span id="subtotal">۰ تومان</span></div><div class="invoice-total"><span>تخفیف</span><span id="discount-preview">۰ تومان</span></div>${settings.taxEnabled?`<div class="invoice-total"><span>مالیات</span><span id="tax-total">۰ تومان</span></div>`:''}<div class="invoice-total"><span>مبلغ نهایی</span><strong id="sum">۰ تومان</strong></div></div>
      </form>
      <div class="sticky-invoice-footer"><div class="sticky-invoice-inner"><div class="sticky-total"><small>مبلغ نهایی</small><strong id="sticky-sum">۰ تومان</strong></div><button class="btn btn-primary" id="save-invoice">${icon('check','')} ${existing?'ذخیره تغییرات':'ثبت فاکتور'}</button></div></div>`);
    const f = m.querySelector('#invoice-form'), itemsEl = m.querySelector('#items'); let counter = 0;
    const catalog = [...products.map(p=>({type:'product',id:p.id,name:p.name,unit:p.unit||'عدد',price:Number(p.salePrice)||0})), ...services.map(s=>({type:'service',id:s.id,name:s.name,unit:s.unit||'مورد',price:Number(s.price)||0}))];
    const addRow = (item=null) => {
      counter++; const row=document.createElement('div'); row.className='card card-pad invoice-row';
      row.innerHTML=`<div class="invoice-row-head"><strong>ردیف ${num(counter)}</strong><button type="button" class="btn btn-danger btn-remove">${icon('trash','')}حذف</button></div><div class="field full"><label>کالا / خدمت</label><div class="invoice-search-wrap"><input class="item-search" autocomplete="off" placeholder="نام کالا یا خدمت را تایپ کنید" value="${esc(item?.name||'')}"><div class="invoice-results" hidden></div></div><div class="selected-item" ${item?'':'hidden'}><span class="selected-name">${esc(item?.name||'')}</span><small class="selected-type">${item?(item.type==='product'?'کالا':'خدمت'):''}</small></div></div><div class="form-grid mt-3"><div class="field"><label>تعداد</label><input class="qty" type="text" inputmode="decimal" value="${item?.quantity??1}"></div><div class="field"><label>قیمت واحد</label><input class="price" type="text" inputmode="decimal" value="${item?.unitPrice??0}"></div><div class="field"><label>تخفیف ردیف</label><input class="rdisc" type="text" inputmode="decimal" value="${item?.discount??0}"></div></div>`;
      row._item=item?{...item}:null; itemsEl.appendChild(row);
      const search=row.querySelector('.item-search'), results=row.querySelector('.invoice-results');
      const renderResults=q=>{const s=(q||'').trim().toLocaleLowerCase('fa-IR');const found=catalog.filter(x=>!s||x.name.toLocaleLowerCase('fa-IR').includes(s)).slice(0,8);results.innerHTML=found.map(x=>`<button type="button" class="invoice-result" data-id="${x.id}" data-type="${x.type}"><span>${esc(x.name)}<small>${x.type==='product'?'کالا':'خدمت'} · ${esc(x.unit)}</small></span><strong>${money(x.price)}</strong></button>`).join('')||`<div class="hint empty-result">موردی پیدا نشد.</div>`;results.hidden=false;};
      search.oninput=()=>renderResults(search.value); search.onfocus=()=>renderResults(search.value);
      results.addEventListener('click',e=>{const b=e.target.closest('.invoice-result');if(!b)return;const found=catalog.find(x=>x.id==b.dataset.id&&x.type===b.dataset.type);row._item={...found,quantity:1,unitPrice:found.price,discount:0};search.value=found.name;row.querySelector('.selected-item').hidden=false;row.querySelector('.selected-name').textContent=found.name;row.querySelector('.selected-type').textContent=found.type==='product'?'کالا':'خدمت';row.querySelector('.qty').value='1';row.querySelector('.price').value=String(found.price);results.hidden=true;refreshTotals();setTimeout(()=>row.querySelector('.qty').focus(),40);});
      row.querySelectorAll('input').forEach(i=>i.addEventListener('input',refreshTotals));
      row.querySelector('.qty').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addRow();itemsEl.lastElementChild.querySelector('.item-search').focus();}});
      row.querySelector('.btn-remove').onclick=()=>{row.remove();refreshTotals();}; if(!item)setTimeout(()=>search.focus(),20);
    };
    const readItems=()=>[...itemsEl.querySelectorAll('.invoice-row')].map(row=>{const it=row._item||{};return {type:it.type||'product',itemId:it.id??null,name:row.querySelector('.item-search').value.trim(),unit:it.unit||'مورد',quantity:Number(normalizeAmountInput(row.querySelector('.qty').value))||0,unitPrice:Number(normalizeAmountInput(row.querySelector('.price').value))||0,discount:Number(normalizeAmountInput(row.querySelector('.rdisc').value))||0};});
    const refreshTotals=()=>{const its=readItems(),d=Number(normalizeAmountInput(f.discount.value))||0,z=calculateTotals(its,d,settings.taxEnabled,settings.taxPercent);m.querySelector('#subtotal').textContent=money(z.subtotal);m.querySelector('#discount-preview').textContent=money(z.discount);m.querySelector('#sum').textContent=money(z.total);m.querySelector('#sticky-sum').textContent=money(z.total);if(settings.taxEnabled){m.querySelector('#tax-preview').value=money(z.tax);m.querySelector('#tax-total').textContent=money(z.tax);}return z;};
    if(existing?.items?.length) existing.items.forEach(addRow); else addRow();
    m.querySelector('#add-item').onclick=()=>addRow(); f.discount.oninput=refreshTotals; m.querySelector('.close').onclick=closeModal; m.querySelector('#save-invoice').onclick=()=>f.requestSubmit(); refreshTotals();
    f.onsubmit=async e=>{e.preventDefault();const its=readItems(),rawDiscount=Number(normalizeAmountInput(f.discount.value))||0,z=calculateTotals(its,rawDiscount,settings.taxEnabled,settings.taxPercent),fd=Object.fromEntries(new FormData(f));const paidAmount=Math.round(Number(normalizeAmountInput(fd.paidAmount))||0);const data={invoiceNumber:existing?.number||nextNumber().number,customerId:fd.customerId?Number(fd.customerId):null,date:fd.date,items:its,discount:z.discount,tax:z.tax,paidAmount,status:deriveInvoiceStatus(fd.status,paidAmount,z.total),total:z.total,allowOverpayment:false};const v=validateInvoice(data);if(showValidationErrors(f,v))return;if(!existing&&rows.some(x=>String(x.number)===String(data.invoiceNumber))){toast('شماره فاکتور تکراری است.','error');return;}const customer=customers.find(c=>c.id===data.customerId);const row={...(existing||{}),number:data.invoiceNumber,seq:existing?.seq||nextNumber().seq,customerId:data.customerId,customerName:customer?.name||'مشتری آزاد',items:its,discount:data.discount,tax:data.tax,total:data.total,paidAmount:data.paidAmount,status:data.status,notes:fd.notes||'',date:data.date,createdAt:existing?.createdAt||new Date(fd.date).getTime()};if(existing){await DB.put('invoices',row);}else{row.id=await DB.add('invoices',row);}closeModal();toast(existing?'فاکتور ویرایش شد':'فاکتور ثبت شد');navigate(`#/invoices/${row.id}`);};
  }
}

export async function renderInvoiceDetail(App, params) {
  const id=Number(params.id);
  const [invoice,settings,customer]=await Promise.all([DB.get('invoices',id),getSettings(), DB.get('customers', id)]);
  if(!invoice){
    App.setView(`${emptyState('فاکتور پیدا نشد','این فاکتور وجود ندارد.')}<button class="btn btn-secondary" data-route="#/invoices">بازگشت به فاکتورها</button>`);
    return;
  }
  const [allCustomers]=await Promise.all([DB.all('customers')]);
  const actualCustomer=allCustomers.find(c=>String(c.id)===String(invoice.customerId))||null;
  const computed=calculateTotals(invoice.items||[],invoice.discount||0,settings.taxEnabled,settings.taxPercent);
  const repaired={...invoice,discount:computed.discount,tax:computed.tax,total:computed.total,paidAmount:Math.min(Math.max(0,Math.round(Number(invoice.paidAmount)||0)),computed.total),status:deriveInvoiceStatus(invoice.status,invoice.paidAmount,computed.total)};
  const balance=Math.max(0,repaired.total-repaired.paidAmount);
  if(invoice.status!=='cancelled' && (invoice.total!==repaired.total || invoice.discount!==repaired.discount || invoice.tax!==repaired.tax || invoice.paidAmount!==repaired.paidAmount || invoice.status!==repaired.status)) {
    await DB.put('invoices',{...repaired,updatedAt:Date.now()});
  }
  App.setView(`${pageHeader('فاکتور',{back:true,subtitle:`شماره ${invoice.number}`})}
    <div class="invoice-action-bar">
      <div class="invoice-action-status"><span class="badge badge-${invoiceStatusClass(repaired.status)}">${faLabel(INVOICE_STATUS_LABELS,repaired.status)}</span><strong class="invoice-detail-total">${money(repaired.total)}</strong><small>${balance?`مانده ${money(balance)}`:'تسویه کامل'}</small></div>
      <div class="btn-row">
        <button class="btn btn-primary" id="print-invoice">${icon('printer','')}چاپ</button>
        <button class="btn btn-secondary" id="image-invoice">${icon('image','')}تصویر</button>
        ${repaired.status!=='cancelled'&&balance>0?`<button class="btn btn-secondary" id="payment-invoice">${icon('wallet','')}ثبت دریافت</button>`:''}
        <button class="btn btn-ghost" id="edit-invoice">${icon('edit','')}ویرایش</button>
      </div>
    </div>
    <article id="invoice-print" class="invoice-paper detail-invoice">${invoiceMarkup(repaired,settings,actualCustomer)}</article>`);
  document.querySelector('[data-back]')?.addEventListener('click',()=>history.length>1?history.back():navigate('#/invoices'));
  document.getElementById('print-invoice').onclick=()=>printWithClass('printing-invoice');
  document.getElementById('image-invoice').onclick=()=>invoiceToImage(document.getElementById('invoice-print'),`DIA-Invoice-${invoice.number}.png`).catch(e=>toast(e.message||'خروجی تصویر ناموفق بود','error'));
  document.getElementById('edit-invoice').onclick=()=>editInvoice(repaired);
  document.getElementById('payment-invoice')?.addEventListener('click',()=>openPaymentModal(repaired));
  function openPaymentModal(current){
    const remaining=Math.max(0,(current.total||0)-(current.paidAmount||0));
    const m=openModal(`<div class="modal-head"><h3>ثبت دریافت</h3><button class="close">${icon('x','')}</button></div><form id="payment-form" class="form-grid" novalidate><div class="field full"><label>مانده فاکتور</label><input value="${money(remaining)}" disabled></div><div class="field full"><label>مبلغ دریافت</label><input name="amount" type="text" inputmode="decimal" autofocus value="${remaining||''}"></div><div class="field full"><label>توضیحات</label><input name="notes" placeholder="مثلاً کارت به کارت"></div><div class="field full"><button class="btn btn-primary btn-block">${icon('check','')}ثبت دریافت</button></div></form>`);
    const f=m.querySelector('#payment-form');m.querySelector('.close').onclick=closeModal;
    f.onsubmit=async e=>{e.preventDefault();const amount=Math.round(Number(normalizeAmountInput(new FormData(f).get('amount')))||0);if(amount<=0){toast('مبلغ دریافت باید بیشتر از صفر باشد.','error');return;}if(amount>remaining){toast('مبلغ دریافت از مانده فاکتور بیشتر است.','error');return;}const paid=(current.paidAmount||0)+amount;const status=paid>=current.total?'paid':'partially_paid';await DB.put('invoices',{...current,paidAmount:paid,status,notes:current.notes||''});closeModal();toast('دریافت ثبت شد');renderInvoiceDetail(App,{id:current.id});};
  }
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=e=>{e.preventDefault();navigate(b.dataset.route)});
}

async function editInvoice(invoice){ navigate(`#/invoices?edit=${encodeURIComponent(invoice.id)}`); }

function invoiceMarkup(x,settings,customer=null){
  const items=(x.items||[]).map((i,k)=>({
    index:k+1,name:i.name||'—',qty:Number(i.quantity)||0,unit:i.unit||'مورد',unitPrice:Number(i.unitPrice)||0,discount:Number(i.discount)||0,
    total:Math.max(0,(Number(i.quantity)||0)*(Number(i.unitPrice)||0)-(Number(i.discount)||0))
  }));
  const subtotal=items.reduce((s,i)=>s+i.total,0);
  const paid=Math.min(Math.max(0,Number(x.paidAmount)||0),Number(x.total)||0);
  const balance=Math.max(0,(Number(x.total)||0)-paid);
  return `<div class="invoice-brand-row">
      <div class="invoice-brand">
        <img class="invoice-logo" src="./assets/apple-touch-icon.png" alt="">
        <div><div class="invoice-business-name">${esc(settings.businessName||'DIA Business')}</div><div class="invoice-business-sub">${esc(settings.ownerName||'تأسیسات الکتریکی و نورپردازی')}</div></div>
      </div>
      <div class="invoice-title-block"><div class="invoice-doc-label">فاکتور فروش</div><div class="invoice-doc-number">شماره <strong>${esc(x.number)}</strong></div></div>
    </div>
    <div class="invoice-accent"></div>
    <div class="invoice-info-grid">
      <div class="invoice-info-card"><span>تاریخ</span><strong>${dateFa(x.date||x.createdAt)}</strong></div>
      <div class="invoice-info-card"><span>وضعیت</span><strong>${faLabel(INVOICE_STATUS_LABELS,x.status)}</strong></div>
      <div class="invoice-info-card invoice-customer-card"><span>طرف حساب</span><strong>${esc(x.customerName||'مشتری آزاد')}</strong>${customer?.mobile?`<small>${esc(customer.mobile)}</small>`:''}</div>
      ${settings.phone?`<div class="invoice-info-card"><span>تلفن فروشنده</span><strong>${esc(settings.phone)}</strong></div>`:''}
    </div>
    <div class="invoice-section-label">جزئیات فاکتور</div>
    <div class="invoice-table-wrap"><table class="invoice-table clean-invoice-table"><thead><tr><th class="col-index">ردیف</th><th>شرح کالا / خدمت</th><th class="num-col">تعداد</th><th class="unit-col">واحد</th><th class="money-col">قیمت واحد</th><th class="money-col discount-col">تخفیف</th><th class="money-col">مبلغ</th></tr></thead><tbody>${items.length?items.map(i=>`<tr><td class="col-index">${num(i.index)}</td><td class="item-name">${esc(i.name)}</td><td class="num-col">${num(i.qty)}</td><td class="unit-col">${esc(i.unit)}</td><td class="money-col">${money(i.unitPrice,'')}</td><td class="money-col discount-col">${money(i.discount,'')}</td><td class="money-col total-col">${money(i.total,'')}</td></tr>`).join(''):`<tr><td colspan="7" class="invoice-empty-row">موردی برای نمایش ثبت نشده است.</td></tr>`}</tbody></table></div>
    <div class="invoice-bottom-grid">
      <div class="invoice-words-block"><span>مبلغ به حروف</span><strong>${esc(amountToWordsFa(x.total,settings.currency||'تومان'))}</strong>${x.notes?`<div class="invoice-notes-block"><span>توضیحات</span><p>${esc(x.notes)}</p></div>`:''}</div>
      <div class="invoice-summary-box">
        <div><span>جمع اقلام</span><strong>${money(subtotal)}</strong></div>
        <div><span>تخفیف کلی</span><strong>${money(x.discount||0)}</strong></div>
        ${settings.taxEnabled?`<div><span>مالیات</span><strong>${money(x.tax||0)}</strong></div>`:''}
        <div class="grand"><span>مبلغ نهایی</span><strong>${money(x.total)}</strong></div>
        <div><span>پرداخت‌شده</span><strong class="green">${money(paid)}</strong></div>
        <div class="balance-row"><span>مانده</span><strong class="${balance?'red':'green'}">${money(balance)}</strong></div>
      </div>
    </div>
    <div class="invoice-footer-note">${esc(settings.invoiceNote||'از انتخاب شما سپاسگزاریم.')}</div>
    <div class="invoice-signatures"><div><span>امضای خریدار</span><div></div></div><div><span>مهر و امضای فروشنده</span><div></div></div></div>`;
}
