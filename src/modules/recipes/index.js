/* modules/recipes — บันทึกสูตรการอบเบื้องต้น (S.recipes).
   Each recipe: { id, name, icon, steps:[{temp,hours,note}], ingredients:[{name,qty,unit}],
   note, createdAt, updatedAt } — at least one ingredient is required; steps are
   the bake stages in order (e.g. 70°C 2 ชม. → 60°C 6 ชม.). Older recipes saved
   with a single top-level temp/hours are read as one step (getSteps). icon is
   optional — empty means auto (product icon by name, else 🧾).
   List + add/edit popup (#recipe-modal in index.html). Functions are exposed
   to window for the inline on* handlers, same as core/legacy.js. */
import { S, saveState, PRODUCT_ICONS } from '../../core/state.js';

const RECIPE_UNITS = ['กรัม', 'กก.', 'ชิ้น', 'ลูก', 'หัว', 'ฝัก', 'ช้อนชา', 'ช้อนโต๊ะ', 'ml'];

let recipeEditId = null;
let recipeIngredients = [];
let recipeSteps = [];
let recipeIcon = '';

const RECIPE_ICON_CHOICES = ['🥕','🎃','🌽','🍎','🥒','🥦','🌿','🍌','🍊','🍓','🥭','🍍','🍐','🍠','🥔','🫛','🥬','🥥','🍪','🧁','🌾','🐹','🔥','🧾'];
function autoIcon(name){return PRODUCT_ICONS[String(name||'').trim()]||'🧾';}
function recipeIconOf(r){return r.icon||autoIcon(r.name);}

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function notif(msg,type){window.showNotif?.(msg,type);}
function fmtNum(n){return Number.isFinite(n)?String(Math.round(n*100)/100):'';}
function getSteps(r){
  if(r?.steps?.length)return r.steps;
  if(r&&(r.temp!==''&&r.temp!=null||r.hours!==''&&r.hours!=null))return [{temp:r.temp??'',hours:r.hours??'',note:''}];
  return [];
}

// ---- List ----
function renderRecipeList(){
  const box=document.getElementById('recipe-list');if(!box)return;
  const q=(document.getElementById('recipe-search')?.value||'').trim().toLowerCase();
  const all=(S?.recipes||[]).slice().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  const list=q?all.filter(r=>r.name.toLowerCase().includes(q)||(r.ingredients||[]).some(i=>i.name.toLowerCase().includes(q))):all;
  const cnt=document.getElementById('recipe-count');if(cnt)cnt.textContent=`${list.length} สูตร`;
  if(!list.length){
    box.innerHTML=`<div class="card empty" style="grid-column:1/-1"><div class="ei">📖</div><p>${q?'ไม่พบสูตรที่ค้นหา':'ยังไม่มีสูตร — กด "+ เพิ่มสูตร" เพื่อเริ่มบันทึก'}</p></div>`;
    return;
  }
  box.innerHTML=list.map(r=>{
    const icon=esc(recipeIconOf(r));
    const steps=getSteps(r);
    const ings=r.ingredients||[];
    const totalH=steps.reduce((s,x)=>s+(+x.hours||0),0);
    const badges=[
      steps.length?`<span class="rc-badge">🔥 ${steps.length} ขั้นตอน</span>`:'',
      totalH?`<span class="rc-badge">⏱️ ${esc(fmtNum(totalH))} ชม.</span>`:'',
      `<span class="rc-badge">🥕 ${ings.length} วัตถุดิบ</span>`,
    ].join('');
    const stepsHtml=steps.length?`<div class="rc-section"><div class="rc-label">ขั้นตอนการอบ</div>${steps.map((x,i)=>`<div class="rc-step">
        <span class="rc-step-no">${i+1}</span>
        <span class="rc-step-val">${x.temp!==''&&x.temp!=null?`${esc(fmtNum(+x.temp))}°C`:'—'}</span>
        <span class="rc-step-val">${x.hours!==''&&x.hours!=null?`${esc(fmtNum(+x.hours))} ชม.`:'—'}</span>
        ${x.note?`<span class="rc-step-note">${esc(x.note)}</span>`:''}
      </div>`).join('')}</div>`:'';
    const ingsHtml=`<div class="rc-section"><div class="rc-label">วัตถุดิบ</div>${ings.map(i=>`<div class="rc-ing"><span>${esc(i.name)}</span><span class="rc-ing-qty">${i.qty!==''&&i.qty!=null?`${esc(fmtNum(+i.qty))} ${esc(i.unit||'')}`:''}</span></div>`).join('')}</div>`;
    return `<div class="recipe-card">
      <div class="rc-head">
        <span class="rc-icon">${icon}</span>
        <div class="rc-name">${esc(r.name)}</div>
        <button class="btn btn-outline btn-sm" onclick="openRecipeModal('${esc(r.id)}')">✏️ แก้ไข</button>
      </div>
      <div class="rc-badges">${badges}</div>
      ${stepsHtml}
      ${ingsHtml}
      ${r.note?`<div class="rc-note">📝 ${esc(r.note)}</div>`:''}
    </div>`;
  }).join('');
}

