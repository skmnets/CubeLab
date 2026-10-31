"use strict";
/* CubeLab v3: timer, customizable goals, random-move scrambles and exact cube nets. No network calls, libraries, or secrets. */
const STORAGE_KEY = 'cubelab-solves-v1'; // unchanged: preserves existing v1 solve histories
const GOALS_STORAGE_KEY = 'cubelab-goals-v2';
const EVENTS = {
  '3x3': {label:'3×3×3', method:'CFOP', scrambleLen:20},
  '4x4': {label:'4×4×4', method:'Yau', scrambleLen:44},
  '5x5': {label:'5×5×5', method:'Yau', scrambleLen:60}
};
// Public, generic starter template: no personal solve times are embedded here.
const DEFAULT_GOALS = {
  competitionDate:'2027-01-16',
  events:{
    '3x3':{competitionCs:800,stretchCs:750,metric:50,checkpoints:[{date:'2026-11-15',targetCs:930},{date:'2026-12-15',targetCs:850}]},
    '4x4':{competitionCs:3000,stretchCs:2800,metric:12,checkpoints:[{date:'2026-11-15',targetCs:3550},{date:'2026-12-15',targetCs:3200}]},
    '5x5':{competitionCs:6000,stretchCs:5500,metric:12,checkpoints:[{date:'2026-11-15',targetCs:8000},{date:'2026-12-15',targetCs:7000}]}
  }
};
const $ = (selector) => document.querySelector(selector);
let solves = loadSolves();
let goals = loadGoals();
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
function validDateString(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number);
  const t=new Date(Date.UTC(y,m-1,d));
  return t.getUTCFullYear()===y && t.getUTCMonth()===m-1 && t.getUTCDate()===d;
}
function goalCs(value,fallback) {return Number.isInteger(value)&&value>0&&value<=8640000?value:fallback;}
function sanitizeGoals(value){
  const result=structuredClone(DEFAULT_GOALS);
  if(!value||typeof value!=='object'||Array.isArray(value))return result;
  if(validDateString(value.competitionDate))result.competitionDate=value.competitionDate;
  for(const ev of Object.keys(EVENTS)){
    const src=value.events?.[ev];if(!src||typeof src!=='object')continue;
    const target=result.events[ev];
    target.competitionCs=goalCs(src.competitionCs,target.competitionCs);
    target.stretchCs=goalCs(src.stretchCs,target.stretchCs);
    if([5,12,50].includes(src.metric))target.metric=src.metric;
    if(Array.isArray(src.checkpoints))for(let i=0;i<2;i++){
      const c=src.checkpoints[i];if(!c||typeof c!=='object')continue;
      if(validDateString(c.date))target.checkpoints[i].date=c.date;
      target.checkpoints[i].targetCs=goalCs(c.targetCs,target.checkpoints[i].targetCs);
    }
  }
  return result;
}
function loadGoals(){
  try{return sanitizeGoals(JSON.parse(localStorage.getItem(GOALS_STORAGE_KEY)||'null'));}
  catch{return structuredClone(DEFAULT_GOALS);}
}
function persistGoals(){
  try{localStorage.setItem(GOALS_STORAGE_KEY,JSON.stringify(goals));}
  catch{toast('Could not save goals. Export your data as a backup.',true);}
}
function goalLabel(cs){return `Sub-${timeText(cs)}`;}
function displayGoalDate(value){
  const [y,m,d]=value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d)));
}
function updateCountdown(){
  const [y,m,d]=goals.competitionDate.split('-').map(Number);
  const today=new Date(),until=Math.round((Date.UTC(y,m-1,d)-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
  $('#days-left').textContent=Math.max(0,until);
  $('#competition-date-label').textContent=displayGoalDate(goals.competitionDate).toUpperCase()+', '+y;
}
function milestoneStatus(value,target,n){
  if(value===null)return `Need ${n} solves`;
  if(!Number.isFinite(value))return 'DNF';
  return value<target?'Reached':`${timeText(value-target)} away`;
}
function goalEditorMarkup(ev){
  const name=EVENTS[ev].label;
  const field=(id,label,type='text')=>`<div class="goal-field"><label for="goal-${ev}-${id}">${label}</label><input id="goal-${ev}-${id}" type="${type}" ${type==='text'?'placeholder="9.30 or 1:20.00" inputmode="decimal"':''} required /></div>`;
  return `<section class="goal-editor-card"><h3 class="goal-editor-title">${name}<small>${EVENTS[ev].method}</small></h3>
    ${field('competition','Competition Ao5 target')}
    <div class="field-pair">${field('c1-time','Checkpoint 1 target')}${field('c1-date','Checkpoint 1 date','date')}</div>
    <div class="field-pair">${field('c2-time','Checkpoint 2 target')}${field('c2-date','Checkpoint 2 date','date')}</div>
    ${field('stretch','Stretch Ao5 target')}
    <div class="goal-field"><label for="goal-${ev}-metric">Checkpoints measured using</label><select id="goal-${ev}-metric"><option value="5">Latest Ao5</option><option value="12">Latest Ao12</option><option value="50">Latest Ao50</option></select></div></section>`;
}
function populateGoalEditor(config){
  $('#competition-date').value=config.competitionDate;
  for(const ev of Object.keys(EVENTS)){
    const g=config.events[ev];
    $(`#goal-${ev}-competition`).value=timeText(g.competitionCs);
    $(`#goal-${ev}-stretch`).value=timeText(g.stretchCs);
    $(`#goal-${ev}-metric`).value=String(g.metric);
    for(let i=0;i<2;i++){
      $(`#goal-${ev}-c${i+1}-time`).value=timeText(g.checkpoints[i].targetCs);
      $(`#goal-${ev}-c${i+1}-date`).value=g.checkpoints[i].date;
    }
  }
}
function openGoals(){if(running||armed)resetTimer();populateGoalEditor(goals);const d=$('#goals-dialog');if(d.showModal)d.showModal();else d.setAttribute('open','');}
function closeGoals(){const d=$('#goals-dialog');if(d.close)d.close();else d.removeAttribute('open');}
function readGoalTime(ev,suffix){
  const input=$(`#goal-${ev}-${suffix}`),value=parseTime(input.value);
  if(value===null){input.setCustomValidity('Enter a valid time (e.g. 9.30 or 1:20.00).');input.reportValidity();throw Error('Enter a valid target time');}
  input.setCustomValidity('');return value;
}
function saveGoals(e){
  e.preventDefault();
  if(!validDateString($('#competition-date').value)){toast('Set a valid competition date.',true);return;}
  const next={competitionDate:$('#competition-date').value,events:{}};
  try{for(const ev of Object.keys(EVENTS)){
    const checkpoints=[];
    for(let i=0;i<2;i++){
      const date=$(`#goal-${ev}-c${i+1}-date`).value;
      if(!validDateString(date))throw Error(`Invalid checkpoint date for ${EVENTS[ev].label}`);
      checkpoints.push({date,targetCs:readGoalTime(ev,`c${i+1}-time`)});
    }
    if(checkpoints[0].date>checkpoints[1].date)throw Error(`Checkpoint 1 must occur before checkpoint 2 for ${EVENTS[ev].label}`);
    next.events[ev]={competitionCs:readGoalTime(ev,'competition'),stretchCs:readGoalTime(ev,'stretch'),metric:Number($(`#goal-${ev}-metric`).value),checkpoints};
  }}catch(error){toast(error.message,true);return;}
  goals=sanitizeGoals(next);persistGoals();closeGoals();render();toast('Goals saved privately in this browser');
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
  if(value===null){toast('Enter a valid time such as 12.34 or 1:23.45',true);$('#time-input').focus();return;}
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
function keyboardDown(e){if($('#goals-dialog').open||mode!=='keyboard'||isInputFocused())return;
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
// Sticker model: each visible sticker has a 3D coordinate and outward normal.
// Applying a face turn rotates the selected layer(s), so wide turns on 4x4/5x5
// display accurately. The diagram uses U:white, D:yellow, F:green,
// B:blue, R:red, L:orange and an unfolded U/L/F/R/B/D net.
const FACE_COLORS={U:'#f5f5f5',D:'#f6d945',F:'#24ad52',B:'#2969de',R:'#d43b40',L:'#f58b2d'};
const FACE_NORMALS={U:[0,1,0],D:[0,-1,0],F:[0,0,1],B:[0,0,-1],R:[1,0,0],L:[-1,0,0]};
function faceletCoordinate(face,row,col,n){
  const h=n-1;
  switch(face){
    case 'U':return [col,h,row];
    case 'D':return [col,0,h-row];
    case 'F':return [col,h-row,h];
    case 'B':return [h-col,h-row,0];
    case 'R':return [h,h-row,h-col];
    case 'L':return [0,h-row,col];
  }
  throw Error('Unknown cube face');
}
function faceletPosition(normal,x,y,z,n){
  const h=n-1;
  if(normal[1]===1)return ['U',z,x];
  if(normal[1]===-1)return ['D',h-z,x];
  if(normal[2]===1)return ['F',h-y,x];
  if(normal[2]===-1)return ['B',h-y,h-x];
  if(normal[0]===1)return ['R',h-y,h-z];
  if(normal[0]===-1)return ['L',h-y,z];
  throw Error('Invalid facelet normal');
}
function cubeStickers(n){
  const stickers=[];
  for(const face of ['U','L','F','R','B','D']){
    for(let row=0;row<n;row++)for(let col=0;col<n;col++){
      stickers.push({p:faceletCoordinate(face,row,col,n),v:FACE_NORMALS[face].slice(),color:face});
    }
  }
  return stickers;
}
// Positive 90 degree right-hand rotations around x,y,z.
function quarterTurn(sticker,axis,n){
  const h=n-1,[x,y,z]=sticker.p,[vx,vy,vz]=sticker.v;
  if(axis===0){sticker.p=[x,h-z,y];sticker.v=[vx,-vz,vy];}
  if(axis===1){sticker.p=[z,y,h-x];sticker.v=[vz,vy,-vx];}
  if(axis===2){sticker.p=[h-y,x,z];sticker.v=[-vy,vx,vz];}
}
function applyCubeMove(stickers,token,n){
  const m=/^([RLUDFB])(w?)(2|')?$/.exec(token);
  if(!m)throw Error('Invalid scramble move: '+token);
  const [face,wide,modifier]=m.slice(1);
  const positive=['R','U','F'].includes(face);
  const axis=face==='R'||face==='L'?0:face==='U'||face==='D'?1:2;
  const depth=wide?2:1;
  const cw=positive?-1:1;
  const steps=modifier==='2'?2:(modifier==="'"?-cw:cw);
  for(const sticker of stickers){
    const coord=sticker.p[axis];
    if(positive?coord<n-depth:coord>=depth)continue;
    for(let turn=0;turn<(steps+4)%4;turn++)quarterTurn(sticker,axis,n);
  }
}
function scrambleNetColors(n,alg){
  const stickers=cubeStickers(n);
  for(const token of alg.trim().split(/\s+/).filter(Boolean))applyCubeMove(stickers,token,n);
  const result={};
  for(const face of ['U','L','F','R','B','D'])result[face]=Array(n*n).fill(null);
  for(const {p,v,color} of stickers){
    const [face,row,col]=faceletPosition(v,...p,n);
    const idx=row*n+col;
    if(result[face][idx]!==null)throw Error('Cube net has overlapping stickers');
    result[face][idx]=color;
  }
  return result;
}
function renderCubeNet(){
  const n=Number(activeEvent[0]);
  const colors=scrambleNetColors(n,scramble);
  const container=$('#cube-net');
  container.replaceChildren();
  container.style.setProperty('--cube-n',String(n));
  $('#net-size').textContent=`${n}×${n}`;
  container.setAttribute('aria-label',`${n} by ${n} cube unfolded net after: ${scramble}`);
  for(const face of ['U','L','F','R','B','D']){
    const panel=document.createElement('div');panel.className='cube-face';panel.dataset.face=face;
    panel.title=`${face} face`;
    for(const color of colors[face]){
      const sticker=document.createElement('span');sticker.className='cube-sticker';
      sticker.style.backgroundColor=FACE_COLORS[color];
      panel.appendChild(sticker);
    }
    container.appendChild(panel);
  }
}
function newScramble(){scramble=scrambleFor(activeEvent);$('#scramble-text').textContent=scramble;renderCubeNet();}
function renderChart(items){const svg=$('#trend-chart');const data=items.slice(-50).map((s,i)=>({x:i,val:effectiveCs(s)})).filter(e=>Number.isFinite(e.val));const target=goals.events[activeEvent].competitionCs;
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
function render(){const items=eventSolves(),cfg=EVENTS[activeEvent],goal=goals.events[activeEvent];
  document.querySelectorAll('.event-btn').forEach(b=>{
    const ev=b.dataset.event;b.classList.toggle('active',ev===activeEvent);
    b.querySelector('.event-target').textContent='< '+timeText(goals.events[ev].competitionCs);
  });
  $('#event-tag').textContent=cfg.label;
  $('#subtitle').textContent=`${cfg.label} · ${cfg.method} · ${goalLabel(goal.competitionCs)} Ao5`;
  updateCountdown();
  const today=localDate(),todayItems=items.filter(s=>localDate(new Date(s.createdAt))===today);
  const validToday=todayItems.map(effectiveCs).filter(Number.isFinite);
  $('#session-mean').textContent=validToday.length?timeText(Math.round(validToday.reduce((a,b)=>a+b,0)/validToday.length)):'—';
  $('#session-count').textContent=`${todayItems.length} solve${todayItems.length===1?'':'s'} today`;
  const validAll=items.map(effectiveCs).filter(Number.isFinite);
  $('#best-single').textContent=validAll.length?timeText(Math.min(...validAll)):'—';
  [5,12,50,100].forEach(n=>{$(`#ao${n}`).textContent=metricText(rollingAverage(items,n));$(`#best-ao${n}`).textContent=`Best ${metricText(bestRolling(items,n))}`;});
  const ao5=rollingAverage(items,5),benchmark=rollingAverage(items,goal.metric);
  $('#target-label').textContent=goalLabel(goal.competitionCs).toUpperCase();
  $('#target-number').textContent=`${timeText(goal.competitionCs)} target`;
  $('#current-vs-target').textContent=ao5===null?'Record five solves to compare your competition-average pace.':
    !Number.isFinite(ao5)?'Latest Ao5: DNF · Keep practicing.':ao5<goal.competitionCs?
      `Latest Ao5 ${timeText(ao5)} · Competition goal reached!`:
      `Latest Ao5 ${timeText(ao5)} · ${timeText(ao5-goal.competitionCs)} above target`;
  // Pace ratio, not % of improvement since a personal starting baseline isn't assumed.
  const pace=ao5===null||!Number.isFinite(ao5)?0:Math.round(Math.max(0,Math.min(100,100*goal.competitionCs/Math.max(1,ao5))));
  $('#goal-fill').style.width=`${pace}%`;
  $('#goal-track').setAttribute('aria-valuenow',String(pace));
  $('#current-label').textContent='Latest Ao5 · pace ratio (100% at goal)';
  $('#goal-benchmark-name').textContent=`Tracked with Ao${goal.metric}`;
  for(let i=0;i<2;i++){
    const c=goal.checkpoints[i],e=i===0?'one':'two',status=milestoneStatus(benchmark,c.targetCs,goal.metric);
    $(`#milestone-${e}`).textContent=`${displayGoalDate(c.date)} · ${goalLabel(c.targetCs)}`;
    $(`#milestone-${e}-status`).textContent=status;
    $(`#milestone-${e}-status`).classList.toggle('goal-met',status==='Reached');
  }
  $('#stretch-goal').textContent=`Stretch · ${goalLabel(goal.stretchCs)} Ao5`;
  const stretchStatus=milestoneStatus(ao5,goal.stretchCs,5);
  $('#stretch-status').textContent=stretchStatus;$('#stretch-status').classList.toggle('goal-met',stretchStatus==='Reached');
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
function exportJSON(){download(`cubelab-backup-${localDate()}.json`,JSON.stringify({app:'CubeLab',version:3,exportedAt:new Date().toISOString(),goals,solves},null,2),'application/json');toast(`Backup exported: ${solves.length} solves + your goals`);}
function csvQuote(v){return '"'+String(v??'').replaceAll('"','""')+'"';}
function exportCSV(){const cols=['event','date','timestamp','time_seconds','base_time_seconds','penalty','result','source','notes','scramble'];const rows=solves.map(s=>[s.event,localDate(new Date(s.createdAt)),s.createdAt,Number.isFinite(effectiveCs(s))?(effectiveCs(s)/100).toFixed(2):'',(s.baseCs/100).toFixed(2),s.penalty,timeText(effectiveCs(s)),s.source,s.note,s.scramble].map(csvQuote).join(','));download(`cubelab-solves-${localDate()}.csv`,[cols.join(','),...rows].join('\r\n'),'text/csv');toast(`CSV exported: ${solves.length} solves`);}
async function importJSON(event){const file=event.target.files[0];event.target.value='';if(!file)return;
  try{const raw=await file.text();const parsed=JSON.parse(raw);const incoming=Array.isArray(parsed)?parsed:parsed.solves;
    if(!Array.isArray(incoming)||incoming.length>50000)throw Error('Not a valid CubeLab backup');
    let added=0,skipped=0;const ids=new Set(solves.map(s=>s.id));for(const x of incoming){const s=sanitizeSolve(x);if(!s||ids.has(s.id)){skipped++;continue;}solves.push(s);ids.add(s.id);added++;}
    persist();
    let importedGoals=false;
    if(parsed && !Array.isArray(parsed) && parsed.goals && confirm('This backup includes custom goals. Import those goals too? Your current goal settings will be replaced.')){
      goals=sanitizeGoals(parsed.goals);persistGoals();importedGoals=true;
    }
    render();toast(`Imported ${added} solves${skipped?` (${skipped} skipped)`:''}${importedGoals?' and goal settings':''}.`);
  }catch(e){toast(`Import failed: ${e.message}`,true);}
}
function switchEvent(ev){if(!EVENTS[ev]||activeEvent===ev)return;if(running||armed)resetTimer();activeEvent=ev;$('#readout').textContent='0.00';newScramble();render();}
function init(){
  document.querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>switchEvent(b.dataset.event)));
  $('#goal-editor-grid').innerHTML=Object.keys(EVENTS).map(goalEditorMarkup).join('');
  $('#edit-goals').addEventListener('click',openGoals);
  $('#close-goals').addEventListener('click',closeGoals);
  $('#cancel-goals').addEventListener('click',closeGoals);
  $('#goals-form').addEventListener('submit',saveGoals);
  $('#goal-editor-grid').addEventListener('input',e=>{if(e.target instanceof HTMLInputElement)e.target.setCustomValidity('');});
  $('#reset-goals').addEventListener('click',()=>{if(confirm('Load the recommended 11-week template into the editor? Click Save goals to apply it.')){populateGoalEditor(DEFAULT_GOALS);toast('Template loaded into editor; click Save goals to apply');}});
  $('#goals-dialog').addEventListener('click',e=>{if(e.target===$('#goals-dialog'))closeGoals();});
  $('#manual-tab').addEventListener('click',()=>changeMode('manual'));$('#keyboard-tab').addEventListener('click',()=>changeMode('keyboard'));
  $('#manual-form').addEventListener('submit',manualSave);
  $('#new-scramble').addEventListener('click',newScramble);
  $('#touch-timer-btn').addEventListener('pointerdown',e=>{e.preventDefault();if(running)stopTimer();else armTimer();});
  $('#touch-timer-btn').addEventListener('pointerup',e=>{e.preventDefault();if(armed)startTimer();});
  $('#touch-timer-btn').addEventListener('pointercancel',()=>{if(armed)resetTimer();});
  document.addEventListener('keydown',keyboardDown);document.addEventListener('keyup',keyboardUp);
  window.addEventListener('blur',()=>{if(armed)resetTimer();});
  $('#export-csv').addEventListener('click',exportCSV);$('#export-json').addEventListener('click',exportJSON);
  $('#import-file').addEventListener('change',importJSON);
  $('#clear-event').addEventListener('click',()=>{const count=eventSolves().length;if(!count){toast('No solves to clear');return;}if(confirm(`Permanently delete all ${count} ${EVENTS[activeEvent].label} solves from local storage? Export a backup first.`)){solves=solves.filter(s=>s.event!==activeEvent);persist();render();toast('Event history cleared');}});
  updateCountdown();
  newScramble();render();
}
init();
