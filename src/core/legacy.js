/* core/legacy.js — the app engine (stock, import, profit, sales, customers,
   nav, auth). Formerly the whole inline <script>. Phase 3 moved state and
   Firebase into their own core modules; this file imports them and still
   re-exposes every function to window for the inline on* handlers. */
import {
  BACKUP_ORDERS, BACKUP_FRESH, BACKUP_DRYLOTS, PRODUCT_ICONS, FRESH_ICONS, INITIAL_STOCK, INITIAL_COSTS, DEFAULT_SETTINGS, FRESH_TO_DRY, VAR_MAP, resolveVarName, S, setState, round2, buildInitLots, loadState, saveState, fixAndRecalc, parseDate, lotSort, recalcAllFifo, getFifoCost, getAvgDryCost,
} from './state.js';
import { updateSyncStatus, saveToFirebase, startFirebaseSync, isSyncing } from './firebase.js';
import { PAGE_IDS, PAGES, PAGE_BY_ID } from '../modules/registry.js';

// renderAll lives here (calls the engine's render* fns) but firebase.js needs it
function renderAll(){
  renderFreshList();renderFreshStockGrid();
  renderDryStock();renderDryLots();
  renderBoxStock();renderBoxLots();
  renderOverview();
  if(document.getElementById('manual-tbody'))renderManualList();
  if(document.getElementById('dr-tbody'))renderDeliveryRounds();
  if(document.getElementById('merged-packs-tbody'))renderMergedPacks();
  if(document.getElementById('cust-tbody'))renderCustomerList();
}


// ===================== FRESH STOCK =====================
let freshBuyItems=[];
const FRESH_UNITS=['ฝัก','หัว','หวี','ชิ้น','ลูก','กก.','ขีด'];
const FRESH_NAMES=['ข้าวโพด','แครอท','ฟักทอง','แอปเปิ้ล','แตงกวา','บล็อคโคลี่','บวบ','กล้วย','ส้มแมนดาริน'];
const FRESH_DEFAULT_UNIT={'ข้าวโพด':'ฝัก','แครอท':'หัว','ฟักทอง':'ชิ้น','แอปเปิ้ล':'ลูก','แตงกวา':'ลูก','บล็อคโคลี่':'หัว','บวบ':'ลูก','กล้วย':'หวี','ส้มแมนดาริน':'ลูก'};

