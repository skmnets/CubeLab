"use strict";
/* CubeLab v1: local-first speedcubing timer. No network calls, libraries, or secrets. */
const STORAGE_KEY = 'cubelab-solves-v1';
const EVENTS = {
  '3x3': {label:'3×3×3', subtitle:'3×3 · Building consistency toward sub-8', targetCs:800, scrambleLen:20},
  '4x4': {label:'4×4×4', subtitle:'4×4 · Yau efficiency toward sub-30', targetCs:3000, scrambleLen:44},
  '5x5': {label:'5×5×5', subtitle:'5×5 · Yau reduction toward sub-60', targetCs:6000, scrambleLen:60}
};
const $ = (selector) => document.querySelector(selector);
let solves = loadSolves();
let activeEvent = '3x3';
let mode = 'manual';
let scramble = '';
let running = false, armed = false, startAt = 0, frameId = null;
let lastStopAt = -Infinity;
let toastTimer;

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function safeNowID() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function sanitizeSolve(s) {
  if (!s || typeof s !== 'object') return null;
  if (!EVENTS[s.event] || !Number.isInteger(s.baseCs) || s.baseCs < 0 || s.baseCs > 8640000) return null;
  const createdAt = typeof s.createdAt==='string' && Number.isFinite(Date.parse(s.createdAt)) ? s.createdAt : new Date().toISOString();
  return {id: String(s.id || safeNowID()).slice(0,100), event:s.event, baseCs:s.baseCs,
    penalty:['none','+2','DNF'].includes(s.penalty)?s.penalty:'none',
    source:['manual','keyboard','baseline'].includes(s.source)?s.source:'manual',
    note:String(s.note||'').slice(0,180), scramble:String(s.scramble||'').slice(0,400), createdAt};
}
function loadSolves() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeSolve).filter(Boolean);
  } catch { return []; }
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(solves)); }
  catch { toast('Storage unavailable or full. Export a backup to avoid losing data.',true); }
}
function toast(message,error=false) {
  const el=$('#toast'); el.textContent=message; el.classList.toggle('error',error); el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('visible'),3300);
}
function parseTime(input) {
  const raw = String(input).trim();
  if (!/^(?:\d{1,3}:)?\d{1,2}(?:\.\d{1,3})?$/.test(raw) && !/^\d{1,5}(?:\.\d{1,3})?$/.test(raw)) return null;
  let seconds;
  if (raw.includes(':')) {
    const [min, sec] = raw.split(':').map(Number);
    if (sec>=60) return null;
    seconds = min*60 + sec;
  } else seconds = Number(raw);
  if (!(seconds>0) || seconds>86400) return null;
  return Math.round(seconds*100);
}
function timeText(cs) {
  if (!Number.isFinite(cs)) return 'DNF';
  cs=Math.round(cs);const mins=Math.floor(cs/6000);const sec=Math.floor((cs%6000)/100);const cent=String(cs%100).padStart(2,'0');
  return mins>0?`${mins}:${String(sec).padStart(2,'0')}.${cent}`:`${sec}.${cent}`;
}
function effectiveCs(s) {return s.penalty==='DNF'?Infinity:s.baseCs+(s.penalty==='+2'?200:0);}
function effectiveText(s) {const val=effectiveCs(s);return val===Infinity?'DNF':`${timeText(val)}${s.penalty==='+2'?' (+2)':''}`;}
function eventSolves() { return solves.filter(s=>s.event===activeEvent).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)); }
function trimmedAverage(items) {
  const n=items.length, trim=Math.ceil(n*0.05);if(n<5)return null;
  const sorted=items.map(effectiveCs).sort((a,b)=>a-b);
  const kept=sorted.slice(trim,n-trim);
  return kept.some(x=>!Number.isFinite(x))?Infinity:Math.round(kept.reduce((a,b)=>a+b,0)/kept.length);
}
function rollingAverage(items,n){return items.length<n?null:trimmedAverage(items.slice(-n));}
function bestRolling(items,n){ if(items.length<n)return null;let best=Infinity;for(let i=n;i<=items.length;i++){const val=trimmedAverage(items.slice(i-n,i));if(val!==null && val<best)best=val;}return best; }
function metricText(v){return v===null?'—':timeText(v);}
function addSolve(baseCs,source,penalty='none',note='') {
  const s={id:safeNowID(),event:activeEvent,baseCs,source,penalty,note,scramble,createdAt:new Date().toISOString()};
  solves.push(s);persist();render();return s;
}
function manualSave(e) {
  e.preventDefault();const value=parseTime($('#time-input').value);
  if(value===null){toast('Enter a valid time such as 9.66 or 1:27.30',true);$('#time-input').focus();return;}
  addSolve(value,'manual',$('#manual-penalty').value,$('#solve-note').value.trim());
  $('#time-input').value='';$('#solve-note').value='';$('#manual-penalty').value='none';
  $('#readout').textContent=timeText(value);newScramble();$('#time-input').focus();toast('Solve saved');
}
function startTimer() {
  if(running)return;
  running=true;armed=false;startAt=performance.now();$('#readout').classList.remove('armed');$('#readout').classList.add('running');
  $('#timer-instruction').textContent='TIMER RUNNING';$('#timer-hint').textContent='Press Space or tap the button to stop';
  function tick(){if(!running)return;const cs=Math.floor((performance.now()-startAt)/10);$('#readout').textContent=timeText(cs);frameId=requestAnimationFrame(tick);}
  tick();
}
function stopTimer() {
  if(!running)return;
  const elapsed=Math.floor((performance.now()-startAt)/10);running=false;cancelAnimationFrame(frameId);
  if(elapsed<5){resetTimer();toast('Solve was too short to record',true);return;}
  $('#readout').textContent=timeText(elapsed);$('#readout').classList.remove('running');
  $('#timer-instruction').textContent='SOLVE SAVED';$('#timer-hint').textContent='Hold Space and release for next solve';
  addSolve(elapsed,'keyboard');lastStopAt=performance.now();newScramble();toast('Timed solve saved');
}
function resetTimer(){running=false;armed=false;cancelAnimationFrame(frameId);$('#readout').classList.remove('armed','running');$('#readout').textContent='0.00';$('#timer-instruction').textContent='HOLD SPACE TO ARM';$('#timer-hint').textContent='Release Space to start; press again to stop';}
function armTimer(){if(mode!=='keyboard'||running||performance.now()-lastStopAt<250)return;armed=true;$('#readout').classList.add('armed');$('#timer-instruction').textContent='READY — RELEASE TO START';}
function isInputFocused(){const el=document.activeElement;return !!(el && ['INPUT','TEXTAREA','SELECT'].includes(el.tagName));}
function keyboardDown(e){if(mode!=='keyboard'||isInputFocused())return;
  if(e.code==='Escape'){e.preventDefault();if(running||armed){resetTimer();toast('Timer canceled');}return;}
  if(e.code!=='Space')return;e.preventDefault();if(e.repeat)return;
  if(running)stopTimer();else armTimer();
}
function keyboardUp(e){if(mode==='keyboard' && e.code==='Space' && !isInputFocused()){e.preventDefault();if(armed)startTimer();}}
function changeMode(next){if(mode===next)return;if(running||armed)resetTimer();mode=next;
  $('#manual-tab').classList.toggle('active',next==='manual');$('#keyboard-tab').classList.toggle('active',next==='keyboard');
  $('#manual-tab').setAttribute('aria-pressed',String(next==='manual'));$('#keyboard-tab').setAttribute('aria-pressed',String(next==='keyboard'));
  $('#manual-form').classList.toggle('hidden',next!=='manual');$('#keyboard-controls').classList.toggle('hidden',next!=='keyboard');
  $('#readout').textContent='0.00';$('#timer-instruction').textContent=next==='manual'?'ENTER A TIME FROM YOUR QIYI TIMER':'HOLD SPACE TO ARM';
  $('#timer-hint').textContent=next==='manual'?'Solve using your physical timer, then record the displayed result below.':'Release Space to start; press again to stop';
  $('#readout').classList.remove('armed','running');
}
function randomInt(n){return Math.floor(Math.random()*n);}
function scrambleFor(ev){const opts=ev==='3x3'?['R','L','U','D','F','B']:['R','L','U','D','F','B','Rw','Lw','Uw','Dw','Fw','Bw'];const axes={R:0,L:0,U:1,D:1,F:2,B:2};let previousAxis=-1;const moves=[];
  for(let i=0;i<EVENTS[ev].scrambleLen;i++){let candidates=opts.filter(x=>axes[x[0]]!==previousAxis);const move=candidates[randomInt(candidates.length)];previousAxis=axes[move[0]];moves.push(move+['',"'",'2'][randomInt(3)]);}return moves.join(' ');
}
function newScramble(){scramble=scrambleFor(activeEvent);$('#scramble-text').textContent=scramble;}
function renderChart(items){const svg=$('#trend-chart');const data=items.slice(-50).map((s,i)=>({x:i,val:effectiveCs(s)})).filter(e=>Number.isFinite(e.val));const target=EVENTS[activeEvent].targetCs;
  $('#chart-count').textContent=`${Math.min(items.length,50)} recent`;
  if(!data.length){svg.innerHTML='<text x="300" y="105" text-anchor="middle" fill="#7f91a6" font-size="13">Record solves to see your performance trend</text>';return;}
  let vals=data.map(e=>e.val).concat(target);let lo=Math.min(...vals),hi=Math.max(...vals);const margin=Math.max(100,(hi-lo)*.18);lo=Math.max(0,lo-margin);hi+=margin;if(hi-lo<100){hi+=50;lo=Math.max(0,lo-50);}
  const plot={l:48,r:585,t:15,b:185};const x=i=>plot.l+(i/Math.max(1,Math.min(items.length,50)-1))*(plot.r-plot.l);const y=v=>plot.b-(v-lo)/(hi-lo)*(plot.b-plot.t);
  const grid=[0,.25,.5,.75,1].map(z=>{const yy=plot.b-z*(plot.b-plot.t),vv=lo+z*(hi-lo);return `<line x1="48" x2="585" y1="${yy}" y2="${yy}" stroke="#26374d" stroke-dasharray="4 5"/><text x="38" y="${yy+4}" fill="#798da4" font-size="10" text-anchor="end">${(vv/100).toFixed(1)}</text>`}).join('');
  const targetLine=`<line x1="48" x2="585" y1="${y(target)}" y2="${y(target)}" stroke="#8596ac" stroke-dasharray="6 4" stroke-width="1.3"/>`;
  const path=data.map((p,i)=>`${i?'L':'M'} ${x(p.x).toFixed(2)} ${y(p.val).toFixed(2)}`).join(' ');
  const dots=data.map(p=>`<circle cx="${x(p.x).toFixed(2)}" cy="${y(p.val).toFixed(2)}" r="2.3" fill="#54d8b8"><title>${timeText(p.val)}</title></circle>`).join('');
  svg.innerHTML=`${grid}${targetLine}<path d="${path}" fill="none" stroke="#3bc9aa" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
}
function render(){const items=eventSolves(),cfg=EVENTS[activeEvent];
  document.querySelectorAll('.event-btn').forEach(b=>b.classList.toggle('active',b.dataset.event===activeEvent));
  $('#event-tag').textContent=cfg.label;$('#subtitle').textContent=cfg.subtitle;
  const today=localDate(),todayItems=items.filter(s=>localDate(new Date(s.createdAt))===today);
  const validToday=todayItems.map(effectiveCs).filter(Number.isFinite);
  $('#session-mean').textContent=validToday.length?timeText(Math.round(validToday.reduce((a,b)=>a+b,0)/validToday.length)):'—';
  $('#session-count').textContent=`${todayItems.length} solve${todayItems.length===1?'':'s'} today`;
  const validAll=items.map(effectiveCs).filter(Number.isFinite);
  $('#best-single').textContent=validAll.length?timeText(Math.min(...validAll)):'—';
  [5,12,50,100].forEach(n=>{$(`#ao${n}`).textContent=metricText(rollingAverage(items,n));$(`#best-ao${n}`).textContent=`Best ${metricText(bestRolling(items,n))}`;});
  let allMean=validAll.length?Math.round(validAll.reduce((a,b)=>a+b,0)/validAll.length):null;
  const diff=allMean===null?null:(allMean-cfg.targetCs);
  $('#target-label').textContent=`SUB-${timeText(cfg.targetCs)}`;
  $('#target-number').textContent=timeText(cfg.targetCs);
  $('#current-vs-target').textContent=allMean===null?'Add a few solves to compare your pace.':diff<=0?`${timeText(allMean)} mean · Target pace reached!`:`${timeText(allMean)} mean · ${timeText(diff)} to remove`;
  $('#goal-fill').style.width=allMean===null?'0%':`${Math.max(0,Math.min(100,100*cfg.targetCs/allMean))}%`;
  $('#current-label').textContent='Mean of all valid solves';
  renderChart(items);renderHistory(items);
}
function renderHistory(items){const tbody=$('#history-body');tbody.textContent='';$('#history-count').textContent=`${items.length} recorded solve${items.length===1?'':'s'} · showing latest 25`;
  if(!items.length){let tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.style.padding='20px 8px';td.textContent='No solves yet. Enter a QiYi time or start the keyboard timer.';tr.append(td);tbody.append(tr);return;}
  items.slice(-25).reverse().forEach((s,i)=>{
    const tr=document.createElement('tr');tr.title=[new Date(s.createdAt).toLocaleString(),s.note].filter(Boolean).join(' · ');
    const num=document.createElement('td');num.textContent=String(items.length-i);
    const time=document.createElement('td');time.textContent=timeText(effectiveCs(s));
    const penalty=document.createElement('td');const pb=document.createElement('button');pb.type='button';pb.className='penalty-btn'+(s.penalty==='+2'?' penalized':s.penalty==='DNF'?' dnf':'');pb.textContent=s.penalty==='none'?'—':s.penalty;pb.title='Change penalty: none → +2 → DNF';pb.addEventListener('click',()=>{s.penalty=({none:'+2','+2':'DNF',DNF:'none'})[s.penalty];persist();render();});penalty.append(pb);
    const source=document.createElement('td');source.textContent=s.source==='baseline'?'Day 1':s.source;
    const actions=document.createElement('td');const del=document.createElement('button');del.type='button';del.textContent='✕';del.title='Delete solve';del.className='delete-btn';del.addEventListener('click',()=>{if(confirm(`Delete ${effectiveText(s)} solve?`)){solves=solves.filter(x=>x.id!==s.id);persist();render();toast('Solve deleted');}});actions.append(del);
    tr.append(num,time,penalty,source,actions);tbody.append(tr);
  });
}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportJSON(){download(`cubelab-backup-${localDate()}.json`,JSON.stringify({app:'CubeLab',version:1,exportedAt:new Date().toISOString(),solves},null,2),'application/json');toast(`Backup exported: ${solves.length} solves`);}
function csvQuote(v){return '"'+String(v??'').replaceAll('"','""')+'"';}
function exportCSV(){const cols=['event','date','timestamp','time_seconds','base_time_seconds','penalty','result','source','notes','scramble'];const rows=solves.map(s=>[s.event,localDate(new Date(s.createdAt)),s.createdAt,Number.isFinite(effectiveCs(s))?(effectiveCs(s)/100).toFixed(2):'',(s.baseCs/100).toFixed(2),s.penalty,timeText(effectiveCs(s)),s.source,s.note,s.scramble].map(csvQuote).join(','));download(`cubelab-solves-${localDate()}.csv`,[cols.join(','),...rows].join('\r\n'),'text/csv');toast(`CSV exported: ${solves.length} solves`);}
async function importJSON(event){const file=event.target.files[0];event.target.value='';if(!file)return;
  try{const raw=await file.text();const parsed=JSON.parse(raw);const incoming=Array.isArray(parsed)?parsed:parsed.solves;
    if(!Array.isArray(incoming)||incoming.length>50000)throw Error('Not a valid CubeLab backup');
    let added=0,skipped=0;const ids=new Set(solves.map(s=>s.id));for(const x of incoming){const s=sanitizeSolve(x);if(!s||ids.has(s.id)){skipped++;continue;}solves.push(s);ids.add(s.id);added++;}
    persist();render();toast(`Imported ${added} solves${skipped?` (${skipped} skipped)`:''}.`);
  }catch(e){toast(`Import failed: ${e.message}`,true);}
}
function loadBaseline(){
  if(solves.some(s=>String(s.id).startsWith('cubelab-day1-'))){toast('Day 1 sample is already loaded.');return;}
  const baseline={
    '3x3':`9.66, 10.31, 9.31, 11.43, 9.24, 12.31, 9.98, 9.10, 9.05, 8.77, 9.28, 11.63, 10.50, 8.66, 10.86, 11.38, 8.27, 9.48, 9.18, 10.13, 9.08, 7.93, 13.19, 11.02, 9.87, 8.86, 10.26, 10.10, 8.94, 9.98, 9.40, 11.30, 9.20, 9.61, 11.18, 8.79, 9.64, 9.69, 10.71, 9.62, 9.14, 9.28, 8.38, 8.92, 9.73, 9.17, 10.22, 8.73, 8.59, 9.26`,
    '4x4':`35.89, 39.99, 39.65, 37.29, 33.67`,
    '5x5':`1:27.30`
  };
  if(!confirm('Load your 50×3×3, 5×4×4, and 1×5×5 Day 1 results from our chat? Existing data will be kept.'))return;
  for(const [ev,line] of Object.entries(baseline)){
    line.split(',').map(s=>s.trim()).forEach((time,i)=>{
      const baseCs=parseTime(time);
      if(baseCs!==null)solves.push({id:`cubelab-day1-${ev}-${i}`,event:ev,baseCs,penalty:'none',source:'baseline',note:'Session 1 — Day 1',scramble:'',createdAt:new Date(Date.UTC(2026,9,31,12,0,i)).toISOString()});
    });
  }
  persist();render();toast('Imported all 56 Day 1 solves.');
}
function switchEvent(ev){if(!EVENTS[ev]||activeEvent===ev)return;if(running||armed)resetTimer();activeEvent=ev;$('#readout').textContent='0.00';newScramble();render();}
function init(){
  document.querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>switchEvent(b.dataset.event)));
  $('#manual-tab').addEventListener('click',()=>changeMode('manual'));$('#keyboard-tab').addEventListener('click',()=>changeMode('keyboard'));
  $('#manual-form').addEventListener('submit',manualSave);
  $('#new-scramble').addEventListener('click',newScramble);
  $('#touch-timer-btn').addEventListener('pointerdown',e=>{e.preventDefault();if(running)stopTimer();else armTimer();});
  $('#touch-timer-btn').addEventListener('pointerup',e=>{e.preventDefault();if(armed)startTimer();});
  $('#touch-timer-btn').addEventListener('pointercancel',()=>{if(armed)resetTimer();});
  document.addEventListener('keydown',keyboardDown);document.addEventListener('keyup',keyboardUp);
  window.addEventListener('blur',()=>{if(armed)resetTimer();});
  $('#export-csv').addEventListener('click',exportCSV);$('#export-json').addEventListener('click',exportJSON);
  $('#import-file').addEventListener('change',importJSON);$('#load-baseline').addEventListener('click',loadBaseline);
  $('#clear-event').addEventListener('click',()=>{const count=eventSolves().length;if(!count){toast('No solves to clear');return;}if(confirm(`Permanently delete all ${count} ${EVENTS[activeEvent].label} solves from local storage? Export a backup first.`)){solves=solves.filter(s=>s.event!==activeEvent);persist();render();toast('Event history cleared');}});
  const competition=new Date(2027,0,16,0,0,0);const days=Math.max(0,Math.ceil((competition-new Date())/86400000));$('#days-left').textContent=days;
  newScramble();render();
}
init();
