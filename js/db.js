// db.js — لایه دیتابیس (IndexedDB). تمام منطق ذخیره‌سازی اینجاست، UI مستقیم با IndexedDB کار نمی‌کند.
const DB_NAME = 'DIA_Business_DB';
const DB_VERSION = 1;
const stores = ['customers', 'products', 'services', 'projects', 'invoices', 'transactions', 'accounts', 'settings'];

let dbPromise;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      stores.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id', autoIncrement: true }); });
      // نسخه‌های بعدی می‌توانند اینجا با بررسی e.oldVersion، migrate انجام دهند.
    };
    req.onblocked = () => console.warn('DB upgrade blocked — یک تب دیگر از برنامه باز است.');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), os = t.objectStore(store);
    let result;
    try { result = fn(os); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('تراکنش دیتابیس ناتمام ماند'));
  });
}

export const DB = {
  async all(store) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async get(store, id) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const r = db.transaction(store).objectStore(store).get(id);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async add(store, data) {
    const now = Date.now();
    data = { ...data, createdAt: data.createdAt || now, updatedAt: now };
    const db = await openDB();
    return new Promise((res, rej) => {
      const r = db.transaction(store, 'readwrite').objectStore(store).add(data);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async put(store, data) {
    data = { ...data, updatedAt: Date.now() };
    const db = await openDB();
    return new Promise((res, rej) => {
      const r = db.transaction(store, 'readwrite').objectStore(store).put(data);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async delete(store, id) { return tx(store, 'readwrite', os => os.delete(id)); },
  async clear(store) { return tx(store, 'readwrite', os => os.clear()); }
};

// ---- تنظیمات برنامه (یک رکورد واحد با id ثابت) ----
const SETTINGS_ID = 'app';
const DEFAULT_SETTINGS = {
  id: SETTINGS_ID,
  businessName: 'DIA Business',
  ownerName: '',
  phone: '',
  address: '',
  invoiceNote: 'از انتخاب شما سپاسگزاریم.',
  currency: 'تومان',
  invoicePrefix: '',
  invoiceStart: 1001,
  taxEnabled: false,
  taxPercent: 9,
  sampleDataLoaded: false
};

export async function getSettings() {
  const s = await DB.get('settings', SETTINGS_ID);
  return s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS };
}
export async function saveSettings(patch) {
  const current = await getSettings();
  const merged = { ...current, ...patch, id: SETTINGS_ID };
  await DB.put('settings', merged);
  return merged;
}

// ---- خروجی / بازیابی پشتیبان ----
export async function exportDatabase() {
  const data = { app: 'DIA-Business', version: DB_VERSION, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of stores) data.stores[s] = await DB.all(s);
  return data;
}
export async function importDatabase(data) {
  if (!data || typeof data !== 'object' || !data.stores) throw new Error('فایل پشتیبان معتبر نیست.');
  for (const s of stores) {
    await DB.clear(s);
    const rows = Array.isArray(data.stores[s]) ? data.stores[s] : [];
    for (const row of rows) await DB.put(s, row);
  }
}

export { stores, SETTINGS_ID };
