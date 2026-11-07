// 제이제이 수퍼스타 만들기 화면. 사용자가 쓴 글은 모두 textContent로만 넣는다.
const API_URL = 'https://script.google.com/macros/s/AKfycbwrkeySSxJfPPCwZl0FU8-LT_w86KmjjevHFfDbcsWOJzlTNTJls-mY-p7J8aX6-vszNA/exec';
const APP_URL = 'https://kukhyoun-max.github.io/jeyjey-superstar/';
const PLATFORM_NAME = { instagram: '인스타', youtube: '유튜브' };
const NEXT_DELAY_MS = 900;
const TEAM = ['국현', '하영', '산하', '민우', '실장님'];
const MAKERS = ['산하', '민우'];
const PUBLISHERS = ['국현', '산하', '민우'];
const isMade = (word) => word === '제작' || word === '발행';

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
    store.del('jj_name');
    renderPick();
    throw new Error('token');
  }
  return out;
}

function retryBox(fn) {
  return el('div', { class: 'empty' }, '불러오지 못했습니다. 연결을 확인하고 다시 눌러 주세요.',
    el('button', { class: 'btn y', on: { click: fn } }, '다시 불러오기'));
}

// ── 이름 고르기 ─────────────────────────────────
function renderPick() {
  const err = el('p', { class: 'err', role: 'alert' });
  const pick = async (name, btn) => {
    err.textContent = '';
    btn.disabled = true;
    try {
      const r = await api('pick', { name });
      if (r.ok) {
        store.set('jj_token', r.token);
        store.set('jj_name', r.name);
        location.hash = '#/';
        route();
        return;
      }
    } catch (x) { /* 아래 안내로 처리 */ }
    err.textContent = '들어가지 못했습니다. 다시 눌러 주세요.';
    btn.disabled = false;
  };
  const buttons = TEAM.map((name) => {
    const b = el('button', { class: 'btn y', type: 'button', on: { click: () => pick(name, b) } }, name);
    return b;
  });
  show(el('section', { class: 'form' },
    el('h1', { class: 'display' }, '누구세요?'),
    el('p', { class: 'note' }, '처음 한 번만 고르면 이 브라우저에서 기억합니다. 표는 이름 없이 저장합니다.'),
    buttons, err));
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
  const listed = api('list').catch(() => null); // 배지와 투표하기가 같은 응답을 쓴다.
  // 투표할 영상이 있으면 투표 화면으로, 없거나 못 받았으면 목록으로 간다.
  const voteLink = el('a', { class: 'btn w', href: '#/list', on: { click: async (e) => {
    e.preventDefault();
    voteLink.classList.add('busy');
    const r = await listed;
    const first = r && r.ok ? r.cards.find((c) => c.word === '투표') : null;
    go(first ? `#/vote/${first.id}` : '#/list');
  } } }, '투표하기', badge);
  const name = store.get('jj_name');
  const who = el('div', { class: 'who' }, name ? el('span', null, name) : null,
    el('button', { type: 'button', on: { click: () => { store.del('jj_token'); store.del('jj_name'); renderPick(); } } }, '이름 바꾸기'));
  show(el('section', { class: 'home' },
    who,
    el('h1', { class: 'display' }, '제이제이 ', el('span', null, '수퍼스타'), el('br'), '만들기 프로젝트'),
    el('div', { class: 'btns' }, el('button', { class: 'btn y', on: { click: pasteLink } }, '찾은 영상 붙여넣기'), voteLink),
    el('div', { class: 'cast' }, el('img', { src: 'home-cast.webp', alt: '' }))));
  listed.then((r) => {
    if (r && r.ok && r.todo > 0) { badge.textContent = String(r.todo); badge.removeAttribute('hidden'); }
  });
}

// ── 등록 ─────────────────────────────────────────
const ADD_ERRORS = { line: '한 줄 설명을 80자 안으로 써 주세요.', link: '인스타, 유튜브 영상 링크만 넣을 수 있습니다.' };

// 이번에 등록하고 아직 단톡방에 알리지 않은 설명. 앱을 오가도 남도록 저장한다.
function unsent() { try { return JSON.parse(sessionStorage.getItem('jj_unsent') || '[]'); } catch (x) { return []; } }
function setUnsent(list) { try { sessionStorage.setItem('jj_unsent', JSON.stringify(list)); } catch (x) { /* 저장 못 하면 화면 안에서만 */ } }

