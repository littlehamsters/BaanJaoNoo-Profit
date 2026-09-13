/* core/firebase.js — Firebase config + Firestore single-doc sync (hamster/mainData).
   Split out of the monolith in Phase 3. Reads/writes the shared state S from
   core/state.js and repaints via renderAll() from core/legacy.js. */
import { S, setState, fixAndRecalc } from './state.js';
import { renderAll } from './legacy.js';

// ===================== FIREBASE =====================
const firebaseConfig = {
  apiKey: "AIzaSyAqwe8VKTY653krwpUr62VayHmklkbFQiM",
  authDomain: "baan-jao-noo.firebaseapp.com",
  projectId: "baan-jao-noo",
  storageBucket: "baan-jao-noo.firebasestorage.app",
  messagingSenderId: "274963887630",
  appId: "1:274963887630:web:fd150b9146cd98058d6e5f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const DATA_DOC = db.collection('hamster').doc('mainData');

let isSyncing = false;
let firebaseReady = false;
let saveInFlight = false;
let savePending = false;
let saveRetryTimer = null;
let saveRetryDelay = 1000;

function updateSyncStatus(text, color){
  const c=color==='green'?'#22c55e':color==='orange'?'#f59e0b':'#ef4444';
  const dot=document.getElementById('sync-dot'); if(dot)dot.style.background=c;
  const t=document.getElementById('sync-text'); if(t){t.textContent=text;t.style.color=c;}
}

async function saveToFirebase(){
  if(!firebaseReady)return;
  if(saveInFlight){savePending=true;return;}
  saveInFlight=true;
  if(saveRetryTimer){clearTimeout(saveRetryTimer);saveRetryTimer=null;}
  try{
    const data={
      orders:S.orders||[],freshPurchases:S.freshPurchases||[],
      dryLots:S.dryLots||[],boxLots:S.boxLots||[],
      stock:S.stock||{},settings:S.settings||{},
      manualSales:S.manualSales||[],dryAdjustments:S.dryAdjustments||[],
      pendingRemnants:S.pendingRemnants||{},deliveryRounds:S.deliveryRounds||[],
      orderReturns:S.orderReturns||[],boxAdjustments:S.boxAdjustments||[],
      customers:S.customers||[],
      mergedPacks:S.mergedPacks||[],
      updatedAt:new Date().toISOString()
    };
    await DATA_DOC.set(data);
    updateSyncStatus('ซิงค์แล้ว','green');
    saveRetryDelay=1000;
    saveInFlight=false;
    if(savePending){savePending=false;saveToFirebase();}
  }catch(err){
    console.error('Firebase save error:',err);
    saveInFlight=false;
    savePending=false;
    const delaySec=Math.round(saveRetryDelay/1000);
    updateSyncStatus(`ลองใหม่ใน ${delaySec}s…`,'orange');
    saveRetryTimer=setTimeout(()=>{saveRetryTimer=null;saveToFirebase();},saveRetryDelay);
    saveRetryDelay=Math.min(saveRetryDelay*2,30000);
  }
}

function startFirebaseSync(){
  updateSyncStatus('กำลังเชื่อมต่อ…','orange');
  let firstSync=true;
  DATA_DOC.onSnapshot(snap=>{
    firebaseReady=true;
    if(!snap.exists)return;
    const data=snap.data();
    if(!data){updateSyncStatus('ซิงค์แล้ว','green');return;}

    const remoteTime=data.updatedAt?new Date(data.updatedAt):new Date(0);
    const localTime=S._updatedAt?new Date(S._updatedAt):new Date(0);

    // ครั้งแรกที่ sync: ดึงจาก Firebase เสมอถ้ามีข้อมูล
    // ครั้งต่อไป: เช็ค timestamp
    if(firstSync || remoteTime>localTime){
      firstSync=false;
      isSyncing=true;
      const theme=localStorage.getItem('hamsterTheme');
      setState({...data});
      delete S.updatedAt;
      S._updatedAt=data.updatedAt;
      if(theme)localStorage.setItem('hamsterTheme',theme);
      fixAndRecalc();
      localStorage.setItem('hamsterSnackV3',JSON.stringify(S));
      renderAll();
      setTimeout(()=>{isSyncing=false;},500);
    }
    firstSync=false;
    updateSyncStatus('ซิงค์แล้ว','green');
  },err=>{
    console.error('Firebase listen error:',err);
    updateSyncStatus('ออฟไลน์','red');
  });
}

export { updateSyncStatus, saveToFirebase, startFirebaseSync, isSyncing };