// ---- Modal ----
function openRecipeModal(id=null){
  recipeEditId=id;
  const r=id?(S.recipes||[]).find(x=>x.id===id):null;
  document.getElementById('rm-title').textContent=r?'แก้ไขสูตร':'เพิ่มสูตร';
  document.getElementById('rm-name').value=r?r.name:'';
  recipeIcon=r?.icon||'';
  document.getElementById('rm-note').value=r?.note||'';
  document.getElementById('rm-delete').style.display=r?'':'none';
  recipeSteps=getSteps(r).map(x=>({...x}));
  if(!recipeSteps.length)recipeSteps=[{temp:'',hours:'',note:''}];
  recipeIngredients=r&&r.ingredients?.length?r.ingredients.map(i=>({...i})):[{name:'',qty:'',unit:'กรัม'}];
  // name suggestions: dry products + ingredient names used before
  document.getElementById('rm-name-list').innerHTML=Object.keys(PRODUCT_ICONS).map(n=>`<option value="${esc(n)}">`).join('');
  const used=[...new Set((S.recipes||[]).flatMap(x=>(x.ingredients||[]).map(i=>i.name)).filter(Boolean))];
  document.getElementById('rm-ing-list').innerHTML=used.map(n=>`<option value="${esc(n)}">`).join('');
  renderRecipeIconPicker();renderRecipeSteps();renderRecipeIngredients();
  document.getElementById('recipe-modal').style.display='flex';
  document.getElementById('rm-name').focus();
}
function closeRecipeModal(){document.getElementById('recipe-modal').style.display='none';recipeEditId=null;recipeIngredients=[];recipeSteps=[];recipeIcon='';}

function renderRecipeIconPicker(){
  const box=document.getElementById('rm-icons');if(!box)return;
  const auto=autoIcon(document.getElementById('rm-name')?.value);
  document.getElementById('rm-icon-preview').textContent=recipeIcon||auto;
  box.innerHTML=`<button type="button" class="rm-icon-opt rm-icon-auto${recipeIcon?'':' active'}" onclick="pickRecipeIcon('')" title="อัตโนมัติตามชื่อสินค้า">อัตโนมัติ ${esc(auto)}</button>`+
    RECIPE_ICON_CHOICES.map(ic=>`<button type="button" class="rm-icon-opt${recipeIcon===ic?' active':''}" onclick="pickRecipeIcon('${ic}')" aria-label="เลือก ${ic}">${ic}</button>`).join('');
}
function pickRecipeIcon(ic){recipeIcon=ic;renderRecipeIconPicker();}

function renderRecipeSteps(){
  const box=document.getElementById('rm-steps');if(!box)return;
  const one=recipeSteps.length<=1;
  box.innerHTML=recipeSteps.map((st,i)=>`<div class="recipe-step-row">
    <span class="recipe-step-no">${i+1}</span>
    <input type="number" placeholder="°C" step="any" min="0" value="${esc(st.temp)}" oninput="updateRecipeStep(${i},'temp',this.value)" aria-label="อุณหภูมิ (°C)">
    <input type="number" placeholder="ชม." step="any" min="0" value="${esc(st.hours)}" oninput="updateRecipeStep(${i},'hours',this.value);updateRecipeStepTotal()" aria-label="เวลา (ชม.)">
    <input type="text" placeholder="รายละเอียด (เช่น กลับด้าน)" value="${esc(st.note)}" oninput="updateRecipeStep(${i},'note',this.value)">
    <button class="modal-x" title="ลบขั้นตอน" aria-label="ลบขั้นตอน" onclick="removeRecipeStep(${i})"${one?' disabled style="opacity:.3;cursor:not-allowed"':''}>✕</button>
  </div>`).join('');
  updateRecipeStepTotal();
}
function updateRecipeStepTotal(){
  const el=document.getElementById('rm-steps-total');if(!el)return;
  const t=recipeSteps.reduce((s,x)=>s+(+x.hours||0),0);
  el.textContent=t?`รวม ${fmtNum(t)} ชม.`:'';
}
function addRecipeStep(){
  recipeSteps.push({temp:'',hours:'',note:''});
  renderRecipeSteps();
  document.querySelector('#rm-steps .recipe-step-row:last-child input')?.focus();
}
function updateRecipeStep(i,key,val){if(recipeSteps[i])recipeSteps[i][key]=val;}
function removeRecipeStep(i){
  if(recipeSteps.length<=1)return;
  recipeSteps.splice(i,1);renderRecipeSteps();
}