function addFreshBuyItem(){
  freshBuyItems.push({id:Date.now()+Math.floor(Math.random()*9999),name:'',price:0,qty:0,unit:'ฝัก',note:''});
  renderFreshBuyItems();
}
function removeFreshBuyItem(id){freshBuyItems=freshBuyItems.filter(i=>i.id!==id);renderFreshBuyItems();}
function updateFreshBuyItem(id,field,val){
  const item=freshBuyItems.find(i=>i.id===id);if(!item)return;
  if(field==='name'){
    item.name=val;
    item.unit=FRESH_DEFAULT_UNIT[val]||'ฝัก';
    renderFreshBuyItems();return;
  }
  item[field]=(field==='price'||field==='qty')?parseFloat(val)||0:val;
  updateFreshTravelPreview();
}
function renderFreshBuyItems(){
  const c=document.getElementById('f-items-list');if(!c)return;
  if(!freshBuyItems.length){c.innerHTML='<div style="color:var(--text2);font-size:.83rem;margin-bottom:10px">กด "+ เพิ่มผัก/ผลไม้" เพื่อเริ่ม</div>';return;}
  c.innerHTML=freshBuyItems.map(item=>`
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1.5fr auto;gap:8px;margin-bottom:8px;align-items:end">
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">ชื่อ</label>
        <select onchange="updateFreshBuyItem(${item.id},'name',this.value)"><option value="">-- เลือก --</option>
          ${FRESH_NAMES.map(n=>`<option ${n===item.name?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">ราคา (฿)</label>
        <input type="number" value="${item.price||''}" placeholder="0" step=".01" oninput="updateFreshBuyItem(${item.id},'price',this.value);updateFreshTravelPreview()"></div>
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">จำนวน</label>
        <input type="number" value="${item.qty||''}" placeholder="0" step=".1" oninput="updateFreshBuyItem(${item.id},'qty',this.value);updateFreshTravelPreview()"></div>
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">หน่วย</label>
        <input type="text" value="${item.unit||'ฝัก'}" readonly style="background:var(--surface2);padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.88rem;color:var(--text2)"></div>
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">หมายเหตุ</label>
        <input type="text" value="${item.note||''}" placeholder="(ไม่บังคับ)" oninput="updateFreshBuyItem(${item.id},'note',this.value)"></div>
      <button class="btn btn-danger" onclick="removeFreshBuyItem(${item.id})" style="margin-bottom:1px">✕</button>
    </div>`).join('');
  updateFreshTravelPreview();
}
function updateFreshTravelPreview(){
  const travel=parseFloat(document.getElementById('f-travel')?.value)||0;
  const valid=freshBuyItems.filter(i=>i.name&&i.qty>0&&i.price>0);
  const div=document.getElementById('f-travel-preview');
  const sumDiv=document.getElementById('f-summary');
  if(!div||!sumDiv)return;
  if(!valid.length){div.style.display='none';sumDiv.style.display='none';return;}

  const perItem=Math.round(travel/valid.length*100)/100;
  const totalVeg=valid.reduce((s,i)=>s+i.price,0);
  const totalAll=totalVeg+travel;

  if(travel>0){
    div.innerHTML=`🚗 ค่าเดินทาง ฿${travel.toFixed(2)} ÷ ${valid.length} ชนิด = <b>฿${perItem.toFixed(2)}/ชนิด</b>`;
    div.style.display='';
  } else {
    div.style.display='none';
  }

  let html=`<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:8px">
    <span>🛒 ค่าผัก/ผลไม้รวม: <b>฿${totalVeg.toFixed(2)}</b></span>
    <span>🚗 ค่าเดินทาง: <b>฿${travel.toFixed(2)}</b></span>
    <span style="color:var(--accent)">💰 รวมทั้งหมด: <b>฿${totalAll.toFixed(2)}</b></span>
  </div><div style="display:flex;gap:8px;flex-wrap:wrap">`;
  valid.forEach(i=>{
    const cpuNet=Math.round((i.price+perItem)/i.qty*100)/100;
    html+=`<div style="background:#fff;border-radius:6px;padding:5px 10px;border:1px solid var(--border);font-size:.8rem">
      <b>${FRESH_ICONS[i.name]||''} ${i.name}</b> ${i.qty}${i.unit} ฿${(i.price+perItem).toFixed(2)} →
      <span style="color:var(--accent);font-weight:700">฿${cpuNet.toFixed(2)}/${i.unit}</span></div>`;
  });
  html+=`</div>`;
  sumDiv.innerHTML=html;sumDiv.style.display='';
}

function saveFreshPurchase(){
  const date=document.getElementById('f-date').value;
  const travel=parseFloat(document.getElementById('f-travel').value)||0;
  const valid=freshBuyItems.filter(i=>i.name&&i.qty>0&&i.price>0);
  if(!date||!valid.length){showNotif('กรุณาเพิ่มผักอย่างน้อย 1 ชนิด','error');return;}
  const travelPer=valid.length>0?Math.round(travel/valid.length*100)/100:0;
  valid.forEach(item=>{
    S.freshPurchases.push({id:Date.now()+Math.floor(Math.random()*9999),name:item.name,date,price:item.price,travel:travelPer,qty:item.qty,unit:item.unit,note:item.note,usedQty:0,pricePerUnit:round2((item.price+travelPer)/item.qty)});
  });
  saveState();renderFreshList();renderFreshStockGrid();renderBakingSchedule();
  freshBuyItems=[];
  document.getElementById('f-items-list').innerHTML='';
  document.getElementById('f-travel').value='0';
  document.getElementById('f-travel-preview').style.display='none';
  showNotif(`บันทึก ${valid.length} ชนิดแล้ว ✅`);
}

function getFreshStock(name){return S.freshPurchases.filter(p=>p.name===name&&!p.isAdjust).reduce((s,p)=>s+p.qty-(p.usedQty||0),0);}
function getFreshUnit(name){const p=S.freshPurchases.filter(x=>x.name===name).slice(-1)[0];return p?p.unit:'หน่วย';}

function calcFifoCost(name,qty){
  // ตัด isAdjust (รายการปรับลด/ของเสีย) ออก — ไม่ใช่สต็อกซื้อจริง (ให้ตรงกับ getFreshStock)
  const lots=S.freshPurchases.filter(p=>p.name===name&&!p.isAdjust&&(p.qty-(p.usedQty||0))>0).sort((a,b)=>a.date.localeCompare(b.date));
  let rem=qty,cost=0,used=[];
  for(const l of lots){if(rem<=0)break;const take=Math.min(l.qty-(l.usedQty||0),rem);cost+=take*l.pricePerUnit;used.push({id:l.id,take});rem-=take;}
  return{totalCost:round2(cost),shortage:rem,used};
}

function deductFresh(name,qty){
  const lots=S.freshPurchases.filter(p=>p.name===name&&!p.isAdjust&&(p.qty-(p.usedQty||0))>0).sort((a,b)=>a.date.localeCompare(b.date));
  let rem=qty;
  for(const l of lots){if(rem<=0)break;const take=Math.min(l.qty-(l.usedQty||0),rem);l.usedQty=round2((l.usedQty||0)+take);rem-=take;}
}

function adjustFreshStock(){
  const name=document.getElementById('adj-name').value,
    qty=parseFloat(document.getElementById('adj-qty').value)||0,
    reason=document.getElementById('adj-reason').value||'ปรับลด';
  if(!name||qty<=0){showNotif('กรุณากรอกข้อมูล','error');return;}
  const avail=getFreshStock(name);
  if(qty>avail){showNotif(`สต็อก${name}เหลือแค่ ${avail.toFixed(1)} หน่วย`,'error');return;}
  const unit=getFreshUnit(name)||'หน่วย';
  // คำนวณต้นทุนที่ปรับลด (FIFO price ก่อน deduct)
  const costPerUnit=(calcFifoCost(name,qty).totalCost/qty)||0;
  const totalAdjCost=round2(costPerUnit*qty);
  deductFresh(name,qty);
  // Recalc pricePerUnit: ต้นทุนรวมที่เหลือ / จำนวนที่เหลือ
  const remLots=S.freshPurchases.filter(p=>p.name===name&&!p.isAdjust&&(p.qty-(p.usedQty||0))>0);
  const remQty=remLots.reduce((s,p)=>s+(p.qty-(p.usedQty||0)),0);
  const remCost=remLots.reduce((s,p)=>s+(p.qty-(p.usedQty||0))*p.pricePerUnit,0);
  if(remQty>0){const newPPU=round2(remCost/remQty);remLots.forEach(p=>{p.pricePerUnit=newPPU;});}
  // บันทึก adjustment record ลงใน freshPurchases (isAdjust=true)
  const today=new Date();
  const dateStr=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  S.freshPurchases.push({
    id:Date.now(),name,qty,unit,price:totalAdjCost,pricePerUnit:costPerUnit,
    travel:0,note:reason,date:dateStr,isAdjust:true,usedQty:0
  });
  saveState();renderFreshList();renderFreshStockGrid();
  document.getElementById('adj-name').value='';document.getElementById('adj-qty').value='';document.getElementById('adj-reason').value='';
  showNotif(`ปรับลด ${name} -${qty} ${unit} (${reason}) ต้นทุน ฿${totalAdjCost.toFixed(2)} ✅`);
}

function editFresh(id){
  const p=S.freshPurchases.find(x=>x.id===id);if(!p)return;
  const d=prompt('วันที่:',p.date);if(!d)return;
  const pr=parseFloat(prompt('ราคา:',p.price));if(isNaN(pr))return;
  const q=parseFloat(prompt('จำนวน:',p.qty));if(isNaN(q)||q<=0)return;
  const n=prompt('หมายเหตุ:',p.note||'');
  p.date=d;p.price=pr;p.qty=q;p.pricePerUnit=round2(pr/q);p.note=n||'';
  saveState();renderFreshList();renderFreshStockGrid();showNotif('แก้ไขแล้ว ✅');
}

function deleteFresh(id){
  const p=S.freshPurchases.find(x=>x.id===id);
  if(!p)return;
  const used=round2(p.usedQty||0);
  if(used>0){
    if(!confirm(`⚠️ ${p.name} ล็อตนี้ถูกใช้อบไปแล้ว ${used} ${p.unit||''} (จาก ${p.qty})\n\nการลบจะทำให้ต้นทุน Lot อบแห้งที่ใช้ผักนี้คลาดเคลื่อน\nแนะนำ: แก้จำนวนแทนการลบ\n\nยืนยันลบ?`))return;
  } else {
    if(!confirm(`ลบ ${p.name} ${p.qty} ${p.unit||''}?`))return;
  }
  S.freshPurchases=S.freshPurchases.filter(x=>x.id!==id);
  saveState();renderFreshList();renderFreshStockGrid();
  showNotif('ลบแล้ว ✅');
}

function renderFreshStockGrid(){
  const g=document.getElementById('fresh-stock-grid');if(!g)return;
  const names=Object.keys(FRESH_ICONS);
  g.innerHTML=names.map(name=>{
    const qty=getFreshStock(name),unit=getFreshUnit(name),pct=Math.min((qty/20)*100,100);
    const cls=qty<=0?'stock-low':qty<=3?'stock-med':'';
    return `<div class="prod-card ${cls}"><div class="pc-icon">${FRESH_ICONS[name]}</div><div class="pc-name">${name}</div><div class="pc-stock">${qty.toFixed(1)} ${unit} เหลือ</div><div class="stock-bar ${cls}"><div class="stock-fill" style="width:${pct}%"></div></div></div>`;
  }).join('');
}

function renderFreshList(){
  const tbody=document.getElementById('fresh-tbody');
  const list=[...S.freshPurchases].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  if(!list.length){tbody.innerHTML='<tr><td colspan="7"><div class="empty"><div class="ei">🥬</div><p>ยังไม่มีข้อมูล</p></div></td></tr>';return;}
  tbody.innerHTML=list.map(p=>{
    if(p.isAdjust){
      return `<tr style="background:rgba(220,50,50,.04)">
        <td style="font-size:.82rem">${p.date}</td>
        <td><b>${p.name}</b></td>
        <td><span class="badge" style="background:#e55;color:#fff;font-size:.72rem">📉 ปรับลด</span></td>
        <td class="text-right" style="color:var(--red)">-${p.qty} ${p.unit}<br><span style="font-size:.75rem;color:var(--text2)">฿${p.price.toFixed(2)} | ${p.note||''}</span></td>
        <td>—</td>
        <td>—</td>
        <td><button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="deleteFreshAdjust(${p.id})">${_ICON_TRASH}</button></td>
      </tr>`;
    }
    const rem=round2(p.qty-(p.usedQty||0));
    const col=rem<=0?'var(--red)':rem<p.qty*0.3?'var(--yellow)':'var(--green)';
    return `<tr>
      <td style="font-size:.82rem">${p.date}</td>
      <td><b>${p.name}</b>${p.note?`<br><span style="font-size:.75rem;color:var(--text2)">${p.note}</span>`:''}</td>
      <td><span class="badge badge-pend" style="font-size:.72rem">🛒 ซื้อ</span></td>
      <td class="text-right">฿${p.price.toFixed(2)}<br><span style="font-size:.75rem;color:var(--text2)">฿${p.pricePerUnit.toFixed(2)}/${p.unit} × ${p.qty}</span></td>
      <td class="text-right"><b style="color:${col}">${rem.toFixed(1)}</b> ${p.unit}</td>
      <td><span class="badge ${rem<=0?'badge-done':rem<p.qty?'badge-ship':'badge-pend'}">${rem<=0?'หมด':rem<p.qty?'บางส่วน':'ยังไม่ใช้'}</span></td>
      <td style="display:flex;gap:4px"><button class="act-btn" title="แก้ไข" aria-label="แก้ไข" onclick="editFresh(${p.id})">${_ICON_EDIT}</button><button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="deleteFresh(${p.id})">${_ICON_TRASH}</button></td>
    </tr>`;
  }).join('');
}

function deleteFreshAdjust(id){
  const p=S.freshPurchases.find(x=>x.id===id);
  if(!p)return;
  if(!confirm(`⚠️ ลบบันทึกปรับลด?\n\n${p.name} -${p.qty} ${p.unit} (${p.note||'ปรับลด'})\n\nหมายเหตุ: สต็อกจะ ไม่ถูกคืน เพราะถูกหักออกจาก Lot ไปแล้ว\nลบแค่ประวัติบันทึกเท่านั้น`))return;
  S.freshPurchases=S.freshPurchases.filter(p=>p.id!==id);
  saveState();renderFreshList();renderFreshStockGrid();
  showNotif('ลบบันทึกปรับลดแล้ว (สต็อกไม่เปลี่ยน) ✅');
}

// ===================== DRY LOT =====================
let dryOutputItems=[],freshInputItems=[];

function addFreshInput(){
  freshInputItems.push({id:Date.now()+Math.floor(Math.random()*9999),name:'',qty:0,unit:''});
  renderFreshInputs();
}
function removeFreshInput(id){freshInputItems=freshInputItems.filter(i=>i.id!==id);renderFreshInputs();previewDryCost();}
function updateFreshInput(id,field,val){
  const item=freshInputItems.find(i=>i.id===id);if(!item)return;
  if(field==='name'){
    item.name=val;item.unit=getFreshUnit(val)||'หน่วย';
    const defs=FRESH_TO_DRY[val]||[];
    defs.forEach(def=>{if(!dryOutputItems.some(o=>o.name===def.name)){dryOutputItems.push({id:Date.now()+Math.floor(Math.random()*9999),name:def.name,bags:0,slicesPerBag:def.slicesPerBag||null,remnantGrams:0});}});
    renderFreshInputs();renderDryOutputs();
  } else {item[field]=parseFloat(val)||0;}
  updateFreshInfoBar();previewDryCost();
}

function renderFreshInputs(){
  const c=document.getElementById('dry-fresh-inputs');if(!c)return;
  if(!freshInputItems.length){c.innerHTML='<div style="color:var(--text2);font-size:.83rem;margin-bottom:12px">กด "+ เพิ่มวัตถุดิบ" เพื่อเริ่ม</div>';return;}
  c.innerHTML=freshInputItems.map(item=>`
    <div style="display:grid;grid-template-columns:2fr 1fr .7fr auto;gap:8px;margin-bottom:8px;align-items:end">
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">ชนิดผักสด</label>
        <select onchange="updateFreshInput(${item.id},'name',this.value)"><option value="">-- เลือก --</option>${Object.keys(FRESH_ICONS).map(n=>`<option ${n===item.name?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">จำนวน</label>
        <input type="number" value="${item.qty||''}" placeholder="0" step=".1" oninput="updateFreshInput(${item.id},'qty',this.value)"></div>
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">หน่วย</label>
        <input type="text" value="${item.unit||''}" readonly style="background:var(--surface2);padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.88rem"></div>
      <button class="btn btn-danger" onclick="removeFreshInput(${item.id})" style="margin-bottom:1px">✕</button>
    </div>
    ${item.name?`<div style="font-size:.78rem;color:var(--green);margin-bottom:10px;padding:6px 10px;background:var(--green-light);border-radius:6px">📦 ${item.name} เหลือ ${getFreshStock(item.name).toFixed(1)} ${item.unit}</div>`:''}
  `).join('');
}

function updateFreshInfoBar(){
  const d=document.getElementById('d-fresh-info');if(!d)return;
  const v=freshInputItems.filter(i=>i.name&&i.qty>0);
  if(!v.length){d.style.display='none';return;}
  d.innerHTML=v.map(i=>{const{totalCost,shortage}=calcFifoCost(i.name,i.qty);return `<b>${i.name}</b> ${i.qty} ${i.unit} → ฿${totalCost.toFixed(2)}${shortage>0?` <span style="color:var(--red)">⚠️ขาด${shortage.toFixed(1)}</span>`:''}`}).join(' | ');
  d.style.display='';
}

function addDryOutput(){
  dryOutputItems.push({id:Date.now()+Math.floor(Math.random()*9999),name:'',bags:0,slicesPerBag:null,remnantGrams:0});
  renderDryOutputs();
}
function removeDryOutput(id){dryOutputItems=dryOutputItems.filter(i=>i.id!==id);renderDryOutputs();previewDryCost();}
function updateDryOutput(id,field,val){
  const item=dryOutputItems.find(i=>i.id===id);if(!item)return;
  if(field==='name'){
    item.name=val;
    if(val==='ข้าวโพด 3 แว่น')item.slicesPerBag=3;
    else if(val==='ข้าวโพด 6 แว่น')item.slicesPerBag=6;
    renderDryOutputs();
  } else if(field==='slicesPerBag'){item.slicesPerBag=parseInt(val)||1;
  } else {item[field]=parseFloat(val)||0;}
  previewDryCost();
}

function renderDryOutputs(){
  const c=document.getElementById('dry-outputs');if(!c)return;
  const opts=['ข้าวโพด 3 แว่น','แครอท','ฟักทอง','แอปเปิ้ล','แตงกวา','บล็อคโคลี่','บวบ','กล้วย','ส้มแมนดาริน','ข้าวโพด 6 แว่น'];
  const isCorn=n=>n==='ข้าวโพด 3 แว่น'||n==='ข้าวโพด 6 แว่น';
  const remnant=name=>name?getPendingRemnant(name):{grams:0,cost:0};
  c.innerHTML=dryOutputItems.map(item=>{
    const r=remnant(item.name);
    return `<div style="margin-bottom:12px">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr ${isCorn(item.name)?'.8fr ':''} auto;gap:8px;align-items:end">
        <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">ชนิด</label>
          <select onchange="updateDryOutput(${item.id},'name',this.value)"><option value="">-- เลือก --</option>${opts.map(n=>`<option ${n===item.name?'selected':''}>${n}</option>`).join('')}</select></div>
        <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">ถุงที่ได้</label>
          <input type="number" value="${item.bags||''}" placeholder="20" step="1" oninput="updateDryOutput(${item.id},'bags',this.value)"></div>
        <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">เศษ (g)</label>
          <input type="number" value="${item.remnantGrams||''}" placeholder="0" step=".1" oninput="updateDryOutput(${item.id},'remnantGrams',this.value)"></div>
        ${isCorn(item.name)?`<div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">แว่น/ถุง</label>
          <input type="number" value="${item.slicesPerBag||(item.name==='ข้าวโพด 3 แว่น'?3:6)}" min="1" step="1" oninput="updateDryOutput(${item.id},'slicesPerBag',this.value)" style="background:var(--accent-light)"></div>`:''}
        <button class="btn btn-danger" onclick="removeDryOutput(${item.id})" style="margin-bottom:1px">✕</button>
      </div>
      ${r.grams>0?`<div style="margin-top:6px;padding:6px 10px;background:var(--accent-light);border-radius:6px;font-size:.78rem">⚠️ เศษสะสม: <b>${r.grams.toFixed(1)}g</b> ฿${r.cost.toFixed(2)} — จะรวมเข้าต้นทุน Lot นี้</div>`:''}
    </div>`;
  }).join('');
  previewDryCost();
}

function getCostWeight(item){
  const isCorn=item.name==='ข้าวโพด 3 แว่น'||item.name==='ข้าวโพด 6 แว่น';
  if(isCorn){const spb=item.slicesPerBag||(item.name==='ข้าวโพด 3 แว่น'?3:6);return(item.bags||0)*spb;}
  return item.bags||0;
}

// แยกต้นทุนวัตถุดิบตาม ingredient จริง (แทนการ pool รวมแล้วหาร ratio ถุง)
// คืน Map: output.name → { rawCost, elecCost }
// - ต้นทุนวัตถุดิบ: ผูก output กลับไป fresh ingredient ผ่าน FRESH_TO_DRY
//   ถ้า fresh เดียวผลิตหลาย output (ข้าวโพด → 3/6 แว่น) → หาร ratio เฉพาะใน group นั้น
// - ค่าไฟ: หารตาม weight ถุงทั้งหมด (ใช้เตาร่วมกัน)
function computeDryLotCosts(vf, vo, elec){
  const freshCostMap={};
  vf.forEach(i=>{freshCostMap[i.name]=calcFifoCost(i.name,i.qty).totalCost;});
  const dryToFresh={};
  Object.entries(FRESH_TO_DRY).forEach(([fresh,dryList])=>{dryList.forEach(d=>{dryToFresh[d.name]=fresh;});});
  const totalWeight=vo.reduce((s,i)=>s+getCostWeight(i),0);
  const rawCostTotal=round2(Object.values(freshCostMap).reduce((s,c)=>s+c,0));
  const result={};
  vo.forEach(item=>{
    const sourceFresh=dryToFresh[item.name];
    let rs;
    if(!sourceFresh||freshCostMap[sourceFresh]===undefined){
      // fallback: ratio เดิม
      rs=round2(rawCostTotal*(totalWeight>0?getCostWeight(item)/totalWeight:1/vo.length));
    } else {
      const siblings=vo.filter(x=>dryToFresh[x.name]===sourceFresh);
      if(siblings.length===1){
        rs=round2(freshCostMap[sourceFresh]);
      } else {
        const sibW=siblings.reduce((s,x)=>s+getCostWeight(x),0);
        rs=round2(freshCostMap[sourceFresh]*(sibW>0?getCostWeight(item)/sibW:1/siblings.length));
      }
    }
    const es=round2(elec*(totalWeight>0?getCostWeight(item)/totalWeight:1/vo.length));
    result[item.name]={rawCost:rs,elecCost:es};
  });
  return {costs:result,freshCostMap,rawCostTotal};
}

function getPendingRemnant(name){
  // เศษจาก Lot ที่ยังอยู่
  const fromLots=S.dryLots
    .filter(l=>l.name===name&&!l.isInit&&(l.remnantGrams||0)>0&&!l.remnantUsed)
    .reduce((s,l)=>({grams:s.grams+(l.remnantGrams||0),cost:s.cost+(l.remnantCost||0)}),{grams:0,cost:0});
  // เศษจาก Lot ที่ถูกลบแล้วแต่ยังไม่ได้ใช้
  const fromDeleted=(S.pendingRemnants||{})[name]||{grams:0,cost:0};
  return{grams:round2(fromLots.grams+fromDeleted.grams),cost:round2(fromLots.cost+fromDeleted.cost)};
}

function getBagCost(name){
  const s=S.settings;
  const sticker=s.sticker||0;
  if(name==='ฟักทอง')return round2((s.bag1220||0)+(s.kanchuean||0)+sticker);
  if(name==='ข้าวโพด 6 แว่น')return round2((s.bag1522||0)+(s.kanchuean||0)+sticker);
  return round2((s.bag1217||0)+(s.kanchuean||0)+sticker);
}

function previewDryCost(){
  const hours=parseFloat(document.getElementById('d-hours').value)||0;
  const div=document.getElementById('dry-preview');if(!div)return;
  const vf=freshInputItems.filter(i=>i.name&&i.qty>0);
  if(!vf.length||!dryOutputItems.length){div.style.display='none';return;}
  const vo=dryOutputItems.filter(i=>i.name&&i.bags>0);
  const elec=round2(hours*S.settings.elec);
  const {costs,freshCostMap,rawCostTotal}=computeDryLotCosts(vf,vo,elec);
  const total=round2(rawCostTotal+elec);
  // แสดงต้นทุนวัตถุดิบแยกชนิด
  const freshParts=Object.entries(freshCostMap).map(([n,c])=>`${n}: ฿${c.toFixed(2)}`).join(' | ');
  let html=`<b>วัตถุดิบ:</b> ${freshParts}<br><b>รวมผักสด:</b> ฿${rawCostTotal.toFixed(2)} + <b>ค่าไฟ:</b> ฿${elec.toFixed(2)} = <b>฿${total.toFixed(2)}</b><br><br>`;
  html+='<div style="display:flex;gap:10px;flex-wrap:wrap">';
  vo.forEach(item=>{
    const c=costs[item.name]||{rawCost:0,elecCost:0};
    const bc=getBagCost(item.name),rem=getPendingRemnant(item.name);
    const sticker=S.settings.sticker||0;
    const bagOnly=round2(bc-sticker); // ค่าถุง+กันชื้น ไม่รวมสติ๊กเกอร์
    const cpb=round2((c.rawCost+c.elecCost+rem.cost)/item.bags+bc);
    html+=`<div style="background:#fff;border-radius:8px;padding:8px 12px;border:1px solid var(--border);min-width:160px">
      <b>${PRODUCT_ICONS[item.name]||''} ${item.name}</b><br>
      <span style="font-size:.75rem;color:var(--text2)">ผัก ฿${c.rawCost.toFixed(2)} + ไฟ ฿${c.elecCost.toFixed(2)} | ${item.bags}ถุง</span><br>
      <span style="font-size:.75rem;color:var(--text2)">ถุง ฿${bagOnly.toFixed(2)} + 🏷️฿${sticker.toFixed(3)}</span><br>
      <span style="color:var(--accent);font-weight:700;font-family:'IBM Plex Mono',monospace">฿${cpb.toFixed(2)}/ถุง</span>
    </div>`;
  });
  html+='</div>';div.innerHTML=html;div.style.display='';
}

function saveDryLot(){
  const date=document.getElementById('d-date').value,hours=parseFloat(document.getElementById('d-hours').value)||0;
  const vf=freshInputItems.filter(i=>i.name&&i.qty>0),vo=dryOutputItems.filter(i=>i.name&&i.bags>0);
  if(!date||!vf.length||!vo.length){showNotif('กรุณากรอกข้อมูลให้ครบ','error');return;}
  for(const fi of vf){const{shortage}=calcFifoCost(fi.name,fi.qty);if(shortage>0){showNotif(`สต็อก${fi.name}ไม่พอ`,'error');return;}}
  const elec=round2(hours*S.settings.elec);
  const {costs}=computeDryLotCosts(vf,vo,elec);
  const gid='lotg-'+Date.now();
  const freshDesc=vf.map(i=>`${i.name} ${i.qty} ${i.unit||''}`).join(', ');
  vo.forEach(item=>{
    const bc=getBagCost(item.name),rem=getPendingRemnant(item.name);
    const c=costs[item.name]||{rawCost:0,elecCost:0};
    const rs=c.rawCost,es=c.elecCost;
    const cpb=round2((rs+es+rem.cost)/item.bags+bc);
    const rg=item.remnantGrams||0,rc=rg>0?round2((rs+es)*(rg/(item.bags*10+rg))):0;
    S.dryLots.push({id:'lot-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),groupId:gid,date,name:item.name,freshDesc,rawCost:rs,elecCost:es,bagCost:round2(bc),rawQty:freshDesc,remnantGrams:rg,remnantCost:rc,remnantUsed:false,totalBags:item.bags,soldBags:0,costPerBag:cpb});
    if(rem.grams>0){
      S.dryLots.filter(l=>l.name===item.name&&!l.isInit&&(l.remnantGrams||0)>0&&!l.remnantUsed).forEach(l=>{l.remnantUsed=true;});
      if(S.pendingRemnants&&S.pendingRemnants[item.name]) delete S.pendingRemnants[item.name];
    }
  });
  vf.forEach(i=>deductFresh(i.name,i.qty));
  recalcAllFifo();saveState();renderDryStock();renderDryLots();renderFreshList();renderFreshStockGrid();
  freshInputItems=[];dryOutputItems=[];
  document.getElementById('d-hours').value='';
  document.getElementById('dry-fresh-inputs').innerHTML='';
  document.getElementById('dry-outputs').innerHTML='';
  document.getElementById('dry-preview').style.display='none';
  document.getElementById('d-fresh-info').style.display='none';
  showNotif(`บันทึก Lot แล้ว (${vo.length} ชนิด) ✅`);
}

// ===================== SMART STOCK / PRODUCTION =====================
function getStockVelocity(){
  // ยอดขายเฉลี่ยต่อวัน ย้อนหลัง 30 วัน + วันที่สต็อกจะหมด
  const now=new Date();
  const cutoff=new Date(now-30*24*60*60*1000);
  const salesMap={};
  [...S.orders,...(S.manualSales||[])].forEach(o=>{
    const d=parseOrderDate(o.date);
    if(!d||isNaN(d.getTime())||d<cutoff) return;
    if(!['เสร็จสมบูรณ์','จัดส่งแล้ว'].includes(o.status)) return;
    (o.items||[]).forEach(item=>{ salesMap[item.name]=(salesMap[item.name]||0)+item.qty; });
  });
  const result={};
  Object.keys(PRODUCT_ICONS).forEach(name=>{
    const totalSold=salesMap[name]||0;
    const avgPerDay=round2(totalSold/30);
    const stock=S.stock[name]||0;
    const daysLeft=avgPerDay>0?Math.floor(stock/avgPerDay):null;
    result[name]={avgPerDay,stock,daysLeft};
  });
  return result;
}
function getProductMargin(name){
  const relevant=[...S.orders,...(S.manualSales||[])].filter(o=>(o.items||[]).some(i=>i.name===name)&&o.revenue>0);
  if(!relevant.length) return 0;
  const avgMargin=relevant.reduce((s,o)=>s+(o.profit/o.revenue*100),0)/relevant.length;
  return round2(avgMargin);
}
function buildProdReason(daysLeft,margin,avgPerDay){
  const parts=[];
  if(daysLeft!==null&&daysLeft<=3) parts.push('⚠️ ใกล้หมด');
  else if(daysLeft!==null&&daysLeft<=7) parts.push('📉 สต็อกน้อย');
  if(margin>=60) parts.push('💰 margin สูง');
  if(avgPerDay>=2) parts.push('🔥 ขายดี');
  return parts.join(' · ')||'แนะนำตามสถิติ';
}
function getProductionSuggestions(){
  const vel=getStockVelocity();
  return Object.keys(PRODUCT_ICONS).map(name=>{
    const v=vel[name];
    const margin=getProductMargin(name);
    const urgencyScore=v.daysLeft!==null?Math.max(0,14-v.daysLeft):0;
    const marginScore=margin/100*10;
    const demandScore=v.avgPerDay*5;
    const totalScore=round2(urgencyScore+marginScore+demandScore);
    return {name,score:totalScore,daysLeft:v.daysLeft,avgPerDay:v.avgPerDay,margin,reason:buildProdReason(v.daysLeft,margin,v.avgPerDay)};
  }).filter(s=>s.avgPerDay>0).sort((a,b)=>b.score-a.score).slice(0,3);
}
function renderSmartStockAlert(){
  const box=document.getElementById('smart-stock-alert');if(!box)return;
  const vel=getStockVelocity();
  const urgent=Object.entries(vel).filter(([,v])=>v.daysLeft!==null&&v.daysLeft<=7).sort(([,a],[,b])=>a.daysLeft-b.daysLeft);
  if(!urgent.length){
    box.innerHTML=`<div class="card" style="border-left:4px solid var(--green)"><div class="card-title"><span>📊</span>Smart Stock Alert</div><div style="color:var(--green);font-weight:600;font-size:.86rem">✅ สต็อกทุกอย่างปกติ — ไม่มีชนิดไหนใกล้หมดใน 7 วัน</div></div>`;
    return;
  }
  box.innerHTML=`<div class="card" style="border-left:4px solid var(--red)"><div class="card-title"><span>📊</span>Smart Stock Alert (${urgent.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px">${urgent.map(([name,v])=>{
      const icon=v.daysLeft<=3?'🔴':'🟡';
      const color=v.daysLeft<=3?'var(--red)':'var(--yellow)';
      return `<div style="display:flex;align-items:center;gap:12px;padding:9px 14px;background:var(--surface2);border-radius:8px">
        <div style="font-size:1.2rem">${icon}</div>
        <div style="flex:1;font-weight:700">${PRODUCT_ICONS[name]||''} ${name}</div>
        <div style="text-align:right;font-size:.8rem"><div style="color:${color};font-weight:700">หมดใน ~${v.daysLeft} วัน</div><div style="color:var(--text2)">เหลือ ${v.stock} ถุง · ขาย ${v.avgPerDay.toFixed(1)}/วัน</div></div>
      </div>`;
    }).join('')}</div></div>`;
}
function renderProductionSuggestion(){
  const box=document.getElementById('production-suggestion');if(!box)return;
  const sugg=getProductionSuggestions();
  if(!sugg.length){box.style.display='none';box.innerHTML='';return;}
  box.style.display='';
  const medals=['🥇','🥈','🥉'];
  box.innerHTML=`<div class="card"><div class="card-title"><span>🔥</span>แนะนำอบรอบหน้า</div>
    <div style="display:flex;flex-direction:column;gap:10px">${sugg.map((s,i)=>{
      const dc=s.daysLeft!==null&&s.daysLeft<=3?'var(--red)':s.daysLeft!==null&&s.daysLeft<=7?'var(--yellow)':'var(--text2)';
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface2);border-radius:8px">
        <div style="font-size:1.3rem">${medals[i]||'•'}</div>
        <div style="flex:1"><div style="font-weight:700">${PRODUCT_ICONS[s.name]||''} ${s.name}</div><div style="font-size:.78rem;color:var(--text2)">${s.reason}</div></div>
        <div style="text-align:right;font-size:.8rem"><div style="color:${dc}">${s.daysLeft!==null?`หมดใน ${s.daysLeft} วัน`:'-'}</div><div style="color:var(--text2)">margin ${s.margin.toFixed(0)}%</div></div>
      </div>`;
    }).join('')}</div>
    <div style="font-size:.75rem;color:var(--text2);margin-top:10px">* คำนวณจากยอดขาย 30 วันล่าสุด + margin เฉลี่ย</div></div>`;
}

// ===================== แนะนำรอบการอบ =====================
const PREP_TIME={'ข้าวโพด':1,'แครอท':1,'ฟักทอง':1,'แอปเปิ้ล':1,'แตงกวา':1,'บล็อคโคลี่':2,'บวบ':1,'กล้วย':1,'ส้มแมนดาริน':1};
const BAKE_TIME={'ข้าวโพด':15.5,'แครอท':5,'ฟักทอง':3.5,'แอปเปิ้ล':6,'แตงกวา':6,'บล็อคโคลี่':6,'บวบ':6,'กล้วย':10,'ส้มแมนดาริน':10};
const SHELF_LIFE={'กล้วย':3,'แตงกวา':4,'บวบ':4,'บล็อคโคลี่':4,'ข้าวโพด':4,'ฟักทอง':6,'แอปเปิ้ล':12,'แครอท':12,'ส้มแมนดาริน':12};
const OVERNIGHT_OK=['ข้าวโพด'];

function getBakingSchedule(){
  const now=new Date();
  const startHourBase=S.settings?.bakeStartHour??10;
  const endHourLimit=S.settings?.bakeEndHour??22;
  const vel=getStockVelocity();
  // ผักสด 1 ชนิด (เช่น ข้าวโพด) → สินค้าอบแห้งหลาย variant (ข้าวโพด 3/6 แว่น) → รวมยอด
  const matchKeys=(obj,name)=>Object.keys(obj||{}).filter(k=>k===name||k.startsWith(name+' '));
  const results=[];
  Object.keys(SHELF_LIFE).forEach(name=>{
    const stock=getFreshStock(name);
    if(stock<=0) return;
    const latestPurchase=(S.freshPurchases||[]).filter(p=>p.name===name&&!p.isAdjust&&(p.qty-(p.usedQty||0))>0).sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(!latestPurchase) return;
    const purchaseDate=new Date(latestPurchase.date);
    const daysSincePurchase=Math.max(0,Math.floor((now-purchaseDate)/(1000*60*60*24)));
    const shelfLife=SHELF_LIFE[name];
    const daysLeft=Math.max(0,shelfLife-daysSincePurchase);
    const urgencyPct=Math.min(1,daysSincePurchase/shelfLife);
    const dryStock=matchKeys(S.stock,name).reduce((s,k)=>s+(S.stock[k]||0),0);
    const avgSalesPerDay=matchKeys(vel,name).reduce((s,k)=>s+(vel[k]?.avgPerDay||0),0);
    const dryDaysLeft=avgSalesPerDay>0?dryStock/avgSalesPerDay:999;
    const urgencyScore=urgencyPct*10;
    const stockScore=dryDaysLeft<3?3:dryDaysLeft<7?1.5:0;
    const demandScore=Math.min(avgSalesPerDay*2,4);
    const totalScore=round2(urgencyScore+stockScore+demandScore);
    const prepHours=PREP_TIME[name]||1;
    const bakeHours=BAKE_TIME[name]||6;
    const totalHours=prepHours+bakeHours;
    const isOvernight=OVERNIGHT_OK.includes(name);
    let startHour=startHourBase, isOvernightBake=false;
    if(startHour+totalHours>endHourLimit){
      if(isOvernight){ startHour=18; isOvernightBake=true; }
      else { startHour=null; } // อบไม่ทันในวันเดียว
    }
    let level,levelColor,levelIcon;
    if(daysLeft<=1){level='urgent';levelColor='var(--red)';levelIcon='🔴';}
    else if(daysLeft<=3){level='soon';levelColor='var(--yellow)';levelIcon='🟠';}
    else if(daysLeft<=7){level='plan';levelColor='var(--blue)';levelIcon='🟡';}
    else {level='ok';levelColor='var(--green)';levelIcon='🟢';}
    results.push({name,stock,daysSincePurchase,daysLeft,shelfLife,prepHours,bakeHours,totalHours,startHour,isOvernightBake,dryStock,level,levelColor,levelIcon,totalScore});
  });
  // จัดอันดับตาม score (dense rank: score เท่ากันได้อันดับซ้ำ เช่น 20,20 → 1,1 แล้วถัดไป = 2)
  const sorted=results.sort((a,b)=>b.totalScore-a.totalScore);
  let rank=0, prev=Infinity;
  sorted.forEach(r=>{ if(r.totalScore<prev){ rank++; prev=r.totalScore; } r.rank=rank; });
  return sorted;
}

function formatBakeTime(startHour,totalHours,isOvernight){
  if(startHour===null||startHour===undefined) return '⚠️ อบไม่จบภายในเวลาที่กำหนด — แบ่งหลายวันหรืออบข้ามคืน';
  const fmt=h=>{const hh=Math.floor(((h%24)+24)%24),mm=Math.round((h%1)*60);return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;};
  const startStr=fmt(startHour), endStr=fmt(startHour+totalHours);
  return isOvernight?`เริ่ม ${startStr} → เสร็จ ${endStr} (วันถัดไป) 🌙`:`เริ่ม ${startStr} → เสร็จ ${endStr}`;
}

function renderBakingSchedule(){
  const container=document.getElementById('baking-schedule-card');
  if(!container) return;
  const schedule=getBakingSchedule();
  if(!schedule.length){ container.innerHTML='<div class="empty"><div class="ei">✅</div><p>ไม่มีผักสดที่ต้องอบตอนนี้</p></div>'; return; }
  const fmtHr=h=>`${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round((h%1)*60)).padStart(2,'0')}`;
  const startHourBase=S.settings?.bakeStartHour??10, endHourLimit=S.settings?.bakeEndHour??22;
  const renderGroup=(items,title,color)=>{
    if(!items.length) return '';
    let g=`<div style="margin-bottom:16px"><div style="font-size:.82rem;font-weight:700;color:${color};margin-bottom:8px">${title}</div>`;
    items.forEach(s=>{
      const timeStr=formatBakeTime(s.startHour,s.totalHours,s.isOvernightBake);
      const isTop=s.rank===1;
      g+=`<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface2);border-radius:8px;margin-bottom:6px;border-left:3px solid ${isTop?'var(--accent)':'var(--border)'}">
        <div title="อันดับ ${s.rank} (score ${s.totalScore})" style="flex:none;width:32px;height:32px;border-radius:50%;background:${isTop?'var(--accent)':'var(--surface)'};border:1.5px solid ${isTop?'var(--accent)':'var(--border)'};color:${isTop?'#fff':'var(--text2)'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem">${s.rank}</div>
        <div style="font-size:1.4rem">${FRESH_ICONS[s.name]||'🌿'}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:.9rem">${s.name}<span style="font-size:.7rem;color:var(--text2);font-weight:400;margin-left:6px">score ${s.totalScore}</span></div>
          <div style="font-size:.75rem;color:var(--text2);margin-top:2px">ซื้อมา ${s.daysSincePurchase} วัน · เหลือ ${s.stock.toFixed(1)} หน่วย · ถุงอบ ${s.dryStock} ถุง</div>
          <div style="font-size:.78rem;color:var(--blue);margin-top:3px">🕐 ${timeStr} <span style="color:var(--text2);margin-left:6px">(เตรียม ${s.prepHours}ชม + อบ ${s.bakeHours}ชม)</span></div>
        </div>
        <div style="text-align:right;font-size:.78rem">
          <div style="color:${s.levelColor};font-weight:700">${s.daysLeft<=0?'⚠️ เกินกำหนด!':`เหลือ ${s.daysLeft} วัน`}</div>
          <div style="color:var(--text2)">อายุ ${s.shelfLife} วัน</div>
        </div>
      </div>`;
    });
    return g+'</div>';
  };
  const todayItems=schedule.filter(s=>s.rank===1);   // อันดับ 1 (score สูงสุด — เท่ากันได้หลายตัว)
  const tomorrowItems=schedule.filter(s=>s.rank>=2);  // อันดับ 2 ลงไป
  let html='';
  html+=renderGroup(todayItems,`🔴 อบวันนี้เลย! (อันดับ 1${todayItems.length>1?` · score เท่ากัน ${todayItems.length} ชนิด`:''})`,'var(--red)');
  html+=renderGroup(tomorrowItems,'🟠 ควรอบพรุ่งนี้ (อันดับ 2 ลงไป)','var(--yellow)');
  html+=`<div style="font-size:.72rem;color:var(--text2);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">* จัดอันดับด้วย score (ความใกล้เสีย + สต็อกถุงอบเหลือน้อย + ขายดี) · score เท่ากัน = อันดับเดียวกัน | เริ่มได้ ${fmtHr(startHourBase)} เสร็จก่อน ${fmtHr(endHourLimit)}</div>`;
  container.innerHTML=html;
}

function saveBakeTimeSettings(){
  const start=document.getElementById('set-bake-start').value;
  const end=document.getElementById('set-bake-end').value;
  if(start){const[h,m]=start.split(':');S.settings.bakeStartHour=parseInt(h)+parseInt(m)/60;}
  if(end){const[h,m]=end.split(':');S.settings.bakeEndHour=parseInt(h)+parseInt(m)/60;}
  saveState();
  showNotif('บันทึกเวลาอบแล้ว ✅');
  renderBakingSchedule();
}

function renderDryStock(){
  const g=document.getElementById('dry-stock-grid');if(!g)return;
  const vel=getStockVelocity();
  g.innerHTML=Object.keys(PRODUCT_ICONS).map(name=>{
    const qty=S.stock[name]||0,cpb=getFifoCost(name),avgCpb=getAvgDryCost(name),pct=Math.min((qty/30)*100,100);
    const cls=qty===0?'stock-low':qty<=5?'stock-med':'';
    const v=vel[name];
    let daysHtml;
    if(v.daysLeft!==null){
      const color=v.daysLeft<=3?'var(--red)':v.daysLeft<=7?'var(--yellow)':'var(--green)';
      const icon=v.daysLeft<=3?'🔴':v.daysLeft<=7?'🟡':'🟢';
      daysHtml=`<div style="font-size:.72rem;color:${color};margin-top:3px">${icon} หมดใน ~${v.daysLeft} วัน <span style="color:var(--text2)">(${v.avgPerDay.toFixed(1)}/วัน)</span></div>`;
    } else {
      daysHtml=`<div style="font-size:.72rem;color:var(--text2);margin-top:3px">📊 ยังไม่มีข้อมูลขาย</div>`;
    }
    return `<div class="prod-card ${cls}"><div class="pc-icon">${PRODUCT_ICONS[name]}</div><div class="pc-name">${name}</div><div class="pc-stock">${qty} ถุงเหลือ</div><div class="pc-cost">฿${cpb.toFixed(2)}/ถุง (FIFO)</div><div style="font-size:.72rem;color:var(--text2);margin-top:1px">เฉลี่ยทุก Lot ฿${avgCpb.toFixed(2)}/ถุง</div>${daysHtml}<div class="stock-bar ${cls}"><div class="stock-fill" style="width:${pct}%"></div></div></div>`;
  }).join('');
  renderSmartStockAlert();
  renderProductionSuggestion();
  renderBakingSchedule();
}

function renderDryLots(){
  const tbody=document.getElementById('dry-lots-tbody');
  const lots=S.dryLots.filter(l=>l.name!=='(ต้นทุนตั้งต้น)').sort((a,b)=>parseDate(b.date)-parseDate(a.date));
  const adjs=(S.dryAdjustments||[]).map(a=>({...a,isAdj:true})).sort((a,b)=>b.date.localeCompare(a.date));

  if(!lots.length&&!adjs.length){tbody.innerHTML='<tr><td colspan="12"><div class="empty"><div class="ei">🥕</div><p>ยังไม่มีข้อมูล</p></div></td></tr>';return;}

  // รวม lots + adjs เรียงตามวันที่
  const allRows=[...lots.map(l=>({...l,isAdj:false})),...adjs].sort((a,b)=>{
    const da=parseDate(a.date),db=parseDate(b.date);
    return db-da;
  });

  tbody.innerHTML=allRows.map(row=>{
    if(row.isAdj){
      return `<tr style="background:rgba(192,57,43,.04)">
        <td>${row.date}</td>
        <td colspan="3" style="font-size:.78rem;color:var(--red)">📉 ${row.reason}${row.orderId?` <span style="font-size:.72rem;color:var(--blue)">#${row.orderId.slice(-8)}</span>`:''}${row.note?' — '+row.note:''}</td>
        <td><b>${PRODUCT_ICONS[row.name]||''} ${row.name}</b></td>
        <td></td>
        <td class="text-right" style="color:var(--red)">-${row.qty}</td>
        <td class="text-right" style="color:var(--red)">${row.qty}</td>
        <td class="text-right">0</td>
        <td></td>
        <td class="text-right" style="color:var(--red);font-family:'IBM Plex Mono',monospace">-฿${row.totalCost.toFixed(2)}</td>
        <td><button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="deleteAdjustment('${row.id}')">${_ICON_TRASH}</button></td>
      </tr>`;
    }
    const r=row.remnantGrams||0;
    return `<tr style="${row.isInit?'background:rgba(245,166,35,.05)':''}">
      <td>${row.date}${row.isInit?' <span style="font-size:.7rem;background:var(--accent-light);color:var(--accent);padding:1px 5px;border-radius:4px">ตั้งต้น</span>':''}</td>
      <td style="font-size:.78rem;color:var(--text2)">${row.rawQty||'-'}</td>
      <td class="text-right">฿${(row.rawCost||0).toFixed(2)}</td>
      <td class="text-right">฿${(row.elecCost||0).toFixed(2)}</td>
      <td><b>${PRODUCT_ICONS[row.name]||''} ${row.name}</b></td>
      <td class="text-right" style="font-size:.78rem;color:var(--text2)">฿${(row.bagCost||0).toFixed(2)}</td>
      <td class="text-right">${row.totalBags}</td>
      <td class="text-right">${row.soldBags}</td>
      <td class="text-right"><b>${row.totalBags-row.soldBags}</b></td>
      <td class="text-right" style="font-size:.78rem;color:${r>0?'var(--accent)':'var(--text2)'}">${r>0?r+'g':'-'}</td>
      <td class="text-right" style="color:var(--accent);font-family:'IBM Plex Mono',monospace">฿${row.costPerBag.toFixed(2)}</td>
      <td style="display:flex;gap:4px">
        ${!row.isInit?`<button class="act-btn" title="แก้ไข" aria-label="แก้ไข" onclick="editDryLot('${row.id}')">${_ICON_EDIT}</button>`:''}
        <button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="deleteDryLot('${row.id}')">${_ICON_TRASH}</button>
      </td>
    </tr>`;
  }).join('');
}

function deleteAdjustment(id){
  if(!confirm('ลบรายการปรับลดนี้?'))return;
  S.dryAdjustments=(S.dryAdjustments||[]).filter(a=>a.id!==id);
  recalcAllFifo();  // rebuild soldBags + S.stock จากศูนย์ (FIFO ถูกต้อง)
  saveState();renderDryStock();renderDryLots();renderOverview();
  showNotif('ลบรายการปรับลดแล้ว ✅');
}

function editDryLot(id){
  const l=S.dryLots.find(x=>x.id===id);if(!l)return;
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="background:var(--surface);border-radius:var(--radius);padding:24px;max-width:520px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.3);max-height:90vh;overflow-y:auto">
    <div style="font-weight:700;color:var(--accent);margin-bottom:18px">✏️ แก้ไข Lot — ${l.name}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="form-group"><label>วันที่อบ</label><input type="date" id="el-date" value="${l.date}"></div>
      <div class="form-group"><label>วัตถุดิบ</label><input type="text" id="el-rawqty" value="${l.rawQty||''}"></div>
      <div class="form-group"><label>ต้นทุนผักสด (฿)</label><input type="number" id="el-rawcost" value="${l.rawCost||0}" step=".01"></div>
      <div class="form-group"><label>ค่าไฟ (฿)</label><input type="number" id="el-elec" value="${l.elecCost||0}" step=".01"></div>
      <div class="form-group"><label>ถุงทั้งหมด</label><input type="number" id="el-bags" value="${l.totalBags}" min="1" step="1"></div>
      <div class="form-group"><label>เศษ (g)</label><input type="number" id="el-remnant" value="${l.remnantGrams||0}" min="0" step=".1"></div>
    </div>
    <div style="background:var(--accent-light);border-radius:8px;padding:10px 14px;font-size:.82rem;margin-bottom:16px" id="el-preview">ต้นทุน/ถุง จะคำนวณใหม่เมื่อกดบันทึก</div>
    <div style="display:flex;gap:10px"><button class="btn btn-primary" onclick="saveEditDryLot('${id}')">💾 บันทึก</button><button class="btn btn-outline" onclick="this.closest('[style*=fixed]').remove()">ยกเลิก</button></div>
  </div>`;
  document.body.appendChild(ov);
  ['el-rawcost','el-elec','el-bags'].forEach(eid=>{
    document.getElementById(eid)?.addEventListener('input',()=>{
      const rc=parseFloat(document.getElementById('el-rawcost').value)||0,ec=parseFloat(document.getElementById('el-elec').value)||0,bags=parseInt(document.getElementById('el-bags').value)||1,bc=getBagCost(l.name);
      document.getElementById('el-preview').innerHTML=`฿/ถุง = (฿${rc.toFixed(2)}+฿${ec.toFixed(2)})/${bags} + ฿${bc.toFixed(2)} = <b style="color:var(--accent)">฿${round2((rc+ec)/bags+bc).toFixed(2)}</b>`;
    });
  });
}

