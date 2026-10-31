"use strict";
/*
 * CubeLab v4 — Main Controller & Application Orchestrator
 * Integrates timer, analytics, stage splits, coaching, training planner, and 2D net.
 * 100% browser-local, zero tracking, zero API keys.
 */

const STORAGE_KEY = 'cubelab-solves-v1';       // Preserves existing solve histories
const GOALS_STORAGE_KEY = 'cubelab-goals-v2';   // Preserves user goals
const PLAN_STORAGE_KEY = 'cubelab-plan-v2';

const EVENTS = {
  '3x3': { label: '3×3×3', method: 'CFOP', scrambleLen: 20 },
  '4x4': { label: '4×4×4', method: 'Yau', scrambleLen: 44 },
  '5x5': { label: '5×5×5', method: 'Yau', scrambleLen: 60 }
};

const DEFAULT_GOALS = {
  competitionDate: '2027-01-16',
  events: {
    '3x3': { competitionCs: 800, stretchCs: 750, metric: 50, checkpoints: [{ date: '2026-11-15', targetCs: 930 }, { date: '2026-12-15', targetCs: 850 }] },
    '4x4': { competitionCs: 3000, stretchCs: 2800, metric: 12, checkpoints: [{ date: '2026-11-15', targetCs: 3550 }, { date: '2026-12-15', targetCs: 3200 }] },
    '5x5': { competitionCs: 6000, stretchCs: 5500, metric: 12, checkpoints: [{ date: '2026-11-15', targetCs: 8000 }, { date: '2026-12-15', targetCs: 7000 }] }
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Application State
let solves = loadSolves();
let goals = loadGoals();
let trainingPlan = CubePlanner.loadPlan();
let stageConfigs = CubeSplits.loadStageConfigs();

let activeEvent = '3x3';
let currentView = 'timer';
let mode = 'manual';
let scramble = '';
let running = false, armed = false, startAt = 0, frameId = null;
let lastStopAt = -Infinity;
let toastTimer;

/* ================= STORAGE & SANITIZATION ================= */

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeNowID() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeSolve(s) {
  if (!s || typeof s !== 'object') return null;
  if (!EVENTS[s.event] || !Number.isInteger(s.baseCs) || s.baseCs < 0 || s.baseCs > 8640000) return null;
  const createdAt = typeof s.createdAt === 'string' && Number.isFinite(Date.parse(s.createdAt)) ? s.createdAt : new Date().toISOString();
  
  let validSplits;
  if (Array.isArray(s.splits) && s.splits.length >= 2) {
    validSplits = s.splits.map(st => ({
      name: String(st.name || '').slice(0, 40),
      cs: Math.max(0, Math.round(Number(st.cs) || 0))
    }));
  }

  return {
    id: String(s.id || safeNowID()).slice(0, 100),
    event: s.event,
    baseCs: s.baseCs,
    penalty: ['none', '+2', 'DNF'].includes(s.penalty) ? s.penalty : 'none',
    source: ['manual', 'keyboard', 'baseline'].includes(s.source) ? s.source : 'manual',
    sessionType: ['full', 'drill', 'competition'].includes(s.sessionType) ? s.sessionType : 'full',
    note: String(s.note || '').slice(0, 180),
    scramble: String(s.scramble || '').slice(0, 400),
    createdAt,
    splits: validSplits
  };
}

function loadSolves() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeSolve).filter(Boolean);
  } catch {
    return [];
  }
}

function persistSolves() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(solves));
  } catch {
    toast('Local storage full or unavailable. Export a backup to prevent data loss.', true);
  }
}

function validDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function sanitizeGoals(value) {
  const result = structuredClone(DEFAULT_GOALS);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  if (validDateString(value.competitionDate)) result.competitionDate = value.competitionDate;
  for (const ev of Object.keys(EVENTS)) {
    const src = value.events?.[ev];
    if (!src || typeof src !== 'object') continue;
    const target = result.events[ev];
    if (Number.isInteger(src.competitionCs) && src.competitionCs > 0) target.competitionCs = src.competitionCs;
    if (Number.isInteger(src.stretchCs) && src.stretchCs > 0) target.stretchCs = src.stretchCs;
    if ([5, 12, 50].includes(src.metric)) target.metric = src.metric;
    if (Array.isArray(src.checkpoints)) {
      for (let i = 0; i < 2; i++) {
        const c = src.checkpoints[i];
        if (!c || typeof c !== 'object') continue;
        if (validDateString(c.date)) target.checkpoints[i].date = c.date;
        if (Number.isInteger(c.targetCs) && c.targetCs > 0) target.checkpoints[i].targetCs = c.targetCs;
      }
    }
  }
  return result;
}

function loadGoals() {
  try {
    return sanitizeGoals(JSON.parse(localStorage.getItem(GOALS_STORAGE_KEY) || 'null'));
  } catch {
    return structuredClone(DEFAULT_GOALS);
  }
}

function persistGoals() {
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
  } catch {
    toast('Could not save goals to storage.', true);
  }
}

function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3400);
}

function eventSolves(ev = activeEvent) {
  return solves.filter(s => s.event === ev).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function addSolve(baseCs, source, penalty = 'none', note = '', splits = undefined, sessionType = 'full') {
  const s = {
    id: safeNowID(),
    event: activeEvent,
    baseCs,
    source,
    penalty,
    sessionType,
    note,
    scramble,
    createdAt: new Date().toISOString(),
    splits
  };
  solves.push(s);
  persistSolves();
  render();
  return s;
}

/* ================= TIMER & SCRAMBLER ================= */

function randomInt(n) { return Math.floor(Math.random() * n); }

function scrambleFor(ev) {
  const opts = ev === '3x3' ? ['R', 'L', 'U', 'D', 'F', 'B'] : ['R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw'];
  const axes = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
  let previousAxis = -1;
  const moves = [];
  for (let i = 0; i < EVENTS[ev].scrambleLen; i++) {
    const candidates = opts.filter(x => axes[x[0]] !== previousAxis);
    const move = candidates[randomInt(candidates.length)];
    previousAxis = axes[move[0]];
    moves.push(move + ['', "'", '2'][randomInt(3)]);
  }
  return moves.join(' ');
}

// 3D Sticker-level Simulation for 2D Unfolded Net (White U, Green F)
const FACE_COLORS = { U: '#f5f5f5', D: '#f6d945', F: '#24ad52', B: '#2969de', R: '#d43b40', L: '#f58b2d' };
const FACE_NORMALS = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };

