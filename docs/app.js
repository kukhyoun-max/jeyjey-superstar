// 제이제이 수퍼스타 만들기 화면. 사용자가 쓴 글은 모두 textContent로만 넣는다.
const API_URL = 'https://script.google.com/macros/s/AKfycbwrkeySSxJfPPCwZl0FU8-LT_w86KmjjevHFfDbcsWOJzlTNTJls-mY-p7J8aX6-vszNA/exec';
const APP_URL = 'https://kukhyoun-max.github.io/jeyjey-superstar/';
const PLATFORM_NAME = { instagram: '인스타', youtube: '유튜브', tiktok: '틱톡' };
const NEXT_DELAY_MS = 1600;

const app = document.getElementById('app');
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
};

function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'on') Object.entries(v).forEach(([e, f]) => n.addEventListener(e, f));
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  });
  kids.flat().forEach((c) => { if (c !== null && c !== undefined) n.append(c); });
  return n;
}
function show(...nodes) { app.replaceChildren(...nodes); window.scrollTo(0, 0); }
const go = (hash) => { location.hash = hash; };

async function api(action, body = {}) {
  const r = await fetch(API_URL, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ action, token: store.get('jj_token'), ...body }), redirect: 'follow' });
  const out = await r.json();
  if (out && out.error === 'token') {
    store.del('jj_token');
    renderLogin();
    throw new Error('token');
  }
  return out;
}

function captureToken() {
  const q = new URLSearchParams(location.search);
  const t = q.get('t');
  if (t) {
    store.set('jj_token', t);
    history.replaceState(null, '', location.pathname + location.hash);
  }
}

function retryBox(fn) {
  return el('div', { class: 'empty' }, '불러오지 못했습니다. 연결을 확인하고 다시 눌러 주세요.',
    el('button', { class: 'btn y', on: { click: fn } }, '다시 불러오기'));
}

// ── 내 코드 ─────────────────────────────────────
function renderLogin() {
  const input = el('input', { id: 'code', autocomplete: 'one-time-code', autocapitalize: 'off' });
  const err = el('p', { class: 'err', role: 'alert' });
  const btn = el('button', { class: 'btn y', type: 'submit' }, '들어가기');
  const form = el('form', { class: 'form', on: { submit: async (e) => {
    e.preventDefault();
    btn.disabled = true;
    err.textContent = '';
    try {
      const r = await api('login', { code: input.value.trim() });
      if (r.ok) { store.set('jj_token', r.token); location.hash = '#/'; route(); return; }
      err.textContent = r.error === 'locked' ? '여러 번 틀려 잠겼습니다. 15분 뒤에 다시 넣어 주세요.' : '코드가 맞지 않습니다. 메일로 받은 코드를 확인해 주세요.';
    } catch (x) { err.textContent = '연결하지 못했습니다. 다시 눌러 주세요.'; }
    btn.disabled = false;
  } } },
    el('h1', { class: 'display' }, '내 코드'),
    el('p', { class: 'note' }, '처음 한 번만 넣으면 이 브라우저에서 기억합니다.'),
    el('label', { for: 'code' }, '내 코드', input), err, btn);
  show(form);
}

// ── 첫 화면 ─────────────────────────────────────
async function pasteLink() {
  let text = '';
  try { text = (await navigator.clipboard.readText()).trim(); } catch (e) { /* 입력 칸으로 받는다 */ }
  sessionStorage.setItem('jj_paste', text);
  go('#/add');
}

function renderHome() {
  const badge = el('span', { class: 'badge', hidden: 'hidden' });
  const voteLink = el('a', { class: 'btn w', href: '#/list' }, '투표하기', badge);
  show(el('section', { class: 'home' },
    el('div', { class: 'hill' }),
    el('img', { class: 'jj', src: 'jeyjey.webp', alt: '' }),
    el('h1', { class: 'display' }, '제이제이 ', el('span', null, '수퍼스타'), el('br'), '만들기 프로젝트'),
    el('div', { class: 'btns' }, el('button', { class: 'btn y', on: { click: pasteLink } }, '찾은 영상 붙여넣기'), voteLink),
    el('img', { class: 'jate', src: 'jate.webp', alt: '' }),
    el('img', { class: 'byeori', src: 'byeori.webp', alt: '' })));
  api('list').then((r) => {
    if (r.ok && r.todo > 0) { badge.textContent = String(r.todo); badge.removeAttribute('hidden'); }
  }).catch(() => {});
}

