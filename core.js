// ===== 地基：資料庫、身分、紀錄、垃圾桶 =====
// 所有模組都透過這裡的 create / update / remove / restore 寫資料，
// 就會自動記錄「誰、何時、做了什麼」，刪除也會先進垃圾桶。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection,
  onSnapshot, writeBatch, runTransaction, deleteDoc, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
import { SEED, DEFAULT_META, PACKING } from "./seed.js?v=4";

export const TRASH_DAYS = 30;
export const ls = {
  get(k){ try{ return localStorage.getItem(k) }catch(e){ return null } },
  set(k,v){ try{ localStorage.setItem(k,v) }catch(e){} }
};

let db = null, wid = null;
export const onError = { fn: ()=>{} };

export function weddingIdFromUrl(){ const m=/w=([0-9a-f]{32})/.exec(location.hash); return m?m[1]:null }
export function newWeddingId(){ const a=new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(b=>b.toString(16).padStart(2,'0')).join('') }

export function initDb(id){
  wid = id;
  const app = initializeApp(firebaseConfig);
  try{ db = initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})}) }
  catch(e){ db = initializeFirestore(app,{}) }
}
const ref = (...p)=>doc(db,'weddings',wid,...p);
const coll = n=>collection(db,'weddings',wid,n);

// ---- 身分（存在這支手機上，不用登入）----
export const ROLES = ['新郎','新娘','男方爸爸','男方媽媽','女方爸爸','女方媽媽','婚顧','伴郎','伴娘'];
export const OWNERS = ['新郎','新娘','雙方','男方爸爸','男方媽媽','女方爸爸','女方媽媽','婚顧','伴郎','伴娘'];
export const me = ()=> ls.get('wp-me') || '';
export const setMe = n => ls.set('wp-me', n);

// ---- 自己剛寫的資料（用來判斷「別人更新」提示）----
const mine = new Map();
export const isMine = id => mine.has(id) && Date.now()-mine.get(id) < 6000;

function addLog(b, action, c, id, label){
  b.set(doc(coll('log')), { at:Date.now(), by:me()||'未具名', action, coll:c, tid:id, label:String(label||'').slice(0,80) });
}
async function commit(b){ try{ await b.commit() }catch(e){ console.error(e); onError.fn(e) } }

export function create(c, data, label){
  const r = doc(coll(c)), now = Date.now(), b = writeBatch(db);
  b.set(r, { ...data, createdAt:now, createdBy:me(), updatedAt:now, updatedBy:me() });
  addLog(b, '新增', c, r.id, label); mine.set(r.id, now); commit(b);
  return r.id;
}
export function update(c, id, patch, label, action='修改'){
  const b = writeBatch(db);
  b.update(ref(c,id), { ...patch, updatedAt:Date.now(), updatedBy:me() });
  addLog(b, action, c, id, label); mine.set(id, Date.now()); commit(b);
}
export const remove  = (c,id,label)=> update(c,id,{ deleted:true, deletedAt:Date.now(), deletedBy:me() }, label, '刪除');
export const restore = (c,id,label)=> update(c,id,{ deleted:false }, label, '還原');
export function purge(c,id){ deleteDoc(ref(c,id)).catch(e=>onError.fn(e)) }

export function updateMeta(patch){
  const b = writeBatch(db);
  b.update(ref(), { ...patch, updatedAt:Date.now(), updatedBy:me() });
  addLog(b, '修改', 'meta', 'meta', '婚禮資訊'); commit(b);
}

// ---- 訂閱 ----
export function watchMeta(cb){ return onSnapshot(ref(), s=>{ if(s.exists()) cb(s.data()) }, e=>onError.fn(e)) }
export function watch(c, cb){
  let first = true;
  return onSnapshot(coll(c), snap=>{
    const changes = snap.docChanges().map(ch=>({ type:ch.type, id:ch.doc.id, data:ch.doc.data() }));
    cb({ changes, first, fromCache:snap.metadata.fromCache, pending:snap.metadata.hasPendingWrites });
    if(first){ // 清除超過 30 天的垃圾
      const cut = Date.now()-TRASH_DAYS*864e5;
      changes.forEach(x=>{ if(x.data.deleted && (x.data.deletedAt||0)<cut) purge(c,x.id) });
    }
    first = false;
  }, e=>onError.fn(e));
}
export function watchLog(cb){
  return onSnapshot(query(coll('log'), orderBy('at','desc'), limit(80)),
    snap=>cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))), e=>onError.fn(e));
}

// ---- 新籌備本自動帶入預設內容（只會執行一次）----
export async function ensureSeed(){
  const created = await runTransaction(db, async tx=>{
    const s = await tx.get(ref()); if(s.exists()) return false;
    tx.set(ref(), { ...DEFAULT_META, createdAt:Date.now() }); return true;
  });
  if(!created) return;
  const b = writeBatch(db), now = Date.now();
  SEED.items.forEach(([id,d])=>b.set(ref('items',id), { ...d, createdAt:now }));
  SEED.tables.forEach(([id,d])=>b.set(ref('tables',id), { ...d, createdAt:now }));
  PACKING.forEach(([id,d])=>b.set(ref('items',id), { ...d, createdAt:now }));
  await b.commit();
}
// ---- 舊版籌備本升級（只執行一次）----
export async function upgrade(){
  const up = await runTransaction(db, async tx=>{
    const s = await tx.get(ref()); if(!s.exists() || (s.data().schema||0) >= 3) return false;
    tx.update(ref(), { schema:3, budget:s.data().budget||0 }); return true;
  });
  if(!up) return;
  const b = writeBatch(db), now = Date.now();
  PACKING.forEach(([id,d])=>b.set(ref('items',id), { ...d, createdAt:now }));
  await b.commit();
}
