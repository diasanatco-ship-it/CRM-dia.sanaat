const DB_NAME='DIA_Business_DB', DB_VERSION=1;
const stores=['customers','products','services','projects','invoices','transactions','accounts','settings'];
let dbPromise;
function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;
      stores.forEach(s=>{if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id',autoIncrement:true})});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  }); return dbPromise;
}
async function tx(store,mode,fn){const db=await openDB();return new Promise((resolve,reject)=>{
 const t=db.transaction(store,mode), os=t.objectStore(store); let result;
 try{result=fn(os)}catch(e){reject(e);return}
 t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);
});}
export const DB={
 async all(store){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})},
 async get(store,id){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})},
 async add(store,data){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).add(data);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})},
 async put(store,data){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).put(data);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})},
 async delete(store,id){return tx(store,'readwrite',os=>os.delete(id))},
 async clear(store){return tx(store,'readwrite',os=>os.clear())}
};
export async function exportDatabase(){
 const data={version:1,exportedAt:new Date().toISOString(),stores:{}};
 for(const s of stores)data.stores[s]=await DB.all(s);
 return data;
}
export async function importDatabase(data){
 if(!data?.stores)throw new Error('فایل پشتیبان معتبر نیست');
 for(const s of stores){await DB.clear(s);for(const row of (data.stores[s]||[]))await DB.put(s,row)}
}
export {stores};