// ── 등록 ─────────────────────────────────────────
const ADD_ERRORS = { line: '한 줄 설명을 80자 안으로 써 주세요.', link: '인스타, 유튜브, 틱톡 영상 링크만 넣을 수 있습니다.' };

function renderAdd() {
  const url = el('input', { id: 'url', inputmode: 'url', autocomplete: 'off', value: sessionStorage.getItem('jj_paste') || '' });
  sessionStorage.removeItem('jj_paste');
  const line = el('input', { id: 'line', maxlength: 80, autocomplete: 'off', placeholder: '어떤 영상인지, 왜 골랐는지' });
  const err = el('p', { class: 'err', role: 'alert' });
  const btn = el('button', { class: 'btn y', type: 'submit' }, '등록하기');
  show(el('form', { class: 'form', on: { submit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!url.value.trim()) { err.textContent = '영상 링크를 넣어 주세요.'; return; }
    if (!line.value.trim()) { err.textContent = '한 줄 설명을 써 주세요.'; return; }
    btn.disabled = true;
    try {
      const r = await api('add', { url: url.value.trim(), line: line.value.trim() });
      if (r.ok && r.duplicate) { go(`#/vote/${r.duplicate}`); return; }
      if (r.ok) { renderAdded(line.value.trim()); return; }
      err.textContent = ADD_ERRORS[r.error] || '등록하지 못했습니다. 다시 눌러 주세요.';
    } catch (x) { if (x.message !== 'token') err.textContent = '연결하지 못했습니다. 다시 눌러 주세요.'; }
    btn.disabled = false;
  } } },
    el('a', { class: 'home-link', href: '#/' }, '‹ 처음으로'),
    el('h1', { class: 'display' }, '어떤 영상인가요?'),
    el('label', { for: 'url' }, '영상 링크', url),
    el('label', { for: 'line' }, '한 줄 설명', line), err, btn));
  (url.value ? line : url).focus();
}

function renderAdded(line) {
  const note = el('p', { class: 'note', role: 'status' });
  show(el('section', { class: 'form' },
    el('h1', { class: 'display' }, '등록했습니다'),
    el('p', { class: 'note' }, '단톡방에 알려야 팀원이 투표할 수 있습니다.'),
    el('div', { class: 'sp' }),
    el('button', { class: 'btn y', style: 'padding:26px;font-size:22px', on: { click: async () => {
      const text = `[제이제이] 새 레퍼런스: ${line}`;
      try {
        if (navigator.share) { await navigator.share({ text, url: APP_URL }); return; }
        await navigator.clipboard.writeText(`${text}\n${APP_URL}`);
        note.textContent = '문구를 복사했습니다. 단톡방에 붙여 넣어 주세요.';
      } catch (e) { if (e.name !== 'AbortError') note.textContent = `복사하지 못했습니다. 이 주소를 보내 주세요: ${APP_URL}`; }
    } } }, '단톡방에 알리기'),
    note,
    el('a', { class: 'btn line', href: '#/list' }, '투표 목록 보기')));
}

// ── 목록 ─────────────────────────────────────────
function thumbOf(c) {
  if (c.platform === 'youtube' && c.videoId) return `https://i.ytimg.com/vi/${encodeURIComponent(c.videoId)}/hqdefault.jpg`;
  return /^https:\/\//.test(c.thumbUrl || '') ? c.thumbUrl : '';
}

