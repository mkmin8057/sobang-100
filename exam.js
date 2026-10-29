'use strict';
/* 실전 모의고사
   기출은 저작권 때문에 앱에 넣지 않는다. 사용자가 PC에서 만든 파일을 가져오면 이 기기의 IndexedDB에만 보관.
   틀린 기출 → 같은 주제(t)의 암기 문항을 즉시 복습 대기로 + 미학습 문항은 우선 출제(S.boost). */
let EXAM = [];
let M = null;
const MOCK_N = 20, PASS_SUBJ = 40, PASS_AVG = 60;

/* 수식: 기출의 $TeX$ 구간을 KaTeX로 렌더. 수식 문항이 처음 나올 때만 CDN에서 불러오고 서비스워커가 캐시 */
const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
let katexReady = null;
function loadKatex() {
  if (!katexReady) katexReady = new Promise(res => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = KATEX + 'katex.min.css'; document.head.appendChild(l);
    const sc = document.createElement('script'); sc.src = KATEX + 'katex.min.js'; sc.onload = () => res(true); sc.onerror = () => res(false); document.head.appendChild(sc);
  });
  return katexReady;
}
function tx(s) {
  const parts = String(s).split(/\$([^$]+)\$/);
  if (parts.length === 1) return esc(s);
  if (!window.katex) { loadKatex().then(ok => { if (ok && M && !$('#mock').hidden) renderMQ(); }); }
  return parts.map((p, i) => i % 2 === 0 ? esc(p)
    : window.katex ? katex.renderToString('\\displaystyle ' + p, { throwOnError: false }) : `<code>${esc(p)}</code>`).join('');
}

function idb(mode, fn) {
  return new Promise((res, rej) => {
    const o = indexedDB.open('sobang100', 1);
    o.onupgradeneeded = () => o.result.createObjectStore('kv');
    o.onerror = () => rej(o.error);
    o.onsuccess = () => {
      const tx = o.result.transaction('kv', mode), req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    };
  });
}
async function loadExam() {
  try { const v = await idb('readonly', s => s.get('exam')); EXAM = (v && v.items) || []; } catch (e) { EXAM = []; }
  if (!$('#home').hidden) renderMock();
}

