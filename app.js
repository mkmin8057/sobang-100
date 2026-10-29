'use strict';
/* 소방 100일 작전 — 간격 반복 암기 훈련
   레벨 0(신규) ~ 5. 맞히면 +1, 틀리면 1로. 다음 출제까지 간격은 IV[레벨].
   Lv0~1 객관식, Lv2+ 직접 입력(입력 가능한 문항만). 틀린 문항은 같은 판에서 3문제 뒤 재출제. */
const D = window.SOBANG;
const KEY = 'sobang100.v1';
const MIN = 6e4, DAY = 864e5;
const IV = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY];
const IV_MASTER = 30 * DAY;
const ROUND = 10, REINSERT = 3;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 데이터 ---------- */
const SUBJ = D.subjects;
const ITEMS = [];
const TOPIC = {};
SUBJ.forEach(s => {
  Object.entries(s.topics).forEach(([id, [title, points, trap]]) => TOPIC[id] = { title, points, trap, s: s.key });
  s.items.forEach((it, i) => { it.s = s.key; it.rank = i; ITEMS.push(it); });
});
const ready = SUBJ.filter(s => s.items.length);

/* ---------- 상태 ---------- */
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch (e) { }
  return { v: 1, exam: null, quota: 0, subj: ready[0] ? ready[0].key : null, srs: {}, days: {} };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('저장 실패 — 백업을 내보내 두세요'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

const dkey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const day = () => S.days[dkey()] || (S.days[dkey()] = { r: 0, a: 0, c: 0, n: 0, m: 0 });
// 하루 활동 = 암기 판(r) 또는 모의고사(m)
const active = t => { const d = S.days[dkey(t)]; return !!(d && (d.r || d.m)); };
const examAt = () => S.exam ? new Date(S.exam + 'T09:00:00').getTime() : null;
function daysLeft() { const e = examAt(); return e == null ? null : Math.round((midnight(e) - midnight(Date.now())) / DAY); }
function phase(dl) {
  if (dl == null) return null;
  if (dl < 0) return { n: 4, name: '시험 종료' };
  if (dl > 40) return { n: 1, name: '1단계 · 암기 구축', until: 'D-41까지' };
  if (dl >= 15) return { n: 2, name: '2단계 · 실전 혼합', until: 'D-15까지' };
  return { n: 3, name: '3단계 · 총정리', until: 'D-DAY까지' };
}

/* ---------- 출제 ---------- */
const pool = () => S.subj === 'all' ? ITEMS : ITEMS.filter(i => i.s === S.subj);
const seen = id => S.srs[id];
function quota() {
  if (S.quota) return S.quota;
  const unseen = ITEMS.filter(i => !seen(i.id)).length;
  const dl = daysLeft();
  if (dl == null) return 20;
  const span = dl > 40 ? dl - 40 : Math.max(1, dl - 7);
  return Math.min(50, Math.max(10, Math.ceil(unseen / span)));
}
function counts(items) {
  const now = Date.now(); let due = 0, fresh = 0, m = 0, l = 0;
  items.forEach(i => { const r = seen(i.id); if (!r) fresh++; else { if (r.due <= now) due++; if (r.l >= 4) m++; else l++; } });
  return { due, fresh, m, l, n: fresh, total: items.length };
}
function buildRound() {
  const now = Date.now(), P = pool(), have = new Set();
  const take = (arr, k) => { for (const i of arr) { if (k <= 0) break; if (!have.has(i.id)) { have.add(i.id); out.push(i); k--; } } };
  const out = [];
  const old = P.filter(i => seen(i.id));
  take(old.filter(i => seen(i.id).due <= now).sort((a, b) => seen(a.id).l - seen(b.id).l || seen(a.id).due - seen(b.id).due), ROUND);
  // 신규: 모의고사에서 틀린 주제(boost) 먼저, 그다음 빈출 주제 순
  // (boost 문항은 섞어서 한 주제에 몰리지 않게)
  const unseen = P.filter(i => !seen(i.id)), hot = i => S.boost && S.boost[i.t];
  const fresh = [...shuffle(unseen.filter(hot)), ...unseen.filter(i => !hot(i)).sort((a, b) => a.rank - b.rank)];
  take(fresh, Math.min(ROUND - out.length, Math.max(0, quota() - day().n)));
  take(old.slice().sort((a, b) => seen(a.id).l - seen(b.id).l || seen(a.id).due - seen(b.id).due), ROUND - out.length);
  take(fresh, ROUND - out.length);
  return shuffle(out);
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }
function modeOf(it) {
  if (it.type !== 'fill') return it.type;
  const r = seen(it.id);
  return r && r.l >= 2 && it.in ? 'type' : 'mc';
}
function capIv(iv) { // 시험 전에 최소 한 번은 다시 보도록 간격 상한
  const e = examAt(); if (e == null) return iv;
  const left = e - Date.now(); return left > 0 ? Math.min(iv, Math.max(DAY, left / 3)) : iv;
}
function grade(it, ok) {
  const now = Date.now(), prev = seen(it.id), r = prev ? { ...prev } : { l: 0, due: 0, n: 0, w: 0 };
  if (ok) { const was5 = r.l === 5; r.l = Math.min(5, r.l + 1); r.due = now + capIv(was5 ? IV_MASTER : IV[r.l]); }
  else { r.l = 1; r.w++; r.due = now + IV[1]; }
  r.n++; S.srs[it.id] = r;
  const d = day(); d.a++; if (ok) d.c++; if (!prev) d.n++;
  save();
}

/* ---------- 판 진행 ---------- */
let R = null;
function startRound() {
  const items = buildRound();
  if (!items.length) { toast('이 과목은 아직 문항이 없어요'); return; }
  R = {
    q: items.map(it => ({ it, mode: modeOf(it), retry: false })), i: 0,
    first: {}, before: {}, order: items.map(i => i.id), combo: 0, max: 0, t0: Date.now(), wrongs: []
  };
  items.forEach(it => R.before[it.id] = seen(it.id) ? seen(it.id).l : 0);
  show('play'); renderQ();
}
function renderDots() {
  const cur = R.q[R.i] && R.q[R.i].it.id;
  $('#pdots').innerHTML = R.order.map(id => {
    const st = R.first[id];
    const cls = id === cur ? 'cur' : st === true ? 'ok' : st === false ? 'bad' : '';
    return `<i class="${cls}"></i>`;
  }).join('');
  const c = $('#combo'); c.textContent = R.combo >= 2 ? `${R.combo}콤보` : '';
}
function renderQ() {
  const e = R.q[R.i]; if (!e) return finish();
  const { it, mode } = e, r = seen(it.id), T = TOPIC[it.t];
  renderDots();
  $('#reveal').hidden = true;
  $('#qmeta').innerHTML = `<span class="tag">${esc(subjShort(it.s))}</span><span class="tag">${esc(T ? T.title : '')}</span>` +
    `<span class="tag lv">${r ? 'Lv' + r.l : 'NEW'}</span>` + (e.retry ? '<span class="tag retry">다시</span>' : '');
  const A = $('#answers'); A.className = 'answers'; A.innerHTML = '';
  if (mode === 'ox') {
    $('#q').textContent = it.q;
    A.classList.add('ox');
    A.innerHTML = '<button class="opt" data-v="1">O</button><button class="opt" data-v="0">X</button>';
    A.onclick = ev => { const b = ev.target.closest('.opt'); if (!b || b.disabled) return; lock(); answer((b.dataset.v === '1') === it.a, b.textContent, b); };
  } else if (mode === 'mc') {
    qBlank(it.q);
    const opts = shuffle([it.a, ...it.d]);
    A.innerHTML = opts.map(o => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join('');
    A.onclick = ev => { const b = ev.target.closest('.opt'); if (!b || b.disabled) return; lock(); answer(b.dataset.v === it.a, b.dataset.v, b); };
  } else if (mode === 'type') {
    qBlank(it.q);
    if (/^[\d./]+$/.test(it.a)) renderPad(it); else renderText(it);
  } else if (mode === 'match') renderMatch(it);
}
function qBlank(q, fill, ok) {
  const [a, b = ''] = q.split('＿');
  $('#q').innerHTML = esc(a) + `<span class="blank${ok ? ' fill-ok' : ''}">${fill ? esc(fill) : '?'}</span>` + esc(b);
}
function lock() { document.querySelectorAll('#answers button, #answers input').forEach(b => b.disabled = true); }
function norm(s) {
  return String(s).trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248)).replace(/\s+/g, '').replace(/,/g, '').toLowerCase();
}
function checkTyped(it, v) {
  const n = norm(v); if (!n) return false;
  // 숫자는 값으로 비교 (1/2 = 0.5, 1.20 = 1.2)
  const num = x => { const m = /^([\d.]+)(?:\/([\d.]+))?$/.exec(x); return m ? (m[2] ? parseFloat(m[1]) / parseFloat(m[2]) : parseFloat(m[1])) : NaN; };
  return [it.a, ...(it.alt || [])].some(a => { const x = norm(a); return x === n || Math.abs(num(x) - num(n)) < 1e-9; });
}
function renderPad(it) {
  let v = '';
  const A = $('#answers');
  const keys = ['7', '8', '9', '⌫', '4', '5', '6', '/', '1', '2', '3', '.', '0'];
  A.innerHTML = `<div class="pad">${keys.map(k => `<button data-k="${k}">${k}</button>`).join('')}<button class="dunno" data-k="?">모름</button><button class="ent wide" data-k="ok">확인</button></div>`;
  A.onclick = ev => {
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    const k = b.dataset.k; if (!k) return;
    if (k === '⌫') v = v.slice(0, -1);
    else if (k === '?') { lock(); return answer(false, '모름'); }
    else if (k === 'ok') { if (!v) return; lock(); return answer(checkTyped(it, v), v); }
    else if (v.length < 8) v += k;
    qBlank(it.q, v || null);
  };
}
function renderText(it) {
  const A = $('#answers');
  A.innerHTML = `<input class="textin" id="tin" autocomplete="off" autocapitalize="off" enterkeyhint="done" placeholder="정답 입력">
    <div class="row2"><button class="opt" id="tdunno">모름</button><button class="next" id="tok">확인</button></div>`;
  const inp = $('#tin');
  const go = () => { const v = inp.value; if (!v.trim()) return; lock(); inp.blur(); answer(checkTyped(it, v), v); };
  $('#tok').onclick = go;
  $('#tdunno').onclick = () => { lock(); inp.blur(); answer(false, '모름'); };
  inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  inp.oninput = () => qBlank(it.q, inp.value || null);
  setTimeout(() => inp.focus(), 50);
}
function renderMatch(it) {
  $('#q').textContent = it.q + ' — 짝을 맞추세요';
  const L = shuffle(it.pairs.map((p, i) => ({ t: p[0], i }))), Rt = shuffle(it.pairs.map((p, i) => ({ t: p[1], i })));
  const A = $('#answers');
  A.innerHTML = `<div class="match"><div class="col">${L.map(x => `<button class="opt" data-side="l" data-i="${x.i}">${esc(x.t)}</button>`).join('')}</div>` +
    `<div class="col">${Rt.map(x => `<button class="opt" data-side="r" data-i="${x.i}">${esc(x.t)}</button>`).join('')}</div></div>`;
  let sel = null, miss = 0, done = 0;
  A.onclick = ev => {
    const b = ev.target.closest('.opt'); if (!b || b.disabled) return;
    if (!sel || sel.dataset.side === b.dataset.side) { if (sel) sel.classList.remove('sel'); sel = b; b.classList.add('sel'); return; }
    if (sel.dataset.i === b.dataset.i) {
      [sel, b].forEach(x => { x.classList.remove('sel'); x.classList.add('done'); x.disabled = true; });
      sel = null; done++;
      if (done === it.pairs.length) answer(miss === 0, miss ? `${miss}번 틀림` : '');
    } else {
      miss++; buzz(); b.classList.add('flash-bad'); setTimeout(() => b.classList.remove('flash-bad'), 450);
      sel.classList.remove('sel'); sel = null;
    }
  };
}
function buzz() { if (navigator.vibrate) navigator.vibrate(60); }