function saveEditDryLot(id){
  const l=S.dryLots.find(x=>x.id===id);if(!l)return;
  const nb=parseInt(document.getElementById('el-bags').value)||0;
  if(nb<=0){showNotif('จำนวนถุงต้องมากกว่า 0','error');return;}
  const newDate=document.getElementById('el-date').value;
  const newRawQty=document.getElementById('el-rawqty').value;
  const newRawCost=parseFloat(document.getElementById('el-rawcost').value)||0;
  const newElec=parseFloat(document.getElementById('el-elec').value)||0;
  const newRemnant=parseFloat(document.getElementById('el-remnant').value)||0;

  // อัพเดท Lot นี้ก่อน
  const diff=nb-l.totalBags;
  S.stock[l.name]=Math.max(0,(S.stock[l.name]||0)+diff);
  l.date=newDate;l.rawQty=newRawQty;
  l.rawCost=newRawCost;l.elecCost=newElec;
  l.totalBags=nb;l.remnantGrams=newRemnant;
  l.bagCost=round2(getBagCost(l.name));

  // ถ้าอยู่ใน group (อบพร้อมกัน) → recalc ทั้ง group ด้วย ratio ใหม่
  if(l.groupId){
    const groupLots=S.dryLots.filter(x=>x.groupId===l.groupId&&!x.isInit);
    if(groupLots.length>1){
      // คำนวณ total cost รวมของ group (rawCost+elecCost ของทุก Lot)
      const totalRaw=groupLots.reduce((s,x)=>s+(x.rawCost||0),0);
      const totalElec=groupLots.reduce((s,x)=>s+(x.elecCost||0),0);
      const totalCost=totalRaw+totalElec;

      // คำนวณ weight ใหม่ของแต่ละ Lot (แว่น หรือถุง)
      const totalWeight=groupLots.reduce((s,x)=>s+getCostWeight({name:x.name,bags:x.totalBags,slicesPerBag:x.slicesPerBag}),0);

      if(totalWeight>0 && totalCost>0){
        groupLots.forEach(x=>{
          const w=getCostWeight({name:x.name,bags:x.totalBags,slicesPerBag:x.slicesPerBag});
          const ratio=w/totalWeight;
          x.rawCost=round2(totalRaw*ratio);
          x.elecCost=round2(totalElec*ratio);
          x.bagCost=round2(getBagCost(x.name));
          x.costPerBag=round2((x.rawCost+x.elecCost)/x.totalBags+x.bagCost);
        });
      }
    } else {
      // Lot เดียวใน group → คำนวณตรงๆ
      l.costPerBag=round2((newRawCost+newElec)/nb+l.bagCost);
    }
  } else {
    l.costPerBag=round2((newRawCost+newElec)/nb+l.bagCost);
  }

  document.querySelector('[style*="position:fixed"]')?.remove();
  recalcAllFifo();saveState();renderDryStock();renderDryLots();
  showNotif('แก้ไขแล้ว (recalc ทั้ง group) ✅');
}

function deleteDryLot(id){
  const lot=S.dryLots.find(l=>l.id===id);
  if(!lot)return;

  // หา lots ทั้งหมดใน group เดียวกัน (ถ้าไม่มี groupId ลบแค่ตัวเอง)
  const groupLots=lot.groupId
    ? S.dryLots.filter(l=>l.groupId===lot.groupId&&!l.isInit)
    : [lot];

  const names=groupLots.map(l=>l.name).join(', ');
  if(!confirm(`ลบ Lot ${names} (${groupLots.length} ชนิด) พร้อมกัน? สต็อกจะถูกปรับกลับ`))return;

  groupLots.forEach(l=>{
    // จัดการ remnant
    if((l.remnantGrams||0)>0&&!l.remnantUsed){
      if(!S.pendingRemnants)S.pendingRemnants={};
      if(!S.pendingRemnants[l.name])S.pendingRemnants[l.name]={grams:0,cost:0};
      S.pendingRemnants[l.name].grams=round2(S.pendingRemnants[l.name].grams+(l.remnantGrams||0));
      S.pendingRemnants[l.name].cost=round2(S.pendingRemnants[l.name].cost+(l.remnantCost||0));
    }
  });

  // คืน fresh stock ครั้งเดียว (ใช้ freshDesc จาก lot แรกของ group)
  const freshDesc=groupLots[0]?.freshDesc;
  if(freshDesc){
    freshDesc.split(',').forEach(part=>{
      const t=part.trim().split(' '),unit=t[t.length-1],qty=parseFloat(t[t.length-2]),name=t.slice(0,t.length-2).join(' ');
      if(!name||isNaN(qty)||qty<=0)return;
      S.freshPurchases.filter(p=>p.name===name&&(p.usedQty||0)>0)
        .sort((a,b)=>a.date.localeCompare(b.date))
        .forEach(p=>{
          const take=Math.min(p.usedQty||0,qty);
          p.usedQty=round2((p.usedQty||0)-take);
        });
    });
  }

  // ลบทุก lot ใน group ออกจาก S.dryLots
  const groupIds=new Set(groupLots.map(l=>l.id));
  S.dryLots=S.dryLots.filter(l=>!groupIds.has(l.id));

  recalcAllFifo();
  saveState();
  renderDryStock();
  renderDryLots();
  renderFreshList();
  renderFreshStockGrid();
  showNotif(`ลบ ${groupLots.length} Lot แล้ว สต็อกปรับกลับแล้ว ✅`);
}

// ===================== IMPORT =====================
let pendingCSV=null,pendingXLSX=null,pendingOrders=null,pendingUpdates=null,pendingReturns=null;

function handleDrop(e,type){e.preventDefault();document.getElementById('zone-'+type).classList.remove('dragover');const f=e.dataTransfer.files[0];if(!f)return;type==='csv'?processCSVFile(f):processXLSXFile(f);}
function loadCSV(inp){if(inp.files[0])processCSVFile(inp.files[0]);}
function loadXLSX(inp){if(inp.files[0])processXLSXFile(inp.files[0]);}

