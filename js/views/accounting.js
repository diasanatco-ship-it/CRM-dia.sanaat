import { DB } from '../db.js';
import { money, num, dateFa, esc, toast, TRANSACTION_TYPE_LABELS, isIncomeType, faLabel } from '../utils.js';
import { TRANSACTION_TYPES, validateTransaction, normalizeAmountInput } from '../validators.js';

export async function renderAccounting(App) {
  const [rows, customers] = await Promise.all([DB.all('transactions'), DB.all('customers')]);
  const income = rows.filter(x => isIncomeType(x.type)).reduce((s, x) => s + x.amount, 0);
  const expense = rows.filter(x => !isIncomeType(x.type)).reduce((s, x) => s + x.amount, 0);

  App.setView(`<h1 class="page-title">حسابداری</h1>
  <div class="stats-grid">
    <div class="card stat"><div class="stat-label">مجموع دریافت‌ها</div><div class="stat-value green">${money(income)}</div></div>
    <div class="card stat"><div class="stat-label">مجموع پرداخت‌ها</div><div class="stat-value red">${money(expense)}</div></div>
    <div class="card stat"><div class="stat-label">مانده صندوق</div><div class="stat-value">${money(income - expense)}</div></div>
  </div>
  <div class="section-title">ثبت تراکنش</div>
  <div class="card card-pad">
    <form id="f" class="form-grid" novalidate>
      <div class="field"><label>نوع</label><select name="type" id="tx-type">${TRANSACTION_TYPES.map(t => `<option value="${t}">${faLabel(TRANSACTION_TYPE_LABELS, t)}</option>`).join('')}</select></div>
      <div class="field"><label>مبلغ (تومان)</label><input name="amount" type="number" min="0" required></div>
      <div class="field full"><label>شرح</label><input name="description" required placeholder="مثلاً: دریافت پیش‌پرداخت پروژه"></div>
      <div class="field" id="party-wrap"><label>طرف حساب</label><input name="party" placeholder="صندوق / بانک / تأمین‌کننده"></div>
      <div class="field" id="customer-wrap" style="display:none"><label>مشتری</label><select name="customerId"><option value="">انتخاب کنید</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>مرجع (اختیاری)</label><input name="reference" placeholder="شماره فاکتور / رسید"></div>
      <div class="field"><label>تاریخ</label><input name="date" type="date"></div>
      <div class="field full"><label>توضیحات (اختیاری)</label><textarea name="notes"></textarea></div>
      <div class="field full"><button class="btn btn-primary">ثبت تراکنش</button></div>
    </form>
  </div>
  <div class="section-title">تراکنش‌های اخیر</div>
  <div class="list">${rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 40).map(x => `<div class="list-item"><div class="list-main"><div class="list-title">${esc(x.description)}</div><div class="list-sub">${faLabel(TRANSACTION_TYPE_LABELS, x.type)} · ${esc(x.party || '')} · ${dateFa(x.createdAt)}</div></div><div class="list-value ${isIncomeType(x.type) ? 'green' : 'red'}">${isIncomeType(x.type) ? '+' : '-'} ${money(x.amount)}</div></div>`).join('') || '<div class="empty">تراکنشی ثبت نشده است.</div>'}</div>`);

  const typeSel = document.getElementById('tx-type');
  const syncPartyField = () => {
    const isCustomer = typeSel.value === 'customer_payment';
    document.getElementById('customer-wrap').style.display = isCustomer ? '' : 'none';
    document.getElementById('party-wrap').style.display = isCustomer ? 'none' : '';
  };
  typeSel.onchange = syncPartyField; syncPartyField();

  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const dateStr = fd.date || new Date().toISOString().slice(0, 10);
    const d = { ...fd, amount: Number(normalizeAmountInput(fd.amount)), date: dateStr };
    const result = validateTransaction(d);
    if (!result.valid) { toast(result.errors[0].message, 'error'); return; }
    if (d.type === 'customer_payment') { d.customerId = d.customerId ? Number(d.customerId) : null; const c = customers.find(c => c.id === d.customerId); d.party = c ? c.name : ''; }
    else d.customerId = null;
    d.createdAt = new Date(dateStr).getTime();
    delete d.date;
    await DB.add('transactions', d);
    toast('تراکنش ثبت شد');
    renderAccounting(App);
  };
}
