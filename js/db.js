// DIA Business — IndexedDB data layer. No UI/DOM logic here.
const DB_NAME = 'DIA_Business_DB';
const DB_VERSION = 2;
export const stores = ['customers','products','services','projects','invoices','transactions','accounts','settings'];
export const SETTINGS_ID = 'app';
const DEFAULT_SETTINGS = {
  id: SETTINGS_ID, businessName: 'DIA Business', ownerName: '', phone: '', email: '', address: '',
  invoiceNote: 'از انتخاب شما سپاسگزاریم.', invoicePrefix: '', invoiceStart: 1001,
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
  async clear(store){const db=await openDB();return request(db.transaction(store,'readwrite').objectStore(store).clear());},
  async saveInvoiceWithPayment(invoice, payment=null){
    const db=await openDB();
    let invoiceId=null;
    await new Promise((resolve,reject)=>{
      const t=db.transaction(['invoices','transactions'],'readwrite');
      const invoiceStore=t.objectStore('invoices');
      const txStore=t.objectStore('transactions');
      const now=Date.now();
      const row={...invoice,createdAt:invoice.createdAt??now,updatedAt:now};
      const req=invoice.id!=null ? invoiceStore.put(row) : invoiceStore.add(row);
      req.onsuccess=()=>{
        invoiceId=req.result;
        if(payment && Number(payment.amount)>0){
          txStore.add({...payment,invoiceId,createdAt:payment.createdAt??now,updatedAt:now});
        }
      };
      req.onerror=()=>{try{t.abort();}catch(_){} };
      t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('ذخیره فاکتور و پرداخت انجام نشد.'));
    });
    return invoiceId;
  },
  async atomic(operations=[]){
    if(!Array.isArray(operations)||!operations.length) return;
    const db=await openDB();
    await new Promise((resolve,reject)=>{
      const t=db.transaction(stores,'readwrite');
      try{
        for(const op of operations){
          if(!op||!stores.includes(op.store)) throw new Error('عملیات پایگاه داده نامعتبر است.');
          const os=t.objectStore(op.store);
          if(op.action==='add') os.add({...op.data,createdAt:op.data?.createdAt??Date.now(),updatedAt:Date.now()});
          else if(op.action==='put') os.put({...op.data,createdAt:op.data?.createdAt??Date.now(),updatedAt:Date.now()});
          else if(op.action==='delete') os.delete(op.id);
          else throw new Error('نوع عملیات پایگاه داده نامعتبر است.');
        }
      }catch(e){t.abort();reject(e);return;}
      t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('عملیات پایگاه داده انجام نشد.'));
    });
  }
};
async function migrateLegacyTomanDataToRial(){
  const current=await DB.get('settings',SETTINGS_ID);
  if(current?.rialMigrationV1===true) return;
  const monetaryByStore={
    products:['purchasePrice','salePrice'],
    services:['price'],
    projects:['budget','cost'],
    transactions:['amount'],
    invoices:['discount','discountInput','extraCosts','tax','total','paidAmount','remainingAmount','subtotal','itemDiscountTotal','grandTotal','taxableAmount']
  };
  const db=await openDB();
  await new Promise((resolve,reject)=>{
    const t=db.transaction([...Object.keys(monetaryByStore),'settings'],'readwrite');
    try{
      for(const [store,fields] of Object.entries(monetaryByStore)){
        const os=t.objectStore(store);
        const req=os.getAll();
        req.onsuccess=()=>{
          req.result.forEach(row=>{
            const next={...row};
            fields.forEach(k=>{if(next[k]!==undefined&&next[k]!==null&&Number.isFinite(Number(next[k]))) next[k]=Number(next[k])*10;});
            if(store==='invoices'&&Array.isArray(next.items)){
              next.items=next.items.map(item=>{const it={...item};['unitPrice','discount','discountInput','lineSubtotal','total'].forEach(k=>{if(it[k]!==undefined&&it[k]!==null&&Number.isFinite(Number(it[k])))it[k]=Number(it[k])*10;});return it;});
            }
            os.put(next);
          });
        };
        req.onerror=()=>t.abort();
      }
      const settings={...(current||DEFAULT_SETTINGS),id:SETTINGS_ID,rialMigrationV1:true};
      t.objectStore('settings').put(settings);
    }catch(e){t.abort();reject(e);return;}
    t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('تبدیل مبالغ به ریال انجام نشد.'));
  });
}

async function migrateInvoiceTaxSnapshots(){
  const current=await DB.get('settings',SETTINGS_ID);
  if(current?.invoiceTaxSnapshotV1===true) return;
  const invoices=await DB.all('invoices');
  const db=await openDB();
  await new Promise((resolve,reject)=>{
    const t=db.transaction(['invoices','settings'],'readwrite');
    try{
      const os=t.objectStore('invoices');
      invoices.forEach(inv=>{
        if(inv.taxEnabled!==undefined && inv.taxPercent!==undefined) return;
        const taxable=Number(inv.taxableAmount)||0;
        const tax=Number(inv.tax)||0;
        const inferredEnabled=inv.taxEnabled!==undefined ? !!inv.taxEnabled : tax>0;
        const inferredPercent=inv.taxPercent!==undefined ? Number(inv.taxPercent) : (inferredEnabled&&taxable>0 ? Math.max(0,Math.min(100,(tax/taxable)*100)) : Number(current?.taxPercent??DEFAULT_SETTINGS.taxPercent));
        os.put({...inv,taxEnabled:inferredEnabled,taxPercent:Number.isFinite(inferredPercent)?inferredPercent:DEFAULT_SETTINGS.taxPercent});
      });
      t.objectStore('settings').put({...DEFAULT_SETTINGS,...(current||{}),id:SETTINGS_ID,invoiceTaxSnapshotV1:true});
    }catch(e){t.abort();reject(e);return;}
    t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('ثبت تنظیمات تاریخی فاکتورها انجام نشد.'));
  });
}
export async function getSettings(){const s=await DB.get('settings',SETTINGS_ID);if(!s?.rialMigrationV1) await migrateLegacyTomanDataToRial();await migrateInvoiceTaxSnapshots();const fresh=await DB.get('settings',SETTINGS_ID);return {...DEFAULT_SETTINGS,...(fresh||{})};}
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