function processCSVFile(file){
  const r=new FileReader();
  r.onload=e=>{
    try{
      const lines=e.target.result.split('\n'),headers=lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
      pendingCSV=[];
      for(let i=1;i<lines.length;i++){if(!lines[i].trim())continue;const vals=parseCSVLine(lines[i]),row={};headers.forEach((h,j)=>row[h]=(vals[j]||'').replace(/"/g,'').trim());pendingCSV.push(row);}
      showFileReady('csv-status',file.name,pendingCSV.length+' แถว');tryPreview();
    }catch(err){showNotif('อ่าน CSV ไม่ได้: '+err.message,'error');}
  };r.readAsText(file,'UTF-8');
}

function parseCSVLine(line){
  const res=[];let cur='',inQ=false;
  for(const c of line){if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){res.push(cur);cur='';}else cur+=c;}
  res.push(cur);return res;
}

function processXLSXFile(file){
  const r=new FileReader();
  r.onload=e=>{
    try{
      // cellDates:true กัน date parse, raw:false กัน Order ID precision loss
      const wb=XLSX.read(e.target.result,{type:'array',cellDates:false});
      // Force-rebuild !ref จาก cell keys จริง (กัน TikTok XLSX ที่ !ref ผิด เช่น A1:X2 ทั้งที่มี 100+ แถว)
      const fixRef=s=>{
        const keys=Object.keys(s).filter(k=>!/^!/.test(k));
        if(!keys.length)return s;
        let minR=Infinity,maxR=0,minC=Infinity,maxC=0;
        keys.forEach(k=>{
          const dec=XLSX.utils.decode_cell(k);
          if(dec.r<minR)minR=dec.r;if(dec.r>maxR)maxR=dec.r;
          if(dec.c<minC)minC=dec.c;if(dec.c>maxC)maxC=dec.c;
        });
        s['!ref']=XLSX.utils.encode_range({s:{r:minR,c:minC},e:{r:maxR,c:maxC}});
        return s;
      };
      // หา sheet ที่มี Order ID column (คอลัมน์แรกเป็น "หมายเลขคำสั่งซื้อ/การปรับ")
      let ws=null,pickedSheet='';
      for(const sn of wb.SheetNames){
        const s=fixRef(wb.Sheets[sn]);
        const rows=XLSX.utils.sheet_to_json(s,{defval:'',raw:false});
        if(rows.length>0 && Object.values(rows[0])[0]!==undefined){
          const firstKey=Object.keys(rows[0])[0];
          if(firstKey.includes('หมายเลขคำสั่งซื้อ')){ws=s;pickedSheet=sn;break;}
        }
      }
      if(!ws){ws=fixRef(wb.Sheets[wb.SheetNames[0]]);pickedSheet=wb.SheetNames[0]+' (fallback)';}
      pendingXLSX=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
      showFileReady('xlsx-status',file.name,`${pendingXLSX.length} แถว — sheet: ${pickedSheet}`);tryPreview();
    }catch(err){showNotif('อ่าน XLSX ไม่ได้: '+err.message,'error');}
  };r.readAsArrayBuffer(file);
}

function showFileReady(elId,name,info){document.getElementById(elId).innerHTML=`<div class="file-ready">✅ <b>${name}</b> — ${info}</div>`;}

function getPackCost(qty,hasCorn6){
  if(hasCorn6||qty>=5)return S.settings.pack3;
  if(qty>=3)return S.settings.pack2;
  return S.settings.pack1;
}

function tryPreview(){
  if(!pendingCSV && !pendingXLSX)return;
  const incMap={};
  if(pendingXLSX) pendingXLSX.forEach(r=>{
    // ใช้คอลัมน์แรกเป็น Order ID (ไม่ hardcode ชื่อ — กัน header เพี้ยน)
    const keys=Object.keys(r);
    const id=String(r[keys[0]]||'').trim();
    if(!id||isNaN(id))return;
    incMap[id]=r;
  });
  const exMap={};S.orders.forEach(o=>exMap[o.id]=o);
  const orderMap={};
  const returnStatusSet=['คืนสินค้า','คืนเงิน','ยกเลิก','Cancelled','Returned'];
  const csvReturnMap={}; // oid → status ของออเดอร์ที่ถูกคืน/ยกเลิกใน CSV
  if(pendingCSV){
    pendingCSV.forEach(r=>{
      const oid=String(r['Order ID']||'').trim(),status=(r['Order Status']||'').trim();
      if(!oid)return;
      if(returnStatusSet.some(s=>status.includes(s))){
        csvReturnMap[oid]=status; return;
      }
      if(!['เสร็จสมบูรณ์','จัดส่งแล้ว','ที่จะจัดส่ง'].includes(status))return;
      if(!orderMap[oid])orderMap[oid]={id:oid,status,date:(r['Created Time']||'').split(' ')[0].trim(),
        shippedDate:(r['Shipped Time']||'').trim().replace(/\\t/g,'')||null,
        deliveredDate:(r['Delivered Time']||'').trim().replace(/\\t/g,'')||null,
        buyerUsername:(r['Buyer Username']||'').trim(),
        trackingId:String(r['Tracking ID']||r['หมายเลขติดตามพัสดุ']||'').trim().replace(/\\t/g,''),
        createdTime:(r['Created Time']||'').trim().replace(/\\t/g,''),items:[]};
      const name=resolveVarName(r['Variation']||'');
      orderMap[oid].items.push({variation:r['Variation']||'',name,qty:parseInt(r['Quantity'])||1,costPerBag:getFifoCost(name)});
    });
  }
  let newCount=0,dupCount=0,updateCount=0,matchedFee=0;
  const parseNum=v=>parseFloat(String(v||'0').replace(/,/g,''))||0;
  pendingOrders=[];pendingUpdates=[];pendingReturns=[];
  // detect คืน/ยกเลิกจาก CSV ที่มีออเดอร์อยู่ในระบบแล้วและยังไม่ถูก return
  Object.entries(csvReturnMap).forEach(([oid,status])=>{
    const ex=exMap[oid];
    if(ex&&!ex.returned) pendingReturns.push({id:oid,status,existingOrder:ex});
  });
  Object.values(orderMap).forEach(o=>{
    // revenue: ดึงจาก Income ก่อน ถ้าไม่มีใช้ SKU Subtotal After Discount จาก CSV (sum ทุก row ของ order)
    const inc=incMap[o.id];
    const incKeys=inc?Object.keys(inc):[];
    const fee=inc?round2(Math.abs(parseNum(inc[incKeys[13]]))):0;  // col 14 = ค่าธรรมเนียมทั้งหมด
    const incRev=inc?round2(parseNum(inc[incKeys[6]])):0;          // col 7 = รายได้รวม
    if(inc&&fee>0)matchedFee++;
    let csvRev=0;
    if(!incRev&&pendingCSV){
      // หาค่า Order Amount จาก row แรกของ order นี้ (ทุก row ใช้ค่าเดียวกัน)
      const csvRows=pendingCSV.filter(r=>String(r['Order ID']||'').trim()===o.id);
      if(csvRows.length>0){
        // รายได้ร้าน = SKU Subtotal Before Discount - SKU Seller Discount
        // (TikTok คืน Platform Discount ให้ร้าน → ไม่ต้องหัก)
        const skuTotal=csvRows.reduce((s,r)=>s+parseFloat(r['SKU Subtotal Before Discount']||0)-parseFloat(r['SKU Seller Discount']||0),0);
        csvRev=round2(skuTotal);
      }
    }
    const rev=incRev>0?incRev:(csvRev>0?csvRev:0);
    if(exMap[o.id]){
      const ex=exMap[o.id];
      const needFeeUpdate=ex.tiktokFee===0&&fee>0;
      const needStatusUpdate=o.status&&o.status!==ex.status;
      const needRevenueUpdate=ex.revenue===0&&rev>0;
      const needDeliveredUpdate=!ex.deliveredDate&&o.deliveredDate;
      const needUsernameUpdate=!ex.buyerUsername&&o.buyerUsername;
      const needCreatedTimeUpdate=!ex.createdTime&&o.createdTime;
      if(needFeeUpdate||needStatusUpdate||needRevenueUpdate||needDeliveredUpdate||needUsernameUpdate||needCreatedTimeUpdate){
        const newFee=needFeeUpdate?fee:ex.tiktokFee;
        const newRev=needRevenueUpdate||needFeeUpdate?(rev||ex.revenue):ex.revenue;
        const nc=round2(ex.productCost+ex.packCost+newFee+(ex.deliveryCost||0));
        const np=round2(newRev-nc);
        pendingUpdates.push({id:o.id,tiktokFee:newFee,revenue:newRev,totalCost:nc,profit:np,status:o.status,deliveredDate:o.deliveredDate||ex.deliveredDate||null,buyerUsername:o.buyerUsername||ex.buyerUsername||'',createdTime:o.createdTime||ex.createdTime||''});
        updateCount++;
      } else {dupCount++;}
      return;
    }
    const tq=o.items.reduce((s,i)=>s+i.qty,0),hc=o.items.some(i=>i.name==='ข้าวโพด 6 แว่น');
    const pc=round2(o.items.reduce((s,i)=>s+i.costPerBag*i.qty,0)),pk=getPackCostFifo(tq,hc,o.date),tc=round2(pc+pk+fee),pr=round2(rev-tc);
    pendingOrders.push({id:o.id,date:o.date,shippedDate:o.shippedDate||null,deliveredDate:o.deliveredDate||null,status:o.status,buyerUsername:o.buyerUsername||'',trackingId:o.trackingId||'',createdTime:o.createdTime||'',items:o.items,totalQty:tq,hasCorn6:hc,revenue:rev,productCost:pc,packCost:pk,tiktokFee:fee,deliveryCost:0,totalCost:tc,profit:pr});newCount++;
  });
  if(!pendingCSV){Object.keys(incMap).forEach(id=>{const ex=exMap[id];if(ex&&ex.tiktokFee===0){const inc=incMap[id],fee=round2(Math.abs(parseNum(inc['ค่าธรรมเนียมทั้งหมด']))),rev=round2(parseNum(inc['รายได้รวม']));if(fee>0){const nc=round2(ex.productCost+ex.packCost+fee+(ex.deliveryCost||0)),np=round2((rev||ex.revenue)-nc);pendingUpdates.push({id,tiktokFee:fee,revenue:rev||ex.revenue,totalCost:nc,profit:np});updateCount++;}}});}
  const xlsxCount=pendingXLSX?pendingXLSX.length:0;
  const returnLossEst=round2(pendingReturns.reduce((s,r)=>s+(r.existingOrder.productCost||0)+(getFifoBoxCost((r.existingOrder.hasCorn6||r.existingOrder.totalQty>=5)?'B':(r.existingOrder.totalQty>=3)?'AB':null)||0),0));
  document.getElementById('preview-stats').innerHTML=`
    <div class="stat-card"><div class="s-label">ออเดอร์ใหม่</div><div class="s-val s-green">${newCount}</div></div>
    <div class="stat-card"><div class="s-label">อัพเดท Fee</div><div class="s-val s-blue">${updateCount}</div></div>
    <div class="stat-card"><div class="s-label">ซ้ำ</div><div class="s-val s-accent">${dupCount}</div></div>
    <div class="stat-card"><div class="s-label">รายได้ใหม่</div><div class="s-val s-blue">฿${pendingOrders.reduce((s,o)=>s+o.revenue,0).toFixed(0)}</div></div>
    <div class="stat-card"><div class="s-label">Fee match (XLSX ${xlsxCount})</div><div class="s-val ${matchedFee>0?'s-green':'s-accent'}">${matchedFee}</div></div>
    ${pendingReturns.length>0?`<div class="stat-card" style="border:1.5px solid var(--red)"><div class="s-label">↩ คืน/ยกเลิก</div><div class="s-val s-red">${pendingReturns.length} ออเดอร์</div><div class="s-sub">ขาดทุนประมาณ ฿${returnLossEst.toFixed(0)}</div></div>`:''}`;
  const rows=[...pendingOrders.map(o=>`<tr><td style="font-family:monospace;font-size:.75rem">${o.id.slice(-8)}</td><td>${o.date}</td><td><span class="badge ${statusBadge(o.status)}">${o.status}</span></td><td style="max-width:180px;white-space:normal;font-size:.78rem">${o.items.map(i=>`${i.name}×${i.qty}`).join(', ')}</td><td class="text-right">${o.totalQty}</td><td class="text-right">฿${o.revenue.toFixed(2)}</td><td class="text-right">฿${o.productCost.toFixed(2)}</td><td class="text-right">฿${o.packCost.toFixed(2)}</td><td class="text-right">฿${o.tiktokFee.toFixed(2)}</td><td class="text-right ${o.profit>=0?'profit-pos':'profit-neg'}">฿${o.profit.toFixed(2)}</td></tr>`),
    ...pendingUpdates.map(u=>{const ex=exMap[u.id];return `<tr style="background:rgba(45,111,164,.06)"><td style="font-family:monospace;font-size:.75rem">${u.id.slice(-8)}</td><td>${ex?.date||''}</td><td><span class="badge badge-done">อัพเดท Fee</span></td><td style="max-width:180px;white-space:normal;font-size:.78rem">${(ex?.items||[]).map(i=>`${i.name}×${i.qty}`).join(', ')}</td><td class="text-right">${ex?.totalQty||''}</td><td class="text-right">฿${u.revenue.toFixed(2)}</td><td class="text-right">฿${(ex?.productCost||0).toFixed(2)}</td><td class="text-right">฿${(ex?.packCost||0).toFixed(2)}</td><td class="text-right" style="color:var(--accent)">฿${u.tiktokFee.toFixed(2)}</td><td class="text-right ${u.profit>=0?'profit-pos':'profit-neg'}">฿${u.profit.toFixed(2)}</td></tr>`})];
  document.getElementById('preview-tbody').innerHTML=rows.join('');
  // แสดง section คืน/ยกเลิก
  const retEl=document.getElementById('preview-returns');
  if(retEl){
    if(pendingReturns.length>0){
      retEl.style.display='';
      retEl.innerHTML=`<div style="font-weight:700;color:var(--red);margin:16px 0 8px">↩ ออเดอร์ที่ถูกคืน/ยกเลิก (${pendingReturns.length})</div>
      <div class="tbl-wrap"><table><thead><tr><th>Order ID</th><th>วันที่</th><th>สถานะใหม่</th><th>สินค้า</th><th class="text-right">รายได้ที่หัก</th><th>สภาพสินค้า</th></tr></thead><tbody>
      ${pendingReturns.map(r=>{const o=r.existingOrder;return `<tr style="background:rgba(220,50,50,.05)">
        <td style="font-family:monospace;font-size:.75rem">${r.id.slice(-8)}</td>
        <td>${o.date||''}</td>
        <td><span class="badge" style="background:var(--red);color:#fff;font-size:.72rem">${r.status}</span></td>
        <td style="font-size:.78rem;max-width:160px;white-space:normal">${(o.items||[]).map(i=>`${i.name}×${i.qty}`).join(', ')}</td>
        <td class="text-right" style="color:var(--red)">฿${(o.revenue||0).toFixed(2)}</td>
        <td><select data-return-id="${r.id}" style="font-size:.78rem;padding:4px 6px;border-radius:6px;border:1px solid var(--border)">
          <option value="damaged" selected>⚠️ เสียหาย — ไม่คืนสต็อก</option>
          <option value="good">✅ สภาพดี — คืนสต็อก</option>
        </select></td>
      </tr>`}).join('')}
      </tbody></table></div>`;
    } else {
      retEl.style.display='none';retEl.innerHTML='';
    }
  }
  document.getElementById('import-preview').style.display='';
}

function confirmImport(){
  const saved=pendingOrders?.length||0,updated=pendingUpdates?.length||0;
  (pendingOrders||[]).forEach(o=>{
    S.orders.push(o);
    // ตัดสต็อก dry bags
    o.items.forEach(item=>{
      if(S.stock[item.name]!==undefined)
        S.stock[item.name]=Math.max(0,S.stock[item.name]-item.qty);
    });
    // ตัดกล่อง FIFO หลัง BOX_FIFO_START
    const od=new Date(o.date.includes('/')?o.date.split('/').reverse().join('-'):o.date);
    if(od>=BOX_FIFO_START&&o.totalQty>0){
      const useB=o.hasCorn6||o.totalQty>=5;
      const useAB=!useB&&o.totalQty>=3;
      if(useB) deductBoxFifo('B',1);
      else if(useAB) deductBoxFifo('AB',1);
    }
  });
  (pendingUpdates||[]).forEach(u=>{const o=S.orders.find(x=>x.id===u.id);if(o){o.tiktokFee=u.tiktokFee;o.revenue=u.revenue;o.totalCost=u.totalCost;o.profit=u.profit;if(u.status)o.status=u.status;if(u.deliveredDate)o.deliveredDate=u.deliveredDate;if(u.buyerUsername)o.buyerUsername=u.buyerUsername;if(u.createdTime)o.createdTime=u.createdTime;}});
  // จัดการออเดอร์คืน/ยกเลิก
  const today=new Date().toISOString().slice(0,10);
  if(!S.orderReturns)S.orderReturns=[];
  if(!S.boxAdjustments)S.boxAdjustments=[];
  (pendingReturns||[]).forEach(r=>{
    const order=S.orders.find(x=>x.id===r.id);
    if(!order||order.returned)return;
    const condition=document.querySelector(`[data-return-id="${r.id}"]`)?.value||'damaged';
    order.returned=true;order.returnDate=today;order.returnReason=r.status;order.returnCondition=condition;
    // สต็อกถุงอบแห้ง: recalcAllFifo() จะคืนให้เองถ้า condition==='good' (ดู filter ใน recalcAllFifo)
    // กล่องเสียเสมอ — บันทึก boxAdjustment
    const usedBoxType=(order.hasCorn6||order.totalQty>=5)?'B':(order.totalQty>=3)?'AB':null;
    const boxCost=usedBoxType?getFifoBoxCost(usedBoxType):0;
    if(usedBoxType&&boxCost>0){
      S.boxAdjustments.push({id:'badj-'+Date.now()+Math.random().toString(36).slice(2,5),date:today,type:usedBoxType,qty:1,cost:boxCost,reason:'คืนออเดอร์',orderId:r.id});
    }
    S.orderReturns.push({id:'return-'+Date.now()+Math.random().toString(36).slice(2,5),orderId:r.id,date:today,reason:r.status,condition,items:order.items,revenue:order.revenue,productCost:order.productCost,boxType:usedBoxType,boxCost,totalLoss:condition==='good'?round2(boxCost):round2(order.productCost+boxCost)});
  });
  const returnCount=pendingReturns?.length||0;
  // sync ลูกค้า: อัปเดต lastSeen ออเดอร์เก่า + ใหม่ที่ import เข้ามา
  const syncList=[...(pendingOrders||[]),...(pendingUpdates||[]).map(u=>S.orders.find(o=>o.id===u.id)).filter(Boolean)];
  const custSync=syncCustomersFromImport(syncList);
  // Auto-detect รวมแพ็คจาก Tracking ID เดียวกัน (ต่าง Order ID = แพ็คกล่องเดียวกัน)
  // เฉพาะออเดอร์ตั้งแต่ 20 มิ.ย. 2026 เป็นต้นไป — ของเก่าข้าม (กันกล่องเพี้ยนย้อนหลัง)
  const MERGE_AUTO_START=new Date('2026-06-20');
  const trackingMap={};
  (pendingOrders||[]).forEach(o=>{ if(!o.trackingId) return; if(parseOrderDate(o.date)<MERGE_AUTO_START) return; (trackingMap[o.trackingId]=trackingMap[o.trackingId]||[]).push(o.id); });
  if(!S.mergedPacks)S.mergedPacks=[];
  Object.entries(trackingMap).forEach(([trackingId,orderIds])=>{
    if(orderIds.length<2) return;
    const exists=S.mergedPacks.some(m=>m.orderIds.length===orderIds.length&&orderIds.every(id=>m.orderIds.includes(id)));
    if(exists) return;
    const allOrders=[...S.orders,...(S.manualSales||[])];
    const mergedOrders=orderIds.map(id=>allOrders.find(o=>o.id===id)).filter(Boolean);
    if(mergedOrders.length<2) return;
    const totalQty=mergedOrders.reduce((s,o)=>s+(o.totalQty||0),0);
    const hasCorn6=mergedOrders.some(o=>o.hasCorn6);
    const boxType=(hasCorn6||totalQty>=5)?'B':'AB';
    const boxCost=getFifoBoxCost(boxType);
    const restore=mergedOrders.map(o=>({id:o.id,packCost:o.packCost,totalCost:o.totalCost,profit:o.profit}));
    mergedOrders.forEach((o,idx)=>{
      const oldBt=(o.hasCorn6||o.totalQty>=5)?'B':o.totalQty>=3?'AB':null;
      const oldBoxCost=oldBt?getFifoBoxCost(oldBt):0;
      if(idx===0){ o.packCost=round2(o.packCost-oldBoxCost+boxCost); o.mergedBoxType=boxType; o.mergedBoxCost=boxCost; }
      else { o.packCost=Math.max(0,round2(o.packCost-oldBoxCost)); o.mergedBoxType='none'; o.mergedBoxCost=0; }
      o.totalCost=round2(o.productCost+o.packCost+(o.tiktokFee||0)+(o.deliveryCost||0)+(o.shippingCost||0));
      o.profit=round2(o.revenue-o.totalCost);
    });
    for(let i=0;i<orderIds.length-1;i++){
      const lot=(S.boxLots||[]).filter(l=>l.type===boxType&&(l.usedQty||0)>0).sort((a,b)=>b.date.localeCompare(a.date))[0];
      if(lot) lot.usedQty=round2(Math.max(0,(lot.usedQty||0)-1));
    }
    S.mergedPacks.push({id:'merge-'+Date.now()+Math.random().toString(36).slice(2,5),date:mergedOrders[0]?.date||'',orderIds,boxType,boxCost,trackingId,note:'Auto-detect จาก Tracking ID',savedBoxCount:orderIds.length-1,restore});
  });
  recalcAllFifo();
  recalcDeliveryCosts();
  saveState();
  pendingCSV=null;pendingXLSX=null;pendingOrders=null;pendingUpdates=null;pendingReturns=null;
  document.getElementById('import-preview').style.display='none';
  document.getElementById('csv-status').innerHTML='';document.getElementById('xlsx-status').innerHTML='';
  document.getElementById('inp-csv').value='';document.getElementById('inp-xlsx').value='';
  const notifParts=[`เพิ่ม ${saved} ออเดอร์`,`อัพเดท ${updated} fee`];
  if(returnCount>0)notifParts.push(`↩ คืน/ยกเลิก ${returnCount} ออเดอร์`);
  if(custSync.knownCount>0)notifParts.push(`👥 ลูกค้าเก่า ${custSync.knownCount} คน`);
  if(custSync.newCount>0)notifParts.push(`🆕 ใหม่ ${custSync.newCount} username`);
  showNotif(notifParts.join(' | ')+' ✅');
  renderDryStock();renderOverview();renderOrders();renderFreshStockGrid();
}
function cancelImport(){pendingCSV=null;pendingXLSX=null;pendingOrders=null;pendingUpdates=null;pendingReturns=null;document.getElementById('import-preview').style.display='none';}

// ===================== SHOPEE IMPORT =====================
const SHOPEE_PRODUCT_NAMES=new Set(['แครอท','บล็อคโคลี่','ฟักทอง','แอปเปิ้ล','แตงกวา','บวบ','กล้วย','ข้าวโพด 3 แว่น']);
let pendingShopeeXLSX=null, pendingShopeeOrders=null, pendingShopeeStatusUpdates=null;

function getShopeeCutoffDate(){
  const s=(S.settings&&S.settings.shopeeStockStart)||'2026-05-29';
  return new Date(s);
}

function shopeeMapName(variation, productName){
  const v=(variation||'').trim();
  const p=(productName||'').trim();
  if(v && SHOPEE_PRODUCT_NAMES.has(v)) return v;
  if(!v && (p.includes('6แว่น')||p.includes('6 แว่น'))) return 'ข้าวโพด 6 แว่น';
  return v||p;
}

function formatShopeeDate(s){
  if(!s) return '';
  const d=new Date(s);
  if(isNaN(d.getTime())) return String(s);
  const dd=String(d.getDate()).padStart(2,'0');
  const mm=String(d.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function handleShopeeDrop(e){
  e.preventDefault();
  document.getElementById('zone-shopee').classList.remove('dragover');
  const f=e.dataTransfer.files[0];
  if(f) processShopeeXLSXFile(f);
}

function loadShopeeXLSX(inp){if(inp.files[0]) processShopeeXLSXFile(inp.files[0]);}

function processShopeeXLSXFile(file){
  const r=new FileReader();
  r.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets['orders']||wb.Sheets[wb.SheetNames[0]];
      pendingShopeeXLSX=XLSX.utils.sheet_to_json(ws,{defval:''});
      showFileReady('shopee-status',file.name,pendingShopeeXLSX.length+' แถว');
      tryShopeePreview();
    }catch(err){showNotif('อ่าน XLSX ไม่ได้: '+err.message,'error');}
  };
  r.readAsArrayBuffer(file);
}

function tryShopeePreview(){
  if(!pendingShopeeXLSX) return;
  const cutoff=getShopeeCutoffDate();
  const existingShopeeById={};
  (S.manualSales||[]).filter(s=>s.source==='shopee').forEach(s=>{existingShopeeById[s.id]=s;});
  const orderMap={};

  pendingShopeeXLSX.forEach(r=>{
    const oid=String(r['หมายเลขคำสั่งซื้อ']||'').trim();
    const status=(r['สถานะการสั่งซื้อ']||'').trim();
    const isAccepted =
      status === 'สำเร็จแล้ว' ||
      status === 'การจัดส่ง' ||
      status.includes('ผู้ซื้อได้รับสินค้าแล้ว');
    if(!oid||!isAccepted) return;
    if(!orderMap[oid]){
      // fee fields ซ้ำทุก row → เก็บจาก row แรกของ order เท่านั้น
      orderMap[oid]={
        id:oid,
        date:formatShopeeDate(r['วันที่ทำการสั่งซื้อ']||''),
        shippedDate:String(r['เวลาส่งสินค้า']||'').trim(),
        revenue:0, // SUM ของ col "ราคาขายสุทธิ" ทุก row ด้านล่าง
        commission:round2(Math.abs(parseFloat(r['ค่าคอมมิชชั่น']||0))),
        transFee:round2(Math.abs(parseFloat(r['Transaction Fee']||0))),
        serviceFee:round2(Math.abs(parseFloat(r['ค่าบริการ']||0))),
        buyerUsername:String(r['Buyer Username']||r['ชื่อผู้ใช้ (ผู้ซื้อ)']||r['ชื่อผู้ใช้ของผู้ซื้อ']||'').trim(),
        createdTime:String(r['วันที่ทำการสั่งซื้อ']||'').trim(),
        rawStatus:status,
        items:[]
      };
    }
    // Revenue = SUM ราคาขายสุทธิ ทุก row (ไม่ใช่ราคาที่ลูกค้าจ่าย ซึ่งอาจถูกลดด้วยโค้ด Shopee)
    orderMap[oid].revenue += parseFloat(r['ราคาขายสุทธิ']||0);
    const name=shopeeMapName(r['ชื่อตัวเลือก'],r['ชื่อสินค้า']);
    const qty=parseInt(r['จำนวน'])||1;
    orderMap[oid].items.push({name,qty,costPerBag:getFifoCost(name)});
  });

  pendingShopeeOrders=[];
  pendingShopeeStatusUpdates=[];
  let newCount=0, dupCount=0, cutoffCount=0, updateCount=0;

  Object.values(orderMap).forEach(o=>{
    const mappedStatus=
      o.rawStatus==='สำเร็จแล้ว'?'เสร็จสมบูรณ์':
      o.rawStatus.includes('ผู้ซื้อได้รับสินค้าแล้ว')?'จัดส่งแล้ว':
      'จัดส่งแล้ว'; // การจัดส่ง
    const existing=existingShopeeById[o.id];
    if(existing){
      // ออเดอร์เดิม — อัปเดตสถานะ/username/createdTime หรือ revenue+fee ที่คำนวณใหม่ (สูตรถูกต้อง)
      const needStatus=existing.status!==mappedStatus;
      const needUsername=!existing.buyerUsername&&o.buyerUsername;
      const needCreatedTime=!existing.createdTime&&o.createdTime;
      const newRevenue=round2(o.revenue);
      const newFee=round2(o.commission+o.transFee+(o.serviceFee||0));
      const needFinance=Math.abs((existing.revenue||0)-newRevenue)>0.01||Math.abs((existing.tiktokFee||0)-newFee)>0.01;
      // recompute totalCost/profit โดยคง deliveryCost เดิมไว้ (recalcDeliveryCosts จะ freeze ออเดอร์ที่มีค่าส่งแล้ว)
      const newTotalCost=round2((existing.productCost||0)+(existing.packCost||0)+newFee+(existing.deliveryCost||0)+(existing.shippingCost||0));
      const newProfit=round2(newRevenue-newTotalCost);
      if(needStatus||needUsername||needCreatedTime||needFinance){
        pendingShopeeStatusUpdates.push({id:o.id,date:existing.date,from:existing.status,to:mappedStatus,statusChanged:needStatus,financeChanged:needFinance,buyerUsername:o.buyerUsername||existing.buyerUsername||'',createdTime:o.createdTime||existing.createdTime||'',newRevenue,newFee,newTotalCost,revenue:needFinance?newRevenue:existing.revenue,profit:needFinance?newProfit:existing.profit});
        updateCount++;
      } else {
        dupCount++;
      }
      return;
    }
    const tq=o.items.reduce((s,i)=>s+i.qty,0);
    const hc=o.items.some(i=>i.name==='ข้าวโพด 6 แว่น');
    const productCost=round2(o.items.reduce((s,i)=>s+i.costPerBag*i.qty,0));
    const packCost=getPackCostFifo(tq,hc,o.date);
    const revenue=round2(o.revenue);
    const fee=round2(o.commission+o.transFee+(o.serviceFee||0));
    const totalCost=round2(productCost+packCost+fee);
    const profit=round2(revenue-totalCost);
    const shippedDt=o.shippedDate?new Date(o.shippedDate):null;
    const stockCutoff=!!(shippedDt && !isNaN(shippedDt.getTime()) && shippedDt>=cutoff);
    if(stockCutoff) cutoffCount++;
    pendingShopeeOrders.push({
      id:o.id, date:o.date, shippedDate:o.shippedDate||null,
      platform:'Shopee', source:'shopee', status:mappedStatus,
      buyerUsername:o.buyerUsername||'', createdTime:o.createdTime||'',
      items:o.items, totalQty:tq, hasCorn6:hc,
      revenue, productCost, packCost,
      tiktokFee:fee, feePct:revenue>0?round2(fee/revenue*100):0, shippingCost:0,
      totalCost, profit, stockCutoff
    });
    newCount++;
  });

  document.getElementById('shopee-preview-stats').innerHTML=`
    <div class="stat-card"><div class="s-label">ออเดอร์ใหม่</div><div class="s-val s-green">${newCount}</div></div>
    <div class="stat-card"><div class="s-label">อัพเดทสถานะ</div><div class="s-val s-accent">${updateCount}</div></div>
    <div class="stat-card"><div class="s-label">ซ้ำ</div><div class="s-val s-accent">${dupCount}</div></div>
    <div class="stat-card"><div class="s-label">ตัดสต็อก / ไม่ตัด</div><div class="s-val s-blue">${cutoffCount} / ${newCount-cutoffCount}</div></div>
    <div class="stat-card"><div class="s-label">รายได้ใหม่</div><div class="s-val s-blue">฿${pendingShopeeOrders.reduce((s,o)=>s+o.revenue,0).toFixed(0)}</div></div>`;

  document.getElementById('shopee-preview-tbody').innerHTML=[
    ...pendingShopeeStatusUpdates.map(u=>
    `<tr style="background:rgba(45,111,164,.06)"><td style="font-family:monospace;font-size:.75rem">${u.id.slice(-8)}</td><td>${u.date||''}</td><td style="font-size:.75rem;color:var(--text2)">-</td><td style="max-width:180px;white-space:normal;font-size:.78rem">${u.statusChanged?`<span class="badge ${statusBadge(u.from)}">${u.from}</span> → <span class="badge ${statusBadge(u.to)}">${u.to}</span>`:u.financeChanged?'💰 อัพเดทรายได้/ค่าธรรมเนียม':'👤 อัพเดทชื่อผู้ซื้อ'}</td><td class="text-right">-</td><td class="text-right">฿${(u.revenue||0).toFixed(2)}</td><td class="text-right">-</td><td class="text-right ${(u.profit||0)>=0?'profit-pos':'profit-neg'}">฿${(u.profit||0).toFixed(2)}</td><td style="text-align:center">🔄</td></tr>`),
    ...pendingShopeeOrders.map(o=>
    `<tr><td style="font-family:monospace;font-size:.75rem">${o.id.slice(-8)}</td><td>${o.date}</td><td style="font-size:.75rem;color:var(--text2)">${o.shippedDate||'-'}</td><td style="max-width:180px;white-space:normal;font-size:.78rem">${o.items.map(i=>`${PRODUCT_ICONS[i.name]||''}${i.name}×${i.qty}`).join(', ')}</td><td class="text-right">${o.totalQty}</td><td class="text-right">฿${o.revenue.toFixed(2)}</td><td class="text-right">฿${o.tiktokFee.toFixed(2)}</td><td class="text-right ${o.profit>=0?'profit-pos':'profit-neg'}">฿${o.profit.toFixed(2)}</td><td style="text-align:center">${o.stockCutoff?'✅':'⏭️'}</td></tr>`)
  ].join('');

  document.getElementById('import-shopee-preview').style.display='';
}

function confirmShopeeImport(){
  const saved=pendingShopeeOrders?.length||0;
  const updated=pendingShopeeStatusUpdates?.length||0;
  if(!S.manualSales) S.manualSales=[];

  // อัปเดตสถานะ + buyerUsername + createdTime + revenue/fee ออเดอร์เดิมที่ Shopee เปลี่ยนไป
  (pendingShopeeStatusUpdates||[]).forEach(u=>{
    const o=S.manualSales.find(x=>x.source==='shopee'&&x.id===u.id);
    if(o){
      o.status=u.to;
      if(u.buyerUsername)o.buyerUsername=u.buyerUsername;
      if(u.createdTime)o.createdTime=u.createdTime;
      if(u.financeChanged){
        o.revenue=u.newRevenue; o.tiktokFee=u.newFee; o.totalCost=u.newTotalCost;
        o.profit=round2(u.newRevenue-u.newTotalCost);
        o.feePct=u.newRevenue>0?round2(u.newFee/u.newRevenue*100):0;
      }
    }
  });

  (pendingShopeeOrders||[]).forEach(o=>{
    S.manualSales.push(o);
    if(o.stockCutoff){
      // หักสต็อกถุงอบแห้ง
      o.items.forEach(item=>{
        if(S.stock[item.name]!==undefined)
          S.stock[item.name]=Math.max(0,S.stock[item.name]-item.qty);
      });
      // หักกล่อง FIFO
      const od=new Date(o.date.includes('/')?o.date.split('/').reverse().join('-'):o.date);
      if(od>=BOX_FIFO_START&&o.totalQty>0){
        const useB=o.hasCorn6||o.totalQty>=5;
        const useAB=!useB&&o.totalQty>=3;
        if(useB) deductBoxFifo('B',1);
        else if(useAB) deductBoxFifo('AB',1);
      }
    }
  });

  // sync ลูกค้า: อัปเดต lastSeen ออเดอร์เก่า + ใหม่ที่ import เข้ามา
  const syncList=[...(pendingShopeeOrders||[]),...(pendingShopeeStatusUpdates||[]).map(u=>S.manualSales.find(x=>x.source==='shopee'&&x.id===u.id)).filter(Boolean)];
  const custSync=syncCustomersFromImport(syncList);

  // recalcAllFifo จะข้ามออเดอร์ stockCutoff=false อัตโนมัติ (ดู filter ใน recalcAllFifo)
  recalcAllFifo();
  recalcDeliveryCosts();
  saveState();

  pendingShopeeXLSX=null; pendingShopeeOrders=null; pendingShopeeStatusUpdates=null;
  document.getElementById('import-shopee-preview').style.display='none';
  document.getElementById('shopee-status').innerHTML='';
  document.getElementById('inp-shopee').value='';

  const sParts=[`Import Shopee ${saved} ออเดอร์`];
  if(updated)sParts.push(`อัพเดท ${updated}`);
  if(custSync.knownCount>0)sParts.push(`👥 ลูกค้าเก่า ${custSync.knownCount} คน`);
  if(custSync.newCount>0)sParts.push(`🆕 ใหม่ ${custSync.newCount} username`);
  showNotif(sParts.join(' · ')+' ✅');
  renderDryStock();renderOverview();renderManualList();renderBoxStock();
}

function cancelShopeeImport(){
  pendingShopeeXLSX=null; pendingShopeeOrders=null; pendingShopeeStatusUpdates=null;
  document.getElementById('import-shopee-preview').style.display='none';
}

// ===================== PROFIT =====================
let profitChart=null,qtyChart=null;

function clearOverviewFilters(){
  document.getElementById('filter-year').value='';
  document.getElementById('filter-month').value='';
  renderOverview();
}

function renderOverview(){
  const fyear=document.getElementById('filter-year')?.value||'';
  const fmonth=document.getElementById('filter-month')?.value||'';

  // Populate year dropdown
  const yearEl=document.getElementById('filter-year');
  if(yearEl){
    const allYears=[...new Set([...S.orders,...(S.manualSales||[])].map(o=>{
      const p=o.date?.split('/');return p?.length===3?p[2]:null;
    }).filter(Boolean))].sort().reverse();
    const currentYears=new Set([...yearEl.options].map(o=>o.value).filter(Boolean));
    allYears.forEach(y=>{if(!currentYears.has(y)){const opt=document.createElement('option');opt.value=y;opt.textContent=`พ.ศ. ${parseInt(y)+543}`;yearEl.appendChild(opt);}});
  }

  const allOrders=[...S.orders,...(S.manualSales||[])].filter(o=>{
    if(!o.date)return false;
    if(o.returned)return false; // ออเดอร์ที่คืนแล้วไม่นับในภาพรวม
    const p=o.date.split('/');
    if(p.length!==3)return true;
    if(fyear&&p[2]!==fyear)return false;
    if(fmonth&&p[1]!==fmonth)return false;
    return true;
  });

  // Update filter label
  const labelEl=document.getElementById('overview-filter-label');
  if(labelEl){
    const monthNames=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    if(fyear||fmonth) labelEl.textContent=`แสดง: ${fmonth?monthNames[parseInt(fmonth)]:'ทุกเดือน'} ${fyear?'พ.ศ.'+(parseInt(fyear)+543):'ทุกปี'} (${allOrders.length} ออเดอร์)`;
    else labelEl.textContent='';
  }
  const orders=allOrders;
  const tr=orders.reduce((s,o)=>s+o.revenue,0),tc=orders.reduce((s,o)=>s+o.totalCost,0),tp=orders.reduce((s,o)=>s+o.profit,0);
  const done=orders.filter(o=>o.status==='เสร็จสมบูรณ์');
  const dp=done.reduce((s,o)=>s+o.profit,0);
  const dr=done.reduce((s,o)=>s+o.revenue,0),margin=dr>0?(dp/dr*100):0;
  const sv=Object.entries(S.stock).reduce((s,[n,q])=>s+q*(getFifoCost(n)||0),0);
  const tiktokOrders=S.orders.length,manualOrders=(S.manualSales||[]).length;
  // ตัวกรองเดือน/ปีสำหรับ record ที่เก็บวันที่แบบ YYYY-MM-DD (adjustments, returns, freshPurchases)
  const matchYM=ds=>{
    if(!ds)return false;
    const p=String(ds).split('-'); // YYYY-MM-DD
    if(p.length<2)return true;
    if(fyear&&p[0]!==fyear)return false;
    if(fmonth&&p[1]!==fmonth)return false;
    return true;
  };
  // ตัวกรองสำหรับ orders (DD/MM/YYYY) — รวมออเดอร์ที่คืนแล้วด้วย เพราะค่าส่งจ่ายจริง
  const matchOrderYM=o=>{
    if(!o.date)return false;
    const p=o.date.split('/');
    if(p.length!==3)return true;
    if(fyear&&p[2]!==fyear)return false;
    if(fmonth&&p[1]!==fmonth)return false;
    return true;
  };
  const dryAdjF=(S.dryAdjustments||[]).filter(a=>matchYM(a.date));
  const boxAdjF=(S.boxAdjustments||[]).filter(a=>matchYM(a.date));
  const returnsF=(S.orderReturns||[]).filter(r=>matchYM(r.date));
  const dryLoss=round2(dryAdjF.reduce((s,a)=>s+a.totalCost,0));
  const boxLoss=round2(boxAdjF.reduce((s,a)=>s+a.cost,0));
  const totalLoss=round2(dryLoss+boxLoss);
  const returnCount=returnsF.length;
  const returnLoss=round2(returnsF.reduce((s,r)=>s+r.totalLoss,0));
  const totalDeliveryTT=round2([...S.orders,...(S.manualSales||[])].filter(matchOrderYM).reduce((s,o)=>s+(o.deliveryCost||0),0));
  const totalTravelFresh=round2(S.freshPurchases.filter(p=>!p.isAdjust&&matchYM(p.date)).reduce((s,p)=>s+(p.travel||0),0));
  const totalTransport=round2(totalDeliveryTT+totalTravelFresh);
  document.getElementById('overview-stats').innerHTML=`
    <div class="stat-card"><div class="s-label">รายได้รวม (${orders.length} ออเดอร์)</div><div class="s-val s-blue">฿${tr.toFixed(0)}</div><div class="s-sub">TikTok ${tiktokOrders} | อื่นๆ ${manualOrders}</div></div>
    <div class="stat-card"><div class="s-label">ต้นทุนรวม</div><div class="s-val s-accent">฿${tc.toFixed(0)}</div></div>
    <div class="stat-card"><div class="s-label">กำไรสุทธิรวม</div><div class="s-val ${tp>=0?'s-green':'s-red'}">฿${tp.toFixed(0)}</div></div>
    <div class="stat-card"><div class="s-label">กำไรเสร็จสมบูรณ์</div><div class="s-val s-green">฿${dp.toFixed(0)}</div><div class="s-sub">${done.length} ออเดอร์</div></div>
    <div class="stat-card"><div class="s-label">Margin เฉลี่ย</div><div class="s-val s-blue">${margin.toFixed(1)}%</div></div>
    <div class="stat-card"><div class="s-label">มูลค่าสต็อก</div><div class="s-val s-accent">฿${sv.toFixed(0)}</div><div class="s-sub">${Object.values(S.stock).reduce((s,v)=>s+v,0)} ถุง</div></div>
    <div class="stat-card"><div class="s-label">ของสูญเสีย 🐹</div><div class="s-val s-red">฿${totalLoss.toFixed(0)}</div><div class="s-sub">ถุง ฿${dryLoss.toFixed(0)} (${dryAdjF.length}) | กล่อง ฿${boxLoss.toFixed(0)} (${boxAdjF.length})</div></div>
    ${returnCount>0?`<div class="stat-card"><div class="s-label">↩ คืนออเดอร์</div><div class="s-val s-red">฿${returnLoss.toFixed(0)}</div><div class="s-sub">${returnCount} ออเดอร์</div></div>`:''}
    <div class="stat-card"><div class="s-label">ค่าขนส่งรวม 🚗</div><div class="s-val s-red">฿${totalTransport.toFixed(0)}</div><div class="s-sub">ส่งออเดอร์ ฿${totalDeliveryTT.toFixed(0)} | ซื้อผัก ฿${totalTravelFresh.toFixed(0)}</div></div>
    ${(()=>{const vel=getStockVelocity();const soonest=Object.entries(vel).filter(([,v])=>v.daysLeft!==null&&v.daysLeft<=7).sort(([,a],[,b])=>a.daysLeft-b.daysLeft)[0];return `<div class="stat-card"><div class="s-label">⚠️ สต็อกวิกฤต</div><div class="s-val ${soonest?'s-red':'s-green'}">${soonest?soonest[1].daysLeft+' วัน':'-'}</div><div class="s-sub">${soonest?PRODUCT_ICONS[soonest[0]]+' '+soonest[0]+' ใกล้หมดก่อน':'ปกติทุกชนิด ✅'}</div></div>`;})()}`;
  const pd={};
  orders.forEach(o=>o.items.forEach(item=>{
    if(!pd[item.name])pd[item.name]={qty:0,rev:0,cost:0,profit:0};
    const sh=o.totalQty>0?item.qty/o.totalQty:0;
    pd[item.name].qty+=item.qty;pd[item.name].rev+=o.revenue*sh;pd[item.name].cost+=o.totalCost*sh;pd[item.name].profit+=o.profit*sh;
  }));
  // Daily profit chart (30 วันล่าสุด)
  const dailyMap={};
  [...S.orders,...(S.manualSales||[])].forEach(o=>{
    const d=o.date;if(!d)return;
    if(!dailyMap[d])dailyMap[d]={rev:0,profit:0};
    dailyMap[d].rev+=o.revenue;dailyMap[d].profit+=o.profit;
  });
  const sortedDays=Object.keys(dailyMap).sort((a,b)=>parseOrderDate(a)-parseOrderDate(b)).slice(-30);
  const dailyLabels=sortedDays.map(d=>{const p=d.split('/');return p.length===3?`${p[0]}/${p[1]}`:d;});
  const dailyProfits=sortedDays.map(d=>round2(dailyMap[d].profit));
  const dailyRevs=sortedDays.map(d=>round2(dailyMap[d].rev));
  if(window._dailyChart)window._dailyChart.destroy();
  const dc=document.getElementById('chart-daily');
  if(dc)window._dailyChart=new Chart(dc,{type:'bar',
    data:{labels:dailyLabels,datasets:[
      {label:'กำไร',data:dailyProfits,backgroundColor:'rgba(58,124,92,.7)',borderRadius:4},
      {label:'รายได้',data:dailyRevs,backgroundColor:'rgba(45,111,164,.2)',borderRadius:4,type:'line',borderColor:'rgba(45,111,164,.7)',fill:false,tension:.3}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{family:'IBM Plex Sans Thai'}}}},
      scales:{y:{ticks:{callback:v=>'฿'+v.toFixed(0)}}}}});
  const sorted=Object.entries(pd).sort((a,b)=>b[1].profit-a[1].profit);
  document.getElementById('product-summary-tbody').innerHTML=sorted.map(([name,d],i)=>{
    const m=d.rev>0?(d.profit/d.rev*100):0;
    return `<tr><td><b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '} ${PRODUCT_ICONS[name]||'🌿'} ${name}</b></td><td class="text-right">${d.qty}</td><td class="text-right">฿${d.rev.toFixed(0)}</td><td class="text-right">฿${d.cost.toFixed(0)}</td><td class="text-right ${d.profit>=0?'profit-pos':'profit-neg'}">฿${d.profit.toFixed(0)}</td><td class="text-right">฿${d.qty>0?(d.profit/d.qty).toFixed(2):'0'}</td><td class="text-right">${m.toFixed(1)}%</td></tr>`;
  }).join('');
  const labels=sorted.map(([n])=>n),profits=sorted.map(([,d])=>round2(d.profit)),qtys=sorted.map(([,d])=>d.qty);
  const colors=['#3a7c5c','#c8873a','#2d6fa4','#c0392b','#d4a017','#7b5ea7','#2980b9','#27ae60','#e67e22'];
  if(profitChart)profitChart.destroy();
  profitChart=new Chart(document.getElementById('chart-profit'),{type:'bar',data:{labels,datasets:[{data:profits,backgroundColor:colors,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'฿'+v.toFixed(0)}}}}});
  if(qtyChart)qtyChart.destroy();
  qtyChart=new Chart(document.getElementById('chart-qty'),{type:'doughnut',data:{labels,datasets:[{data:qtys,backgroundColor:colors}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{family:'IBM Plex Sans Thai'}}}}}});
}