function cardNode(c) {
  const src = thumbOf(c);
  const sub = [c.account && (c.platform === 'youtube' ? c.account : `@${c.account}`), PLATFORM_NAME[c.platform]].filter(Boolean).join(' · ');
  const done = c.word !== '투표';
  return el('a', { class: `card word-${c.word}${done ? ' done' : ''}`, href: c.word === '제작' ? `#/result/${c.id}` : `#/vote/${c.id}`, 'aria-label': `${c.line}, ${c.word}` },
    src ? el('img', { class: 'thumb', src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', on: { error: (e) => e.target.remove() } }) : null,
    el('div', { class: 'info' }, el('div', { class: 't' }, c.line), el('div', { class: 'a' }, sub)),
    el('span', { class: `stamp w-${c.word}` }, c.word));
}

function switchBtn(label, on, icon, click) {
  const b = el('button', { type: 'button', 'aria-label': label, 'aria-pressed': on ? 'true' : 'false', on: { click } });
  b.innerHTML = icon; // 고정 문자열인 아이콘만 넣는다.
  return b;
}
const ICON_ONE = '<svg width="17" height="20" viewBox="0 0 17 20" aria-hidden="true"><rect width="17" height="20" rx="3"/></svg>';
const ICON_TWO = '<svg width="19" height="20" viewBox="0 0 19 20" aria-hidden="true"><rect width="8.5" height="9" rx="2"/><rect x="10.5" width="8.5" height="9" rx="2"/><rect y="11" width="8.5" height="9" rx="2"/><rect x="10.5" y="11" width="8.5" height="9" rx="2"/></svg>';

async function renderList() {
  const small = el('small', null);
  const two = store.get('jj_view') !== 'one';
  const grid = el('div', { id: 'grid', class: two ? 'two' : '' });
  const setView = (isTwo) => {
    grid.className = isTwo ? 'two' : '';
    store.set('jj_view', isTwo ? 'two' : 'one');
    bOne.setAttribute('aria-pressed', isTwo ? 'false' : 'true');
    bTwo.setAttribute('aria-pressed', isTwo ? 'true' : 'false');
  };
  const bOne = switchBtn('한 줄에 하나', !two, ICON_ONE, () => setView(false));
  const bTwo = switchBtn('한 줄에 둘', two, ICON_TWO, () => setView(true));
  show(el('header', { class: 'top' },
    el('a', { class: 'home-link', href: '#/', style: 'padding:0' }, el('h1', { class: 'ttl display' }, '투표 목록', small)),
    el('div', { class: 'sw' }, bOne, bTwo)), grid);
  try {
    const r = await api('list');
    if (!r.ok) { show(retryBox(renderList)); return; }
    small.textContent = r.todo ? `내 표 ${r.todo}개 남음` : '내 표는 모두 끝났습니다';
    if (!r.cards.length) {
      grid.replaceWith(el('div', { class: 'empty' }, '아직 등록된 영상이 없습니다. 찾은 영상을 먼저 넣어 주세요.', el('a', { class: 'btn y', href: '#/' }, '처음으로')));
      return;
    }
    grid.append(...r.cards.map(cardNode));
  } catch (e) { if (e.message !== 'token') show(retryBox(renderList)); }
}

// ── 투표 ─────────────────────────────────────────
function starsNode(likes) {
  const n = Math.min(likes || 0, 3);
  return el('div', { class: 'stars', role: 'img', 'aria-label': `좋아요 ${likes || 0}개` }, '★'.repeat(n) + '☆'.repeat(3 - n));
}

function frameNode(c) {
  const box = el('div', { class: 'frame' });
  const e = embedFor({ platform: c.platform, id: String(c.videoId), url: c.url });
  if (e) box.append(el('iframe', { src: e.src, title: c.line, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: 'allowfullscreen' }));
  return box;
}

async function nextAfter(id) {
  try {
    const r = await api('list');
    const next = r.ok && r.cards.find((c) => c.word === '투표' && c.id !== id);
    go(next ? `#/vote/${next.id}` : '#/list');
  } catch (e) { go('#/list'); }
}

async function renderVote(id) {
  show(el('div', { class: 'empty' }, '불러오는 중입니다.'));
  let r;
  try { r = await api('item', { id }); } catch (e) { if (e.message !== 'token') show(retryBox(() => renderVote(id))); return; }
  if (!r.ok) { show(retryBox(() => renderVote(id))); return; }
  const c = r.card;
  if (c.word === '제작') { location.replace(`#/result/${id}`); return; }
  const frame = frameNode(c);
  const original = el('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, '원본 영상 보기');
  const mine = c.myVote ? `내 표: ${c.myVote === 'like' ? '좋아요' : '아니에요'}` : '';
  let busy = false;
  const bottom = el('div', { class: 'acts' });

  const vote = async (value) => {
    if (busy) return;
    busy = true;
    bottom.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const v = await api('vote', { id, value });
      if (!v.ok) {
        if (v.error === 'closed') { location.replace(`#/result/${id}`); return; }
        throw new Error('vote');
      }
      const word = v.justProduced ? '제작' : v.card.word;
      frame.replaceChildren(el('span', { class: `stamp hit w-${word}` }, word));
      const text = v.justProduced ? '내 표로 3개가 찼습니다. Claude가 분석을 시작합니다.'
        : word === '탈락' ? '아니에요 3개로 탈락했습니다.'
          : v.card.likes === 2 ? '별 하나만 더 받으면 제작입니다.' : '내 표를 넣었습니다.';
      bottom.replaceWith(el('div', { class: 'done-msg' }, starsNode(v.card.likes), el('p', { role: 'status' }, text)));
      setTimeout(() => (v.justProduced ? go(`#/result/${id}`) : nextAfter(id)), NEXT_DELAY_MS);
    } catch (e) {
      if (e.message === 'token') return;
      busy = false;
      bottom.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      original.parentElement.append(el('span', { role: 'alert' }, '표를 넣지 못했습니다. 다시 눌러 주세요.'));
    }
  };

  bottom.append(
    el('button', { class: 'no', 'aria-pressed': c.myVote === 'no' ? 'true' : 'false', on: { click: () => vote('no') } }, '아니에요'),
    el('button', { class: 'yes', 'aria-pressed': c.myVote === 'like' ? 'true' : 'false', on: { click: () => vote('like') } }, '좋아요'));

  show(el('section', { class: 'vote' },
    el('header', { class: 'top' }, el('a', { href: '#/list' }, '‹ 목록'), mine ? el('span', { class: 'count' }, mine) : null),
    frame,
    el('div', { class: 'below' }, el('div', { class: 't' }, c.line), el('div', { class: 'sub' }, el('span', null, PLATFORM_NAME[c.platform]), original)),
    bottom));
}

// ── 결과 ─────────────────────────────────────────
function copyBtn(label, text) {
  const b = el('button', { type: 'button', on: { click: async () => {
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = '복사했습니다';
      setTimeout(() => { b.textContent = label; }, 1500);
    } catch (e) { b.textContent = '길게 눌러 직접 복사해 주세요'; }
  } } }, label);
  return b;
}

function listSec(title, items) {
  if (!items || !items.length) return null;
  return el('div', { class: 'sec' }, el('h2', null, title), el('ul', null, items.map((x) => el('li', null, String(x)))));
}

async function renderResult(id) {
  show(el('div', { class: 'empty' }, '불러오는 중입니다.'));
  let r;
  try { r = await api('item', { id }); } catch (e) { if (e.message !== 'token') show(retryBox(() => renderResult(id))); return; }
  if (!r.ok) { show(retryBox(() => renderResult(id))); return; }
  const c = r.card;
  if (c.word !== '제작') { location.replace(`#/vote/${id}`); return; }
  const res = r.result;
  const head = [el('header', { class: 'top' }, el('a', { href: '#/list' }, '‹ 목록'), el('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, '원본 영상 보기')), ];
  const title = el('h1', { class: 'display' }, c.line);
  let body;
  if (!res && c.analysis === '실패') {
    body = el('div', { class: 'msg-box' }, el('span', { class: 'display' }, '분석 실패'), el('p', null, '이 영상을 분석하지 못했습니다. 담당자가 확인합니다.'));
  } else if (!res) {
    body = el('div', { class: 'msg-box' }, el('span', { class: 'display' }, '분석 중'), el('p', null, '끝나면 메일로 알려 드립니다. PC가 꺼져 있으면 다음에 켤 때 이어서 합니다.'));
  } else if (res.fit === false) {
    body = el('div', { class: 'sec' }, el('h2', null, '이 형식은 안 맞음'), el('p', null, String(res.reason || '')));
  } else {
    body = [
      el('div', { class: 'sec' }, el('h2', null, '왜 먹혔나'), el('p', null, String(res.why || '')), res.format ? el('p', null, `빌려 올 형식: ${res.format}`) : null),
      listSec('전주대로 바꿀 곳', res.change),
      el('div', { class: 'sec' }, el('h2', null, '클립별 프롬프트'),
        (res.clips || []).map((x, i) => {
          const n = x.order || i + 1;
          return el('div', { class: 'clip' }, el('b', null, `클립 ${n} · ${x.seconds}초`), el('span', null, `참조 이미지: ${x.reference}`), el('code', null, String(x.prompt || '')), copyBtn(`클립 ${n} 복사`, String(x.prompt || '')));
        })),
      listSec('편집에서 입힐 자막 초안', res.captions),
      el('div', { class: 'sec' }, el('p', null, '뽑은 뒤 AI 생성 지침 5장 검수표로 확인하고, 올릴 때 인스타 AI 정보 표시를 켜 주세요.'))
    ];
  }
  show(...head, el('section', { class: 'result' }, title, body));
}

// ── 길 찾기 ──────────────────────────────────────
function route() {
  if (!store.get('jj_token')) { renderLogin(); return; }
  const h = location.hash || '#/';
  let m;
  if ((m = h.match(/^#\/vote\/([\w-]+)/))) renderVote(m[1]);
  else if ((m = h.match(/^#\/result\/([\w-]+)/))) renderResult(m[1]);
  else if (h === '#/list') renderList();
  else if (h === '#/add') renderAdd();
  else renderHome();
}

captureToken();
window.addEventListener('hashchange', route);
route();
