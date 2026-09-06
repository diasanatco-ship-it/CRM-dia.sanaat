// DIA Business — IndexedDB data layer. No UI/DOM logic here.
const DB_NAME = 'DIA_Business_DB';
const DB_VERSION = 2;
export const stores = ['customers','products','services','projects','invoices','transactions','accounts','settings'];
export const SETTINGS_ID = 'app';
const DEFAULT_SETTINGS = {
  id: SETTINGS_ID, businessName: 'DIA Business', ownerName: '', phone: '', email: '', address: '',
  invoiceNote: 'از انتخاب شما سپاسگزاریم.', currency: 'تومان', invoicePrefix: '', invoiceStart: 1001,
  taxEnabled: false, taxPercent: 9, sampleDataLoaded: false
};
let dbPromise;
function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      stores.forEach(s=>{if(!db.objectStoreNames.contains(s)) db.createObjectStore(s,{keyPath:'id',autoIncrement:true});});
      // v1 -> v2 intentionally preserves all stores and records. Future migrations go here.
    };
    req.onblocked=()=>console.warn('DIA DB upgrade is blocked by another open tab.');
    req.onerror=()=>{dbPromise=null; reject(req.error);};
    req.onsuccess=()=>{
      const db=req.result;
      db.onversionchange=()=>db.close();
      resolve(db);
    };
  });
  return dbPromise;
}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export const DB={
  async all(store){const db=await openDB();return request(db.transaction(store,'readonly').objectStore(store).getAll());},
  async get(store,id){const db=await openDB();return request(db.transaction(store,'readonly').objectStore(store).get(id));},
  async add(store,data){const db=await openDB();const now=Date.now();const row={...data,createdAt:data.createdAt??now,updatedAt:now};return request(db.transaction(store,'readwrite').objectStore(store).add(row));},
  async put(store,data){const db=await openDB();const old=data.id!=null?await DB.get(store,data.id):null;const row={...data,createdAt:data.createdAt??old?.createdAt??Date.now(),updatedAt:Date.now()};return request(db.transaction(store,'readwrite').objectStore(store).put(row));},
  async delete(store,id){const db=await openDB();return request(db.transaction(store,'readwrite').objectStore(store).delete(id));},
  async clear(store){const db=await openDB();return request(db.transaction(store,'readwrite').objectStore(store).clear());}
};
export async function getSettings(){const s=await DB.get('settings',SETTINGS_ID);return {...DEFAULT_SETTINGS,...(s||{})};}
export async function saveSettings(patch){const merged={...await getSettings(),...patch,id:SETTINGS_ID};await DB.put('settings',merged);return merged;}
export async function exportDatabase(){const out={app:'DIA-Business',version:DB_VERSION,exportedAt:new Date().toISOString(),stores:{}};for(const s of stores)out.stores[s]=await DB.all(s);return out;}
export async function importDatabase(data){
  if(!data||typeof data!=='object'||!data.stores) throw new Error('فایل پشتیبان معتبر نیست.');
  const db=await openDB();
  await new Promise((resolve,reject)=>{
    const t=db.transaction(stores,'readwrite');
    try{stores.forEach(s=>{const os=t.objectStore(s);os.clear();(Array.isArray(data.stores[s])?data.stores[s]:[]).forEach(row=>os.put(row));});}
    catch(e){t.abort();reject(e);return;}
    t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('بازیابی انجام نشد.'));
  });
}
export { DEFAULT_SETTINGS, DB_NAME, DB_VERSION };