function faceletCoordinate(face, row, col, n) {
  const h = n - 1;
  switch (face) {
    case 'U': return [col, h, row];
    case 'D': return [col, 0, h - row];
    case 'F': return [col, h - row, h];
    case 'B': return [h - col, h - row, 0];
    case 'R': return [h, h - row, h - col];
    case 'L': return [0, h - row, col];
  }
}

function faceletPosition(normal, x, y, z, n) {
  const h = n - 1;
  if (normal[1] === 1) return ['U', z, x];
  if (normal[1] === -1) return ['D', h - z, x];
  if (normal[2] === 1) return ['F', h - y, x];
  if (normal[2] === -1) return ['B', h - y, h - x];
  if (normal[0] === 1) return ['R', h - y, h - z];
  if (normal[0] === -1) return ['L', h - y, z];
}

function cubeStickers(n) {
  const stickers = [];
  for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) {
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        stickers.push({ p: faceletCoordinate(face, row, col, n), v: FACE_NORMALS[face].slice(), color: face });
      }
    }
  }
  return stickers;
}

function quarterTurn(sticker, axis, n) {
  const h = n - 1, [x, y, z] = sticker.p, [vx, vy, vz] = sticker.v;
  if (axis === 0) { sticker.p = [x, h - z, y]; sticker.v = [vx, -vz, vy]; }
  if (axis === 1) { sticker.p = [z, y, h - x]; sticker.v = [vz, vy, -vx]; }
  if (axis === 2) { sticker.p = [h - y, x, z]; sticker.v = [-vy, vx, vz]; }
}

function applyCubeMove(stickers, token, n) {
  const m = /^([RLUDFB])(w?)(2|')?$/.exec(token);
  if (!m) return;
  const [face, wide, modifier] = m.slice(1);
  const positive = ['R', 'U', 'F'].includes(face);
  const axis = face === 'R' || face === 'L' ? 0 : face === 'U' || face === 'D' ? 1 : 2;
  const depth = wide ? 2 : 1;
  const cw = positive ? -1 : 1;
  const steps = modifier === '2' ? 2 : (modifier === "'" ? -cw : cw);
  for (const sticker of stickers) {
    const coord = sticker.p[axis];
    if (positive ? coord < n - depth : coord >= depth) continue;
    for (let turn = 0; turn < (steps + 4) % 4; turn++) quarterTurn(sticker, axis, n);
  }
}

function scrambleNetColors(n, alg) {
  const stickers = cubeStickers(n);
  for (const token of alg.trim().split(/\s+/).filter(Boolean)) applyCubeMove(stickers, token, n);
  const result = {};
  for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) result[face] = Array(n * n).fill(null);
  for (const { p, v, color } of stickers) {
    const [face, row, col] = faceletPosition(v, ...p, n);
    result[face][row * n + col] = color;
  }
  return result;
}

function renderCubeNet() {
  const n = Number(activeEvent[0]);
  const colors = scrambleNetColors(n, scramble);
  const container = $('#cube-net');
  if (!container) return;
  container.replaceChildren();
  container.style.setProperty('--cube-n', String(n));
  $('#net-size').textContent = `${n}×${n}`;
  container.setAttribute('aria-label', `${n} by ${n} cube unfolded net`);
  for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) {
    const panel = document.createElement('div');
    panel.className = 'cube-face';
    panel.dataset.face = face;
    for (const color of colors[face]) {
      const sticker = document.createElement('span');
      sticker.className = 'cube-sticker';
      sticker.style.backgroundColor = FACE_COLORS[color] || '#333';
      panel.appendChild(sticker);
    }
    container.appendChild(panel);
  }
}

function newScramble() {
  scramble = scrambleFor(activeEvent);
  $('#scramble-text').textContent = scramble;
  renderCubeNet();
}

function startTimer() {
  if (running) return;
  running = true;
  armed = false;
  startAt = performance.now();
  $('#readout').classList.remove('armed');
  $('#readout').classList.add('running');
  $('#timer-instruction').textContent = 'TIMER RUNNING';
  $('#timer-hint').textContent = 'Press Space or tap the button to stop';
  function tick() {
    if (!running) return;
    const cs = Math.floor((performance.now() - startAt) / 10);
    $('#readout').textContent = CubeStats.formatCs(cs);
    frameId = requestAnimationFrame(tick);
  }
  tick();
}

function stopTimer() {
  if (!running) return;
  const elapsed = Math.floor((performance.now() - startAt) / 10);
  running = false;
  cancelAnimationFrame(frameId);
  if (elapsed < 5) {
    resetTimer();
    toast('Solve was too short to record', true);
    return;
  }
  $('#readout').textContent = CubeStats.formatCs(elapsed);
  $('#readout').classList.remove('running');
  $('#timer-instruction').textContent = 'SOLVE SAVED';
  $('#timer-hint').textContent = 'Hold Space and release for next solve';
  const tag = $('#session-tag-select')?.value || 'full';
  addSolve(elapsed, 'keyboard', 'none', '', undefined, tag);
  lastStopAt = performance.now();
  newScramble();
  toast('Timed solve saved');
}

function resetTimer() {
  running = false;
  armed = false;
  cancelAnimationFrame(frameId);
  $('#readout').classList.remove('armed', 'running');
  $('#readout').textContent = '0.00';
  $('#timer-instruction').textContent = 'HOLD SPACE TO ARM';
  $('#timer-hint').textContent = 'Release Space to start; press again to stop';
}

function armTimer() {
  if (mode !== 'keyboard' || running || performance.now() - lastStopAt < 250) return;
  armed = true;
  $('#readout').classList.add('armed');
  $('#timer-instruction').textContent = 'READY — RELEASE TO START';
}