function parseOrderDate(d){if(!d)return new Date(0);if(d.includes('/'))return new Date(d.split('/').reverse().join('-'));return new Date(d);}
// datetime-local ต้องเป็นเวลา local (ไม่ใช่ UTC) — toISOString() คืน UTC ทำให้เพี้ยน -7 ชม.
function getLocalDatetimeString(){const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function clearOrderFilters(){document.getElementById('filter-status').value='';document.getElementById('filter-platform').value='';document.getElementById('filter-date-from').value='';document.getElementById('filter-date-to').value='';renderOrders();}

function getPlatformLabel(o){
  if(!o.source || o.source==='tiktok') return {label:'🎵 TikTok', color:'#e05545'};
  if(o.platform==='Shopee') return {label:'🛍️ Shopee', color:'#e8750a'};
  return {label:'🏪 '+(o.platform||'อื่นๆ'), color:'var(--green)'};
}

function matchOrderPlatform(o, fp){
  if(!fp) return true;
  if(fp==='tiktok') return !o.source || o.source==='tiktok';
  if(fp==='shopee') return o.platform==='Shopee';
  if(fp==='facebook') return o.platform==='Facebook';
  if(fp==='linoa') return o.platform==='Line OA';
  if(fp==='other') return !!o.source && o.source!=='tiktok' && !['Shopee','Facebook','Line OA'].includes(o.platform);
  return true;
}

function renderOrders(){
  const fs=document.getElementById('filter-status').value,ff=document.getElementById('filter-date-from').value,ft=document.getElementById('filter-date-to').value;
  const fp=document.getElementById('filter-platform')?.value||'';
  let orders=[...S.orders,...(S.manualSales||[])];
  if(fs)orders=orders.filter(o=>o.status===fs);
  if(fp)orders=orders.filter(o=>matchOrderPlatform(o,fp));
  if(ff)orders=orders.filter(o=>parseOrderDate(o.date)>=new Date(ff));
  if(ft)orders=orders.filter(o=>parseOrderDate(o.date)<=new Date(ft+'T23:59:59'));
  const sorted=[...orders].sort((a,b)=>parseOrderDate(b.date)-parseOrderDate(a.date));
  const tr=sorted.reduce((s,o)=>s+o.revenue,0),tp=sorted.reduce((s,o)=>s+(o.status==='เสร็จสมบูรณ์'?o.profit:0),0);
  document.getElementById('order-count').textContent=`${sorted.length} ออเดอร์ | รายได้ ฿${tr.toFixed(0)} | กำไร ฿${tp.toFixed(0)}`;
  document.getElementById('orders-tbody').innerHTML=sorted.map(o=>{
    const done=o.status==='เสร็จสมบูรณ์';
    const showProfit=done&&!o.returned?o.profit:0;
    const m=done&&!o.returned&&o.revenue>0?(o.profit/o.revenue*100):0;
    const pl=getPlatformLabel(o);
    const delFn=o.source==='manual'||o.source==='shopee'?`deleteManualSale('${o.id}')`:`deleteTikTokOrder('${o.id}')`;
    const returnedBadge=o.returned?` <span class="badge" style="background:var(--red);color:#fff;font-size:.7rem">↩ คืนแล้ว</span>`:'';
    const profitStyle=o.returned?'text-decoration:line-through;opacity:.5':'';
    return `<tr${o.returned?' style="opacity:.75"':''}><td style="font-family:monospace;font-size:.75rem;color:var(--text2)">${o.id.slice(-8)}</td><td>${o.date}</td><td><span class="badge" style="background:${pl.color};color:#fff">${pl.label}</span>${returnedBadge}</td><td><span class="badge ${statusBadge(o.status)}">${o.status}</span></td><td style="max-width:200px;white-space:normal;font-size:.78rem">${o.items.map(i=>`${PRODUCT_ICONS[i.name]||''}${i.name}×${i.qty}`).join(', ')}</td><td class="text-right">${o.totalQty}</td><td class="text-right">฿${o.revenue.toFixed(2)}</td><td class="text-right">฿${o.productCost.toFixed(2)}</td><td class="text-right">฿${o.packCost.toFixed(2)}</td><td class="text-right">฿${o.tiktokFee.toFixed(2)}</td><td class="text-right ${showProfit>=0?'profit-pos':'profit-neg'}" style="${profitStyle}">฿${showProfit.toFixed(2)}</td><td class="text-right">${m.toFixed(1)}%</td><td><button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="${delFn}">${_ICON_TRASH}</button></td></tr>`;
  }).join('');
}

function deleteFilteredOrders(){
  const fs=document.getElementById('filter-status').value,ff=document.getElementById('filter-date-from').value,ft=document.getElementById('filter-date-to').value;
  const fp=document.getElementById('filter-platform')?.value||'';
  let orders=[...S.orders,...(S.manualSales||[])];
  if(fs)orders=orders.filter(o=>o.status===fs);
  if(fp)orders=orders.filter(o=>matchOrderPlatform(o,fp));
  if(ff)orders=orders.filter(o=>parseOrderDate(o.date)>=new Date(ff));
  if(ft)orders=orders.filter(o=>parseOrderDate(o.date)<=new Date(ft+'T23:59:59'));
  if(!orders.length){showNotif('ไม่มีออเดอร์ที่ตรงกับ filter','error');return;}
  if(!confirm(`ลบ ${orders.length} ออเดอร์ที่ตรงกับ filter? สต็อกทั้งหมดจะถูกปรับกลับ\n(กดยืนยันอีกครั้งเพื่อยืนยัน)`))return;
  if(!confirm(`ยืนยันลบ ${orders.length} ออเดอร์? ทำแล้วย้อนกลับไม่ได้`))return;
  orders.forEach(o=>{
    // คืนสต็อกถุงอบแห้ง (เว้น Shopee ที่ stockCutoff=false)
    if(o.stockCutoff!==false){
      o.items.forEach(i=>{if(S.stock[i.name]!==undefined)S.stock[i.name]=(S.stock[i.name]||0)+i.qty;});
      // คืนกล่อง FIFO
      const od=new Date(o.date.includes('/')?o.date.split('/').reverse().join('-'):o.date);
      if(od>=BOX_FIFO_START&&o.totalQty>0){
        const useB=o.hasCorn6||o.totalQty>=5;
        const useAB=!useB&&o.totalQty>=3;
        const type=useB?'B':useAB?'AB':null;
        if(type){
          const lot=(S.boxLots||[]).filter(l=>l.type===type&&(l.usedQty||0)>0).sort((a,b)=>b.date.localeCompare(a.date))[0];
          if(lot)lot.usedQty=Math.max(0,(lot.usedQty||0)-1);
        }
      }
    }
  });
  const ids=[...new Set(orders.map(o=>o.id))];
  const idSet=new Set(ids);
  S.orders=S.orders.filter(o=>!idSet.has(o.id));
  S.manualSales=(S.manualSales||[]).filter(o=>!idSet.has(o.id));
  // ลบ record คืน/ขาดทุนกล่องที่ผูกกับออเดอร์ที่ลบ (กัน loss ผีค้าง)
  S.orderReturns=(S.orderReturns||[]).filter(r=>!idSet.has(r.orderId));
  S.boxAdjustments=(S.boxAdjustments||[]).filter(a=>!(a.reason==='คืนออเดอร์'&&idSet.has(a.orderId)));
  removeFromDeliveryRounds(ids);
  recalcAllFifo();saveState();
  renderOrders();renderDryStock();renderBoxStock();renderOverview();renderManualList();renderDeliveryRounds();
  showNotif(`ลบ ${orders.length} ออเดอร์แล้ว สต็อกปรับกลับแล้ว ✅`);
}

// ลบ order IDs ออกจาก deliveryRounds — รอบที่ว่างเปล่าจะถูกลบ, รอบที่ยังมีออเดอร์จะ recalc costPerOrder
function removeFromDeliveryRounds(ids){
  const idSet=new Set(ids);
  S.deliveryRounds=(S.deliveryRounds||[]).filter(r=>{
    r.orderIds=r.orderIds.filter(x=>!idSet.has(x));
    if(!r.orderIds.length)return false; // ลบรอบที่ไม่มีออเดอร์เหลือ
    const{costPerTrip}=calcDeliveryCost(r.orderIds.length);
    r.costPerOrder=round2(costPerTrip/r.orderIds.length);
    r.count=r.orderIds.length;
    // อัพเดท deliveryCost ของออเดอร์ที่เหลือในรอบ
    r.orderIds.forEach(oid=>{
      const o=S.orders.find(x=>x.id===oid)||(S.manualSales||[]).find(x=>x.id===oid);
      if(!o)return;
      const isManual=!!(S.manualSales||[]).find(x=>x.id===oid);
      o.deliveryCost=r.costPerOrder;
      const base=o.productCost+o.packCost+o.tiktokFee+r.costPerOrder;
      o.totalCost=round2(isManual?base+(o.shippingCost||0):base);
      o.profit=round2(o.revenue-o.totalCost);
    });
    return true;
  });
}

function deleteTikTokOrder(id){
  if(!confirm('ลบออเดอร์นี้? สต็อกจะถูกปรับกลับ'))return;
  const o=S.orders.find(x=>x.id===id);
  if(!o){showNotif('ไม่พบออเดอร์','error');return;}
  // คืนสต็อกถุงอบแห้ง
  o.items.forEach(i=>{if(S.stock[i.name]!==undefined)S.stock[i.name]=(S.stock[i.name]||0)+i.qty;});
  // คืนกล่อง FIFO
  const od=new Date(o.date.includes('/')?o.date.split('/').reverse().join('-'):o.date);
  if(od>=BOX_FIFO_START&&o.totalQty>0){
    const useB=o.hasCorn6||o.totalQty>=5;
    const useAB=!useB&&o.totalQty>=3;
    const type=useB?'B':useAB?'AB':null;
    if(type){
      const lot=(S.boxLots||[]).filter(l=>l.type===type&&(l.usedQty||0)>0).sort((a,b)=>b.date.localeCompare(a.date))[0];
      if(lot)lot.usedQty=Math.max(0,(lot.usedQty||0)-1);
    }
  }
  S.orders=S.orders.filter(x=>x.id!==id);
  // ลบ record คืน/ขาดทุนกล่องที่ผูกกับออเดอร์นี้ (กัน loss ผีค้าง)
  S.orderReturns=(S.orderReturns||[]).filter(r=>r.orderId!==id);
  S.boxAdjustments=(S.boxAdjustments||[]).filter(a=>!(a.reason==='คืนออเดอร์'&&a.orderId===id));
  removeFromDeliveryRounds([id]);
  recalcAllFifo();saveState();
  renderOrders();renderDryStock();renderBoxStock();renderOverview();renderDeliveryRounds();
  showNotif('ลบแล้ว สต็อกปรับกลับแล้ว ✅');
}

function saveDeliverySettings(){
  const s=S.settings;
  s.fuel91=parseFloat(document.getElementById('set-fuel91').value)||43.68;
  s.fuel95=parseFloat(document.getElementById('set-fuel95').value)||44.05;
  s.motoKmpl=parseFloat(document.getElementById('set-moto-kmpl').value)||45.3;
  s.carKmpl=parseFloat(document.getElementById('set-car-kmpl').value)||23.6;
  s.deliveryKm=parseFloat(document.getElementById('set-delivery-km').value)||4;
  s.carThreshold=parseInt(document.getElementById('set-car-threshold').value)||14;
  s.deliveryStart=document.getElementById('set-delivery-start').value||'2026-05-23';
  saveState();showNotif('บันทึกค่าขนส่งแล้ว ✅');
}

// คำนวณค่าน้ำมันต่อรอบส่ง
function calcDeliveryCost(orderCount){
  const s=S.settings;
  const km=s.deliveryKm||4;
  if(orderCount>=(s.carThreshold||14)){
    const costPerTrip=round2((km/(s.carKmpl||23.6))*(s.fuel95||44.05));
    return{costPerTrip,vehicle:'🚗 รถยนต์',costPerOrder:round2(costPerTrip/orderCount)};
  } else {
    const costPerTrip=round2((km/(s.motoKmpl||45.3))*(s.fuel91||43.68));
    return{costPerTrip,vehicle:'🛵 Scoopy',costPerOrder:round2(costPerTrip/orderCount)};
  }
}

// คำนวณและ assign ค่าขนส่งให้ออเดอร์ใน batch
// - ออเดอร์ที่มี shippedDate (TikTok, Shopee จัดส่งแล้ว) → group ±60 นาที
// - ออเดอร์ที่มีเฉพาะวันที่ (manual FB/Line OA) → attach เข้ารอบใหญ่สุดของวันเดียวกัน
//   ถ้าไม่มีรอบใด ๆ ในวันนั้น → ตั้งรอบใหม่จาก manuals ของวันนั้น
// newOnly=true → คำนวณเฉพาะออเดอร์ที่ deliveryCost===0 (ยังไม่เคย assign)
// newOnly=false (default) → คำนวณทุกออเดอร์ (ใช้ตอนลบออเดอร์ออกจากรอบ)
function calcDeliveryForOrders(orders, manuals, newOnly=true){
  const s=S.settings;
  const startDate=new Date(s.deliveryStart||'2026-05-23');
  const ROUND_GAP=60*60*1000; // 60 นาที

  const tagged=[
    ...(orders||[]).map(o=>({o,isManual:false})),
    ...(manuals||[]).map(o=>({o,isManual:true}))
  ].filter(({o})=>!newOnly||(o.deliveryCost||0)===0); // freeze ถ้า newOnly=true

  const toDate=str=>new Date(str.includes('/')?str.split('/').reverse().join('-'):str);
  const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const strDateKey=str=>{const d=toDate(str);return dateKey(d);};

  const withTime=[];
  const dateOnly={};

  tagged.forEach(({o,isManual})=>{
    const ref=o.shippedDate||o.date;
    if(!ref)return;
    if(parseDate(ref)<startDate)return;
    if(o.shippedDate){
      const dt=toDate(o.shippedDate);
      withTime.push({o,isManual,dt,dateKey:dateKey(dt)});
    } else {
      const k=strDateKey(o.date);
      (dateOnly[k]=dateOnly[k]||[]).push({o,isManual});
    }
  });

  // Time-based ±60 นาที (TikTok/Shopee shippedDate)
  withTime.sort((a,b)=>a.dt-b.dt);
  const rounds=[];
  let current=[];
  withTime.forEach(item=>{
    if(!current.length || item.dt-current[current.length-1].dt<=ROUND_GAP){
      current.push(item);
    } else {
      rounds.push(current);
      current=[item];
    }
  });
  if(current.length)rounds.push(current);

  // Attach manual date-only → รอบใหญ่สุดของวันเดียวกัน, ไม่มี → ตั้งรอบใหม่
  Object.entries(dateOnly).forEach(([k,grp])=>{
    const sameDay=rounds.filter(rnd=>rnd[0].dateKey===k);
    if(sameDay.length){
      sameDay.sort((a,b)=>b.length-a.length);
      sameDay[0].push(...grp);
    } else {
      rounds.push(grp);
    }
  });

  // คำนวณค่าส่งต่อรอบ
  rounds.forEach(rnd=>{
    if(!rnd.length)return;
    const count=rnd.length;
    const{costPerOrder}=calcDeliveryCost(count);
    rnd.forEach(({o,isManual})=>{
      o.deliveryCost=costPerOrder;
      const base=o.productCost+o.packCost+o.tiktokFee+costPerOrder;
      o.totalCost=round2(isManual?base+(o.shippingCost||0):base);
      o.profit=round2(o.revenue-o.totalCost);
    });
  });
}

// Recalculate delivery costs for all existing orders
function recalcDeliveryCosts(){
  calcDeliveryForOrders(S.orders, S.manualSales);
  saveState();
}

// ===================== BOX FIFO =====================
const BOX_FIFO_START = new Date('2026-05-23T15:00:00');
const BOX_INITIAL_LOTS = [
  {id:'box-init-AB-1',type:'AB',date:'2026-05-23',qty:68,usedQty:0,pricePerBox:2.35,isInit:true},
  {id:'box-init-B-1', type:'B', date:'2026-05-23',qty:4, usedQty:0,pricePerBox:2.95,isInit:true},
  {id:'box-init-B-2', type:'B', date:'2026-05-23',qty:60,usedQty:0,pricePerBox:3.30,isInit:true},
];

function initBoxLots(){
  if(!S.boxLots) S.boxLots=JSON.parse(JSON.stringify(BOX_INITIAL_LOTS));
}

function getBoxStock(type){
  return (S.boxLots||[]).filter(l=>l.type===type).reduce((s,l)=>s+l.qty-(l.usedQty||0),0);
}

function getFifoBoxCost(type){
  // หา Lot ที่ยังมีของเหลือก่อน
  const lots=(S.boxLots||[]).filter(l=>l.type===type&&(l.qty-(l.usedQty||0))>0).sort((a,b)=>a.date.localeCompare(b.date));
  if(lots.length>0)return lots[0].pricePerBox;
  // fallback: ใช้ราคา Lot ล่าสุดถึงแม้จะหมดแล้ว
  const allLots=(S.boxLots||[]).filter(l=>l.type===type).sort((a,b)=>b.date.localeCompare(a.date));
  return allLots.length>0?allLots[0].pricePerBox:0;
}

function deductBoxFifo(type,qty){
  const lots=(S.boxLots||[]).filter(l=>l.type===type&&(l.qty-(l.usedQty||0))>0).sort((a,b)=>a.date.localeCompare(b.date));
  let rem=qty;
  for(const l of lots){if(rem<=0)break;const take=Math.min(l.qty-(l.usedQty||0),rem);l.usedQty=round2((l.usedQty||0)+take);rem-=take;}
}

// คำนวณค่าแพ็คจาก FIFO กล่อง (ใช้หลัง BOX_FIFO_START)
function getPackCostFifo(totalQty, hasCorn6, orderDate){
  const od = orderDate ? new Date(orderDate.includes('/')?orderDate.split('/').reverse().join('-'):orderDate) : new Date();
  if(od < BOX_FIFO_START){
    // ก่อน FIFO start → ใช้ settings เดิม
    return getPackCost(totalQty, hasCorn6);
  }
  // หลัง FIFO start → ดึงราคาจาก FIFO lots
  const useB = hasCorn6 || totalQty >= 5;
  const useAB = !useB && totalQty >= 3;
  const bubbleCost = 0.50; // ค่าบับเบิ้ลคงที่
  const stickerPerBag = S.settings.sticker || 0;
  if(useB){
    const boxCost = getFifoBoxCost('B');
    return round2(boxCost + bubbleCost + stickerPerBag * totalQty);
  } else if(useAB){
    const boxCost = getFifoBoxCost('AB');
    return round2(boxCost + bubbleCost + stickerPerBag * totalQty);
  } else {
    // 1-2 ถุง ใช้แค่บับเบิ้ล
    return round2(bubbleCost + stickerPerBag * totalQty);
  }
}

function saveBoxLot(){
  const type=document.getElementById('box-type').value;
  const date=document.getElementById('box-date').value;
  const qty=parseInt(document.getElementById('box-qty').value)||0;
  const price=parseFloat(document.getElementById('box-price').value)||0;
  if(!date||qty<=0||price<=0){showNotif('กรุณากรอกข้อมูลให้ครบ','error');return;}
  if(!S.boxLots)S.boxLots=[];
  S.boxLots.push({id:'box-'+Date.now(),type,date,qty,usedQty:0,pricePerBox:price,isInit:false});
  saveState();renderBoxStock();renderBoxLots();
  document.getElementById('box-qty').value='';
  document.getElementById('box-price').value='';
  showNotif(`บันทึก กล่อง ${type} ${qty} ใบ ฿${price}/ใบ ✅`);
}

function renderBoxStock(){
  const g=document.getElementById('box-stock-grid');if(!g)return;
  const types=[{id:'AB',label:'กล่อง AB',icon:'📦',desc:'3-4 ถุง'},{id:'B',label:'กล่อง B',icon:'📫',desc:'5+ ถุง'}];
  g.innerHTML=types.map(t=>{
    const qty=getBoxStock(t.id);
    const cpb=getFifoBoxCost(t.id);
    const pct=Math.min((qty/100)*100,100);
    const cls=qty<=5?'stock-low':qty<=20?'stock-med':'';
    return `<div class="prod-card ${cls}">
      <div class="pc-icon">${t.icon}</div>
      <div class="pc-name">${t.label}</div>
      <div class="pc-stock">${qty} ใบเหลือ</div>
      <div class="pc-cost">${cpb>0?'฿'+cpb.toFixed(2)+'/ใบ (FIFO)':'ไม่มีสต็อก'}</div>
      <div class="stock-bar ${cls}"><div class="stock-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderBoxLots(){
  const tbody=document.getElementById('box-lots-tbody');if(!tbody)return;
  const lots=(S.boxLots||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  if(!lots.length){tbody.innerHTML='<tr><td colspan="7"><div class="empty"><div class="ei">📦</div><p>ยังไม่มีข้อมูล</p></div></td></tr>';return;}
  tbody.innerHTML=lots.map(l=>`<tr style="${l.isInit?'background:rgba(245,166,35,.05)':''}">
    <td>${l.date}${l.isInit?' <span style="font-size:.7rem;background:var(--accent-light);color:var(--accent);padding:1px 5px;border-radius:4px">ตั้งต้น</span>':''}</td>
    <td><b>${l.type==='AB'?'📦 กล่อง AB':'📫 กล่อง B'}</b></td>
    <td class="text-right">${l.qty}</td>
    <td class="text-right">${l.usedQty||0}</td>
    <td class="text-right"><b>${l.qty-(l.usedQty||0)}</b></td>
    <td class="text-right" style="color:var(--accent);font-family:'IBM Plex Mono',monospace">฿${l.pricePerBox.toFixed(2)}</td>
    <td>${!l.isInit?`<button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="deleteBoxLot('${l.id}')">${_ICON_TRASH}</button>`:''}</td>
  </tr>`).join('');
}

function deleteBoxLot(id){
  if(!confirm('ลบ Lot กล่องนี้?'))return;
  S.boxLots=(S.boxLots||[]).filter(l=>l.id!==id);
  saveState();renderBoxStock();renderBoxLots();
}

function saveStickerSettings(){
  S.settings.sticker=parseFloat(document.getElementById('set-sticker').value)||0;
  saveState();showNotif('บันทึกราคาสติ๊กเกอร์แล้ว ✅');
}

// ===================== SETTINGS =====================
function renderSettings(){
  const s=S.settings;
  document.getElementById('set-bag1217').value=s.bag1217??0.66;document.getElementById('set-bag1220').value=s.bag1220??0.84;
  document.getElementById('set-bag1522').value=s.bag1522??1.10;document.getElementById('set-kanchuean').value=s.kanchuean??0.50;
  document.getElementById('set-pack1').value=s.pack1;document.getElementById('set-pack2').value=s.pack2;document.getElementById('set-pack3').value=s.pack3;
  document.getElementById('set-elec').value=s.elec;
  document.getElementById('set-sticker').value=s.sticker??0.181;
  document.getElementById('set-fuel91').value=s.fuel91??43.68;
  document.getElementById('set-fuel95').value=s.fuel95??44.05;
  document.getElementById('set-moto-kmpl').value=s.motoKmpl??45.3;
  document.getElementById('set-car-kmpl').value=s.carKmpl??23.6;
  document.getElementById('set-delivery-km').value=s.deliveryKm??4;
  document.getElementById('set-car-threshold').value=s.carThreshold??14;
  document.getElementById('set-delivery-start').value=s.deliveryStart??'2026-05-23';
  const toHM=h=>`${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round((h%1)*60)).padStart(2,'0')}`;
  document.getElementById('set-bake-start').value=toHM(s.bakeStartHour??10);
  document.getElementById('set-bake-end').value=toHM(s.bakeEndHour??22);
}
function saveBagSettings(){const s=S.settings;s.bag1217=parseFloat(document.getElementById('set-bag1217').value)||0;s.bag1220=parseFloat(document.getElementById('set-bag1220').value)||0;s.bag1522=parseFloat(document.getElementById('set-bag1522').value)||0;s.kanchuean=parseFloat(document.getElementById('set-kanchuean').value)||0;saveState();showNotif('บันทึกแล้ว ✅');}
function savePackSettings(){const s=S.settings;s.pack1=parseFloat(document.getElementById('set-pack1').value)||1.30;s.pack2=parseFloat(document.getElementById('set-pack2').value)||2.35;s.pack3=parseFloat(document.getElementById('set-pack3').value)||2.95;saveState();showNotif('บันทึกแล้ว ✅');}
function saveElecSettings(){S.settings.elec=parseFloat(document.getElementById('set-elec').value)||5;saveState();showNotif('บันทึกแล้ว ✅');}

// ===================== BACKUP =====================
function exportExcel(){
  const wb = XLSX.utils.book_new();
  const allOrders=[...S.orders,...(S.manualSales||[])];

  // Sheet 1: สรุปรายเดือน
  const monthMap={};
  allOrders.forEach(o=>{
    const d=o.date;if(!d)return;
    const parts=d.split('/');
    const key=parts.length===3?`${parts[2]}-${parts[1]}`:d.slice(0,7);
    if(!monthMap[key])monthMap[key]={month:key,orders:0,revenue:0,productCost:0,packCost:0,fee:0,deliveryCost:0,profit:0};
    const m=monthMap[key];
    m.orders++;m.revenue+=o.revenue;m.productCost+=o.productCost||0;
    m.packCost+=o.packCost||0;m.fee+=o.tiktokFee||0;
    m.deliveryCost+=(o.deliveryCost||0)+(o.shippingCost||0);m.profit+=o.profit;
  });
  const monthRows=[['เดือน','ออเดอร์','รายได้','ต้นทุนสินค้า','ค่าแพ็ค','TikTok Fee','ค่าขนส่ง','กำไร','Margin%']];
  Object.values(monthMap).sort((a,b)=>a.month.localeCompare(b.month)).forEach(m=>{
    const margin=m.revenue>0?round2(m.profit/m.revenue*100):0;
    monthRows.push([m.month,m.orders,round2(m.revenue),round2(m.productCost),round2(m.packCost),round2(m.fee),round2(m.deliveryCost),round2(m.profit),margin+'%']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(monthRows), 'สรุปรายเดือน');

  // Sheet 2: กำไรต่อชนิด
  const pd={};
  allOrders.forEach(o=>o.items.forEach(item=>{
    if(!pd[item.name])pd[item.name]={name:item.name,qty:0,revenue:0,productCost:0,profit:0};
    const ratio=o.totalQty>0?item.qty/o.totalQty:0;
    pd[item.name].qty+=item.qty;
    pd[item.name].revenue+=o.revenue*ratio;
    pd[item.name].productCost+=getFifoCost(item.name)*item.qty;
    pd[item.name].profit+=o.profit*ratio;
  }));
  const prodRows=[['ชนิด','ถุงที่ขาย','รายได้','ต้นทุน','กำไร','กำไร/ถุง','Margin%','อันดับ']];
  Object.values(pd).sort((a,b)=>b.profit-a.profit).forEach((d,i)=>{
    const margin=d.revenue>0?round2(d.profit/d.revenue*100):0;
    const ppb=d.qty>0?round2(d.profit/d.qty):0;
    prodRows.push([d.name,d.qty,round2(d.revenue),round2(d.productCost),round2(d.profit),ppb,margin+'%',i+1]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodRows), 'กำไรต่อชนิด');

  // Sheet 3: รายออเดอร์ทั้งหมด
  const orderRows=[['วันที่','Order ID','ช่องทาง','สถานะ','สินค้า','ซอง','รายได้','ต้นทุน','ค่าแพ็ค','Fee','ค่าขนส่ง','กำไร','Margin%']];
  allOrders.sort((a,b)=>parseOrderDate(a.date)-parseOrderDate(b.date)).forEach(o=>{
    const ch=o.source==='manual'?o.platform:'TikTok';
    const items=o.items.map(i=>`${i.name}×${i.qty}`).join(', ');
    const margin=o.revenue>0?round2(o.profit/o.revenue*100):0;
    orderRows.push([o.date,o.id||'',ch,o.status,items,o.totalQty,o.revenue,o.productCost||0,o.packCost||0,o.tiktokFee||0,(o.deliveryCost||0)+(o.shippingCost||0),o.profit,margin+'%']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orderRows), 'รายออเดอร์');

  // Sheet 4: สต็อกปัจจุบัน
  const stockRows=[['ชนิด','คงเหลือ (ถุง)','ต้นทุน FIFO/ถุง','มูลค่าสต็อก']];
  Object.entries(S.stock).forEach(([name,qty])=>{
    const cpb=getFifoCost(name);
    stockRows.push([name,qty,cpb,round2(qty*cpb)]);
  });
  stockRows.push(['','','รวมมูลค่าสต็อก',round2(Object.entries(S.stock).reduce((s,[n,q])=>s+q*getFifoCost(n),0))]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stockRows), 'สต็อกปัจจุบัน');

  const date=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `บ้านเจ้าหนู_report_${date}.xlsx`);
  showNotif('ดาวน์โหลด Report.xlsx แล้ว ✅');
}

function exportData(){
  const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hamster_snack_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();
  showNotif('ดาวน์โหลด backup แล้ว ✅');
}
function importData(inp){
  if(!inp.files[0])return;if(!confirm('⚠️ จะแทนที่ข้อมูลทั้งหมด ยืนยัน?'))return;
  const r=new FileReader();
  r.onload=e=>{
    try{setState(JSON.parse(e.target.result));fixAndRecalc();saveState();
      showNotif('Import สำเร็จ ✅');renderDryStock();renderFreshList();renderFreshStockGrid();renderOverview();
    }catch(err){showNotif('ไฟล์ไม่ถูกต้อง','error');}
  };r.readAsText(inp.files[0]);
}
function clearAllData(){if(!confirm('⚠️ ล้างข้อมูลทั้งหมด?'))return;localStorage.removeItem('hamsterSnackV3');location.reload();}

// ===================== DELIVERY ROUNDS =====================
function renderDeliveryRoundPicker(){
  const dt=document.getElementById('dr-datetime').value;
  const picker=document.getElementById('dr-order-picker');
  const preview=document.getElementById('dr-preview');
  if(!dt){picker.innerHTML='<div style="color:var(--text2);font-size:.83rem">เลือกวันที่และเวลาก่อนค่ะ</div>';preview.style.display='none';return;}
  const date=dt.slice(0,10);
  const assignedIds=new Set((S.deliveryRounds||[]).flatMap(r=>r.orderIds));

  // TikTok orders — normalize date to YYYY-MM-DD
  const ttOrders=S.orders.filter(o=>{
    const raw=o.shippedDate||o.date;
    const od=raw.includes('/')?raw.slice(0,10).split('/').reverse().join('-'):raw.slice(0,10);
    return od===date && ['จัดส่งแล้ว','ที่จะจัดส่ง','เสร็จสมบูรณ์'].includes(o.status) && !assignedIds.has(o.id);
  });

  // Manual orders — ใช้ shippedDate ถ้ามี (Shopee), ไม่งั้น fallback เป็น date (FB/Line OA)
  const manOrders=(S.manualSales||[]).filter(o=>{
    const raw=o.shippedDate||o.date;
    const od=raw.includes('/')?raw.slice(0,10).split('/').reverse().join('-'):raw.slice(0,10);
    return od===date && !assignedIds.has(o.id);
  });

  const allSelectable=[
    ...ttOrders.map(o=>({id:o.id,label:`🛒 TikTok ${o.id.slice(-8)} | ${o.items.map(i=>`${i.name}×${i.qty}`).join(', ')}`,source:'tiktok'})),
    ...manOrders.map(o=>({id:o.id,label:`🏪 ${o.platform} | ${o.items.map(i=>`${i.name}×${i.qty}`).join(', ')}`,source:'manual'}))
  ];

  if(!allSelectable.length){picker.innerHTML='<div style="color:var(--text2);font-size:.83rem">ไม่มีออเดอร์วันนี้ที่ยังไม่มีรอบส่ง</div>';preview.style.display='none';return;}

  picker.innerHTML=allSelectable.map(o=>`
    <label style="display:flex;gap:10px;align-items:center;padding:7px 6px;border-radius:6px;cursor:pointer;font-size:.83rem;border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${o.id}" data-source="${o.source}" onchange="updateDRPreview()" style="width:16px;height:16px;accent-color:var(--accent)">
      <span>${o.label}</span>
    </label>`).join('');
  preview.style.display='none';
}

function updateDRPreview(){
  const checked = document.querySelectorAll('#dr-order-picker input:checked');
  const div = document.getElementById('dr-preview');
  if(!checked.length){div.style.display='none';return;}
  const count = checked.length;
  const{costPerTrip,vehicle,costPerOrder}=calcDeliveryCost(count);
  div.innerHTML=`${vehicle} | ค่าน้ำมัน ฿${costPerTrip.toFixed(2)} ÷ ${count} ออเดอร์ = <b style="color:var(--accent)">฿${costPerOrder.toFixed(2)}/ออเดอร์</b>`;
  div.style.display='';
}

function saveDeliveryRound(){
  const dt=document.getElementById('dr-datetime').value;
  const checked = document.querySelectorAll('#dr-order-picker input:checked');
  if(!dt||!checked.length){showNotif('กรุณาเลือกวันที่/เวลาและออเดอร์','error');return;}
  const date=dt.slice(0,10);
  const round=dt.slice(11,16);

  const orderIds = [...checked].map(c=>({id:c.value, source:c.dataset.source}));
  const count = orderIds.length;
  const{costPerTrip,vehicle,costPerOrder}=calcDeliveryCost(count);

  // อัพเดท deliveryCost ของแต่ละออเดอร์
  orderIds.forEach(({id,source})=>{
    if(source==='tiktok'){
      const o=S.orders.find(x=>x.id===id);
      if(o){o.deliveryCost=costPerOrder;o.totalCost=round2(o.productCost+o.packCost+o.tiktokFee+costPerOrder);o.profit=round2(o.revenue-o.totalCost);}
    } else {
      const o=(S.manualSales||[]).find(x=>x.id===id);
      if(o){o.deliveryCost=costPerOrder;o.totalCost=round2(o.productCost+o.packCost+o.tiktokFee+(o.shippingCost||0)+costPerOrder);o.profit=round2(o.revenue-o.totalCost);}
    }
  });

  // บันทึกรอบส่ง
  if(!S.deliveryRounds)S.deliveryRounds=[];
  S.deliveryRounds.push({
    id:'dr-'+Date.now(), date, round, vehicle,
    costPerTrip, costPerOrder, count,
    orderIds: orderIds.map(o=>o.id)
  });

  saveState();renderDeliveryRounds();renderOverview();
  // reset
  document.getElementById('dr-datetime').value='';
  document.getElementById('dr-order-picker').innerHTML='<div style="color:var(--text2);font-size:.83rem">เลือกวันที่ก่อนค่ะ</div>';
  document.getElementById('dr-preview').style.display='none';
  showNotif(`บันทึกรอบส่ง ${round} ${count} ออเดอร์ ค่าน้ำมัน ฿${costPerTrip.toFixed(2)} ✅`);
}

// ===================== รวมแพ็คออเดอร์ =====================
function orderBoxType(o){ return (o.hasCorn6||o.totalQty>=5)?'B':o.totalQty>=3?'AB':null; }

function renderMergePackPicker(){
  const date=document.getElementById('mp-date').value;
  const picker=document.getElementById('mp-order-picker');
  if(!date){ picker.innerHTML='<div style="color:var(--text2);font-size:.83rem">เลือกวันที่ก่อนค่ะ</div>'; return; }
  const allOrders=[...S.orders,...(S.manualSales||[])].filter(o=>{
    const od=o.date.includes('/')?o.date.split('/').reverse().join('-'):o.date;
    return od===date && ['จัดส่งแล้ว','เสร็จสมบูรณ์','ที่จะจัดส่ง'].includes(o.status);
  });
  if(!allOrders.length){ picker.innerHTML='<div style="color:var(--text2);font-size:.83rem">ไม่มีออเดอร์วันนี้</div>'; return; }
  picker.innerHTML=allOrders.map(o=>{
    const platform=(!o.source||o.source==='tiktok')?'🎵':(o.source==='shopee'?'🛍️':'🏪');
    const items=(o.items||[]).map(i=>`${i.name}×${i.qty}`).join(', ');
    const bt=orderBoxType(o)||'-';
    const already=o.mergedBoxType?` <span style="color:var(--accent)">· รวมแพ็คแล้ว</span>`:'';
    return `<label style="display:flex;gap:10px;align-items:center;padding:7px 6px;border-radius:6px;cursor:pointer;font-size:.83rem;border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${o.id}" onchange="updateMergePackPreview()" style="width:16px;height:16px;accent-color:var(--accent)">
      <span style="flex:1">${platform} ${o.id.slice(-8)} | ${items}${already}</span>
      <span style="font-size:.75rem;color:var(--text2)">กล่อง ${bt}</span>
    </label>`;
  }).join('');
}

function updateMergePackPreview(){
  const checked=[...document.querySelectorAll('#mp-order-picker input:checked')];
  const preview=document.getElementById('mp-preview');
  if(checked.length<2){ preview.style.display='none'; return; }
  const boxType=document.getElementById('mp-box-type').value;
  const newBoxCost=getFifoBoxCost(boxType);
  const allOrders=[...S.orders,...(S.manualSales||[])];
  const selectedOrders=checked.map(c=>allOrders.find(o=>o.id===c.value)).filter(Boolean);
  const currentBoxCost=selectedOrders.reduce((s,o)=>{const bt=orderBoxType(o);return s+(bt?getFifoBoxCost(bt):0);},0);
  const saving=round2(currentBoxCost-newBoxCost);
  preview.innerHTML=`<div>📦 รวม ${checked.length} ออเดอร์ → ใช้กล่อง ${boxType} เพียง 1 ใบ (฿${newBoxCost.toFixed(2)})</div>
    <div style="margin-top:4px">💰 ประหยัดค่ากล่อง: <b style="color:var(--green)">฿${saving.toFixed(2)}</b> (จาก ฿${currentBoxCost.toFixed(2)} → ฿${newBoxCost.toFixed(2)})</div>`;
  preview.style.display='';
}

function saveMergedPack(){
  const date=document.getElementById('mp-date').value;
  const boxType=document.getElementById('mp-box-type').value;
  const note=document.getElementById('mp-note').value.trim();
  const checked=[...document.querySelectorAll('#mp-order-picker input:checked')];
  if(!date||checked.length<2){ showNotif('กรุณาเลือกวันที่และออเดอร์อย่างน้อย 2 ออเดอร์','error'); return; }
  const orderIds=checked.map(c=>c.value);
  const allOrders=[...S.orders,...(S.manualSales||[])];
  const boxCost=getFifoBoxCost(boxType);
  const restore=[]; // snapshot ค่าเดิม เพื่อให้ลบแล้วคืนค่าได้เป๊ะ
  orderIds.forEach((oid,idx)=>{
    const o=allOrders.find(x=>x.id===oid);
    if(!o) return;
    restore.push({id:oid,packCost:o.packCost,totalCost:o.totalCost,profit:o.profit});
    const oldBt=orderBoxType(o);
    const oldBoxCost=oldBt?getFifoBoxCost(oldBt):0;
    if(idx===0){
      o.packCost=round2(o.packCost-oldBoxCost+boxCost);
      o.mergedBoxType=boxType; o.mergedBoxCost=boxCost;
    } else {
      o.packCost=Math.max(0,round2(o.packCost-oldBoxCost));
      o.mergedBoxType='none'; o.mergedBoxCost=0;
    }
    o.totalCost=round2(o.productCost+o.packCost+(o.tiktokFee||0)+(o.deliveryCost||0)+(o.shippingCost||0));
    o.profit=round2(o.revenue-o.totalCost);
  });
  // คืนกล่อง FIFO ส่วนเกิน (จำนวนออเดอร์ - 1)
  const excessCount=orderIds.length-1;
  for(let i=0;i<excessCount;i++){
    const lot=(S.boxLots||[]).filter(l=>l.type===boxType&&(l.usedQty||0)>0).sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(lot) lot.usedQty=round2(Math.max(0,(lot.usedQty||0)-1));
  }
  if(!S.mergedPacks)S.mergedPacks=[];
  S.mergedPacks.push({id:'merge-'+Date.now(),date,orderIds,boxType,boxCost,note,savedBoxCount:excessCount,restore});
  saveState();
  renderBoxStock();renderBoxLots();renderOverview();renderManualList();renderOrders();renderMergedPacks();
  document.getElementById('mp-date').value='';
  document.getElementById('mp-note').value='';
  document.getElementById('mp-order-picker').innerHTML='<div style="color:var(--text2);font-size:.83rem">เลือกวันที่ก่อนค่ะ</div>';
  document.getElementById('mp-preview').style.display='none';
  showNotif(`รวมแพ็ค ${orderIds.length} ออเดอร์ ประหยัดกล่อง ${excessCount} ใบ ✅`);
}

function renderMergedPacks(){
  const tbody=document.getElementById('merged-packs-tbody');
  if(!tbody) return;
  const list=(S.mergedPacks||[]).slice().reverse();
  if(!list.length){ tbody.innerHTML='<tr><td colspan="5"><div class="empty"><div class="ei">📦</div><p>ยังไม่มีข้อมูล</p></div></td></tr>'; return; }
  tbody.innerHTML=list.map(m=>`<tr>
    <td>${m.date}</td>
    <td style="font-size:.78rem">${m.orderIds.map(id=>id.slice(-8)).join(', ')}</td>
    <td>${m.boxType==='AB'?'📦 AB':'📫 B'} × 1 ใบ</td>
    <td class="text-right s-green">ประหยัด ${m.savedBoxCount} ใบ</td>
    <td><button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="deleteMergedPack('${m.id}')">${_ICON_TRASH}</button></td>
  </tr>`).join('');
}

function deleteMergedPack(id){
  const m=(S.mergedPacks||[]).find(x=>x.id===id);
  if(!m) return;
  if(!confirm('ลบการรวมแพ็คนี้? ค่ากล่อง/ต้นทุนของออเดอร์จะกลับเป็นเหมือนก่อนรวมแพ็ค')) return;
  const allOrders=[...S.orders,...(S.manualSales||[])];
  // คืน packCost เดิมจาก snapshot แล้ว recompute totalCost/profit ด้วยค่าส่งปัจจุบัน
  // (ไม่คืน totalCost/profit จาก snapshot ตรงๆ เพราะ auto-merge ตอน import ยังไม่มี deliveryCost)
  (m.restore||[]).forEach(r=>{
    const o=allOrders.find(x=>x.id===r.id);
    if(o){
      o.packCost=r.packCost; delete o.mergedBoxType; delete o.mergedBoxCost;
      o.totalCost=round2(o.productCost+o.packCost+(o.tiktokFee||0)+(o.deliveryCost||0)+(o.shippingCost||0));
      o.profit=round2(o.revenue-o.totalCost);
    }
  });
  // หักกล่อง FIFO กลับ (deduct คืนจำนวนที่เคยคืนไป)
  for(let i=0;i<(m.savedBoxCount||0);i++){ deductBoxFifo(m.boxType,1); }
  S.mergedPacks=(S.mergedPacks||[]).filter(x=>x.id!==id);
  saveState();
  renderBoxStock();renderBoxLots();renderOverview();renderManualList();renderOrders();renderMergedPacks();
  showNotif('ลบการรวมแพ็คแล้ว — คืนค่าต้นทุนเดิม ✅');
}

function renderDeliveryRounds(){
  const tbody=document.getElementById('dr-tbody');if(!tbody)return;
  const rounds=(S.deliveryRounds||[]).slice().reverse();
  if(!rounds.length){tbody.innerHTML='<tr><td colspan="7"><div class="empty"><div class="ei">🚚</div><p>ยังไม่มีข้อมูล</p></div></td></tr>';return;}
  tbody.innerHTML=rounds.map(r=>`<tr>
    <td>${r.date}</td>
    <td>🕐 ${r.round}</td>
    <td style="font-size:.78rem;color:var(--text2)">${r.orderIds.map(id=>id.slice(-6)).join(', ')}</td>
    <td class="text-right">${r.vehicle}</td>
    <td class="text-right">฿${r.costPerTrip.toFixed(2)}</td>
    <td class="text-right" style="color:var(--accent)">฿${r.costPerOrder.toFixed(2)}</td>
    <td><button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="deleteDeliveryRound('${r.id}')">${_ICON_TRASH}</button></td>
  </tr>`).join('');
}

function deleteDeliveryRound(id){
  if(!confirm('ลบรอบส่งนี้? ค่าน้ำมันของออเดอร์ที่เกี่ยวข้องจะถูก reset'))return;
  const round=(S.deliveryRounds||[]).find(r=>r.id===id);
  if(round){
    round.orderIds.forEach(oid=>{
      const o=S.orders.find(x=>x.id===oid);
      if(o){o.deliveryCost=0;o.totalCost=round2(o.productCost+o.packCost+o.tiktokFee);o.profit=round2(o.revenue-o.totalCost);}
      const m=(S.manualSales||[]).find(x=>x.id===oid);
      if(m){m.deliveryCost=0;m.totalCost=round2(m.productCost+m.packCost+m.tiktokFee+(m.shippingCost||0));m.profit=round2(m.revenue-m.totalCost);}
    });
  }
  S.deliveryRounds=(S.deliveryRounds||[]).filter(r=>r.id!==id);
  saveState();renderDeliveryRounds();renderOverview();
  showNotif('ลบรอบส่งแล้ว ✅');
}

// ===================== MANUAL SALE =====================
let manualItems=[];

function addManualItem(){
  const id=Date.now()+Math.floor(Math.random()*9999);
  manualItems.push({id,name:'',qty:1});
  renderManualItems();
}

function removeManualItem(id){manualItems=manualItems.filter(i=>i.id!==id);renderManualItems();}

function updateManualItem(id,field,val){
  const item=manualItems.find(i=>i.id===id);if(!item)return;
  item[field]=field==='qty'?(parseInt(val)||1):val;
}

function renderManualItems(){
  const c=document.getElementById('m-items');if(!c)return;
  const opts=Object.keys(PRODUCT_ICONS);
  c.innerHTML=manualItems.map(item=>`
    <div style="display:grid;grid-template-columns:2fr 1fr auto;gap:8px;margin-bottom:8px;align-items:end">
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">ชนิด</label>
        <select onchange="updateManualItem(${item.id},'name',this.value)">
          <option value="">-- เลือก --</option>
          ${opts.map(n=>`<option ${n===item.name?'selected':''}>${n}</option>`).join('')}
        </select></div>
      <div class="form-group" style="margin-bottom:0"><label style="font-size:.75rem">จำนวนซอง</label>
        <input type="number" value="${item.qty}" min="1" step="1" oninput="updateManualItem(${item.id},'qty',this.value)"></div>
      <button class="btn btn-danger" onclick="removeManualItem(${item.id})" style="margin-bottom:1px">✕</button>
    </div>`).join('');
}

function getManualCalc(){
  const revenue=parseFloat(document.getElementById('m-revenue').value)||0;
  const feePct=parseFloat(document.getElementById('m-fee-pct').value)||0;
  const shipping=parseFloat(document.getElementById('m-shipping').value)||0;
  const validItems=manualItems.filter(i=>i.name&&i.qty>0);
  const totalQty=validItems.reduce((s,i)=>s+i.qty,0);
  const hasCorn6=validItems.some(i=>i.name==='ข้าวโพด 6 แว่น');
  const productCost=round2(validItems.reduce((s,i)=>s+getFifoCost(i.name)*i.qty,0));
  const packCost=getPackCostFifo(totalQty,hasCorn6,document.getElementById('m-date').value);
  const feeAmt=round2(revenue*feePct/100);
  const totalCost=round2(productCost+packCost+feeAmt+shipping);
  const profit=round2(revenue-totalCost);
  const margin=revenue>0?round2(profit/revenue*100):0;
  return{revenue,feePct,feeAmt,shipping,productCost,packCost,totalCost,profit,margin,totalQty,validItems,hasCorn6};
}

function calcManual(){
  if(!manualItems.length){showNotif('กรุณาเพิ่มสินค้าก่อน','error');return;}
  const c=getManualCalc();
  const div=document.getElementById('m-preview');
  div.innerHTML=`
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <span>ต้นทุนสินค้า: <b>฿${c.productCost.toFixed(2)}</b></span>
      <span>ค่าแพ็ค: <b>฿${c.packCost.toFixed(2)}</b></span>
      <span>ค่าบริการ (${c.feePct}%): <b>฿${c.feeAmt.toFixed(2)}</b></span>
      <span>ค่าส่ง: <b>฿${c.shipping.toFixed(2)}</b></span>
    </div>
    <div style="margin-top:8px;font-size:.95rem">
      รายได้ ฿${c.revenue.toFixed(2)} − ต้นทุนรวม ฿${c.totalCost.toFixed(2)} = 
      <b style="color:${c.profit>=0?'var(--green)':'var(--red)'}">กำไร ฿${c.profit.toFixed(2)} (${c.margin.toFixed(1)}%)</b>
    </div>`;
  div.style.display='';
  return c;
}

function saveManualSale(){
  const c=calcManual();if(!c)return;
  const date=document.getElementById('m-date').value;
  const platformSel=document.getElementById('m-platform').value;
  const platformCustom=document.getElementById('m-platform-custom').value.trim();
  const platform=platformSel==='อื่นๆ'&&platformCustom?platformCustom:platformSel;
  if(!date||c.validItems.length===0||c.revenue<=0){showNotif('กรุณากรอกข้อมูลให้ครบ','error');return;}

  const sale={
    id:'manual-'+Date.now(),date,platform,source:'manual',
    customerId:selectedCustomerId||null,
    items:c.validItems.map(i=>({name:i.name,qty:i.qty,costPerBag:getFifoCost(i.name)})),
    totalQty:c.totalQty,hasCorn6:c.hasCorn6,
    revenue:c.revenue,productCost:c.productCost,packCost:c.packCost,
    tiktokFee:c.feeAmt,feePct:c.feePct,shippingCost:c.shipping,
    totalCost:c.totalCost,profit:c.profit,status:'เสร็จสมบูรณ์'
  };

  if(!S.manualSales)S.manualSales=[];
  S.manualSales.push(sale);
  // ✅ ตัดสต็อกถุงอบแห้ง FIFO
  c.validItems.forEach(i=>{
    if(S.stock[i.name]!==undefined)
      S.stock[i.name]=Math.max(0,S.stock[i.name]-i.qty);
  });
  // ✅ ตัดกล่อง FIFO หลัง BOX_FIFO_START
  const od=new Date(date.includes('/')?date.split('/').reverse().join('-'):date);
  if(od>=BOX_FIFO_START&&c.totalQty>0){
    const useB=c.hasCorn6||c.totalQty>=5;
    const useAB=!useB&&c.totalQty>=3;
    if(useB)deductBoxFifo('B',1);
    else if(useAB)deductBoxFifo('AB',1);
  }
  recalcAllFifo();recalcDeliveryCosts();saveState();renderManualList();renderDryStock();renderBoxStock();renderOverview();

  // reset form
  manualItems=[];
  document.getElementById('m-items').innerHTML='';
  document.getElementById('m-revenue').value='';
  document.getElementById('m-fee-pct').value='0';
  document.getElementById('m-shipping').value='0';
  document.getElementById('m-platform-custom').value='';
  document.getElementById('m-preview').style.display='none';
  clearSelectedCustomer();
  showNotif(`บันทึกการขาย ${platform} แล้ว ✅`);
}

// ===================== CUSTOMERS =====================
let selectedCustomerId=null, customerModalEditId=null, customerModalOpts={};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

function getCustomerOrders(cust){
  const all=[...(S.orders||[]),...(S.manualSales||[])];
  return all.filter(o=>{
    if(o.customerId&&cust.id&&o.customerId===cust.id) return true;
    if(cust.linkedUsernames?.tiktok&&o.buyerUsername&&o.buyerUsername===cust.linkedUsernames.tiktok) return true;
    if(cust.linkedUsernames?.shopee&&o.buyerUsername&&o.buyerUsername===cust.linkedUsernames.shopee) return true;
    return false;
  });
}
function customerBadge(n){return n>=3?'🥇 ประจำ':n>=2?'🔄 ซื้อซ้ำ':'🆕 ใหม่';}
function customerBadgeClass(n){return n>=3?'badge-done':n>=2?'badge-ship':'badge-pend';}

// วันที่ผ่านมาตั้งแต่ออเดอร์ล่าสุด — ใช้ได้แม้ลูกค้าซื้อครั้งเดียว (ต่างจาก getCustomerInsights ที่ต้อง ≥2)
function getDaysSinceLast(cust){
  const ds=getCustomerOrders(cust).map(o=>parseOrderDate(o.date)).filter(d=>d&&!isNaN(d.getTime())&&d.getTime()>0);
  if(!ds.length) return null;
  const last=new Date(Math.max(...ds.map(d=>d.getTime())));
  return Math.round((new Date()-last)/(1000*60*60*24));
}

function getCustomerInsights(cust){
  const orders=getCustomerOrders(cust).slice().sort((a,b)=>parseOrderDate(a.date)-parseOrderDate(b.date));
  if(orders.length<2) return null;
  const gaps=[];
  for(let i=1;i<orders.length;i++){
    const d1=parseOrderDate(orders[i-1].date), d2=parseOrderDate(orders[i].date);
    const days=Math.round((d2-d1)/(1000*60*60*24));
    if(days>0) gaps.push(days);
  }
  if(!gaps.length) return null;
  const avgGap=round2(gaps.reduce((s,g)=>s+g,0)/gaps.length);
  const lastOrder=parseOrderDate(orders[orders.length-1].date);
  const daysSinceLast=Math.round((new Date()-lastOrder)/(1000*60*60*24));
  const daysUntilNext=Math.max(0,Math.round(avgGap-daysSinceLast));
  const CHURN_DAYS=15;
  let status, statusColor, showAlert;
  if(daysSinceLast>CHURN_DAYS){
    status=`💤 ไม่กลับมา ${daysSinceLast} วันแล้ว`; statusColor='var(--text2)'; showAlert=false;
  } else if(daysUntilNext<=3){
    status=`⚠️ ใกล้ถึงรอบซื้อ (อีก ${daysUntilNext} วัน)`; statusColor='var(--yellow)'; showAlert=true;
  } else {
    status=`🔄 คาดว่าจะซื้อในอีก ${daysUntilNext} วัน`; statusColor='var(--green)'; showAlert=false;
  }
  return {avgGap,gaps,daysSinceLast,daysUntilNext,status,statusColor,showAlert,orders};
}

// อัปเดต lastSeen ของลูกค้าเก่าที่ผูก username แล้ว, นับลูกค้าเก่า/username ใหม่
function syncCustomersFromImport(orders){
  const knownIds=new Set(), newUsernames=new Set();
  const today=new Date().toISOString().slice(0,10);
  (orders||[]).forEach(o=>{
    if(!o||!o.buyerUsername) return;
    const source = o.source==='shopee' ? 'shopee'
      : o.source==='manual' ? (o.platform==='Shopee'?'shopee':'other')
      : 'tiktok';
    const linked=(S.customers||[]).find(c=>
      (source==='tiktok'&&c.linkedUsernames?.tiktok===o.buyerUsername)||
      (source==='shopee'&&c.linkedUsernames?.shopee===o.buyerUsername)
    );
    if(linked){ linked.lastSeen=today; knownIds.add(linked.id); }
    else { newUsernames.add(o.buyerUsername); }
  });
  return {knownCount:knownIds.size, newCount:newUsernames.size};
}

// ---- Manual sale: customer search/select ----
function searchCustomer(q){
  const box=document.getElementById('m-customer-suggestions');if(!box)return;
  const query=(q||'').trim().toLowerCase();
  const matches=(S.customers||[]).filter(c=>!query||(c.name||'').toLowerCase().includes(query)||(c.nickname||'').toLowerCase().includes(query)).slice(0,6);
  let html=matches.map(c=>{
    const n=getCustomerOrders(c).length;
    return `<div onclick="selectCustomer('${c.id}')" style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:.84rem" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''"><b>${esc(c.name)}</b>${c.nickname?` (${esc(c.nickname)})`:''} <span style="color:var(--text2)">· ${n} ออเดอร์</span></div>`;
  }).join('');
  html+=`<div onclick="openNewCustomerFromManual()" style="padding:9px 14px;cursor:pointer;font-size:.84rem;color:var(--accent);font-weight:700" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">+ สร้างลูกค้าใหม่</div>`;
  box.innerHTML=html;box.style.display='';
}
function openNewCustomerFromManual(){
  const name=(document.getElementById('m-customer-search')?.value||'').trim();
  openCustomerModal(null,{fromManual:true,prefillName:name});
}
function selectCustomer(id){
  selectedCustomerId=id;
  const box=document.getElementById('m-customer-suggestions');if(box)box.style.display='none';
  const s=document.getElementById('m-customer-search');if(s)s.value='';
  renderSelectedCustomer();
}
function renderSelectedCustomer(){
  const box=document.getElementById('m-customer-selected');if(!box)return;
  const c=(S.customers||[]).find(x=>x.id===selectedCustomerId);
  if(!c){box.style.display='none';selectedCustomerId=null;return;}
  box.style.display='flex';
  box.innerHTML=`<span>👤 <b>${esc(c.name)}</b>${c.nickname?` (${esc(c.nickname)})`:''}${c.phone?` · ${esc(c.phone)}`:''}</span><button class="btn btn-outline btn-sm" style="padding:3px 10px" onclick="clearSelectedCustomer()">✕ เอาออก</button>`;
}
function clearSelectedCustomer(){
  selectedCustomerId=null;
  const box=document.getElementById('m-customer-selected');if(box){box.style.display='none';box.innerHTML='';}
  const s=document.getElementById('m-customer-search');if(s)s.value='';
  const sug=document.getElementById('m-customer-suggestions');if(sug)sug.style.display='none';
}

// ---- Customer directory ----
function getCustomerSegments(){
  const CHURN_DAYS=15;
  let newCount=0,repeatCount=0,loyalCount=0,churnCount=0,churnRepeatCount=0;
  (S.customers||[]).forEach(c=>{
    const orders=getCustomerOrders(c);
    if(orders.length===0) return;
    const lastOrderDays=getDaysSinceLast(c)??0; // นับลูกค้าซื้อครั้งเดียวด้วย
    if(lastOrderDays>CHURN_DAYS){ churnCount++; if(orders.length>1) churnRepeatCount++; }
    else if(orders.length>=3) loyalCount++;
    else if(orders.length>=2) repeatCount++;
    else newCount++;
  });
  return {newCount,repeatCount,loyalCount,churnCount,churnRepeatCount};
}
function renderCustomerSegments(){
  const seg=getCustomerSegments();
  const stat=document.getElementById('cust-seg-stats');
  if(stat)stat.innerHTML=`
    <div class="stat-card"><div class="s-label">🥇 ประจำ</div><div class="s-val" style="color:#d4a017">${seg.loyalCount} คน</div></div>
    <div class="stat-card"><div class="s-label">🔄 ซื้อซ้ำ</div><div class="s-val s-green">${seg.repeatCount} คน</div></div>
    <div class="stat-card"><div class="s-label">🆕 ใหม่</div><div class="s-val s-blue">${seg.newCount} คน</div></div>
    <div class="stat-card"><div class="s-label">💤 หายไป</div><div class="s-val" style="color:#999">${seg.churnCount} คน</div>${seg.churnRepeatCount>0?`<div class="s-sub" style="color:var(--red)">ในนี้ซื้อซ้ำ ${seg.churnRepeatCount} คน — ควรตามกลับ</div>`:''}</div>`;
  if(window._cwSeg)window._cwSeg.destroy();
  const el=document.getElementById('cust-chart-seg');
  const data=[seg.loyalCount,seg.repeatCount,seg.newCount,seg.churnCount];
  if(el&&data.some(v=>v>0))window._cwSeg=new Chart(el,{type:'doughnut',data:{labels:['🥇 ประจำ','🔄 ซื้อซ้ำ','🆕 ใหม่','💤 หายไป'],datasets:[{data,backgroundColor:['#d4a017','#3a7c5c','#2d6fa4','#999']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{family:'IBM Plex Sans Thai'}}}}}});
}
function renderCustomerList(){
  const tbody=document.getElementById('cust-tbody');if(!tbody)return;
  const search=(document.getElementById('cust-search')?.value||'').trim().toLowerCase();
  const segFilter=document.getElementById('cust-filter-segment')?.value||'';
  const platformFilter=document.getElementById('cust-filter-platform')?.value||'';
  const sort=document.getElementById('cust-sort')?.value||'total_desc';
  const CHURN_DAYS=15;
  // enrich แต่ละลูกค้าครั้งเดียว
  let rows=(S.customers||[]).map(c=>{
    const orders=getCustomerOrders(c);
    const insight=getCustomerInsights(c);
    const total=orders.reduce((s,o)=>s+(o.revenue||0),0);
    const last=orders.map(o=>parseOrderDate(o.date)).filter(d=>d&&!isNaN(d.getTime())&&d.getTime()>0).sort((a,b)=>b-a)[0];
    const days=getDaysSinceLast(c)??0; // นับลูกค้าซื้อครั้งเดียวด้วย
    return {c,orders,insight,total,last,days};
  });
  // filters
  rows=rows.filter(({c,orders,days})=>{
    if(search && !(c.name||'').toLowerCase().includes(search) && !(c.nickname||'').toLowerCase().includes(search)) return false;
    if(segFilter){
      const n=orders.length;
      if(segFilter==='loyal' && (n<3||days>CHURN_DAYS)) return false;
      if(segFilter==='repeat' && (n!==2||days>CHURN_DAYS)) return false;
      if(segFilter==='new' && (n!==1||days>CHURN_DAYS)) return false;
      if(segFilter==='churn' && days<=CHURN_DAYS) return false;
    }
    if(platformFilter){
      const hasPlatform=
        (platformFilter==='tiktok' && c.linkedUsernames?.tiktok)||
        (platformFilter==='shopee' && c.linkedUsernames?.shopee)||
        (platformFilter==='manual' && orders.some(o=>o.source==='manual'));
      if(!hasPlatform) return false;
    }
    return true;
  });
  // sort
  rows.sort((a,b)=>{
    if(sort==='total_desc') return b.total-a.total;
    if(sort==='orders_desc') return b.orders.length-a.orders.length;
    if(sort==='recent'){const la=a.last?a.last.getTime():0, lb=b.last?b.last.getTime():0; return lb-la;}
    if(sort==='alert'){const ia=a.insight?.daysUntilNext??999, ib=b.insight?.daysUntilNext??999; return ia-ib;}
    return 0;
  });
  const cnt=document.getElementById('cust-count');if(cnt)cnt.textContent=`${rows.length} คน`;
  if(!rows.length){
    const emptyMsg=(S.customers||[]).length?'ไม่พบลูกค้าตามเงื่อนไข':'ยังไม่มีลูกค้า — กด "+ เพิ่มลูกค้า" หรือผูกจาก username ด้านล่าง';
    tbody.innerHTML=`<tr><td colspan="10"><div class="empty"><div class="ei">👤</div><p>${emptyMsg}</p></div></td></tr>`;
  } else {
    tbody.innerHTML=rows.map(({c,orders,total,last,insight,days})=>{
      const n=orders.length;
      const plats=[...new Set(orders.map(o=>getPlatformLabel(o).label))];
      const lastStr=last?`${String(last.getDate()).padStart(2,'0')}/${String(last.getMonth()+1).padStart(2,'0')}/${last.getFullYear()}`:'-';
      const gapStr=insight?`ทุก ${Math.round(insight.avgGap)} วัน`:'<span style="color:var(--text2)">-</span>';
      let statusStr;
      if(insight){statusStr=`<span style="color:${insight.statusColor};font-weight:600;font-size:.78rem">${insight.status}</span>`;}
      else if(days>15){statusStr=`<span style="color:var(--text2);font-weight:600;font-size:.78rem">💤 ไม่กลับมา ${days} วันแล้ว</span>`;}
      else{statusStr='<span style="color:var(--text2);font-size:.78rem">ซื้อครั้งเดียว</span>';}
      return `<tr id="cust-row-${c.id}" style="cursor:pointer" onclick="toggleCustomerOrders('${c.id}')">
        <td><b>${esc(c.name)}</b></td><td>${esc(c.nickname||'-')}</td>
        <td style="font-size:.76rem">${plats.join(', ')||'-'}</td>
        <td class="text-right">${n}</td>
        <td class="text-right">฿${total.toFixed(0)}</td>
        <td>${lastStr}</td>
        <td style="font-size:.8rem">${gapStr}</td>
        <td>${statusStr}</td>
        <td><span class="badge ${customerBadgeClass(n)}">${customerBadge(n)}</span></td>
        <td><button class="act-btn" title="แก้ไข" aria-label="แก้ไข" onclick="event.stopPropagation();openCustomerModal('${c.id}')">${_ICON_EDIT}</button></td>
      </tr>
      <tr id="cust-detail-${c.id}" style="display:none"><td colspan="10" style="background:var(--surface2);padding:0">${customerOrdersHtml(orders,c)}</td></tr>`;
    }).join('');
  }
  renderCustomerSegments();
  renderCustomerAlerts();
  renderUnknownBuyers();
}
function customerInsightHtml(cust){
  const ins=getCustomerInsights(cust);if(!ins)return '';
  const timeline=ins.orders.map((o,i)=>{
    const d=o.date;
    const short=d.includes('/')?d.split('/').slice(0,2).join('/'):d;
    let gapLabel='';
    if(i>0){
      const days=Math.round((parseOrderDate(o.date)-parseOrderDate(ins.orders[i-1].date))/(1000*60*60*24));
      gapLabel=` <span style="color:var(--text2);font-size:.72rem">(${days}วัน)</span>`;
    }
    return `${i>0?' → ':''}${short}${gapLabel}`;
  }).join('');
  return `<div style="padding:12px 14px;border-bottom:1px solid var(--border);font-size:.83rem">
    <div style="font-weight:700;margin-bottom:6px">📅 ประวัติการซื้อ</div>
    <div style="line-height:1.8">${timeline}</div>
    <div style="margin-top:6px;color:var(--text2)">เฉลี่ยซื้อซ้ำทุก <b style="color:var(--text)">${Math.round(ins.avgGap)} วัน</b> · ซื้อล่าสุด <b style="color:var(--text)">${ins.daysSinceLast} วันที่แล้ว</b> · <span style="color:${ins.statusColor};font-weight:600">${ins.status}</span></div>
  </div>`;
}
function customerOrdersHtml(orders,cust){
  if(!orders.length)return '<div style="padding:14px;color:var(--text2);font-size:.83rem">ยังไม่มีประวัติออเดอร์</div>';
  const insightBlock=cust?customerInsightHtml(cust):'';
  const sorted=orders.slice().sort((a,b)=>parseOrderDate(b.date)-parseOrderDate(a.date));
  return `${insightBlock}<div style="padding:10px 14px"><table style="width:100%"><thead><tr><th>วันที่</th><th>ช่องทาง</th><th>สินค้า</th><th class="text-right">รายได้</th><th class="text-right">กำไร</th></tr></thead><tbody>${sorted.map(o=>{
    const pl=getPlatformLabel(o);
    return `<tr><td>${o.date}</td><td><span class="badge" style="background:${pl.color};color:#fff">${pl.label}</span></td><td style="font-size:.78rem;max-width:200px;white-space:normal">${(o.items||[]).map(i=>`${PRODUCT_ICONS[i.name]||''}${i.name}×${i.qty}`).join(', ')}</td><td class="text-right">฿${(o.revenue||0).toFixed(0)}</td><td class="text-right ${(o.profit||0)>=0?'profit-pos':'profit-neg'}">฿${(o.status==='เสร็จสมบูรณ์'?(o.profit||0):0).toFixed(0)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function toggleCustomerOrders(id){const el=document.getElementById('cust-detail-'+id);if(el)el.style.display=el.style.display==='none'?'':'none';}

function renderCustomerAlerts(){
  const box=document.getElementById('cust-alerts');if(!box)return;
  const CHURN_DAYS=15;
  const enriched=(S.customers||[]).map(c=>({c,orders:getCustomerOrders(c),insight:getCustomerInsights(c),days:getDaysSinceLast(c)}));
  // ใกล้ถึงรอบซื้อ
  const near=enriched.filter(e=>e.insight&&e.insight.showAlert).sort((a,b)=>a.insight.daysUntilNext-b.insight.daysUntilNext);
  // ลูกค้าซื้อซ้ำ (>1 ครั้ง) ที่หายไป >15 วัน — กลุ่มที่ควรตามกลับ เรียงตามยอดสะสมมากสุด
  const winback=enriched.filter(e=>e.orders.length>1&&e.days!=null&&e.days>CHURN_DAYS)
    .map(e=>({...e,total:e.orders.reduce((s,o)=>s+(o.revenue||0),0)}))
    .sort((a,b)=>b.total-a.total);
  let html='';
  if(near.length){
    html+=`<div class="card" style="border-left:4px solid var(--yellow)"><div class="card-title"><span>⚠️</span>ใกล้ถึงรอบซื้อ (${near.length})</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">${near.map(({c,insight,orders})=>
      `<div style="background:rgba(212,160,23,.12);border-radius:10px;padding:12px 14px">
        <div style="font-weight:700;font-size:.9rem">${esc(c.name)}${c.nickname?` <span style="color:var(--text2);font-weight:400">(${esc(c.nickname)})</span>`:''}</div>
        <div style="font-size:.8rem;color:${insight.statusColor};font-weight:600;margin:4px 0">${insight.status}</div>
        <div style="font-size:.76rem;color:var(--text2)">ซื้อทุก ~${Math.round(insight.avgGap)} วัน · ${orders.length} ออเดอร์</div>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;padding:4px 12px" onclick="focusCustomer('${c.id}')">ดูประวัติ</button>
      </div>`).join('')}</div></div>`;
  }
  if(winback.length){
    const totalValue=winback.reduce((s,e)=>s+e.total,0);
    const rows=winback.map(({c,orders,days,total,insight})=>{
      const plats=[...new Set(orders.map(o=>getPlatformLabel(o).label))].join(', ')||'-';
      const last=orders.map(o=>parseOrderDate(o.date)).filter(d=>d&&!isNaN(d.getTime())&&d.getTime()>0).sort((a,b)=>b-a)[0];
      const lastStr=last?`${String(last.getDate()).padStart(2,'0')}/${String(last.getMonth()+1).padStart(2,'0')}/${last.getFullYear()}`:'-';
      const gapStr=insight?`ทุก ${Math.round(insight.avgGap)} วัน`:'-';
      return `<tr>
        <td><button class="info-btn" onclick="openCustomerModal('${c.id}')" title="ดูข้อมูล / ตามกลับ" aria-label="ดูข้อมูลลูกค้า ${esc(c.name)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>${esc(c.name)}${c.nickname?` <span style="color:var(--text2);font-size:.8rem">(${esc(c.nickname)})</span>`:''}</td>
        <td style="font-size:.76rem">${plats}</td>
        <td class="text-right">${orders.length}</td>
        <td class="text-right">฿${total.toFixed(0)}</td>
        <td>${lastStr}</td>
        <td class="text-right" style="white-space:nowrap"><span style="color:var(--red)">${days} วัน</span></td>
        <td style="font-size:.8rem">${gapStr}</td>
      </tr>`;
    }).join('');
    html+=`<div class="card" style="border-left:4px solid var(--red)"><div class="card-title"><span>🔔</span>ลูกค้าซื้อซ้ำที่หายไป — ควรตามกลับ (${winback.length})</div>
      <div style="font-size:.82rem;color:var(--text2);margin-bottom:12px;line-height:1.6">มูลค่าที่เคยซื้อรวม <b>฿${totalValue.toFixed(0)}</b> · เรียงจากยอดสะสมมากสุด (ควรตามกลับก่อน)</div>
      <div class="tbl-wrap"><table><thead><tr><th>ชื่อ</th><th>ช่องทาง</th><th class="text-right">ออเดอร์</th><th class="text-right">ยอดสะสม</th><th>ซื้อล่าสุด</th><th class="text-right">หายไป</th><th>รอบซื้อเฉลี่ย</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  if(!html){box.style.display='none';box.innerHTML='';return;}
  box.style.display='';box.innerHTML=html;
}
function focusCustomer(id){
  let row=document.getElementById('cust-row-'+id);
  if(!row){const s=document.getElementById('cust-search');if(s&&s.value){s.value='';renderCustomerList();row=document.getElementById('cust-row-'+id);}}
  const detail=document.getElementById('cust-detail-'+id);
  if(detail&&detail.style.display==='none')detail.style.display='';
  if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.style.transition='background .3s';const orig=row.style.background;row.style.background='var(--accent-light)';setTimeout(()=>{row.style.background=orig;},1200);}
}

function renderUnknownBuyers(){
  const box=document.getElementById('cust-unknown');if(!box)return;
  const known=new Set((S.customers||[]).flatMap(c=>[c.linkedUsernames?.tiktok,c.linkedUsernames?.shopee].filter(Boolean)));
  const unknown={};
  [...(S.orders||[]),...(S.manualSales||[])].forEach(o=>{
    if(!o.buyerUsername)return;
    if(known.has(o.buyerUsername))return;
    const key=o.buyerUsername;
    if(!unknown[key])unknown[key]={username:o.buyerUsername,source:o.source||'tiktok',count:0,total:0};
    unknown[key].count++;unknown[key].total+=(o.revenue||0);
  });
  const list=Object.values(unknown).sort((a,b)=>b.total-a.total);
  if(!list.length){box.innerHTML='<div class="empty" style="padding:24px"><div class="ei">🔗</div><p>ไม่มี username ที่ยังไม่ได้ผูก</p></div>';return;}
  box.innerHTML=`<div class="tbl-wrap"><table><thead><tr><th>Username</th><th>ช่องทาง</th><th class="text-right">ออเดอร์</th><th class="text-right">ยอดสะสม</th><th></th></tr></thead><tbody>${list.map(u=>`<tr><td style="font-family:monospace;font-size:.8rem">${esc(u.username)}</td><td>${u.source==='shopee'?'🛍️ Shopee':'🎵 TikTok'}</td><td class="text-right">${u.count}</td><td class="text-right">฿${u.total.toFixed(0)}</td><td><button class="btn btn-primary btn-sm" onclick="addUnknownAsCustomer('${encodeURIComponent(u.username)}','${u.source}')">+ เพิ่มเป็นลูกค้า</button></td></tr>`).join('')}</tbody></table></div>`;
}
function addUnknownAsCustomer(encUser,source){
  const user=decodeURIComponent(encUser);
  const opts={prefillName:user};
  if(source==='shopee')opts.prefillShopee=user;else opts.prefillTiktok=user;
  openCustomerModal(null,opts);
}

// ---- Customer modal ----
function openCustomerModal(custId=null,opts={}){
  customerModalEditId=custId;customerModalOpts=opts||{};
  const c=custId?(S.customers||[]).find(x=>x.id===custId):null;
  document.getElementById('cm-title').textContent=c?'แก้ไขลูกค้า':'เพิ่มลูกค้า';
  document.getElementById('cm-name').value=c?(c.name||''):(opts.prefillName||'');
  document.getElementById('cm-nickname').value=c?(c.nickname||''):'';
  document.getElementById('cm-phone').value=c?(c.phone||''):'';
  document.getElementById('cm-note').value=c?(c.note||''):'';
  document.getElementById('cm-tiktok').value=c?(c.linkedUsernames?.tiktok||''):(opts.prefillTiktok||'');
  document.getElementById('cm-shopee').value=c?(c.linkedUsernames?.shopee||''):(opts.prefillShopee||'');
  document.getElementById('cm-delete').style.display=c?'':'none';
  const known=new Set((S.customers||[]).flatMap(x=>[x.linkedUsernames?.tiktok,x.linkedUsernames?.shopee].filter(Boolean)));
  const seen={};
  [...(S.orders||[]),...(S.manualSales||[])].forEach(o=>{if(o.buyerUsername&&!known.has(o.buyerUsername))seen[o.buyerUsername]=o.source||'tiktok';});
  const sel=document.getElementById('cm-link-select');
  sel.innerHTML='<option value="">— เลือก username —</option>'+Object.entries(seen).map(([u,s])=>`<option value="${encodeURIComponent(u)}|${s}">${s==='shopee'?'🛍️':'🎵'} ${esc(u)}</option>`).join('');
  document.getElementById('customer-modal').style.display='flex';
  const sug=document.getElementById('m-customer-suggestions');if(sug)sug.style.display='none';
}
function applyLinkUsername(val){
  if(!val)return;
  const idx=val.lastIndexOf('|');const encU=val.slice(0,idx),s=val.slice(idx+1);const u=decodeURIComponent(encU);
  if(s==='shopee')document.getElementById('cm-shopee').value=u;else document.getElementById('cm-tiktok').value=u;
}
function closeCustomerModal(){document.getElementById('customer-modal').style.display='none';customerModalEditId=null;customerModalOpts={};}
function saveCustomer(){
  const name=document.getElementById('cm-name').value.trim();
  if(!name){showNotif('กรุณากรอกชื่อลูกค้า','error');return;}
  const data={
    name,
    nickname:document.getElementById('cm-nickname').value.trim(),
    phone:document.getElementById('cm-phone').value.trim(),
    note:document.getElementById('cm-note').value.trim(),
    linkedUsernames:{tiktok:document.getElementById('cm-tiktok').value.trim(),shopee:document.getElementById('cm-shopee').value.trim()}
  };
  if(!S.customers)S.customers=[];
  let id=customerModalEditId;
  if(id){const c=S.customers.find(x=>x.id===id);if(c)Object.assign(c,data);}
  else{id='cust-'+Date.now();S.customers.push({id,...data,createdAt:new Date().toISOString()});}
  saveState();
  const fromManual=customerModalOpts.fromManual;
  closeCustomerModal();renderCustomerList();
  if(fromManual)selectCustomer(id);
  showNotif('บันทึกลูกค้าแล้ว ✅');
}
function deleteCustomerFromModal(){
  if(!customerModalEditId)return;
  if(!confirm('ลบลูกค้านี้? (ออเดอร์ยังอยู่ แต่จะไม่ผูกกับลูกค้า)'))return;
  const delId=customerModalEditId;
  S.customers=(S.customers||[]).filter(c=>c.id!==delId);
  if(selectedCustomerId===delId)clearSelectedCustomer();
  saveState();closeCustomerModal();renderCustomerList();showNotif('ลบลูกค้าแล้ว ✅');
}

// ---- Business overview (Tab 1) ----
function showLiveDayDetail(d){
  const sched=window._liveSched; const box=document.getElementById('cust-live-day-detail');
  if(!sched||!box) return;
  const hours=sched.hourByDay[d]||[];
  const total=hours.reduce((s,n)=>s+n,0);
  const dayName=sched.dayFull[d];
  if(!total){
    box.innerHTML=`<div style="margin-top:12px;padding:10px 14px;background:var(--surface2);border-radius:10px;font-size:.8rem;color:var(--text2)">📅 <b>วัน${dayName}</b> — ยังไม่มีข้อมูลเวลาสั่งซื้อของวันนี้<br><span style="font-size:.74rem">(re-import ไฟล์เดิมเพื่อเก็บเวลา หรือวันนี้ขายผ่านช่องทางที่ไม่บันทึกเวลา)</span></div>`;
    return;
  }
  const bins=[];
  for(let h=0;h<24;h+=2){ const c=(hours[h]||0)+(hours[h+1]||0); if(c>0) bins.push({h,c,label:`${String(h).padStart(2,'0')}:00-${String(h+2).padStart(2,'0')}:00`}); }
  const maxC=Math.max(...bins.map(b=>b.c));
  const top=bins.slice().sort((a,b)=>b.c-a.c)[0];
  const rows=bins.map(b=>{
    const isTop=b.h===top.h, w=Math.round(b.c/maxC*100);
    return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
      <div style="width:104px;font-size:.76rem;${isTop?'font-weight:700;color:var(--accent)':'color:var(--text2)'}">${b.label}</div>
      <div style="flex:1;background:var(--surface2);border-radius:5px;overflow:hidden;height:18px"><div style="width:${w}%;height:100%;background:var(--accent);opacity:${isTop?1:.45}"></div></div>
      <div style="width:62px;text-align:right;font-size:.76rem;${isTop?'font-weight:700':''}">${b.c} ออเดอร์</div>
    </div>`;
  }).join('');
  const fmtStart=`${String(((top.h-1)+24)%24).padStart(2,'0')}:15`;
  box.innerHTML=`<div style="margin-top:12px;padding:12px 14px;background:var(--surface);border:1.5px solid var(--accent);border-radius:10px">
    <div style="font-weight:700;font-size:.86rem;margin-bottom:8px">📅 วัน${dayName} — ช่วงเวลาที่ลูกค้าสั่งซื้อ (${total} ออเดอร์)</div>
    ${rows}
    <div style="margin-top:8px;font-weight:700;color:var(--accent);font-size:.84rem">💡 ควรไลฟ์ช่วง ${top.label} (${top.c} ออเดอร์) · เริ่มไลฟ์ ~${fmtStart} น.</div>
  </div>`;
}

function renderCustomerBusiness(){
  const all=[...(S.orders||[]),...(S.manualSales||[])];
  // Card 1: day of week
  const dow=[0,0,0,0,0,0,0];
  all.forEach(o=>{const d=parseOrderDate(o.date);if(d&&!isNaN(d.getTime())&&d.getTime()>0)dow[d.getDay()]++;});
  const dowLabels=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์'];
  if(window._cwDow)window._cwDow.destroy();
  const dowEl=document.getElementById('cust-chart-dow');
  if(dowEl)window._cwDow=new Chart(dowEl,{type:'bar',data:{labels:dowLabels,datasets:[{data:dow,backgroundColor:'rgba(200,135,58,.7)',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{precision:0}}}}});
  // Card 2: ตารางไลฟ์แนะนำ — คำนวณจาก order จริง (completed/shipped) แทน pie ช่วงเวลา
  const ACCEPT=['เสร็จสมบูรณ์','จัดส่งแล้ว'];
  const seenIds=new Set();
  const liveOrders=all.filter(o=>{
    if(!ACCEPT.includes(o.status)) return false;
    if(o.id){ if(seenIds.has(o.id)) return false; seenIds.add(o.id); }
    return true;
  });
  const ordersByDay=[0,0,0,0,0,0,0], revenueByDay=[0,0,0,0,0,0,0];
  const ordersByHour=new Array(24).fill(0); let timedCount=0;
  const hourByDay=Array.from({length:7},()=>new Array(24).fill(0)); // [dayOfWeek][hour]
  liveOrders.forEach(o=>{
    const dd=parseOrderDate(o.date);
    let dow=null;
    if(dd&&!isNaN(dd.getTime())&&dd.getTime()>0){ dow=dd.getDay(); ordersByDay[dow]++; revenueByDay[dow]+=(o.revenue||0); }
    // ใช้ createdTime (เวลาที่ลูกค้าสั่งจริง) เท่านั้น — ไม่ fallback ไป shippedDate (เวลาส่งของ = คนละความหมาย)
    const t=o.createdTime;
    if(t){ const ht=new Date(String(t).replace(/\\t/g,'').trim()); if(!isNaN(ht.getTime())){ const h=ht.getHours(); ordersByHour[h]++; timedCount++; hourByDay[dow!=null?dow:ht.getDay()][h]++; } }
  });
  // แนะนำวันไลฟ์: top 4 วันที่มีออเดอร์ = เขียว(ควรไลฟ์), bottom 2 = แดง(พัก), ที่เหลือ = เทา(ตามสะดวก)
  const dayIdx=[0,1,2,3,4,5,6];
  const greenDays=new Set([...dayIdx].sort((a,b)=>ordersByDay[b]-ordersByDay[a]).filter(d=>ordersByDay[d]>0).slice(0,4));
  const redDays=new Set([...dayIdx].sort((a,b)=>ordersByDay[a]-ordersByDay[b]).filter(d=>!greenDays.has(d)).slice(0,2));
  const neutralDays=new Set(dayIdx.filter(d=>!greenDays.has(d)&&!redDays.has(d)));
  const dayShort={0:'อา',1:'จ',2:'อ',3:'พ',4:'พฤ',5:'ศ',6:'ส'};
  const dayFull={0:'อาทิตย์',1:'จันทร์',2:'อังคาร',3:'พุธ',4:'พฤหัส',5:'ศุกร์',6:'เสาร์'};
  window._liveSched={hourByDay,dayFull};
  const pills=[1,2,3,4,5,6,0].map(d=>{
    const inG=greenDays.has(d), inR=redDays.has(d);
    const bg=inG?'var(--green-light)':inR?'var(--red-light)':'var(--surface2)';
    const col=inG?'var(--green)':inR?'var(--red)':'var(--text2)';
    return `<div onclick="showLiveDayDetail(${d})" title="กดดูช่วงเวลาขายของวัน${dayFull[d]}" style="flex:1;min-width:32px;text-align:center;background:${bg};color:${col};border-radius:8px;padding:7px 2px;cursor:pointer"><div style="font-size:.78rem;font-weight:700">${dayShort[d]}</div><div style="font-size:.72rem">${ordersByDay[d]}</div></div>`;
  }).join('');
  const legend=`<div style="font-size:.7rem;color:var(--text2);text-align:center;margin-top:6px">🟢 ควรไลฟ์ · ⚪ ตามสะดวก · 🔴 วันพัก — 👆 กดที่วันเพื่อดูช่วงเวลาขายของวันนั้น</div>`;
  // แนะนำเวลาไลฟ์ (ภาพรวมทุกวัน): หา period ที่ขายดีสุด
  const periods=[{label:'🌙 ดึก',from:0,to:5},{label:'🌅 เช้า',from:6,to:11},{label:'☀️ บ่าย',from:12,to:16},{label:'🌆 เย็น',from:17,to:20},{label:'🌃 ค่ำ',from:21,to:23}];
  periods.forEach(p=>{ p.count=0; for(let h=p.from;h<=p.to;h++) p.count+=ordersByHour[h]; });
  const topPeriod=periods.slice().sort((a,b)=>b.count-a.count)[0];
  let timeBadge;
  if(timedCount>0 && topPeriod.count>0){
    let peakHour=topPeriod.from, peakC=-1;
    for(let h=topPeriod.from;h<=topPeriod.to;h++){ if(ordersByHour[h]>peakC){ peakC=ordersByHour[h]; peakHour=h; } }
    const fmt=mins=>{ const m=((mins%1440)+1440)%1440; return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; };
    const startT=fmt(peakHour*60-45), endT=fmt((peakHour+1)*60);
    timeBadge=`<div style="background:var(--accent-light);border-radius:10px;padding:10px 14px;margin-top:12px;text-align:center"><div style="font-size:.78rem;color:var(--text2)">ช่วงที่ลูกค้าสั่งซื้อมากสุด (ทุกวันรวมกัน): ${topPeriod.label} (${topPeriod.count} ออเดอร์)</div><div style="font-weight:700;color:var(--accent);margin-top:2px">⏰ เริ่ม ${startT} น. · ไลฟ์ถึง ${endT} น.</div></div>`;
  } else {
    timeBadge=`<div style="background:var(--accent-light);border-radius:10px;padding:10px 14px;margin-top:12px;text-align:center;font-size:.78rem;color:var(--text2)">⏰ ยังแนะนำเวลาไลฟ์ไม่ได้ — ออเดอร์ยังไม่มี<b>เวลาสั่งซื้อ</b> (มีเฉพาะเวลาส่งของ)<br><b style="color:var(--accent)">วิธีแก้: re-import ไฟล์ TikTok/Shopee เดิม</b> เพื่อเติมเวลาสั่งซื้อ</div>`;
  }
  const weekOrder=[1,2,3,4,5,6,0];
  const namesOf=set=>weekOrder.filter(d=>set.has(d)).map(d=>dayFull[d]).join(' ');
  let summary;
  if(!greenDays.size){ summary='ยังไม่มีข้อมูลออเดอร์พอแนะนำ'; }
  else {
    summary=`ไลฟ์ ${greenDays.size} วัน: <span style="color:var(--green)">${namesOf(greenDays)}</span>`;
    if(neutralDays.size) summary+=` · ตามสะดวก: ${namesOf(neutralDays)}`;
    if(redDays.size) summary+=` · พัก: <span style="color:var(--red)">${namesOf(redDays)}</span>`;
  }
  const disclaimer=liveOrders.length<30?`<div style="font-size:.72rem;color:var(--yellow);text-align:center;margin-top:8px">⚠️ ข้อมูลยังน้อย (${liveOrders.length} ออเดอร์) ผลอาจคลาดเคลื่อน</div>`:'';
  const liveBox=document.getElementById('cust-live-schedule');
  if(liveBox)liveBox.innerHTML=`<div style="display:flex;gap:5px">${pills}</div>${legend}<div id="cust-live-day-detail"></div>${timeBadge}<div style="text-align:center;font-weight:600;margin-top:12px;font-size:.84rem;line-height:1.7">📋 ${summary}</div>${disclaimer}`;
  // Card 3: avg order value per platform
  const grp={tiktok:{c:0,t:0,label:'🎵 TikTok'},shopee:{c:0,t:0,label:'🛍️ Shopee'},other:{c:0,t:0,label:'🏪 อื่นๆ'}};
  all.forEach(o=>{const k=(!o.source||o.source==='tiktok')?'tiktok':o.source==='shopee'?'shopee':'other';grp[k].c++;grp[k].t+=(o.revenue||0);});
  const avgBox=document.getElementById('cust-avg-stats');
  if(avgBox)avgBox.innerHTML=Object.values(grp).map(g=>`<div class="stat-card"><div class="s-label">${g.label}</div><div class="s-val">฿${g.c?(g.t/g.c).toFixed(0):'0'}</div><div class="s-sub">${g.c} ออเดอร์ · รวม ฿${g.t.toFixed(0)}</div></div>`).join('');
  // Card 4: product pairs
  const pairs={};
  all.forEach(o=>{
    const names=[...new Set((o.items||[]).map(i=>i.name))];
    if(names.length<2)return;
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const key=[names[i],names[j]].sort().join('|');pairs[key]=(pairs[key]||0)+1;}
  });
  const top=Object.entries(pairs).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const pairBox=document.getElementById('cust-pairs');
  if(pairBox)pairBox.innerHTML=top.length?top.map(([k,n])=>{const[a,b]=k.split('|');return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 4px;border-bottom:1px solid var(--border);font-size:.86rem"><span>${PRODUCT_ICONS[a]||'🌿'} ${a} + ${PRODUCT_ICONS[b]||'🌿'} ${b}</span><b>${n} ครั้ง</b></div>`;}).join(''):'<div class="empty" style="padding:20px"><p>ยังไม่มีออเดอร์ที่ซื้อหลายชนิด</p></div>';
}

function renderManualList(){
  const tbody=document.getElementById('manual-tbody');if(!tbody)return;
  const filter=document.getElementById('m-filter-platform')?.value||'';
  const list=(S.manualSales||[]).filter(s=>!filter||s.platform===filter).slice().reverse();
  if(!list.length){tbody.innerHTML='<tr><td colspan="10"><div class="empty"><div class="ei">📝</div><p>ยังไม่มีข้อมูล</p></div></td></tr>';return;}
  tbody.innerHTML=list.map(s=>`<tr>
    <td>${s.date}</td>
    <td><span class="badge badge-pend">${s.platform}</span>${s.stockCutoff===false?' <span class="badge" style="background:#e0e0e0;color:#666">📦 ไม่ตัดสต็อก</span>':''}</td>
    <td style="font-size:.78rem;max-width:180px;white-space:normal">${s.items.map(i=>`${PRODUCT_ICONS[i.name]||''}${i.name}×${i.qty}`).join(', ')}</td>
    <td class="text-right">฿${s.revenue.toFixed(2)}</td>
    <td class="text-right">฿${s.productCost.toFixed(2)}</td>
    <td class="text-right">฿${s.packCost.toFixed(2)}</td>
    <td class="text-right">฿${s.tiktokFee.toFixed(2)}</td>
    <td class="text-right ${s.profit>=0?'profit-pos':'profit-neg'}">฿${s.profit.toFixed(2)}</td>
    <td class="text-right">${s.revenue>0?(s.profit/s.revenue*100).toFixed(1):0}%</td>
    <td><button class="act-btn del" title="ลบ" aria-label="ลบ" onclick="deleteManualSale('${s.id}')">${_ICON_TRASH}</button></td>
  </tr>`).join('');
}

function deleteManualSale(id){
  if(!confirm('ลบรายการนี้?'))return;
  const sale=(S.manualSales||[]).find(s=>s.id===id);
  if(sale && sale.stockCutoff!==false){
    // ✅ คืนสต็อกถุงอบแห้ง (เฉพาะออเดอร์ที่เคยตัดสต็อก)
    sale.items.forEach(i=>{if(S.stock[i.name]!==undefined)S.stock[i.name]=(S.stock[i.name]||0)+i.qty;});
    // ✅ คืนกล่อง FIFO
    const od=new Date(sale.date.includes('/')?sale.date.split('/').reverse().join('-'):sale.date);
    if(od>=BOX_FIFO_START&&sale.totalQty>0){
      const useB=sale.hasCorn6||sale.totalQty>=5;
      const useAB=!useB&&sale.totalQty>=3;
      const type=useB?'B':useAB?'AB':null;
      if(type){
        const lot=(S.boxLots||[]).filter(l=>l.type===type&&(l.usedQty||0)>0).sort((a,b)=>b.date.localeCompare(a.date))[0];
        if(lot)lot.usedQty=Math.max(0,(lot.usedQty||0)-1);
      }
    }
  }
  S.manualSales=(S.manualSales||[]).filter(s=>s.id!==id);
  // ลบ record คืน/ขาดทุนกล่องที่ผูกกับออเดอร์นี้ (กัน loss ผีค้าง)
  S.orderReturns=(S.orderReturns||[]).filter(r=>r.orderId!==id);
  S.boxAdjustments=(S.boxAdjustments||[]).filter(a=>!(a.reason==='คืนออเดอร์'&&a.orderId===id));
  removeFromDeliveryRounds([id]);
  recalcAllFifo();saveState();renderManualList();renderDryStock();renderBoxStock();renderOverview();renderDeliveryRounds();
  showNotif('ลบแล้ว สต็อกปรับกลับแล้ว ✅');
}

function adjustDryStock(){
  const name=document.getElementById('da-name').value;
  const qty=parseInt(document.getElementById('da-qty').value)||0;
  const reason=document.getElementById('da-reason').value;
  const note=document.getElementById('da-note').value;
  const orderId=document.getElementById('da-orderid').value.trim();
  const reshipping=parseFloat(document.getElementById('da-reshipping').value)||0;
  if(!name||qty<=0){showNotif('กรุณากรอกข้อมูลให้ครบ','error');return;}
  const avail=S.stock[name]||0;
  if(qty>avail){showNotif(`สต็อก${name}เหลือแค่ ${avail} ถุง`,'error');return;}

  // คำนวณต้นทุนตาม FIFO (รวมค่าส่งซ้ำ)
  const cpb=getFifoCost(name);
  const totalCost=round2(cpb*qty+reshipping);

  // ตัด soldBags ใน Lot แบบ FIFO
  const lots=S.dryLots.filter(l=>l.name===name&&(l.totalBags-l.soldBags)>0).sort(lotSort);
  let rem=qty;
  for(const lot of lots){
    if(rem<=0)break;
    const take=Math.min(lot.totalBags-lot.soldBags,rem);
    lot.soldBags+=take;
    rem-=take;
  }

  // อัพเดทสต็อก
  S.stock[name]=Math.max(0,avail-qty);

  // บันทึกเป็น Lot พิเศษแสดงในประวัติ
  if(!S.dryAdjustments)S.dryAdjustments=[];
  S.dryAdjustments.push({
    id:'da-'+Date.now(),
    date:new Date().toISOString().slice(0,10),
    name,qty,reason,note,cpb,totalCost,orderId,reshipping
  });

  recalcAllFifo();
  saveState();renderDryStock();renderDryLots();renderOverview();
  document.getElementById('da-name').value='';
  document.getElementById('da-qty').value='';
  document.getElementById('da-note').value='';
  document.getElementById('da-orderid').value='';
  document.getElementById('da-reshipping').value='0';
  showNotif(`ปรับลด ${name} -${qty} ถุง (${reason}) ฿${totalCost.toFixed(2)} ✅`);
}

// ===================== NAV & UI =====================
const _MOON_SVG='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>';
const _SUN_SVG='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const _ICON_EDIT='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/></svg>';
const _ICON_TRASH='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>';
function setDarkIcon(isDark){ const b=document.getElementById('dark-btn'); if(b)b.innerHTML=isDark?_SUN_SVG:_MOON_SVG; }
function toggleDarkMode(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const next=isDark?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  setDarkIcon(next==='dark');
  localStorage.setItem('hamsterTheme',next);
}

function initTheme(){
  const saved=localStorage.getItem('hamsterTheme')||'light';
  document.documentElement.setAttribute('data-theme',saved);
  setDarkIcon(saved==='dark');
}

function buildSidebar(){
  const menu=document.getElementById('side-menu');if(!menu)return;
  const activeId=document.querySelector('.page.active')?.id||PAGE_IDS[0];
  menu.innerHTML=PAGES.map(p=>`<button class="side-item${p.id===activeId?' active':''}" data-page="${p.id}" onclick="showPage('${p.id}')"><span class="si-icon">${p.icon}</span>${p.name}</button>`).join('');
}
function toggleSidebar(){document.getElementById('app-layout')?.classList.toggle('sidebar-open');}

function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.side-item').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  const tt=document.getElementById('topbar-title');if(tt&&PAGE_BY_ID[id])tt.textContent=PAGE_BY_ID[id].name;
  document.getElementById('app-layout')?.classList.remove('sidebar-open');
  if(id==='p-settings')renderSettings();
  if(id==='p-profit')renderOverview();
  if(id==='p-customers'){renderCustomerBusiness();renderCustomerList();}
  if(id==='p-manual'){renderManualItems();renderManualList();renderDeliveryRounds();renderMergedPacks();renderSelectedCustomer();
    document.getElementById('dr-datetime').value=getLocalDatetimeString();
    renderDeliveryRoundPicker();}
  if(id==='p-stock'){renderFreshList();renderFreshStockGrid();renderDryStock();renderDryLots();initBoxLots();renderBoxStock();renderBoxLots();}
}
function showInnerStock(showId, btn){
  ['stock-fresh','stock-dry','stock-box'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  document.getElementById(showId).style.display='';
  btn.closest('.inner-tabs').querySelectorAll('.inner-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(showId==='stock-dry'){
    renderDryStock();renderDryLots();
    // reset inner tab กลับ "จัดการสต็อก" ทุกครั้งที่เปิด tab อบแห้ง
    const firstBtn=document.querySelector('#dry-inner-tabs .inner-tab:first-child');
    if(firstBtn) showDryInner('dry-main', firstBtn);
  }
  if(showId==='stock-fresh'){renderFreshList();renderFreshStockGrid();}
  if(showId==='stock-box'){initBoxLots();renderBoxStock();renderBoxLots();}
}
function showDryInner(showId, btn){
  ['dry-main','dry-schedule'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const target=document.getElementById(showId);if(target)target.style.display='';
  const tabs=document.getElementById('dry-inner-tabs');
  if(tabs)tabs.querySelectorAll('.inner-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  if(showId==='dry-schedule'){renderSmartStockAlert();renderBakingSchedule();}
  if(showId==='dry-main'){renderDryStock();renderDryLots();}
}

function showInner(showId,hideId,btn){
  document.getElementById(showId).style.display='';
  document.getElementById(hideId).style.display='none';
  btn.closest('.inner-tabs').querySelectorAll('.inner-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function statusBadge(s){return s==='เสร็จสมบูรณ์'?'badge-done':s==='จัดส่งแล้ว'?'badge-ship':'badge-pend';}
function showNotif(msg,type='success'){
  const el=document.createElement('div');el.className=`notif notif-${type}`;el.textContent=msg;
  document.body.appendChild(el);setTimeout(()=>el.remove(),3000);
}

// ===================== INIT =====================
window.addEventListener('load',function(){
  // Register Service Worker for PWA
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js')
      .then(()=>console.log('SW registered'))
      .catch(err=>console.log('SW error:',err));
  }
  initTheme();
  buildSidebar();
  loadBuildInfo();
  // ต้องเข้าสู่ระบบด้วย Google ก่อน — เริ่มแอปหลังยืนยันสิทธิ์
  firebase.auth().onAuthStateChanged(handleAuthChange);
  // เผื่อ login ผ่าน redirect (มือถือ) — ดักerror เช่น domain ไม่อนุญาต มาแสดง
  firebase.auth().getRedirectResult().catch(err=>{
    showLogin('เข้าสู่ระบบไม่สำเร็จ: '+(err.message||err.code||''));
  });
});

// ===================== AUTH (Google login) =====================
// ⚠️ allowlist ฝั่ง client เป็นแค่ UX gate — การป้องกันจริงอยู่ที่ Firestore Security Rules (ดู README/คำอธิบาย)
const ALLOWED_EMAILS=['tanawat.lukkanapinij@gmail.com','littlehamsterhome@gmail.com','mantana1995sp@gmail.com'];
let appInited=false;

function handleAuthChange(user){
  if(!user){ showLogin(); return; }
  const email=(user.email||'').toLowerCase();
  if(!ALLOWED_EMAILS.includes(email)){
    showLogin(`บัญชี ${user.email} ไม่มีสิทธิ์เข้าใช้งาน`);
    firebase.auth().signOut();
    return;
  }
  hideLogin();
  const name=(user.displayName||user.email||'').trim();
  const first=name.split(/\s+/)[0]||name;
  const nm=document.getElementById('uc-name'); if(nm)nm.textContent=first;
  const chip0=document.getElementById('user-chip'); if(chip0)chip0.title=name;
  const av=document.getElementById('uc-avatar'), fb=document.getElementById('uc-fallback');
  const showFallback=()=>{ if(av)av.style.display='none'; if(fb){fb.textContent=(name.trim()[0]||'?');fb.style.display='inline-flex';} };
  if(user.photoURL&&av){ av.onerror=showFallback; av.src=user.photoURL; av.style.display=''; if(fb)fb.style.display='none'; }
  else showFallback();
  const chip=document.getElementById('user-chip'); if(chip)chip.style.display='inline-flex';
  const lb=document.getElementById('logout-btn'); if(lb)lb.style.display='inline-flex';
  if(!appInited){ appInited=true; initApp(); }
}
function showLogin(err){
  const ov=document.getElementById('login-overlay'); if(ov)ov.style.display='flex';
  const e=document.getElementById('login-error');
  if(e){ if(err){e.textContent='⚠️ '+err;e.style.display='';} else {e.style.display='none';} }
  const chip=document.getElementById('user-chip'); if(chip)chip.style.display='none';
  const lb=document.getElementById('logout-btn'); if(lb)lb.style.display='none';
}
function hideLogin(){ const ov=document.getElementById('login-overlay'); if(ov)ov.style.display='none'; }
function loginWithGoogle(){
  const btn=document.getElementById('login-btn'); if(btn){btn.disabled=true;btn.style.opacity='.6';}
  const reset=()=>{ if(btn){btn.disabled=false;btn.style.opacity='1';} };
  const provider=new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .catch(err=>{
      const code=(err&&err.code)||'';
      // popup ถูกบล็อก/ไม่รองรับ (มือถือ, in-app browser) → เปลี่ยนไปใช้ redirect แทน
      if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment','auth/popup-closed-by-user'].includes(code)){
        return firebase.auth().signInWithRedirect(provider)
          .catch(e=>{ showLogin('เข้าสู่ระบบไม่สำเร็จ: '+(e.message||e.code||'')); reset(); });
      }
      showLogin('เข้าสู่ระบบไม่สำเร็จ: '+(err.message||code||''));
      reset();
    });
}
function logout(){ firebase.auth().signOut().then(()=>location.reload()); }

function initApp(){
  loadState();
  startFirebaseSync();
  document.getElementById('f-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('m-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('d-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('box-date').value=new Date().toISOString().slice(0,10);
  renderFreshList();
  renderFreshStockGrid();
  renderDryStock();
  renderDryLots();
  renderBoxStock();
  renderBoxLots();
  renderOverview();
  // แจ้งเตือนสต็อกต่ำ
  setTimeout(checkLowStock, 800);
}

function loadBuildInfo(){
  fetch('https://api.github.com/repos/littlehamsters/BaanJaoNoo-Profit/commits/main')
    .then(r=>r.json())
    .then(d=>{
      const hash=d.sha?.slice(0,7);
      const date=d.commit?.committer?.date?.slice(0,10);
      const el=document.getElementById('build-info');
      if(el&&hash)el.textContent=`${date} #${hash}`;
    })
    .catch(()=>{
      const el=document.getElementById('build-info');
      if(el)el.textContent='';
    });
}

function checkLowStock(){
  const warnings=[];
  // ถุงอบแห้ง < 5
  Object.entries(S.stock).forEach(([name,qty])=>{
    if(qty>0&&qty<5) warnings.push(`${PRODUCT_ICONS[name]||''} ${name}: เหลือ ${qty} ถุง`);
  });
  // กล่อง < 15
  ['AB','B'].forEach(type=>{
    const qty=getBoxStock(type);
    if(qty<15) warnings.push(`📦 กล่อง ${type}: เหลือ ${qty} ใบ`);
  });
  if(warnings.length>0){
    const msg=`⚠️ สต็อกใกล้หมด!\n${warnings.join('\n')}`;
    const div=document.createElement('div');
    div.style.cssText='position:fixed;top:70px;right:20px;z-index:9999;background:var(--surface);border:2px solid var(--yellow);border-radius:12px;padding:16px 20px;box-shadow:0 4px 20px rgba(0,0,0,.15);max-width:280px;font-size:.85rem;font-family:"IBM Plex Sans Thai",sans-serif';
    div.innerHTML=`<div style="font-weight:700;color:var(--yellow);margin-bottom:8px">⚠️ สต็อกใกล้หมด</div>`+
      warnings.map(w=>`<div style="margin-bottom:4px">• ${w}</div>`).join('')+
      `<button onclick="this.parentElement.remove()" style="margin-top:10px;background:none;border:1px solid var(--border);border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit;font-size:.8rem">ปิด</button>`;
    document.body.appendChild(div);
  }
}


/* --- expose top-level functions to global scope for inline on* handlers --- */
Object.assign(window, { addDryOutput,addFreshBuyItem,addFreshInput,addManualItem,addUnknownAsCustomer,adjustDryStock,adjustFreshStock,applyLinkUsername,buildInitLots,buildProdReason,calcDeliveryCost,calcDeliveryForOrders,calcFifoCost,calcManual,cancelImport,cancelShopeeImport,checkLowStock,clearAllData,clearOrderFilters,clearOverviewFilters,clearSelectedCustomer,closeCustomerModal,computeDryLotCosts,confirmImport,confirmShopeeImport,customerBadge,customerBadgeClass,customerInsightHtml,customerOrdersHtml,deductBoxFifo,deductFresh,deleteAdjustment,deleteBoxLot,deleteCustomerFromModal,deleteDeliveryRound,deleteDryLot,deleteFilteredOrders,deleteFresh,deleteFreshAdjust,deleteManualSale,deleteMergedPack,deleteTikTokOrder,editDryLot,editFresh,esc,exportData,exportExcel,fixAndRecalc,focusCustomer,formatBakeTime,formatShopeeDate,getAvgDryCost,getBagCost,getBakingSchedule,getBoxStock,getCostWeight,getCustomerInsights,getCustomerOrders,getCustomerSegments,getDaysSinceLast,getFifoBoxCost,getFifoCost,getFreshStock,getFreshUnit,getLocalDatetimeString,getManualCalc,getPackCost,getPackCostFifo,getPendingRemnant,getPlatformLabel,getProductMargin,getProductionSuggestions,getShopeeCutoffDate,getStockVelocity,handleAuthChange,handleDrop,handleShopeeDrop,hideLogin,importData,initApp,initBoxLots,initTheme,loadBuildInfo,loadCSV,loadShopeeXLSX,loadState,loadXLSX,loginWithGoogle,logout,lotSort,matchOrderPlatform,openCustomerModal,openNewCustomerFromManual,orderBoxType,parseCSVLine,parseDate,parseOrderDate,previewDryCost,processCSVFile,processShopeeXLSXFile,processXLSXFile,recalcAllFifo,recalcDeliveryCosts,removeDryOutput,removeFreshBuyItem,removeFreshInput,removeFromDeliveryRounds,removeManualItem,renderAll,renderBakingSchedule,renderBoxLots,renderBoxStock,renderCustomerAlerts,renderCustomerBusiness,renderCustomerList,renderCustomerSegments,renderDeliveryRoundPicker,renderDeliveryRounds,renderDryLots,renderDryOutputs,renderDryStock,renderFreshBuyItems,renderFreshInputs,renderFreshList,renderFreshStockGrid,renderManualItems,renderManualList,renderMergePackPicker,renderMergedPacks,renderOrders,renderOverview,renderProductionSuggestion,renderSelectedCustomer,renderSettings,renderSmartStockAlert,renderUnknownBuyers,resolveVarName,round2,saveBagSettings,saveBakeTimeSettings,saveBoxLot,saveCustomer,saveDeliveryRound,saveDeliverySettings,saveDryLot,saveEditDryLot,saveElecSettings,saveFreshPurchase,saveManualSale,saveMergedPack,savePackSettings,saveState,saveStickerSettings,searchCustomer,selectCustomer,shopeeMapName,showDryInner,showFileReady,showInner,showInnerStock,showLiveDayDetail,showLogin,showNotif,showPage,buildSidebar,toggleSidebar,startFirebaseSync,statusBadge,syncCustomersFromImport,toggleCustomerOrders,toggleDarkMode,tryPreview,tryShopeePreview,updateDRPreview,updateDryOutput,updateFreshBuyItem,updateFreshInfoBar,updateFreshInput,updateFreshTravelPreview,updateManualItem,updateMergePackPreview,updateSyncStatus });


export { renderAll, BOX_INITIAL_LOTS };