/* ---------- 홈 카드 ---------- */
function renderMock() {
  const el = $('#mockCard');
  if (!EXAM.length) {
    el.innerHTML = `<h2>🎯 실전 모의고사</h2><p class="mk-empty">PC에서 만든 기출 파일을 가져오면 실전처럼 풀 수 있어요. 기출은 이 폰 안에만 저장돼요.</p>
      <button class="ghost" id="mkImport">기출 파일 가져오기</button>`;
    $('#mkImport').onclick = () => $('#examFile').click();
    return;
  }
  const ex = S.ex || {}, wrong = EXAM.filter(q => (ex[q.id] || {}).lw).length, done = EXAM.filter(q => ex[q.id]).length;
  const subj = S.mkSubj || 'all', last = (S.mocks || []).slice(-1)[0];
  if (!wrong) S.mkWrong = false;
  const chips = [['all', '4과목 80문항'], ...SUBJ.map(s => [s.key, s.short])]
    .map(([k, t]) => `<button class="chip" data-k="${k}" aria-pressed="${subj === k}">${esc(t)}</button>`).join('');
  el.innerHTML = `<h2>🎯 실전 모의고사</h2>
    <div class="mk-stats">기출 <b>${EXAM.length.toLocaleString()}</b> · 푼 문제 <b>${done}</b> · 틀린 채 남은 <b class="bad">${wrong}</b></div>
    ${last ? `<div class="mk-last">최근 ${mockSummary(last)}</div>` : ''}
    <div class="subj" id="mkChips">${chips}</div>
    <label class="mk-wrong"><input type="checkbox" id="mkWrong" ${S.mkWrong ? 'checked' : ''} ${wrong ? '' : 'disabled'}> 틀린 문제만 다시</label>
    <button class="go mk-go" id="mkStart">▶ 모의고사 시작</button>
    <p class="hint">${subj === 'all' ? '80문항 · 실전 120분 기준 · 과목별 40점 미만 과락, 평균 60점 합격' : '20문항 · 30분 기준 · 40점 미만 과락'}</p>`;
  $('#mkChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.mkSubj = b.dataset.k; save(); renderMock(); };
  $('#mkWrong').onchange = e => { S.mkWrong = e.target.checked; save(); };
  $('#mkStart').onclick = () => startMock(buildMock());
}
function mockSummary(m) {
  const ks = Object.keys(m.sc);
  if (ks.length === 4) return `4과목 평균 <b>${m.avg}점</b> · ${m.pass ? '<span class="good">합격권</span>' : '<span class="bad">불합격</span>'}`;
  return `${esc(subjShort(ks[0]))} <b>${m.sc[ks[0]]}점</b>`;
}

/* ---------- 출제 ---------- */
function buildMock() {
  const ex = S.ex || {}, subs = (S.mkSubj || 'all') === 'all' ? SUBJ.map(s => s.key) : [S.mkSubj];
  const out = [];
  subs.forEach(sk => {
    let p = EXAM.filter(q => q.s === sk);
    if (S.mkWrong) p = p.filter(q => (ex[q.id] || {}).lw);
    const n = q => (ex[q.id] || {}).n || 0;   // 덜 풀어본 문제부터
    out.push(...shuffle(p).sort((a, b) => n(a) - n(b)).slice(0, MOCK_N));
  });
  return out;
}
function startMock(qs) {
  if (!qs.length) { toast('풀 문제가 없어요'); return; }
  M = { qs, ans: [], i: 0, t0: Date.now() };
  show('mock'); renderMQ();
  clearInterval(M.timer);
  M.timer = setInterval(() => { if (!M) return; const s = Math.round((Date.now() - M.t0) / 1000); $('#mkTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} / ${Math.round(M.qs.length * 1.5)}분`; }, 1000);
}
function renderMQ() {
  const q = M.qs[M.i], n = M.qs.length;
  $('#mkPos').textContent = `${M.i + 1} / ${n}`;
  $('#mkQ').innerHTML = `<span class="tag">${esc(subjShort(q.s))}</span><div class="mq-t"><b>${M.i + 1}.</b> ${tx(q.q)}</div>` +
    (q.qi || []).map(src => `<img class="mq-img" src="${src}" alt="문제 그림">`).join('');
  $('#mkOpts').innerHTML = q.o.map((o, k) => `<button class="opt mq-opt${M.ans[M.i] === k + 1 ? ' sel' : ''}" data-k="${k + 1}">
      <span class="mq-n">${'①②③④'[k]}</span><span class="mq-o">${tx(o)}${q.oi && q.oi[k] ? `<img class="mq-img" src="${q.oi[k]}" alt="">` : ''}</span></button>`).join('');
  $('#mkStrip').innerHTML = M.qs.map((x, j) => `<button class="${j === M.i ? 'cur' : ''}${M.ans[j] ? ' done' : ''}" data-j="${j}">${j + 1}</button>`).join('');
  const cur = $('#mkStrip .cur'); if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  $('#mkPrev').disabled = M.i === 0;
  $('#mkNext').textContent = M.i === n - 1 ? '제출' : '다음 ▶';
  $('.mq-wrap').scrollTop = 0;
}
$('#mkOpts').onclick = e => {
  const b = e.target.closest('.mq-opt'); if (!b || !M) return;
  M.ans[M.i] = +b.dataset.k; renderMQ();
  if (M.i < M.qs.length - 1) setTimeout(() => { if (M && M.ans[M.i]) { M.i++; renderMQ(); } }, 220);
};
$('#mkStrip').onclick = e => { const b = e.target.closest('button'); if (!b || !M) return; M.i = +b.dataset.j; renderMQ(); };
$('#mkPrev').onclick = () => { if (M.i > 0) { M.i--; renderMQ(); } };
$('#mkNext').onclick = () => {
  if (M.i < M.qs.length - 1) { M.i++; renderMQ(); return; }
  const empty = M.qs.filter((_, j) => !M.ans[j]).length;
  if (empty && !confirm(`안 푼 문제 ${empty}개는 오답 처리돼요. 제출할까요?`)) return;
  finishMock();
};
$('#mkQuit').onclick = () => { if (confirm('그만두면 이번 모의고사는 기록되지 않아요. 나갈까요?')) { clearInterval(M.timer); M = null; show('home'); } };

/* ---------- 채점 ---------- */
function relinkTopic(t, now) {
  let review = 0, fresh = 0;
  ITEMS.forEach(it => {
    if (it.t !== t) return;
    const r = S.srs[it.id];
    if (r) { r.due = Math.min(r.due, now); r.l = Math.min(r.l, 2); review++; } else fresh++;
  });
  if (fresh) (S.boost || (S.boost = {}))[t] = now;
  return { review, fresh };
}
async function finishMock() {
  clearInterval(M.timer);
  if (M.qs.some(q => /\$/.test(q.q + q.o.join('')))) await loadKatex();
  const now = Date.now(), sec = Math.round((now - M.t0) / 1000), per = {}, wrongs = [], topics = new Set();
  S.ex = S.ex || {};
  M.qs.forEach((q, j) => {
    const ok = M.ans[j] === q.a, p = per[q.s] || (per[q.s] = { c: 0, n: 0 });
    p.n++; if (ok) p.c++;
    const r = S.ex[q.id] || { n: 0, w: 0 }; r.n++; if (!ok) r.w++; r.lw = !ok; r.t = now; S.ex[q.id] = r;
    if (!ok) { wrongs.push(j); if (q.t) topics.add(q.t); }
  });
  let review = 0, fresh = 0;
  topics.forEach(t => { const x = relinkTopic(t, now); review += x.review; fresh += x.fresh; });
  const subs = SUBJ.map(s => s.key).filter(k => per[k]);
  const sc = Object.fromEntries(subs.map(k => [k, Math.round(per[k].c / per[k].n * 100)]));
  const avg = Math.round(subs.reduce((a, k) => a + sc[k], 0) / subs.length);
  const cut = subs.filter(k => sc[k] < PASS_SUBJ), full = subs.length === 4;
  const pass = full && !cut.length && avg >= PASS_AVG;
  S.mocks = (S.mocks || []).concat([{ t: now, sc, avg, pass }]).slice(-30);
  const d = day(); d.m = (d.m || 0) + 1;
  const st = streak(), firstToday = d.r + d.m === 1;
  if (st > (S.best || 0)) S.best = st;
  save();

  const verdict = full
    ? (pass ? '<b class="good">합격권 🎉</b>' : cut.length ? `<b class="bad">불합격 · 과락 ${cut.map(subjShort).join(', ')}</b>` : '<b class="bad">불합격 · 평균 미달</b>')
    : (sc[subs[0]] < PASS_SUBJ ? '<b class="bad">과락</b>' : sc[subs[0]] >= PASS_AVG ? '<b class="good">목표 달성</b>' : '<b>과락 면함 · 목표 60점</b>');
  const bars = subs.map(k => `<div class="mr-bar"><div class="gl"><span>${esc(subjShort(k))}</span><b>${sc[k]}점 <small>(${per[k].c}/${per[k].n})</small></b></div>
    <div class="mr-track"><i style="width:${sc[k]}%" class="${sc[k] < PASS_SUBJ ? 'bad' : sc[k] >= PASS_AVG ? 'good' : 'mid'}"></i><em style="left:${PASS_SUBJ}%"></em><em class="avg" style="left:${PASS_AVG}%"></em></div></div>`).join('');
  const list = wrongs.map(j => {
    const q = M.qs[j], T = TOPIC[q.t], my = M.ans[j];
    return `<li><div class="mq-t"><b>${j + 1}.</b> ${tx(q.q)}</div>${(q.qi || []).map(src => `<img class="mq-img" src="${src}" alt="">`).join('')}
      <div class="mr-ans">정답 <b class="good">${'①②③④'[q.a - 1]} ${tx(q.o[q.a - 1])}</b>${my ? `<br>내 답 <span class="bad">${'①②③④'[my - 1]} ${tx(q.o[my - 1])}</span>` : '<br><span class="bad">안 풂</span>'}</div>
      ${T ? `<details><summary>관련 이론: ${esc(T.title)}</summary><ul>${T.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>${T.trap ? `<div class="trap">⚠ 함정: ${esc(T.trap)}</div>` : ''}</details>` : ''}</li>`;
  }).join('');
  $('#mrBody').innerHTML = (firstToday ? `<div class="plus1">🔥 <b>${st}일 연속</b> 달성 · 오늘 기록 지켰다!</div>` : '') +
    `<div class="mr-verdict">${full ? `평균 <b class="mr-avg">${avg}</b>점` : `<b class="mr-avg">${sc[subs[0]]}</b>점`} ${verdict}</div>
    <div class="mr-time">${Math.floor(sec / 60)}분 ${sec % 60}초 · 틀린 문제 ${wrongs.length}개</div>
    ${bars}
    ${review + fresh ? `<div class="up">🔗 틀린 문제와 연결된 암기 문항 ${review ? `${review}개를 오늘 복습으로` : ''}${review && fresh ? ', ' : ''}${fresh ? `미학습 ${fresh}개를 우선 출제로` : ''} 보냈어요</div>` : ''}
    ${list ? `<h3>틀린 문제</h3><ol class="mr-list">${list}</ol>` : '<p class="good">전부 맞혔어요!</p>'}`;
  M.wrongQs = wrongs.map(j => M.qs[j]);
  const again = $('#mrAgain'); again.hidden = !wrongs.length;
  show('mockResult');
  if (firstToday && MILESTONES.includes(st)) celebrate(st);
}
$('#mrAgain').onclick = () => startMock(shuffle(M.wrongQs.slice()));
$('#mrHome').onclick = () => { M = null; show('home'); };

/* ---------- 가져오기 / 삭제 ---------- */
function renderExStatus() {
  $('#exStatus').textContent = EXAM.length ? `${EXAM.length.toLocaleString()}문항 보관 중 (이 기기에만)` : '가져온 기출 없음';
  $('#exDelete').hidden = !EXAM.length;
}
$('#exImport').onclick = () => $('#examFile').click();
$('#examFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  toast('기출을 불러오는 중…');
  try {
    const d = JSON.parse(await f.text());
    if (d.kind !== 'sobang100-exam' || !Array.isArray(d.items)) throw 0;
    await idb('readwrite', s => s.put({ items: d.items, at: Date.now() }, 'exam'));
    EXAM = d.items; toast(`기출 ${EXAM.length.toLocaleString()}문항을 가져왔어요`);
  } catch (err) { toast('기출 파일이 아니거나 저장에 실패했어요'); }
  e.target.value = '';
  renderExStatus(); if (!$('#home').hidden) renderMock();
};
$('#exDelete').onclick = async () => {
  if (!confirm('이 기기에서 기출 데이터를 지울까요? (풀이 기록은 남아요)')) return;
  await idb('readwrite', s => s.delete('exam')); EXAM = [];
  renderExStatus(); toast('기출 데이터를 지웠어요');
};
loadExam();