function isInputFocused() {
  const el = document.activeElement;
  return !!(el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function keyboardDown(e) {
  if ($('#goals-dialog').open || mode !== 'keyboard' || isInputFocused()) return;
  if (e.code === 'Escape') {
    e.preventDefault();
    if (running || armed) { resetTimer(); toast('Timer canceled'); }
    return;
  }
  if (e.code !== 'Space') return;
  e.preventDefault();
  if (e.repeat) return;
  if (running) stopTimer();
  else armTimer();
}

function keyboardUp(e) {
  if (mode === 'keyboard' && e.code === 'Space' && !isInputFocused()) {
    e.preventDefault();
    if (armed) startTimer();
  }
}

function changeMode(next) {
  if (mode === next) return;
  if (running || armed) resetTimer();
  mode = next;
  $('#manual-tab').classList.toggle('active', next === 'manual');
  $('#keyboard-tab').classList.toggle('active', next === 'keyboard');
  $('#manual-tab').setAttribute('aria-pressed', String(next === 'manual'));
  $('#keyboard-tab').setAttribute('aria-pressed', String(next === 'keyboard'));
  $('#manual-form').classList.toggle('hidden', next !== 'manual');
  $('#keyboard-controls').classList.toggle('hidden', next !== 'keyboard');
  $('#readout').textContent = '0.00';
  $('#timer-instruction').textContent = next === 'manual' ? 'ENTER A TIME FROM YOUR QIYI TIMER' : 'HOLD SPACE TO ARM';
  $('#timer-hint').textContent = next === 'manual' ? 'Solve using your physical timer, then record the displayed result below.' : 'Release Space to start; press again to stop';
  $('#readout').classList.remove('armed', 'running');
}

/* ================= STAGE SPLITS MANUAL INPUT ================= */

function renderSplitsInputs() {
  const container = $('#splits-fields-grid');
  if (!container) return;
  container.innerHTML = '';
  const stages = stageConfigs[activeEvent] || CubeSplits.DEFAULT_STAGE_CONFIGS[activeEvent] || [];
  
  stages.forEach((st, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'stage-input-field';
    wrap.innerHTML = `
      <label for="split-${st.id}">${st.name}</label>
      <input id="split-${st.id}" data-stage="${st.name}" type="text" placeholder="e.g. 1.80" inputmode="decimal" />
    `;
    container.appendChild(wrap);
  });

  // Attach live sum validation
  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', updateSplitsSumIndicator);
  });
  updateSplitsSumIndicator();
}

function updateSplitsSumIndicator() {
  const container = $('#splits-fields-grid');
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('input'));
  let sumCs = 0;
  let allEmpty = true;

  for (const inp of inputs) {
    if (inp.value.trim()) {
      allEmpty = false;
      const cs = CubeStats.parseTime(inp.value);
      if (cs !== null) sumCs += cs;
    }
  }

  const indicator = $('#splits-sum-indicator');
  if (allEmpty) {
    indicator.textContent = 'Sum: 0.00s';
    indicator.classList.remove('error');
    return;
  }

  indicator.textContent = `Sum: ${CubeStats.formatCs(sumCs)}`;
  const totalCs = CubeStats.parseTime($('#time-input').value);
  if (totalCs !== null) {
    const diff = Math.abs(sumCs - totalCs);
    indicator.classList.toggle('error', diff > 2);
  }
}

function manualSave(e) {
  e.preventDefault();
  const value = CubeStats.parseTime($('#time-input').value);
  if (value === null) {
    toast('Enter a valid solve time (e.g. 12.34 or 1:23.45)', true);
    $('#time-input').focus();
    return;
  }

  // Check optional splits
  let splitsArray;
  const splitsContainer = $('#splits-inputs-container');
  if (!splitsContainer.classList.contains('hidden')) {
    const inputs = Array.from($('#splits-fields-grid').querySelectorAll('input'));
    const entered = inputs.map(inp => ({
      name: inp.dataset.stage,
      cs: CubeStats.parseTime(inp.value)
    })).filter(x => x.cs !== null);

    if (entered.length > 0) {
      if (entered.length < inputs.length) {
        toast('Fill in all stage splits, or close the splits box to skip them.', true);
        return;
      }
      const valRes = CubeSplits.validateSplits(entered, value);
      if (!valRes.valid) {
        toast(valRes.error, true);
        return;
      }
      splitsArray = valRes.stages;
    }
  }

  const sessionType = $('#session-tag-select')?.value || 'full';
  addSolve(value, 'manual', $('#manual-penalty').value, $('#solve-note').value.trim(), splitsArray, sessionType);
  
  $('#time-input').value = '';
  $('#solve-note').value = '';
  $('#manual-penalty').value = 'none';
  if (splitsContainer) {
    splitsContainer.querySelectorAll('input').forEach(i => i.value = '');
    updateSplitsSumIndicator();
  }
  $('#readout').textContent = CubeStats.formatCs(value);
  newScramble();
  $('#time-input').focus();
  toast(splitsArray ? 'Solve with stage splits saved' : 'Solve saved');
}

/* ================= VIEW NAVIGATION & RENDERING ================= */

function switchView(viewId) {
  if (running || armed) resetTimer();
  currentView = viewId;

  // Update nav buttons
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));

  // Toggle view panels
  $$('.view-panel').forEach(p => p.classList.add('hidden'));
  $(`#view-${viewId}`)?.classList.remove('hidden');

  // Update topbar titles
  const titles = {
    timer: 'Session timer',
    analytics: 'Deep performance analytics',
    splits: 'Stage-specific splits',
    coach: 'CubeLab coach & review',
    planner: '2-hour training planner',
    forecast: 'Goal trajectory & forecasting'
  };
  $('#view-title').innerHTML = `${titles[viewId] || 'Dashboard'}<span class="heading-period">.</span>`;
  render();
}

function switchEvent(ev) {
  if (!EVENTS[ev] || activeEvent === ev) return;
  if (running || armed) resetTimer();
  activeEvent = ev;
  $('#readout').textContent = '0.00';
  renderSplitsInputs();
  newScramble();
  render();
}

function updateCountdown() {
  const [y, m, d] = goals.competitionDate.split('-').map(Number);
  const today = new Date();
  const until = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  $('#days-left').textContent = Math.max(0, until);
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))).toUpperCase();
  $('#competition-date-label').textContent = `${monthName}, ${y}`;
}