function answer(ok, given, btn) {
  const e = R.q[R.i], it = e.it, firstTry = !(it.id in R.first);
  if (ok) {
    if (firstTry) { R.first[it.id] = true; grade(it, true); }
    R.combo++; R.max = Math.max(R.max, R.combo);
    $('#combo').classList.remove('pop'); void $('#combo').offsetWidth; $('#combo').classList.add('pop');
    if (btn) btn.classList.add('ok');
    if (it.type === 'fill') qBlank(it.q, it.a, true);
    $('.qwrap').classList.add('flash-ok');
    setTimeout(() => { $('.qwrap').classList.remove('flash-ok'); R.i++; renderQ(); }, 650);
    renderDots();
    return;
  }
  // 오답: 정답 공개 후 사용자가 '다음'을 눌러야 진행 (읽을 시간 확보)
  buzz(); R.combo = 0;
  if (btn) btn.classList.add('bad');
  markCorrect(e);
  if (it.type === 'fill') qBlank(it.q, it.a);
  showReveal(e, given);
  const A = $('#answers'); A.onclick = null;
  const canOverride = e.mode === 'type' && given !== '모름';
  const bar = document.createElement('div');
  bar.className = canOverride ? 'row2' : '';
  bar.style.cssText = 'display:grid;gap:8px;grid-column:1/-1';
  bar.innerHTML = (canOverride ? '<button class="opt" id="ovr" style="font-size:14px;text-align:center">맞은 걸로</button>' : '') + '<button class="next" id="nxt">다음 ▶</button>';
  if (e.mode === 'mc' || e.mode === 'ox') A.appendChild(bar); else { A.innerHTML = ''; A.appendChild(bar); }
  // 화면이 바뀐 뒤 클릭이 새 문항의 #answers 핸들러로 버블링되지 않게 막는다
  $('#nxt').onclick = ev => { ev.stopPropagation(); commitWrong(e); };
  if (canOverride) $('#ovr').onclick = ev => {
    ev.stopPropagation(); if (firstTry) { R.first[it.id] = true; grade(it, true); } R.i++; renderQ(); };
}
function markCorrect(e) {
  if (e.mode === 'mc') document.querySelectorAll('#answers .opt').forEach(b => { if (b.dataset.v === e.it.a) b.classList.add('ok'); });
  if (e.mode === 'ox') document.querySelectorAll('#answers .opt').forEach(b => { if ((b.dataset.v === '1') === e.it.a) b.classList.add('ok'); });
}
function commitWrong(e) {
  const it = e.it;
  if (!(it.id in R.first)) { R.first[it.id] = false; grade(it, false); R.wrongs.push(it); }
  R.q.splice(Math.min(R.q.length, R.i + 1 + REINSERT), 0, { it, mode: e.mode === 'type' ? 'type' : e.mode, retry: true });
  R.i++; renderQ();
}
function showReveal(e, given) {
  const it = e.it, T = TOPIC[it.t], el = $('#reveal');
  let ans;
  if (it.type === 'ox') ans = `정답 <b>${it.a ? 'O' : 'X'}</b>`;
  else if (it.type === 'match') ans = it.pairs.map(p => `${esc(p[0])} → <b>${esc(p[1])}</b>`).join('<br>');
  else ans = `정답 <b>${esc(it.a)}</b>`;
  el.className = 'reveal';
  el.innerHTML = `<div class="ans">${ans}</div>` +
    (given && it.type !== 'match' ? `<div class="you">내 답: ${esc(given)}</div>` : '') +
    (it.x ? `<div class="x">💡 ${esc(it.x)}</div>` : '') +
    (T ? `<details><summary>관련 이론: ${esc(T.title)}</summary><ul>${T.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>${T.trap ? `<div class="trap">⚠ 함정: ${esc(T.trap)}</div>` : ''}</details>` : '');
  el.hidden = false;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function finish() {
  const ids = R.order, ok = ids.filter(id => R.first[id]).length, sec = Math.round((Date.now() - R.t0) / 1000);
  const d = day(); d.r++;
  const st = streak(), firstToday = d.r + (d.m || 0) === 1;
  if (st > (S.best || 0)) S.best = st;
  save();
  let ups = 0, lts = 0;
  ids.forEach(id => { const a = R.before[id], b = (seen(id) || { l: 0 }).l; if (b > a) ups++; if (a < 4 && b >= 4) lts++; });
  const pct = Math.round(ok / ids.length * 100);
  const tone = pct === 100 ? '완벽! 🔥' : pct >= 80 ? '좋아요' : pct >= 60 ? '조금 더' : '반복이 답';
  $('#resBody').innerHTML = (firstToday ? `<div class="plus1">🔥 <b>${st}일 연속</b> 달성 · 오늘 기록 지켰다!</div>` : '') + `<div class="big"><b style="color:${pct >= 60 ? 'var(--signal)' : 'var(--hydrant)'}">${ok}/${ids.length}</b><span>${tone}</span></div>
    <div class="stats"><div><b>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</b><span>소요</span></div>
    <div><b>${R.max}</b><span>최대 콤보</span></div><div><b>${d.r}판</b><span>오늘</span></div></div>
    ${ups ? `<div class="up">▲ 레벨업 ${ups}개${lts ? ` · 장기기억 진입 ${lts}개` : ''}</div>` : ''}
    ${R.wrongs.length ? `<ul>${R.wrongs.map(it => `<li>${esc(qText(it))}<br><b>${esc(ansText(it))}</b></li>`).join('')}</ul>` : ''}`;
  R = null; show('result');
  if (firstToday && MILESTONES.includes(st)) celebrate(st);
}
const qText = it => it.type === 'fill' ? it.q.replace('＿', '( ? )') : it.q;
const ansText = it => it.type === 'ox' ? (it.a ? 'O' : 'X') : it.type === 'match' ? it.pairs.map(p => p[0] + '→' + p[1]).join(', ') : it.a;
const subjShort = k => (SUBJ.find(s => s.key === k) || {}).short || '';

/* ---------- 홈 ---------- */
let tickTimer = null;
function renderHome() {
  renderCountdown();
  const d = S.days[dkey()];
  $('#todayRounds').textContent = (d ? d.r : 0) + '판';
  $('#todayAcc').textContent = d && d.a ? Math.round(d.c / d.a * 100) + '%' : '–';
  $('#todayN').textContent = d ? d.a : 0;
  renderStreak();
  if (typeof renderMock === 'function') renderMock();
  const chips = [...ready, ...SUBJ.filter(s => !s.items.length)].map(s => `<button class="chip" data-k="${s.key}" aria-pressed="${S.subj === s.key}" ${s.items.length ? '' : 'disabled'}>${esc(s.short)}${s.items.length ? '' : ' · 준비중'}</button>`);
  if (ready.length > 1) chips.unshift(`<button class="chip" data-k="all" aria-pressed="${S.subj === 'all'}">전체 섞기</button>`);
  $('#subjChips').innerHTML = chips.join('');
  const c = counts(pool()), q = quota(), newLeft = Math.max(0, q - (d ? d.n : 0));
  $('#todo').innerHTML = c.total ? `복습 대기 <b>${c.due}</b> · 오늘 신규 <b>${Math.min(newLeft, c.fresh)}</b>/${q}` + (c.due + Math.min(newLeft, c.fresh) === 0 ? ' — 오늘 목표 완료! 더 하면 약한 것부터 나와요' : '') : '이 과목은 준비중이에요';
  $('#startBtn').textContent = c.due ? `▶ 복습 ${c.due}개 처리하기` : '▶ 한 판 시작';
  $('#gauges').innerHTML = SUBJ.map(s => {
    const k = counts(s.items), t = k.total || 1;
    return `<div class="gauge${k.total ? '' : ' lock'}"><div class="gl"><span>${esc(s.short)}</span><b>${k.total ? `장기 ${Math.round(k.m / t * 100)}% · ${k.m}/${k.total}` : '준비중'}</b></div>
      <div class="gb"><i style="width:${k.m / t * 100}%"></i><i style="width:${k.l / t * 100}%"></i></div></div>`;
  }).join('');
}
/* ---------- 연속 학습 (듀오링고식) ---------- */
const MILESTONES = [3, 7, 14, 21, 30, 50, 70, 100];
let streakTimer = null;
function renderStreak() {
  const st = streak(), doneToday = active(Date.now()), el = $('#streakCard');
  const week = [];
  for (let k = 6; k >= 0; k--) {
    const t = Date.now() - k * DAY, on = active(t);
    week.push(`<div class="wd${on ? ' on' : ''}${k === 0 ? ' today' : ''}"><i>${on ? '🔥' : ''}</i><span>${'일월화수목금토'[new Date(t).getDay()]}</span></div>`);
  }
  const next = MILESTONES.find(m => m > st);
  el.className = 'streak card' + (doneToday ? ' done' : st ? ' risk' : '');
  el.innerHTML = `<div class="st-top"><div class="flame${doneToday ? '' : ' cold'}">🔥</div>
      <div><div class="st-n"><b>${st}</b>일 연속</div><div class="st-sub">${S.best ? `최고 기록 ${S.best}일` : '첫 판으로 기록을 시작하세요'}${next ? ` · ${next}일까지 ${next - st}일` : ''}</div></div></div>
    <div class="week">${week.join('')}</div>
    <div class="st-msg" id="brk"></div>`;
  clearInterval(streakTimer);
  const tick = () => {
    const b = $('#brk'); if (!b) return;
    if (doneToday) { b.innerHTML = '✓ 오늘 기록 지킴 · 내일도 한 판이면 이어져요'; return; }
    const ms = midnight(Date.now()) + DAY - Date.now(), h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
    const left = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    b.innerHTML = st ? `⚠ <b>${st}일 기록</b>이 끊기기까지 <b class="mono">${left}</b>` : `오늘 첫 판까지 <b class="mono">${left}</b> 남음`;
  };
  tick(); streakTimer = setInterval(tick, 1000);
}
function celebrate(n) {
  const el = $('#celebrate');
  el.innerHTML = `<div class="cel-box"><div class="cel-flame">🔥</div><div class="cel-n">${n}일</div><div class="cel-t">연속 학습 달성!</div>
    <p>${n >= 30 ? '이 정도면 습관이다. 합격까지 그대로.' : n >= 7 ? '일주일을 넘겼다. 이제 장기기억이 쌓이는 중.' : '좋은 출발. 끊기지 않게만 가자.'}</p><button class="go" id="celOk">계속</button></div>`;
  el.hidden = false;
  if (navigator.vibrate) navigator.vibrate([80, 60, 160]);
  $('#celOk').onclick = () => { el.hidden = true; };
}
function streak() {
  let n = 0, t = Date.now();
  if (!active(t)) t -= DAY;
  while (active(t)) { n++; t -= DAY; }
  return n;
}
function renderCountdown() {
  const el = $('#countdown'); clearInterval(tickTimer);
  const dl = daysLeft();
  if (dl == null) {
    el.className = 'cd empty';
    el.innerHTML = `<strong>시험일을 입력하면 작전이 시작됩니다</strong><div class="row"><input type="date" id="examQuick"><button id="examSet">시작</button></div>`;
    $('#examSet').onclick = () => { const v = $('#examQuick').value; if (v) { S.exam = v; save(); renderHome(); } };
    return;
  }
  const e = examAt(), start = midnight(e) - 100 * DAY, ph = phase(dl);
  const prog = Math.min(100, Math.max(0, (Date.now() - start) / (e - start) * 100));
  const ex = new Date(e), wd = '일월화수목금토'[ex.getDay()];
  let weekends = 0; for (let t = midnight(Date.now()) + DAY; t < midnight(e); t += DAY) if (new Date(t).getDay() === 0) weekends++;
  const all = counts(ITEMS), notM = all.total - all.m;
  const need = dl > 0 ? Math.ceil(notM / dl) : notM;
  el.className = 'cd' + (dl <= 30 ? ' hot' : '');
  el.innerHTML = `<div class="dday">${dl > 0 ? 'D-' + dl : dl === 0 ? 'D-DAY' : 'D+' + -dl}</div>
    <div class="tick" id="tick"></div>
    <div class="when">${ex.getFullYear()}.${ex.getMonth() + 1}.${ex.getDate()} (${wd}) 시험</div>
    <span class="phase">${ph.name}${ph.until ? ' · ' + ph.until : ''}</span>
    <div class="fuse"><i style="width:${prog}%"></i></div>
    <div class="fuse-l"><span>작전 ${Math.round(prog)}% 경과</span><span>${Math.max(0, 100 - Math.round(prog))}% 남음</span></div>
    <div class="facts"><div><b>${weekends}번</b><span>남은 주말</span></div><div><b>${notM}</b><span>아직 못 외운 문항</span></div><div><b>${need}</b><span>하루 외워야 할 양</span></div></div>
    <p class="msg">${urge(dl)}</p>`;
  const tick = () => {
    const ms = Math.max(0, e - Date.now()), h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
    const t = $('#tick'); if (t) t.innerHTML = `${h.toLocaleString()}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}<small>시간 남음</small>`;
  };
  tick(); tickTimer = setInterval(tick, 1000);
}
function urge(dl) {
  const today = active(Date.now());
  if (dl < 0) return '수고했습니다. 결과를 기다리며 실기 준비로!';
  if (dl === 0) return '오늘이다. 아는 것부터 침착하게.';
  if (!today) return dl <= 14 ? `🚨 D-${dl}인데 오늘 0판. 지금 한 판.` : '오늘 아직 0판. 1분이면 된다. 지금.';
  if (dl > 70) return '지금 쌓은 게 시험장에서 꺼내진다. 매일 끊기지 않게.';
  if (dl > 40) return `암기 구축 마감까지 ${dl - 40}일. 신규를 밀리면 뒤가 무너진다.`;
  if (dl >= 15) return '실전 감각 단계. 틀린 건 오늘 다시 친다.';
  if (dl > 7) return '총정리. 새로운 건 없다. 약점만 친다.';
  return '마지막 한 바퀴. 레벨 낮은 것부터 전부 털어낸다.';
}

/* ---------- 화면 전환 / 이벤트 ---------- */
function show(id) {
  ['home', 'play', 'result', 'mock', 'mockResult'].forEach(s => $('#' + s).hidden = s !== id);
  if (id === 'home') renderHome(); else { clearInterval(tickTimer); clearInterval(streakTimer); }
  window.scrollTo(0, 0);
}
$('#startBtn').onclick = startRound;
$('#again').onclick = startRound;
$('#toHome').onclick = () => show('home');
$('#quit').onclick = () => { R = null; save(); show('home'); };
$('#subjChips').onclick = e => { const b = e.target.closest('.chip'); if (!b || b.disabled) return; S.subj = b.dataset.k; save(); renderHome(); };

/* 설정 */
const dlg = $('#settings');
$('#openSettings').onclick = () => { $('#examInput').value = S.exam || ''; $('#quotaInput').value = String(S.quota || 0); $('#ver').textContent = 'v' + D.ver; if (typeof renderExStatus === 'function') renderExStatus(); dlg.showModal(); };
$('#examInput').onchange = e => { S.exam = e.target.value || null; save(); };
$('#quotaInput').onchange = e => { S.quota = +e.target.value; save(); };
dlg.addEventListener('close', renderHome);
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `소방100_백업_${dkey()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('백업 파일을 저장했어요');
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const s = JSON.parse(await f.text()); if (s.v !== 1 || !s.srs) throw 0; S = s; save(); toast('진도를 불러왔어요'); dlg.close(); }
  catch (err) { toast('올바른 백업 파일이 아니에요'); }
  e.target.value = '';
};
$('#resetBtn').onclick = () => {
  if (!confirm('모든 학습 기록이 지워집니다. 정말 초기화할까요?')) return;
  S = { v: 1, exam: S.exam, quota: S.quota, subj: S.subj, srs: {}, days: {} }; save(); toast('초기화했어요'); dlg.close();
};

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

/* 설치 안내 */
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let deferred = null;
if (!standalone) {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('#installText').innerHTML = ios
    ? 'Safari 하단 <b>공유(⬆)</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 바로 열려요.'
    : '크롬 메뉴(⋮) → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누르면 아이콘이 생겨요.';
  $('#installCard').hidden = false;
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
addEventListener('appinstalled', () => $('#installCard').hidden = true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#home').hidden) renderHome(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
show('home');
