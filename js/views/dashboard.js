import { DB } from '../db.js';
import { money, num, dateFa, esc, isIncomeType, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, faLabel } from '../utils.js';

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x.getTime(); }

export async function renderDashboard(App) {
  const [customers, products, invoices, transactions, projects] = await Promise.all([DB.all('customers'), DB.all('products'), DB.all('invoices'), DB.all('transactions'), DB.all('projects')]);
  const now = Date.now(), todayStart = startOfDay(now), monthStart = startOfMonth(now);
  const active = invoices.filter(i => i.status !== 'cancelled');

  const salesToday = active.filter(i => i.createdAt >= todayStart).reduce((s, i) => s + (i.total || 0), 0);
  const salesMonth = active.filter(i => i.createdAt >= monthStart).reduce((s, i) => s + (i.total || 0), 0);
  const receivedMonth = transactions.filter(t => isIncomeType(t.type) && t.createdAt >= monthStart).reduce((s, t) => s + t.amount, 0)
    + active.filter(i => i.createdAt >= monthStart).reduce((s, i) => s + (i.paidAmount || 0), 0);
  const expensesMonth = transactions.filter(t => !isIncomeType(t.type) && t.createdAt >= monthStart).reduce((s, t) => s + t.amount, 0);
  const receivable = active.reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.paidAmount || 0)), 0);
  const stockValue = products.reduce((s, x) => s + (x.stock || 0) * (x.salePrice || 0), 0);
  const totalIncome = transactions.filter(t => isIncomeType(t.type)).reduce((s, t) => s + t.amount, 0) + active.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const totalExpense = transactions.filter(t => !isIncomeType(t.type)).reduce((s, t) => s + t.amount, 0);
  const approxProfit = totalIncome - totalExpense;
  const recent = [...invoices].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);

  App.setView(`<h1 class="page-title">داشبورد</h1>
  <div class="card kpi-wide"><div class="stat-label">سود تقریبی</div><div class="stat-value ${approxProfit >= 0 ? 'green' : 'red'}">${money(approxProfit)}</div><div class="stat-meta">مجموع دریافت‌ها منهای هزینه‌ها</div></div>
  <div class="section-title">وضعیت مالی</div>
  <div class="stats-grid">
    <div class="card stat"><div class="stat-label">فروش امروز</div><div class="stat-value">${money(salesToday)}</div></div>
    <div class="card stat"><div class="stat-label">فروش این ماه</div><div class="stat-value green">${money(salesMonth)}</div></div>
    <div class="card stat"><div class="stat-label">دریافت‌های این ماه</div><div class="stat-value">${money(receivedMonth)}</div></div>
    <div class="card stat"><div class="stat-label">هزینه‌های این ماه</div><div class="stat-value red">${money(expensesMonth)}</div></div>
    <div class="card stat"><div class="stat-label">بدهی مشتریان</div><div class="stat-value red">${money(receivable)}</div><div class="stat-meta">مانده مطالبات</div></div>
    <div class="card stat"><div class="stat-label">موجودی انبار</div><div class="stat-value">${money(stockValue)}</div><div class="stat-meta">${num(products.length)} قلم کالا</div></div>
    <div class="card stat"><div class="stat-label">مشتریان</div><div class="stat-value">${num(customers.length)}</div></div>
    <div class="card stat"><div class="stat-label">پروژه‌های فعال</div><div class="stat-value">${num(projects.filter(p => p.status !== 'completed' && p.status !== 'cancelled').length)}</div></div>
  </div>
  <div class="section-title">دسترسی سریع</div>
  <div class="quick-grid">
  ${[['#/invoices', '▤', 'فاکتور جدید'], ['#/customers', '♙', 'مشتری جدید'], ['#/accounting', '₮', 'ثبت پرداخت'], ['#/accounting', '⚠', 'ثبت هزینه'], ['#/products', '□', 'افزودن کالا'], ['#/services', '⚡', 'افزودن خدمت'], ['#/projects', '⌂', 'پروژه'], ['#/reports', '▥', 'گزارش']].map(x => `<button class="quick" data-route="${x[0]}"><span class="qicon">${x[1]}</span><small>${x[2]}</small></button>`).join('')}
  </div>
  <div class="section-title">آخرین فاکتورها</div>
  <div class="list">${recent.length ? recent.map(i => `<div class="list-item"><div class="list-main"><div class="list-title">فاکتور ${esc(i.number)}</div><div class="list-sub">${esc(i.customerName || 'مشتری آزاد')} · ${dateFa(i.createdAt)}</div></div><div class="list-value">${money(i.total)}<br><span class="badge badge-${INVOICE_STATUS_BADGE[i.status] || 'muted'}">${faLabel(INVOICE_STATUS_LABELS, i.status)}</span></div></div>`).join('') : '<div class="empty">هنوز فاکتوری ثبت نشده است.</div>'}</div>`);
}