function render() {
  const items = eventSolves();
  const cfg = EVENTS[activeEvent];
  const goal = goals.events[activeEvent];

  // Update sidebar buttons
  $$('.event-btn').forEach(b => {
    const ev = b.dataset.event;
    b.classList.toggle('active', ev === activeEvent);
    b.querySelector('.event-target').textContent = '< ' + CubeStats.formatCs(goals.events[ev].competitionCs);
  });

  $('#event-tag').textContent = cfg.label;
  $('#subtitle').textContent = `${cfg.label} · ${cfg.method} · Sub-${CubeStats.formatCs(goal.competitionCs)} Ao5`;
  updateCountdown();

  // Render sidebar 2-hour mini plan bars
  const alloc = trainingPlan.allocations;
  const totalBudget = trainingPlan.dailyBudgetMinutes || 120;
  for (const ev of ['3x3', '4x4', '5x5', 'review']) {
    const mins = alloc[ev]?.minutes || 0;
    const pct = Math.round((mins / totalBudget) * 1000) / 10;
    const txt = $(`#side-plan-${ev}`);
    const bar = $(`#side-bar-${ev}`);
    if (txt) txt.textContent = `${mins}m`;
    if (bar) bar.style.width = `${pct}%`;
  }

  // Active View Renderers
  renderTimerStats(items, goal);
  renderHistory(items);

  if (currentView === 'analytics') {
    renderAnalyticsView(items, goal);
  } else if (currentView === 'splits') {
    renderSplitsView(items);
  } else if (currentView === 'coach') {
    renderCoachView(items, goal);
  } else if (currentView === 'planner') {
    renderPlannerView();
  } else if (currentView === 'forecast') {
    renderForecastView(items, goal);
  }
}

function renderTimerStats(items, goal) {
  const today = localDate();
  const todayItems = items.filter(s => localDate(new Date(s.createdAt)) === today);
  const validToday = todayItems.map(CubeStats.effectiveCs).filter(Number.isFinite);
  $('#session-mean').textContent = validToday.length ? CubeStats.formatCs(Math.round(validToday.reduce((a, b) => a + b, 0) / validToday.length)) : '—';
  $('#session-count').textContent = `${todayItems.length} solve${todayItems.length === 1 ? '' : 's'} today`;

  const validAll = items.map(CubeStats.effectiveCs).filter(Number.isFinite);
  $('#best-single').textContent = validAll.length ? CubeStats.formatCs(Math.min(...validAll)) : '—';

  [5, 12, 50, 100].forEach(n => {
    const avg = CubeStats.rollingAverage(items, n);
    const best = CubeStats.bestRollingAverage(items, n);
    $(`#ao${n}`).textContent = avg === null ? '—' : CubeStats.formatCs(avg);
    $(`#best-ao${n}`).textContent = `Best ${best === null ? '—' : CubeStats.formatCs(best)}`;
  });

  const ao5 = CubeStats.rollingAverage(items, 5);
  $('#target-label').textContent = `SUB-${CubeStats.formatCs(goal.competitionCs)}`;
  $('#target-number').textContent = `${CubeStats.formatCs(goal.competitionCs)} target`;
  $('#current-vs-target').textContent = ao5 === null
    ? 'Record five solves to compare your competition Ao5 pace.'
    : !Number.isFinite(ao5)
      ? 'Latest Ao5: DNF · Keep practicing.'
      : ao5 < goal.competitionCs
        ? `Latest Ao5 ${CubeStats.formatCs(ao5)} · Competition goal achieved!`
        : `Latest Ao5 ${CubeStats.formatCs(ao5)} · ${CubeStats.formatCs(ao5 - goal.competitionCs)} above target`;

  const pace = ao5 === null || !Number.isFinite(ao5) ? 0 : Math.round(Math.max(0, Math.min(100, (100 * goal.competitionCs) / Math.max(1, ao5))));
  $('#goal-fill').style.width = `${pace}%`;
  $('#goal-track').setAttribute('aria-valuenow', String(pace));
}

