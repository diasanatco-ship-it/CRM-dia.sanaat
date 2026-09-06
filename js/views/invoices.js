import { DB, getSettings } from '../db.js';
import { money, num, dateFa, esc, toast, invoiceToImage, amountToWordsFa, printWithClass, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, faLabel } from '../utils.js';
import { INVOICE_STATUS, validateInvoice, normalizeAmountInput } from '../validators.js';
import { navigate } from '../router.js';

function calcInvoiceTotals(items, discount, taxEnabled, taxPercent) {
  const itemsSubtotal = items.reduce((s, it) => s + (it.quantity * it.unitPrice - (it.discount || 0)), 0);
  const afterDiscount = Math.max(0, itemsSubtotal - (discount || 0));
  const taxAmount = taxEnabled ? Math.round(afterDiscount * (taxPercent || 0) / 100) : 0;
  const total = afterDiscount + taxAmount;
  return { itemsSubtotal, afterDiscount, taxAmount, total };
}

export async function renderInvoices(App) {
  const [rows, customers, products, services, settings] = await Promise.all([DB.all('invoices'), DB.all('customers'), DB.all('products'), DB.all('services'), getSettings()]);

  App.setView(`<div class="page-title-row"><h1 class="page-title">فاکتورها</h1><button class="btn btn-primary" id="add">+ فاکتور</button></div><div class="search"><span>⌕</span><input id="search" placeholder="جستجو در فاکتورها..."></div><div class="list" id="list"></div>`);

  const draw = f => document.getElementById('list').innerHTML = (rows.filter(x => (String(x.number) + ' ' + (x.customerName || '')).includes(f || '')).sort((a, b) => b.createdAt - a.createdAt).map(x => `<div class="list-item"><div class="list-main"><div class="list-title">فاکتور ${esc(x.number)}</div><div class="list-sub">${esc(x.customerName || 'مشتری آزاد')} · ${dateFa(x.createdAt)}</div></div><div class="list-value">${money(x.total)}<br><span class="badge badge-${INVOICE_STATUS_BADGE[x.status] || 'muted'}">${faLabel(INVOICE_STATUS_LABELS, x.status)}</span><div class="btn-row"><button class="btn btn-secondary view-i" data-id="${x.id}">نمایش</button><button class="btn btn-danger del-i" data-id="${x.id}">حذف</button></div></div></div>`).join('') || '<div class="empty">فاکتوری ثبت نشده است.</div>');
  draw(''); document.getElementById('search').oninput = e => draw(e.target.value.trim()); document.getElementById('add').onclick = () => form();
  document.querySelectorAll('.view-i').forEach(b => b.onclick = () => show(rows.find(x => x.id == b.dataset.id)));
  document.querySelectorAll('.del-i').forEach(b => b.onclick = async () => { if (confirm('این فاکتور حذف شود؟ این عملیات برگشت‌پذیر نیست.')) { await DB.delete('invoices', Number(b.dataset.id)); toast('فاکتور حذف شد'); renderInvoices(App); } });

  function nextInvoiceNumber() {
    const seqs = rows.map(r => Number(r.seq) || 0);
    const nextSeq = Math.max(settings.invoiceStart || 1001, ...(seqs.length ? [Math.max(...seqs) + 1] : [settings.invoiceStart || 1001]));
    return { seq: nextSeq, number: (settings.invoicePrefix || '') + nextSeq };
  }

  function form() {
    const r = document.getElementById('modal-root');
    const { number } = nextInvoiceNumber();
    r.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>فاکتور فروش جدید — ${esc(number)}</h3><button class="close">×</button></div><form id="f" novalidate>
    <div class="form-grid">
      <div class="field"><label>مشتری</label><select name="customerId"><option value="">مشتری آزاد</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>تاریخ</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field"><label>وضعیت</label><select name="status">${INVOICE_STATUS.map(s => `<option value="${s}" ${s === 'issued' ? 'selected' : ''}>${faLabel(INVOICE_STATUS_LABELS, s)}</option>`).join('')}</select></div>
    </div>
    <div class="section-title">اقلام فاکتور</div><div id="items"></div><button type="button" class="btn btn-secondary" id="add-item">+ افزودن کالا/خدمت</button>
    <div class="section-title">تخفیف، مالیات و پرداخت</div>
    <div class="form-grid">
      <div class="field"><label>تخفیف کلی (تومان)</label><input name="discount" type="number" min="0" value="0"></div>
      ${settings.taxEnabled ? `<div class="field"><label>مالیات (٪${num(settings.taxPercent)} خودکار)</label><input value="" id="tax-preview" disabled></div>` : ''}
      <div class="field"><label>مبلغ پرداختی</label><input name="paidAmount" type="number" min="0" value="0"></div>
    </div>
    <div class="field full"><label>توضیحات فاکتور</label><textarea name="notes"></textarea></div>
    <div class="card card-pad" style="margin-top:12px">جمع کل: <strong id="sum">۰ تومان</strong></div>
    <button class="btn btn-primary" style="width:100%;margin-top:12px">ثبت فاکتور</button></form></div></div>`;

    const items = r.querySelector('#items'); let n = 0;
    const itemOptions = () => products.map(p => `<option data-kind="product" data-price="${p.salePrice || 0}" data-unit="${esc(p.unit || 'عدد')}" value="p${p.id}">${esc(p.name)}</option>`).join('') +
      services.map(s => `<option data-kind="service" data-price="${s.price || 0}" data-unit="${esc(s.unit || 'مورد')}" value="s${s.id}">${esc(s.name)}</option>`).join('');

    const readItems = () => [...items.querySelectorAll('.invoice-row')].map(row => {
      const opt = row.querySelector('.item-select').selectedOptions[0];
      const val = opt?.value || '';
      return {
        type: opt?.dataset.kind || 'product',
        itemId: val ? Number(val.slice(1)) : null,
        name: opt?.textContent || '',
        unit: opt?.dataset.unit || '',
        quantity: Number(row.querySelector('.qty').value || 0),
        unitPrice: Number(row.querySelector('.price').value || 0),
        discount: Number(row.querySelector('.rdisc').value || 0)
      };
    });
    const calc = () => {
      const its = readItems();
      const discount = Number(r.querySelector('[name=discount]').value || 0);
      const { total, taxAmount } = calcInvoiceTotals(its, discount, settings.taxEnabled, settings.taxPercent);
      if (settings.taxEnabled) r.querySelector('#tax-preview').value = money(taxAmount);
      r.querySelector('#sum').textContent = money(total);
      return total;
    };

    const addItem = () => {
      n++;
      items.insertAdjacentHTML('beforeend', `<div class="card card-pad invoice-row" style="margin-bottom:8px">
        <div class="form-grid">
          <div class="field full"><label>شرح کالا/خدمت</label><select class="item-select">${itemOptions()}</select></div>
          <div class="field"><label>تعداد</label><input class="qty" type="number" value="1" min="0.01" step="0.01"></div>
          <div class="field"><label>قیمت واحد</label><input class="price" type="number" min="0" value="0"></div>
          <div class="field"><label>تخفیف ردیف</label><input class="rdisc" type="number" min="0" value="0"></div>
        </div>
        <button type="button" class="btn btn-danger btn-remove-row" style="margin-top:6px">حذف ردیف</button>
      </div>`);
      const row = items.lastElementChild;
      const sync = () => { const opt = row.querySelector('.item-select').selectedOptions[0]; if (opt) row.querySelector('.price').value = opt.dataset.price || 0; calc(); };
      row.querySelector('.item-select').onchange = sync;
      row.querySelector('.qty').oninput = calc; row.querySelector('.price').oninput = calc; row.querySelector('.rdisc').oninput = calc;
      row.querySelector('.btn-remove-row').onclick = () => { row.remove(); calc(); };
      sync();
    };
    addItem(); r.querySelector('#add-item').onclick = addItem;
    r.querySelector('[name=discount]').oninput = calc;

    r.querySelector('.close').onclick = () => r.innerHTML = '';
    r.querySelector('#f').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const its = readItems();
      const discount = Number(normalizeAmountInput(fd.discount || 0));
      const { total, taxAmount } = calcInvoiceTotals(its, discount, settings.taxEnabled, settings.taxPercent);
      const customerId = fd.customerId ? Number(fd.customerId) : null;
      const customer = customers.find(c => c.id === customerId);
      const { seq, number } = nextInvoiceNumber();
      const invoiceData = {
        invoiceNumber: number, customerId, date: fd.date, items: its,
        discount, tax: taxAmount, paidAmount: Number(normalizeAmountInput(fd.paidAmount || 0)),
        status: fd.status, total, allowOverpayment: false
      };
      const result = validateInvoice(invoiceData);
      if (!result.valid) { toast(result.errors[0].message, 'error'); return; }
      if (rows.some(x => String(x.number) === String(number))) { toast('شماره فاکتور تکراری است؛ لطفاً دوباره تلاش کنید.', 'error'); return; }
      await DB.add('invoices', {
        number, seq, customerId, customerName: customer?.name || '', items: its,
        discount, tax: taxAmount, total, paidAmount: invoiceData.paidAmount,
        status: fd.status, notes: fd.notes || '', createdAt: fd.date ? new Date(fd.date).getTime() : Date.now()
      });
      r.innerHTML = ''; toast('فاکتور ثبت شد'); renderInvoices(App);
    };
  }

  function show(x) {
    const r = document.getElementById('modal-root');
    const remaining = Math.max(0, x.total - x.paidAmount);
    r.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head no-print"><h3>فاکتور ${esc(x.number)}</h3><button class="close">×</button></div>
    <div id="invoice-print" class="invoice-box">
      <div class="invoice-head">
        <div><div class="invoice-title">${esc(settings.businessName || 'DIA Business')}</div><div class="invoice-number">فاکتور فروش${settings.ownerName ? ' · ' + esc(settings.ownerName) : ''}</div>${settings.phone ? '<div class="invoice-number">' + esc(settings.phone) + '</div>' : ''}</div>
        <div>شماره: ${esc(x.number)}<br>تاریخ: ${dateFa(x.createdAt)}<br>وضعیت: ${faLabel(INVOICE_STATUS_LABELS, x.status)}</div>
      </div>
      <div class="invoice-meta">طرف حساب: <strong>${esc(x.customerName || 'مشتری آزاد')}</strong></div>
      <table class="invoice-table"><thead><tr><th>ردیف</th><th>شرح کالا / خدمت</th><th>تعداد</th><th>واحد</th><th>قیمت واحد</th><th>تخفیف</th><th>جمع</th></tr></thead><tbody>
        ${x.items.map((i, k) => `<tr><td>${num(k + 1)}</td><td>${esc(i.name)}</td><td>${num(i.quantity)}</td><td>${esc(i.unit || '')}</td><td>${money(i.unitPrice, '')}</td><td>${money(i.discount || 0, '')}</td><td>${money(i.quantity * i.unitPrice - (i.discount || 0), '')}</td></tr>`).join('')}
      </tbody></table>
      <div class="invoice-total"><span>تخفیف کلی</span><span>${money(x.discount || 0)}</span></div>
      ${x.tax ? `<div class="invoice-total"><span>مالیات</span><span>${money(x.tax)}</span></div>` : ''}
      <div class="invoice-total"><span>مبلغ نهایی</span><span>${money(x.total)}</span></div>
      <div class="invoice-total"><span>پرداخت‌شده</span><span>${money(x.paidAmount)}</span></div>
      <div class="invoice-total"><span>مانده</span><span>${money(remaining)}</span></div>
      <div class="invoice-words">مبلغ به حروف: ${amountToWordsFa(x.total, settings.currency || 'تومان')}</div>
      ${x.notes ? `<div class="invoice-notes">توضیحات: ${esc(x.notes)}</div>` : ''}
      <div class="invoice-signature">${esc(settings.invoiceNote || 'از انتخاب شما سپاسگزاریم.')}<br><br>مهر و امضا</div>
    </div>
    <div class="btn-row no-print" style="margin-top:12px"><button id="print" class="btn btn-primary">🖨 چاپ</button><button id="img" class="btn btn-secondary">🖼 خروجی تصویر</button></div>
    </div></div>`;
    r.querySelector('.close').onclick = () => r.innerHTML = '';
    r.querySelector('#print').onclick = () => printWithClass('printing-invoice');
    r.querySelector('#img').onclick = () => invoiceToImage(r.querySelector('#invoice-print'), 'DIA-Invoice-' + x.number + '.png');
  }
}