function toast(text, link) {
  document.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast', role: 'status' }, el('span', null, text), link || null);
  document.body.append(t);
  setTimeout(() => t.remove(), link ? 5000 : 2200);
}

function shareText(lines) {
  if (lines.length === 1) return `[제이제이] 새 레퍼런스: ${lines[0]}`;
  return `[제이제이] 새 레퍼런스 ${lines.length}개\n${lines.map((x) => `- ${x}`).join('\n')}`;
}

function renderAdd() {
  const url = el('input', { id: 'url', inputmode: 'url', autocomplete: 'off', value: sessionStorage.getItem('jj_paste') || '' });
  sessionStorage.removeItem('jj_paste');
  const line = el('input', { id: 'line', maxlength: 80, autocomplete: 'off', placeholder: '어떤 영상인지, 왜 골랐는지' });
  const err = el('p', { class: 'err', role: 'alert' });
  const btn = el('button', { class: 'btn y', type: 'submit' }, '등록하기');
  const note = el('p', { class: 'note', role: 'status' });
  const shareBox = el('div', { class: 'share-box' });

  const paste = el('button', { class: 'btn w', type: 'button', on: { click: async () => {
    err.textContent = '';
    try {
      url.value = (await navigator.clipboard.readText()).trim();
      line.focus();
    } catch (x) {
      err.textContent = '붙여넣지 못했습니다. 링크 칸을 길게 눌러 넣어 주세요.';
      url.focus();
    }
  } } }, '붙여넣기');

  const drawShare = () => {
    const lines = unsent();
    shareBox.replaceChildren();
    if (!lines.length) return;
    shareBox.append(el('button', { class: 'btn line', type: 'button', on: { click: async () => {
      const text = shareText(lines);
      try {
        if (navigator.share) await navigator.share({ text, url: APP_URL });
        else { await navigator.clipboard.writeText(`${text}\n${APP_URL}`); toast('문구를 복사했습니다. 단톡방에 붙여 넣어 주세요.'); }
        setUnsent([]);
        drawShare();
      } catch (x) {
        if (x.name !== 'AbortError') note.textContent = `복사하지 못했습니다. 이 주소를 보내 주세요: ${APP_URL}`;
      }
    } } }, `단톡방에 ${lines.length}개 알리기`));
  };

  show(el('form', { class: 'form', on: { submit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!url.value.trim()) { err.textContent = '영상 링크를 넣어 주세요.'; return; }
    const text = line.value.trim();
    if (!text) { err.textContent = '한 줄 설명을 써 주세요.'; return; }
    btn.disabled = true;
    try {
      const r = await api('add', { url: url.value.trim(), line: text });
      if (r.ok && r.duplicate) {
        toast('이미 등록된 영상입니다.', el('a', { href: `#/vote/${r.duplicate}` }, '투표하러 가기'));
      } else if (r.ok) {
        setUnsent([...unsent(), text]);
        toast('등록했습니다');
        drawShare();
      } else {
        err.textContent = ADD_ERRORS[r.error] || '등록하지 못했습니다. 다시 눌러 주세요.';
        btn.disabled = false;
        return;
      }
      url.value = '';
      line.value = '';
    } catch (x) { if (x.message !== 'token') err.textContent = '연결하지 못했습니다. 다시 눌러 주세요.'; }
    btn.disabled = false;
  } } },
    el('a', { class: 'home-link', href: '#/' }, '‹ 처음으로'),
    el('h1', { class: 'display' }, '찾은 영상 넣기'),
    paste,
    el('label', { for: 'url' }, '영상 링크', url),
    el('label', { for: 'line' }, '한 줄 설명', line), err, btn,
    el('div', { class: 'sp' }), shareBox, note,
    el('a', { class: 'btn line', href: '#/list' }, '투표 목록 보기')));
  drawShare();
  if (url.value) line.focus();
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
  return el('a', { class: `card word-${c.word}${done ? ' done' : ''}`, href: isMade(c.word) ? `#/result/${c.id}` : `#/vote/${c.id}`, 'aria-label': `${c.line}, ${c.word}` },
    src ? el('img', { class: 'thumb', src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', on: { error: (e) => e.target.remove() } }) : null,
    el('div', { class: 'info' }, el('div', { class: 't' }, c.line), el('div', { class: 'a' }, sub)),
    el('span', { class: `stamp w-${c.word}` }, c.word));
}

// 내 표가 필요한 영상은 카드 하나로 묶고, 누르면 첫 영상부터 위아래로 넘기며 투표한다.
function voteCardNode(voting) {
  const src = voting.map(thumbOf).find(Boolean);
  const title = `투표할 영상 ${voting.length}개`;
  return el('a', { class: 'card word-투표', href: `#/vote/${voting[0].id}`, 'aria-label': `${title}, 눌러서 투표하기` },
    src ? el('img', { class: 'thumb', src, alt: '', referrerpolicy: 'no-referrer', on: { error: (e) => e.target.remove() } }) : null,
    el('div', { class: 'info' }, el('div', { class: 't' }, title), el('div', { class: 'a' }, '눌러서 투표하기')),
    el('span', { class: 'stamp w-투표' }, '투표'));
}

// 투표 묶음 카드를 맨 앞에 두고, 나머지 카드는 받은 순서대로 잇는다.
function listNodes(cards) {
  const voting = cards.filter((c) => c.word === '투표');
  const rest = cards.filter((c) => c.word !== '투표').map(cardNode);
  return voting.length ? [voteCardNode(voting), ...rest] : rest;
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
    el('div', { class: 'head-left' }, el('a', { class: 'to-home', href: '#/' }, '‹ 처음으로'), el('h1', { class: 'ttl display' }, '투표 목록', small)),
    el('div', { class: 'sw' }, bOne, bTwo)), grid);
  try {
    const r = await api('list');
    if (!r.ok) { show(retryBox(renderList)); return; }
    small.textContent = r.todo ? `내 표 ${r.todo}개 남음` : '내 표는 모두 끝났습니다';
    if (!r.cards.length) {
      grid.replaceWith(el('div', { class: 'empty' }, '아직 등록된 영상이 없습니다. 찾은 영상을 먼저 넣어 주세요.', el('a', { class: 'btn y', href: '#/' }, '처음으로')));
      return;
    }
    grid.append(...listNodes(r.cards));
  } catch (e) { if (e.message !== 'token') show(retryBox(renderList)); }
}