function renderHistory(items) {
  const tbody = $('#history-body');
  if (!tbody) return;
  tbody.textContent = '';
  $('#history-count').textContent = `${items.length} recorded solve${items.length === 1 ? '' : 's'} · showing latest 25`;

  if (!items.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.padding = '20px 8px';
    td.textContent = 'No solves recorded for this event yet.';
    tr.append(td);
    tbody.append(tr);
    return;
  }

  items.slice(-25).reverse().forEach((s, i) => {
    const tr = document.createElement('tr');
    const num = document.createElement('td');
    num.textContent = String(items.length - i);

    const time = document.createElement('td');
    time.textContent = CubeStats.formatCs(CubeStats.effectiveCs(s));

    const penalty = document.createElement('td');
    const pb = document.createElement('button');
    pb.type = 'button';
    pb.className = 'penalty-btn' + (s.penalty === '+2' ? ' penalized' : s.penalty === 'DNF' ? ' dnf' : '');
    pb.textContent = s.penalty === 'none' ? '—' : s.penalty;
    pb.title = 'Cycle penalty: none → +2 → DNF';
    pb.addEventListener('click', () => {
      s.penalty = { none: '+2', '+2': 'DNF', DNF: 'none' }[s.penalty];
      persistSolves();
      render();
    });
    penalty.append(pb);

    const splitsTd = document.createElement('td');
    if (s.splits && s.splits.length) {
      splitsTd.textContent = s.splits.map(st => `${st.name.slice(0, 3)}: ${(st.cs / 100).toFixed(1)}`).join(' · ');
      splitsTd.style.fontSize = '10px';
      splitsTd.style.color = '#72d9be';
    } else {
      splitsTd.textContent = '—';
    }

    const typeTd = document.createElement('td');
    typeTd.textContent = s.sessionType === 'competition' ? 'Comp' : s.sessionType === 'drill' ? 'Drill' : 'Full';

    const dateTd = document.createElement('td');
    dateTd.textContent = new Date(s.createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

    const actions = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '✕';
    del.title = 'Delete solve';
    del.className = 'delete-btn';
    del.addEventListener('click', () => {
      if (confirm(`Delete ${CubeStats.formatCs(CubeStats.effectiveCs(s))} solve?`)) {
        solves = solves.filter(x => x.id !== s.id);
        persistSolves();
        render();
        toast('Solve deleted');
      }
    });
    actions.append(del);

    tr.append(num, time, penalty, splitsTd, typeTd, dateTd, actions);
    tbody.append(tr);
  });
}

/* ================= VIEW 2: ANALYTICS RENDERER ================= */

function renderAnalyticsView(items, goal) {
  const stats = CubeStats.descriptiveStats(items);

  $('#stat-mean').textContent = stats.mean ? CubeStats.formatCs(stats.mean) : '—';
  $('#stat-valid-count').textContent = `${stats.validCount} valid solves (${stats.count} total)`;

  $('#stat-median').textContent = stats.median ? CubeStats.formatCs(stats.median) : '—';
  $('#stat-stddev').textContent = stats.stdDev ? `±${(stats.stdDev / 100).toFixed(2)}s` : '—';
  $('#stat-cv').textContent = stats.cv ? `CV: ${stats.cv}%` : 'CV: —';

  $('#stat-iqr').textContent = stats.iqr ? CubeStats.formatCs(stats.iqr) : '—';
  $('#stat-iqr-span').textContent = stats.p25 && stats.p75 ? `${CubeStats.formatCs(stats.p25)} to ${CubeStats.formatCs(stats.p75)}` : 'P75 - P25';

  $('#stat-penalties').textContent = `${stats.plusTwoCount + stats.dnfCount} penalties`;
  $('#stat-penalty-detail').textContent = `${stats.plusTwoRate.toFixed(1)}% +2 · ${stats.dnfRate.toFixed(1)}% DNF`;

  $('#stat-range').textContent = stats.min && stats.max ? `${CubeStats.formatCs(stats.min)} / ${CubeStats.formatCs(stats.max)}` : '—';
  $('#stat-range-detail').textContent = stats.min && stats.max ? `Spread: ${CubeStats.formatCs(stats.max - stats.min)}` : 'Single range';

  // Percentiles
  ['10', '25', '50', '75', '90'].forEach(p => {
    $(`#p-${p}`).textContent = stats[`p${p}`] ? CubeStats.formatCs(stats[`p${p}`]) : '—';
  });

  // Render Charts
  const progSvg = $('#analytics-progression-chart');
  CubeCharts.renderProgressionChart(progSvg, items, goal.competitionCs, true);

  const histSvg = $('#analytics-histogram-chart');
  CubeCharts.renderDistributionHistogram(histSvg, items);

  // Update Comparative Analytics
  updateComparativeAnalytics(items);
}

function updateComparativeAnalytics(items) {
  const preset = $('#compare-preset-select')?.value || 'last25_vs_prior25';
  let sampleA = [], sampleB = [];
  let labelA = '', labelB = '';

  if (preset === 'last25_vs_prior25') {
    sampleB = items.slice(-25);
    sampleA = items.slice(-50, -25);
    labelA = 'Prior 25 Solves';
    labelB = 'Most Recent 25';
  } else if (preset === 'first50_vs_last50') {
    sampleA = items.slice(0, 50);
    sampleB = items.slice(-50);
    labelA = 'First 50 Solves';
    labelB = 'Most Recent 50';
  } else if (preset === 'thisweek_vs_lastweek') {
    const now = Date.now();
    const oneDay = 86400000;
    sampleB = items.filter(s => (now - new Date(s.createdAt).getTime()) <= 7 * oneDay);
    sampleA = items.filter(s => {
      const age = now - new Date(s.createdAt).getTime();
      return age > 7 * oneDay && age <= 14 * oneDay;
    });
    labelA = 'Previous Week';
    labelB = 'Current Week';
  }

  const res = CubeStats.compareSubsets(sampleA, sampleB);
  if (!res.sufficientData) {
    $('#cmp-base-mean').textContent = '—';
    $('#cmp-base-meta').textContent = `${labelA} (${sampleA.length})`;
    $('#cmp-comp-mean').textContent = '—';
    $('#cmp-comp-meta').textContent = `${labelB} (${sampleB.length})`;
    $('#cmp-delta').textContent = '—';
    $('#cmp-pct-delta').textContent = '—';
    $('#cmp-pvalue').textContent = '—';
    $('#cmp-df').textContent = '—';
    $('#cmp-conclusion').textContent = res.message;
    return;
  }

  $('#cmp-base-mean').textContent = CubeStats.formatCs(res.statsA.mean);
  $('#cmp-base-meta').textContent = `${labelA} (N = ${res.statsA.validCount}, s = ±${(res.statsA.stdDev / 100).toFixed(2)}s)`;

  $('#cmp-comp-mean').textContent = CubeStats.formatCs(res.statsB.mean);
  $('#cmp-comp-meta').textContent = `${labelB} (N = ${res.statsB.validCount}, s = ±${(res.statsB.stdDev / 100).toFixed(2)}s)`;

  const sign = res.diff <= 0 ? '-' : '+';
  $('#cmp-delta').textContent = `${sign}${CubeStats.formatCs(Math.abs(res.diff))}`;
  $('#cmp-pct-delta').textContent = `${res.percentChange > 0 ? '+' : ''}${res.percentChange}% Δ`;

  $('#cmp-pvalue').textContent = `t = ${res.tStat} (p = ${res.pValue})`;
  $('#cmp-df').textContent = `Welch df = ${res.df} · ΔCV = ${res.cvDiff}%`;
  $('#cmp-conclusion').textContent = res.conclusion;
}

/* ================= VIEW 3: STAGE SPLITS RENDERER ================= */

function renderSplitsView(items) {
  const analysis = CubeSplits.analyzeSplits(items, activeEvent, stageConfigs);
  const container = $('#splits-breakdown-list');
  const samplePill = $('#splits-sample-pill');
  samplePill.textContent = `${analysis.sampleCount} timed split solve${analysis.sampleCount === 1 ? '' : 's'}`;

  if (!analysis.hasData) {
    container.innerHTML = `<p class="tiny-muted" style="padding:15px;">${analysis.message}</p>`;
    $('#bottleneck-content').innerHTML = `<p class="tiny-muted">Record stage-split solves in the Timer tab to view bottleneck diagnostics.</p>`;
    return;
  }

  container.innerHTML = '';
  analysis.stages.forEach(st => {
    const row = document.createElement('div');
    row.className = 'stage-bar-row';
    const isExcess = st.deviationPct > 2;
    row.innerHTML = `
      <div class="stage-bar-head">
        <span>${st.name}</span>
        <strong style="color:${isExcess ? '#ffcf8d' : '#3bc9aa'}">${(st.meanCs / 100).toFixed(2)}s (${st.actualPct}%)</strong>
      </div>
      <div class="stage-bar-track">
        <div class="stage-bar-fill" style="width:${Math.min(100, st.actualPct)}%; background:${isExcess ? '#e5b76c' : '#3bc9aa'}"></div>
        <div class="stage-bar-marker" style="left:${st.benchmarkPct}%;" title="Benchmark: ${st.benchmarkPct}%"></div>
      </div>
      <div class="stage-bar-meta">
        <span>Target benchmark: ${st.benchmarkPct}%</span>
        <span>Deviation: ${st.deviationPct > 0 ? '+' : ''}${st.deviationPct}% · s = ±${(st.stdDevCs / 100).toFixed(2)}s</span>
      </div>
    `;
    container.appendChild(row);
  });

  const b = analysis.dominantBottleneck;
  if (b) {
    $('#bottleneck-content').innerHTML = `
      <div class="bottleneck-highlight">Primary Bottleneck: ${b.name}</div>
      <p style="margin:8px 0 0; color:#c7d6e8;">
        The <strong>${b.name}</strong> stage is consuming <strong>${b.actualPct}%</strong> of total solve duration, which is <strong>${b.excessPct}%</strong> higher than the ${b.benchmarkPct}% speedcubing benchmark.
      </p>
      <div class="coach-rec-box" style="margin-top:12px;">
        <strong>Targeted Intervention:</strong>
        <p>Switch your daily training schedule to include 15–20 minutes of dedicated ${b.name} isolation drills before resuming full solves.</p>
      </div>
    `;
  } else {
    $('#bottleneck-content').innerHTML = `
      <div style="color:#52dcb8; font-weight:750;">Balanced Stage Distribution</div>
      <p style="margin:8px 0 0; color:#c7d6e8;">
        All stages are currently within ±2.5% of optimal WCA benchmark proportions. Continue working on overall continuous turning and lookahead.
      </p>
    `;
  }
}

/* ================= VIEW 4: COACH RENDERER ================= */

function renderCoachView(items, goal) {
  const splitsAnalysis = CubeSplits.analyzeSplits(items, activeEvent, stageConfigs);
  const recs = CubeCoach.generateRecommendations(items, activeEvent, goal, splitsAnalysis);
  const container = $('#coach-recs-container');
  container.innerHTML = '';

  recs.forEach(r => {
    const card = document.createElement('div');
    card.className = 'coach-card' + (r.id.includes('bottleneck') || r.id === 'penalties_dnf' ? ' warning' : '');
    card.innerHTML = `
      <div class="coach-header">
        <h3>${r.pattern}</h3>
        <span class="coach-badge">${r.confidence}</span>
      </div>
      <div class="coach-evidence">Evidence: ${r.evidence}</div>
      <div class="coach-interp">${r.interpretation}</div>
      <div class="coach-rec-box">
        <strong>Recommended Training Action:</strong>
        <p>${r.recommendation}</p>
        <div class="coach-outcome">Intended Outcome: ${r.intendedOutcome}</div>
      </div>
    `;
    container.appendChild(card);
  });

  // Weekly Performance Review
  const review = CubeCoach.generateWeeklyReview(solves, activeEvent, goal);
  $('#weekly-review-event-tag').textContent = EVENTS[activeEvent].label;
  $('#weekly-review-narrative').innerHTML = `
    <p>${review.narrative}</p>
    <div style="display:flex; gap:18px; margin-top:14px; flex-wrap:wrap; font-size:12px; color:#8ea2b8;">
      <span>7-Day Volume: <strong>${review.thisWeekCount} solves</strong></span>
      <span>Mean: <strong>${review.thisWeekMean ? CubeStats.formatCs(review.thisWeekMean) : '—'}</strong></span>
      <span>Best Single: <strong>${review.bestSingleThisWeek ? CubeStats.formatCs(review.bestSingleThisWeek) : '—'}</strong></span>
      <span>New PBs: <strong>${review.newPBsCount}</strong></span>
    </div>
  `;
}

/* ================= VIEW 5: PLANNER RENDERER ================= */

function renderPlannerView() {
  const container = $('#planner-schedule-grid');
  container.innerHTML = '';
  const alloc = trainingPlan.allocations;

  for (const [evKey, data] of Object.entries(alloc)) {
    const card = document.createElement('div');
    card.className = 'plan-card';
    card.innerHTML = `
      <div class="plan-card-head">
        <span class="plan-card-title">${data.label}</span>
      </div>
      <div class="plan-card-minutes">${data.minutes}<small>min</small></div>
      <div class="plan-input-wrap">
        <label for="plan-input-${evKey}" style="font-size:10px; color:#7e93ab;">Adjust:</label>
        <input id="plan-input-${evKey}" type="number" min="0" max="120" step="5" value="${data.minutes}" />
      </div>
    `;
    container.appendChild(card);

    card.querySelector('input').addEventListener('change', (e) => {
      const val = Math.max(0, parseInt(e.target.value) || 0);
      trainingPlan.allocations[evKey].minutes = val;
      CubePlanner.savePlan(trainingPlan);
      render();
    });
  }

  // Populate Drills for active event
  const drillsContainer = $('#planner-drills-container');
  drillsContainer.innerHTML = '';
  const drills = CubePlanner.DRILL_LIBRARY[activeEvent] || [];

  drills.forEach(d => {
    const dCard = document.createElement('div');
    dCard.className = 'drill-card';
    dCard.innerHTML = `
      <div class="drill-card-head">
        <strong>${d.title}</strong>
        <span class="drill-pill">${d.min} min</span>
      </div>
      <p>${d.desc}</p>
    `;
    drillsContainer.appendChild(dCard);
  });
}

function rebalanceTrainingPlan() {
  const splitsMap = {};
  for (const ev of ['3x3', '4x4', '5x5']) {
    splitsMap[ev] = CubeSplits.analyzeSplits(solves.filter(s => s.event === ev), ev, stageConfigs);
  }
  const suggested = CubePlanner.suggestSchedule(solves, goals, splitsMap, trainingPlan.dailyBudgetMinutes || 120);
  trainingPlan = suggested;
  CubePlanner.savePlan(trainingPlan);
  render();
  toast('Training plan rebalanced based on your goal gaps & bottlenecks');
}

function resetTrainingPlan() {
  trainingPlan = structuredClone(CubePlanner.DEFAULT_PLAN);
  CubePlanner.savePlan(trainingPlan);
  render();
  toast('Reset to default 35/35/45/5 schedule');
}

/* ================= VIEW 6: FORECAST RENDERER ================= */

function renderForecastView(items, goal) {
  const forecast = CubeStats.forecastGoal(items, goal.competitionCs, goals.competitionDate, 12);
  
  if (!forecast.hasData) {
    $('#fc-current-ao').textContent = '—';
    $('#fc-current-gap').textContent = 'Gap to goal: —';
    $('#fc-rate').textContent = '—';
    $('#fc-required-rate').textContent = 'Required: —';
    $('#fc-projected-date').textContent = '—';
    $('#fc-confidence').textContent = 'Confidence: —';
    $('#fc-days-left').textContent = $('#days-left').textContent;
    $('#fc-comp-date').textContent = `Target: ${goals.competitionDate}`;
    $('#forecast-narrative-box').innerHTML = `
      <div class="forecast-status-icon">ℹ️</div>
      <div>${forecast.message}</div>
    `;
    return;
  }

  $('#fc-current-ao').textContent = CubeStats.formatCs(forecast.currentAo);
  $('#fc-current-gap').textContent = forecast.distanceToGoal <= 0 ? 'Goal Achieved!' : `Gap: ${CubeStats.formatCs(forecast.distanceToGoal)}`;

  const rateSign = forecast.csPerWeek <= 0 ? '' : '+';
  $('#fc-rate').textContent = `${rateSign}${(forecast.csPerWeek / 100).toFixed(2)}s/wk`;
  $('#fc-required-rate').textContent = `Required: -${(forecast.requiredCsPerWeek / 100).toFixed(2)}s/wk`;

  $('#fc-projected-date').textContent = forecast.projectedDate || 'Plateau';
  $('#fc-confidence').textContent = forecast.confidenceIntervalDays ? `±${forecast.confidenceIntervalDays} days (R² = ${forecast.correlationR2})` : 'Regression flat';

  $('#fc-days-left').textContent = forecast.daysUntilComp;
  $('#fc-comp-date').textContent = `Target: ${goals.competitionDate}`;

  const icon = forecast.projectedStatus === 'achieved' ? '🏆' : forecast.projectedStatus === 'on_track' ? '🚀' : forecast.projectedStatus === 'behind_pace' ? '⚠️' : '📊';
  $('#forecast-narrative-box').innerHTML = `
    <div class="forecast-status-icon">${icon}</div>
    <div>${forecast.message}</div>
  `;
}

/* ================= GOALS MODAL CONTROLLER ================= */

function goalEditorMarkup(ev) {
  const name = EVENTS[ev].label;
  const field = (id, label, type = 'text') => `
    <div class="goal-field">
      <label for="goal-${ev}-${id}">${label}</label>
      <input id="goal-${ev}-${id}" type="${type}" ${type === 'text' ? 'placeholder="8.00 or 1:00.00" inputmode="decimal"' : ''} required />
    </div>`;
  return `
    <section class="goal-editor-card">
      <h3 class="goal-editor-title">${name}<small>${EVENTS[ev].method}</small></h3>
      ${field('competition', 'Competition Ao5 target')}
      <div class="field-pair">${field('c1-time', 'Checkpoint 1 target')}${field('c1-date', 'Checkpoint 1 date', 'date')}</div>
      <div class="field-pair">${field('c2-time', 'Checkpoint 2 target')}${field('c2-date', 'Checkpoint 2 date', 'date')}</div>
      ${field('stretch', 'Stretch Ao5 target')}
      <div class="goal-field">
        <label for="goal-${ev}-metric">Checkpoints measured with</label>
        <select id="goal-${ev}-metric">
          <option value="5">Latest Ao5</option>
          <option value="12">Latest Ao12</option>
          <option value="50">Latest Ao50</option>
        </select>
      </div>
    </section>`;
}

function populateGoalEditor(config) {
  $('#competition-date').value = config.competitionDate;
  for (const ev of Object.keys(EVENTS)) {
    const g = config.events[ev];
    $(`#goal-${ev}-competition`).value = CubeStats.formatCs(g.competitionCs);
    $(`#goal-${ev}-stretch`).value = CubeStats.formatCs(g.stretchCs);
    $(`#goal-${ev}-metric`).value = String(g.metric);
    for (let i = 0; i < 2; i++) {
      $(`#goal-${ev}-c${i + 1}-time`).value = CubeStats.formatCs(g.checkpoints[i].targetCs);
      $(`#goal-${ev}-c${i + 1}-date`).value = g.checkpoints[i].date;
    }
  }
}

function openGoals() {
  if (running || armed) resetTimer();
  populateGoalEditor(goals);
  const d = $('#goals-dialog');
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}

function closeGoals() {
  const d = $('#goals-dialog');
  if (d.close) d.close(); else d.removeAttribute('open');
}

function readGoalTime(ev, suffix) {
  const input = $(`#goal-${ev}-${suffix}`);
  const value = CubeStats.parseTime(input.value);
  if (value === null) {
    input.setCustomValidity('Enter a valid time (e.g. 8.00 or 1:00.00).');
    input.reportValidity();
    throw Error('Enter a valid target time');
  }
  input.setCustomValidity('');
  return value;
}

function saveGoals(e) {
  e.preventDefault();
  if (!validDateString($('#competition-date').value)) {
    toast('Set a valid competition date.', true);
    return;
  }
  const next = { competitionDate: $('#competition-date').value, events: {} };
  try {
    for (const ev of Object.keys(EVENTS)) {
      const checkpoints = [];
      for (let i = 0; i < 2; i++) {
        const date = $(`#goal-${ev}-c${i + 1}-date`).value;
        if (!validDateString(date)) throw Error(`Invalid checkpoint date for ${EVENTS[ev].label}`);
        checkpoints.push({ date, targetCs: readGoalTime(ev, `c${i + 1}-time`) });
      }
      if (checkpoints[0].date > checkpoints[1].date) throw Error(`Checkpoint 1 must occur before checkpoint 2 for ${EVENTS[ev].label}`);
      next.events[ev] = {
        competitionCs: readGoalTime(ev, 'competition'),
        stretchCs: readGoalTime(ev, 'stretch'),
        metric: Number($(`#goal-${ev}-metric`).value),
        checkpoints
      };
    }
  } catch (error) {
    toast(error.message, true);
    return;
  }
  goals = sanitizeGoals(next);
  persistGoals();
  closeGoals();
  render();
  toast('Goals saved privately in this browser');
}

/* ================= IMPORT & EXPORT ================= */

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportJSON() {
  const payload = {
    app: 'CubeLab',
    version: 4,
    exportedAt: new Date().toISOString(),
    goals,
    plan: trainingPlan,
    splitsConfig: stageConfigs,
    solves
  };
  download(`cubelab-v4-backup-${localDate()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast(`Backup exported: ${solves.length} solves + goals & training plan`);
}

function csvQuote(v) {
  return '"' + String(v ?? '').replaceAll('"', '""') + '"';
}

function exportCSV() {
  const cols = ['event', 'date', 'timestamp', 'time_seconds', 'base_time_seconds', 'penalty', 'result', 'source', 'session_type', 'notes', 'splits', 'scramble'];
  const rows = solves.map(s => {
    const splitsStr = s.splits ? s.splits.map(st => `${st.name}:${(st.cs / 100).toFixed(2)}`).join(';') : '';
    const eff = CubeStats.effectiveCs(s);
    return [
      s.event,
      localDate(new Date(s.createdAt)),
      s.createdAt,
      Number.isFinite(eff) ? (eff / 100).toFixed(2) : '',
      (s.baseCs / 100).toFixed(2),
      s.penalty,
      CubeStats.formatCs(eff),
      s.source,
      s.sessionType || 'full',
      s.note,
      splitsStr,
      s.scramble
    ].map(csvQuote).join(',');
  });

  download(`cubelab-solves-${localDate()}.csv`, [cols.join(','), ...rows].join('\r\n'), 'text/csv');
  toast(`CSV exported: ${solves.length} solves`);
}

async function importJSON(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    const incoming = Array.isArray(parsed) ? parsed : parsed.solves;

    if (!Array.isArray(incoming) || incoming.length > 100000) throw Error('Not a valid CubeLab backup');
    let added = 0, skipped = 0;
    const ids = new Set(solves.map(s => s.id));

    for (const x of incoming) {
      const s = sanitizeSolve(x);
      if (!s || ids.has(s.id)) { skipped++; continue; }
      solves.push(s);
      ids.add(s.id);
      added++;
    }
    persistSolves();

    let importedConfig = false;
    if (parsed && !Array.isArray(parsed)) {
      if (parsed.goals && confirm('Import goals from this backup? Current goals will be replaced.')) {
        goals = sanitizeGoals(parsed.goals);
        persistGoals();
        importedConfig = true;
      }
      if (parsed.plan) {
        trainingPlan = parsed.plan;
        CubePlanner.savePlan(trainingPlan);
      }
    }

    render();
    toast(`Imported ${added} solves${skipped ? ` (${skipped} skipped)` : ''}${importedConfig ? ' and custom settings' : ''}.`);
  } catch (e) {
    toast(`Import failed: ${e.message}`, true);
  }
}

/* ================= INITIALIZATION ================= */

function init() {
  // Navigation View Switchers
  $$('[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  // Event Switchers
  $$('[data-event]').forEach(b => b.addEventListener('click', () => switchEvent(b.dataset.event)));

  // Goals Dialog
  $('#goal-editor-grid').innerHTML = Object.keys(EVENTS).map(goalEditorMarkup).join('');
  $('#edit-goals-timer')?.addEventListener('click', openGoals);
  $('#btn-open-goals-modal')?.addEventListener('click', openGoals);
  $('#close-goals')?.addEventListener('click', closeGoals);
  $('#cancel-goals')?.addEventListener('click', closeGoals);
  $('#goals-form')?.addEventListener('submit', saveGoals);
  $('#reset-goals')?.addEventListener('click', () => {
    if (confirm('Load the recommended 11-week template into the editor? Click Save goals to apply.')) {
      populateGoalEditor(DEFAULT_GOALS);
      toast('Template loaded; click Save goals to apply');
    }
  });

  // Timer controls
  $('#manual-tab')?.addEventListener('click', () => changeMode('manual'));
  $('#keyboard-tab')?.addEventListener('click', () => changeMode('keyboard'));
  $('#manual-form')?.addEventListener('submit', manualSave);
  $('#new-scramble')?.addEventListener('click', newScramble);

  // Optional stage splits toggle
  $('#toggle-splits-entry')?.addEventListener('click', () => {
    const c = $('#splits-inputs-container');
    c.classList.toggle('hidden');
    if (!c.classList.contains('hidden')) {
      renderSplitsInputs();
    }
  });

  $('#touch-timer-btn')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (running) stopTimer(); else armTimer();
  });
  $('#touch-timer-btn')?.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (armed) startTimer();
  });
  $('#touch-timer-btn')?.addEventListener('pointercancel', () => {
    if (armed) resetTimer();
  });

  document.addEventListener('keydown', keyboardDown);
  document.addEventListener('keyup', keyboardUp);
  window.addEventListener('blur', () => { if (armed) resetTimer(); });

  // Compare presets
  $('#compare-preset-select')?.addEventListener('change', () => {
    updateComparativeAnalytics(eventSolves());
  });

  // Planner actions
  $('#btn-rebalance-plan')?.addEventListener('click', rebalanceTrainingPlan);
  $('#btn-reset-plan')?.addEventListener('click', resetTrainingPlan);

  // Data Actions
  $('#export-csv')?.addEventListener('click', exportCSV);
  $('#export-json')?.addEventListener('click', exportJSON);
  $('#import-file')?.addEventListener('change', importJSON);
  $('#clear-event')?.addEventListener('click', () => {
    const count = eventSolves().length;
    if (!count) { toast('No solves to clear'); return; }
    if (confirm(`Permanently delete all ${count} ${EVENTS[activeEvent].label} solves from local storage? Export a backup first.`)) {
      solves = solves.filter(s => s.event !== activeEvent);
      persistSolves();
      render();
      toast('Event solves cleared');
    }
  });

  newScramble();
  render();
}

init();