function renderRecipeIngredients(){
  const box=document.getElementById('rm-ings');if(!box)return;
  const one=recipeIngredients.length<=1;
  box.innerHTML=recipeIngredients.map((ing,i)=>`<div class="recipe-ing-row">
    <input type="text" list="rm-ing-list" placeholder="วัตถุดิบ" value="${esc(ing.name)}" oninput="updateRecipeIngredient(${i},'name',this.value)">
    <input type="number" placeholder="ปริมาณ" step="any" min="0" value="${esc(ing.qty)}" oninput="updateRecipeIngredient(${i},'qty',this.value)">
    <select onchange="updateRecipeIngredient(${i},'unit',this.value)">${[...new Set([...RECIPE_UNITS,ing.unit||'กรัม'])].map(u=>`<option${u===(ing.unit||'กรัม')?' selected':''}>${esc(u)}</option>`).join('')}</select>
    <button class="modal-x" title="ลบวัตถุดิบ" aria-label="ลบวัตถุดิบ" onclick="removeRecipeIngredient(${i})"${one?' disabled style="opacity:.3;cursor:not-allowed"':''}>✕</button>
  </div>`).join('');
}
function addRecipeIngredient(){
  recipeIngredients.push({name:'',qty:'',unit:'กรัม'});
  renderRecipeIngredients();
  document.querySelector('#rm-ings .recipe-ing-row:last-child input')?.focus();
}
function updateRecipeIngredient(i,key,val){if(recipeIngredients[i])recipeIngredients[i][key]=val;}
function removeRecipeIngredient(i){
  if(recipeIngredients.length<=1)return;
  recipeIngredients.splice(i,1);renderRecipeIngredients();
}

function saveRecipe(){
  const name=document.getElementById('rm-name').value.trim();
  if(!name){notif('กรุณากรอกชื่อสูตร','error');return;}
  const ingredients=recipeIngredients
    .map(i=>({name:String(i.name||'').trim(),qty:i.qty===''||i.qty==null?'':+i.qty,unit:i.unit||''}))
    .filter(i=>i.name);
  if(!ingredients.length){notif('กรุณาใส่วัตถุดิบอย่างน้อย 1 รายการ','error');return;}
  const num=v=>v===''||v==null?'':+v;
  const steps=recipeSteps
    .map(x=>({temp:num(x.temp),hours:num(x.hours),note:String(x.note||'').trim()}))
    .filter(x=>x.temp!==''||x.hours!==''||x.note);
  const data={name,icon:recipeIcon,steps,ingredients,
    note:document.getElementById('rm-note').value.trim(),updatedAt:new Date().toISOString()};
  if(!S.recipes)S.recipes=[];
  const r=recipeEditId&&S.recipes.find(x=>x.id===recipeEditId);
  if(r){Object.assign(r,data);delete r.temp;delete r.hours;}
  else S.recipes.push({id:'recipe-'+Date.now(),...data,createdAt:data.updatedAt});
  saveState();closeRecipeModal();renderRecipeList();
  notif('บันทึกสูตรแล้ว ✅');
}
function deleteRecipeFromModal(){
  if(!recipeEditId)return;
  if(!confirm('ลบสูตรนี้?'))return;
  S.recipes=(S.recipes||[]).filter(r=>r.id!==recipeEditId);
  saveState();closeRecipeModal();renderRecipeList();
  notif('ลบสูตรแล้ว ✅');
}

Object.assign(window, { renderRecipeList,openRecipeModal,closeRecipeModal,renderRecipeIconPicker,pickRecipeIcon,addRecipeStep,updateRecipeStep,removeRecipeStep,updateRecipeStepTotal,addRecipeIngredient,updateRecipeIngredient,removeRecipeIngredient,saveRecipe,deleteRecipeFromModal });

export { renderRecipeList };