// ── 투표 ─────────────────────────────────────────
function starsNode(likes) {
  const n = Math.min(likes || 0, 3);
  return el('div', { class: 'stars', role: 'img', 'aria-label': `좋아요 ${likes || 0}개` }, '★'.repeat(n) + '☆'.repeat(3 - n));
}

// 플레이어 안쪽이 스크롤되지 않아야 손가락 움직임이 바깥 줄로 넘어간다.
function mountEmbed(box, c, autoplay) {
  box.replaceChildren();
  box.classList.remove('wide');
  const e = embedFor({ platform: c.platform, id: String(c.videoId), url: c.url }, { autoplay });
  if (e) box.append(el('iframe', { src: e.src, title: c.line, scrolling: 'no', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: 'allowfullscreen' }));
  // 플레이어는 터치를 가져가므로 위아래에 투명 구역을 얹어 바깥 줄이 넘어가게 한다. 가운데는 재생용으로 비운다.
  box.append(['top', 'bottom', 'left', 'right'].map((s) => el('div', { class: `swipe-zone ${s}` })).reduce((f, n) => { f.append(n); return f; }, document.createDocumentFragment()));
  if (c.platform === 'instagram') box.append(el('a', { class: 'ig-open', href: c.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': '인스타에서 재생' }, el('span', null, '누르면 인스타에서 재생')));
}

// 인스타는 정사각형·가로 영상에 「Instagram에서 더 보기」 흰 줄을 영상 위에 띄우고, 임베드 안쪽은 고칠 수 없다.
// 임베드가 알려 주는 높이로 비율을 알아내, 이런 영상은 첫 화면 사진만 잘라 보여 주고 누르면 인스타로 보낸다.
const IG_CHROME_PX = 208; // 임베드 높이에서 사진을 뺀 값(머리 54 + 아래 154). 여러 게시물·폭에서 실측.
const IG_TALL_RATIO = 1.2; // 세로 영상의 사진 칸은 폭의 5/4다.
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://www.instagram.com') return;
  let d = e.data;
  try { if (typeof d === 'string') d = JSON.parse(d); } catch (x) { return; }
  if (!d || d.type !== 'MEASURE' || !d.details || !d.details.height) return;
  const frame = [...document.querySelectorAll('.frame.ig iframe')].find((f) => f.contentWindow === e.source);
  if (!frame) return;
  // 폭을 바꾸면 늦게 온 높이와 어긋나므로, 임베드 폭은 그대로 두고 배율로만 화면 폭에 맞춘다.
  const photo = d.details.height - IG_CHROME_PX;
  const wide = photo / frame.offsetWidth < IG_TALL_RATIO;
  const box = frame.parentNode;
  box.classList.toggle('wide', wide);
  if (!wide) return;
  box.style.setProperty('--ig-photo', `${photo}px`);
  box.style.setProperty('--ig-scale', (box.clientWidth / frame.offsetWidth).toFixed(4));
});

async function renderVote(id) {
  show(el('div', { class: 'empty' }, '불러오는 중입니다.'));
  let cards;
  let first;
  try {
    const r = await api('list');
    if (!r.ok) { show(retryBox(() => renderVote(id))); return; }
    cards = r.cards;
    first = cards.find((c) => c.id === id);
    if (!first) {
      const one = await api('item', { id });
      if (!one.ok) { show(retryBox(() => renderVote(id))); return; }
      first = one.card;
    }
  } catch (e) { if (e.message !== 'token') show(retryBox(() => renderVote(id))); return; }
  if (isMade(first.word)) { location.replace(`#/result/${id}`); return; }

  // 연 영상을 맨 앞에 두고, 내 표가 필요한 영상을 잇는다.
  const items = [first, ...cards.filter((c) => c.word === '투표' && c.id !== id)];
  const slides = items.map((card) => {
    const box = el('div', { class: `frame${card.platform === 'instagram' ? ' ig' : ''}` });
    return { card, box, node: el('div', { class: 'slide' }, box) };
  });
  const feed = el('div', { class: 'feed' }, slides.map((x) => x.node));
  const mineEl = el('span', { class: 'count' });
  const titleEl = el('div', { class: 't' });
  const platformEl = el('span');
  const original = el('a', { target: '_blank', rel: 'noopener noreferrer' }, '원본 영상 보기');
  const below = el('div', { class: 'below' }, titleEl, el('div', { class: 'sub' }, platformEl, original));
  const bottomHolder = el('div');
  let cur = -1;
  let busy = false;

  const drawMine = (c) => { mineEl.textContent = c.myVote ? `내 표: ${c.myVote === 'like' ? '좋아요' : '아니에요'}` : ''; };

  const drawActs = () => {
    const c = slides[cur].card;
    if (c.word !== '투표') {
      const text = c.myVote ? `내 표: ${c.myVote === 'like' ? '좋아요' : '아니에요'}. 표는 한 번만 넣을 수 있습니다.` : '투표가 끝난 영상입니다.';
      bottomHolder.replaceChildren(el('div', { class: 'done-msg' }, starsNode(c.likes), el('p', { role: 'status' }, text)));
      return;
    }
    const bar = el('div', { class: 'acts' },
      el('button', { class: 'no', on: { click: () => vote('no') } }, '아니에요'),
      el('button', { class: 'yes', on: { click: () => vote('like') } }, '좋아요'));
    bottomHolder.replaceChildren(bar);
  };

  const setCurrent = (i) => {
    if (i === cur || i < 0) return;
    const prev = cur;
    cur = i;
    const c = slides[i].card;
    slides.forEach((x, j) => {
      x.node.classList.toggle('current', j === i);
      // 지금 영상은 자동 재생으로 다시 불러온다. 자동 재생이 없는 인스타만 다음 영상을 미리 불러 둔다.
      const preload = j === i + 1 && x.card.platform === 'instagram';
      const frame = x.box.querySelector('iframe');
      if (j === i) {
        const want = embedFor({ platform: x.card.platform, id: String(x.card.videoId), url: x.card.url }, { autoplay: true });
        if (!frame || !want || frame.getAttribute('src') !== want.src) mountEmbed(x.box, x.card, true);
      } else if (preload) {
        // 방금까지 보던 영상이면 다시 불러 소리를 멈춘다.
        if (!frame || j === prev) mountEmbed(x.box, x.card, false);
      } else if (x.box.firstChild) {
        x.box.replaceChildren(); // 지나간 영상의 소리를 멈춘다.
      }
    });
    titleEl.textContent = c.line;
    platformEl.textContent = PLATFORM_NAME[c.platform] || '';
    original.href = c.url;
    drawMine(c);
    history.replaceState(null, '', `#/vote/${c.id}`);
    if (!busy) drawActs();
  };

  const vote = async (value) => {
    if (busy) return;
    busy = true;
    const at = cur;
    const s0 = slides[at];
    // 누르자마자 반응한다. 서버 응답을 기다리지 않는다.
    bottomHolder.querySelectorAll('button').forEach((b) => {
      b.disabled = true;
      const picked = b.classList.contains(value === 'like' ? 'yes' : 'no');
      b.classList.add(picked ? 'picked' : 'dim');
    });
    if (navigator.vibrate) navigator.vibrate(12);
    try {
      const v = await api('vote', { id: s0.card.id, value });
      if (!v.ok) {
        if (v.error === 'closed') { location.replace(`#/result/${s0.card.id}`); return; }
        if (v.error === 'ended' && v.card) { // 다른 기기나 창에서 이미 넣은 표. 서버 값을 그대로 보여 준다.
          s0.card = v.card;
          busy = false;
          drawMine(v.card);
          drawActs();
          return;
        }
        throw new Error('vote');
      }
      const word = v.justProduced ? '제작' : v.card.word;
      s0.card = { ...s0.card, myVote: value, word };
      s0.box.replaceChildren(el('span', { class: `stamp hit w-${word}` }, word));
      const text = v.justProduced ? '내 표로 3개가 찼습니다. 제작으로 넘어갑니다.'
        : v.card.likes === 2 ? '별 하나만 더 받으면 제작입니다.' : '내 표를 넣었습니다.';
      bottomHolder.replaceChildren(el('div', { class: 'done-msg' }, starsNode(v.card.likes), el('p', { role: 'status' }, text)));
      if (v.justProduced) { setTimeout(() => go(`#/result/${s0.card.id}`), 1600); return; }
      setTimeout(() => {
        busy = false;
        const next = slides.findIndex((x, j) => j > at && x.card.word === '투표');
        if (next < 0) { go('#/list'); return; }
        setCurrent(next); // 스크롤 전에 바꿔야 도중에 누른 표가 다음 영상에 들어간다.
        slides[next].node.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }, NEXT_DELAY_MS);
    } catch (e) {
      if (e.message === 'token') return;
      busy = false;
      drawActs();
      below.append(el('span', { role: 'alert' }, '표를 넣지 못했습니다. 다시 눌러 주세요.'));
    }
  };

  show(el('section', { class: 'vote' },
    feed,
    el('div', { class: 'over' },
      el('header', { class: 'top' }, el('nav', { class: 'navs' }, el('a', { href: '#/list' }, '‹ 목록'), el('a', { href: '#/' }, '처음으로')), mineEl),
      el('div', { class: 'over-low' }, below, bottomHolder))));

  const seen = new IntersectionObserver((list) => {
    list.forEach((en) => { if (en.isIntersecting) setCurrent(slides.findIndex((x) => x.node === en.target)); });
  }, { root: feed, threshold: 0.6 });
  slides.forEach((x) => seen.observe(x.node));
  setCurrent(0);
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
  if (!isMade(c.word)) { location.replace(`#/vote/${id}`); return; }
  drawMade(id, c, r.result);
}

const MAKE_ERRORS = {
  role: '제작은 산하, 민우만 맡을 수 있습니다.',
  idea: '제이제이 버전을 80자 안의 한 줄로 써 주세요.',
  notproduced: '아직 제작으로 넘어가지 않은 영상입니다.'
};
const PUBLISH_ERRORS = {
  role: '발행 링크는 국현, 산하, 민우만 넣을 수 있습니다.',
  nomaker: '맡은 사람이 있어야 발행할 수 있습니다.',
  link: '인스타그램 또는 유튜브 게시물 링크를 넣어 주세요.',
  same: '레퍼런스 원본 링크입니다. 우리가 게시한 영상 링크를 넣어 주세요.',
  notproduced: '아직 제작으로 넘어가지 않은 영상입니다.'
};

// 입력 하나와 버튼 하나. submit이 실패 문구를 돌려주면 그 자리에 보여 준다.
function oneField({ label, help, value, button, inputmode, submit }) {
  const input = el('input', { value: value || '', autocomplete: 'off', inputmode });
  const err = el('p', { class: 'err', role: 'alert' });
  const btn = el('button', { type: 'submit', class: 'btn y' }, button);
  return el('form', { class: 'make-form', on: { submit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    try {
      const msg = await submit(input.value.trim());
      if (msg) err.textContent = msg;
    } catch (x) {
      if (x.message !== 'token') err.textContent = '저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요.';
    }
    btn.disabled = false;
  } } }, el('label', null, label, input), help ? el('p', { class: 'help' }, help) : null, err, btn);
}

function drawMade(id, c, res, notice) {
  const me = store.get('jj_name');
  const redraw = (card, msg) => drawMade(id, card, res, msg);
  const head = [el('header', { class: 'top' }, el('nav', { class: 'navs' }, el('a', { href: '#/list' }, '‹ 목록'), el('a', { href: '#/' }, '처음으로')), el('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, '원본 영상 보기')), ];
  const title = el('h1', { class: 'display' }, c.line);

  const makeSec = el('div', { class: 'sec' }, el('h2', null, '제이제이 버전'),
    c.maker ? el('p', { class: 'maker-line' }, `맡은 사람: ${c.maker}`) : el('p', null, '아직 맡은 사람이 없습니다. 산하, 민우 중 한 분이 맡으면 여기에 나옵니다.'),
    c.idea ? el('p', null, c.idea) : null,
    notice ? el('p', { class: 'err', role: 'alert' }, notice) : null,
    MAKERS.includes(me) && !c.publishedUrl ? oneField({
      label: '제이제이 버전 한 줄',
      help: '무대, 소품, 상황 중 하나 이상을 전주대 요소로 바꿔 주세요.',
      value: c.idea,
      button: !c.maker ? '내가 만들게요' : c.maker === me ? '한 줄 고치기' : '내가 이어받기',
      submit: async (idea) => {
        if (!idea) return '제이제이 버전 한 줄을 써 주세요.';
        const out = await api('make', { id, idea, expect: c.maker || '' });
        if (out.ok) { redraw(out.card); return null; }
        if (out.error === 'changed') {
          const fresh = await api('item', { id });
          if (fresh.ok) { redraw(fresh.card, '방금 다른 분이 맡았습니다. 맡은 사람을 확인해 주세요.'); return null; }
        }
        return MAKE_ERRORS[out.error] || '저장하지 못했습니다. 다시 눌러 주세요.';
      }
    }) : null);

  const pubSec = c.publishedUrl ? el('div', { class: 'sec pub' }, el('h2', null, '발행'),
    el('a', { href: c.publishedUrl, target: '_blank', rel: 'noopener noreferrer' }, '우리 영상 보기'),
    el('span', { class: 'stamp w-발행' }, '발행')) : null;
  const pubForm = PUBLISHERS.includes(me) && c.maker ? el('div', { class: 'sec' }, oneField({
    label: '게시한 영상 링크',
    value: c.publishedUrl,
    inputmode: 'url',
    button: c.publishedUrl ? '링크 고치기' : '발행으로 넘기기',
    submit: async (url) => {
      const out = await api('publish', { id, url });
      if (out.ok) { redraw(out.card); return null; }
      return PUBLISH_ERRORS[out.error] || '저장하지 못했습니다. 다시 눌러 주세요.';
    }
  })) : null;

  let body = null;
  if (res && res.fit === false) {
    body = el('div', { class: 'sec' }, el('h2', null, '이 형식은 안 맞음'), el('p', null, String(res.reason || '')));
  } else if (res) {
    body = [
      res.seenVideo === false ? el('div', { class: 'sec' }, el('p', null, '영상을 직접 보지 않고 한 줄 설명과 공개 정보로 쓴 초안입니다. 영상과 맞는지 확인해 주세요.')) : null,
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
  show(...head, el('section', { class: 'result' }, title, makeSec, pubSec, pubForm, body));
}

// ── 길 찾기 ──────────────────────────────────────
function route() {
  if (!store.get('jj_token')) { renderPick(); return; }
  const h = location.hash || '#/';
  let m;
  if ((m = h.match(/^#\/vote\/([\w-]+)/))) renderVote(m[1]);
  else if ((m = h.match(/^#\/result\/([\w-]+)/))) renderResult(m[1]);
  else if (h === '#/list') renderList();
  else if (h === '#/add') renderAdd();
  else renderHome();
}

document.addEventListener('touchstart', () => {}, { passive: true }); // 아이폰에서 눌림 표시가 나오게 한다.
window.addEventListener('hashchange', route);
route();
