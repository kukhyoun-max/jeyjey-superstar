// 판정 규칙. 시트·메일을 건드리지 않는 순수 함수만 둔다. Node 시험은 logic.gs.cjs로 불러온다.
const GOAL_LIKES = 3;
const GOAL_NOS = 3;

// Apps Script에는 URL 객체가 없어 정규식으로 나눈다.
function splitUrl_(raw) {
  const m = String(raw || '').trim().match(/^https?:\/\/([^\/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!m) return null;
  return { host: m[1].toLowerCase().replace(/^www\./, ''), path: m[2], query: m[3] || '' };
}

function parseLink(raw) {
  const u = splitUrl_(raw);
  if (!u) return null;
  let m;
  if (u.host === 'instagram.com') {
    m = u.path.match(/^(?:\/[\w.]+)?\/(?:reel|reels|p|tv)\/([\w-]+)/);
    return m ? { platform: 'instagram', id: m[1], url: `https://www.instagram.com/reel/${m[1]}/` } : null;
  }
  if (u.host === 'youtu.be' || u.host === 'youtube.com' || u.host === 'm.youtube.com') {
    if (u.host === 'youtu.be') m = u.path.match(/^\/([\w-]+)/);
    else if ((m = u.path.match(/^\/(?:shorts|live|embed)\/([\w-]+)/))) { /* 경로에서 찾음 */ }
    else if (u.path.replace(/\/$/, '') === '/watch') m = u.query.match(/[?&]v=([\w-]+)/);
    return m ? { platform: 'youtube', id: m[1], url: `https://www.youtube.com/watch?v=${m[1]}` } : null;
  }
  return null;
}

// votes는 시간순. 같은 사람은 마지막 표만 센다.
function tally(votes) {
  const last = {};
  (votes || []).forEach((v) => { last[v.voter] = v.value; });
  const vals = Object.keys(last).map((k) => last[k]);
  return { likes: vals.filter((x) => x === 'like').length, nos: vals.filter((x) => x === 'no').length };
}

function itemStatus(t, produced, published) {
  if (published) return '발행';
  if (produced) return '제작';
  if (t.nos >= GOAL_NOS) return '탈락';
  return '진행';
}

function cardWord(status, myVote) {
  if (status === '발행' || status === '제작' || status === '탈락') return status;
  return myVote ? '완료' : '투표';
}

// 담당자 결정(2026-11-07): 제작은 산하·민우. 게시는 담당자 몫이기도 해서 발행 링크는 국현도 넣는다.
const MAKERS_ = ['산하', '민우'];
const PUBLISHERS_ = ['국현', '산하', '민우'];

// expect는 화면을 열 때 본 담당. 그 사이 바뀌었으면 덮어쓰지 않는다.
function checkMake(o) {
  if (MAKERS_.indexOf(o.member) < 0) return { error: 'role' };
  if (!o.produced) return { error: 'notproduced' };
  if (String(o.maker || '') !== String(o.expect || '')) return { error: 'changed' };
  const idea = cleanLine(o.idea);
  return idea ? { maker: o.member, idea } : { error: 'idea' };
}

function checkPublish(o) {
  if (PUBLISHERS_.indexOf(o.member) < 0) return { error: 'role' };
  if (!o.produced) return { error: 'notproduced' };
  if (!o.maker) return { error: 'nomaker' };
  const link = parseLink(o.url);
  if (!link) return { error: 'link' };
  if (link.platform === o.refPlatform && String(link.id) === String(o.refId)) return { error: 'same' };
  return { url: link.url };
}

function canVote(produced) {
  return !produced;
}

function shouldProduce(t, produced) {
  return !produced && t.likes >= GOAL_LIKES;
}

// 내 표가 없고 진행 중이면 표 수를 넣지 않는다.
function publicView(item, t, myVote, produced, published) {
  const status = itemStatus(t, produced, published);
  const view = Object.assign({}, item, { word: cardWord(status, myVote), myVote: myVote || null });
  if (myVote || status !== '진행') {
    view.likes = t.likes;
    view.nos = t.nos;
  }
  return view;
}

function cleanLine(raw) {
  const s = String(raw === null || raw === undefined ? '' : raw).replace(/\s+/g, ' ').trim();
  return s && s.length <= 80 ? s : null;
}

// 사용자가 쓴 글이 시트 수식으로 실행되지 않게 한다.
function safeCell(s) {
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

const CARD_ORDER_ ={ 투표: 0, 완료: 1, 제작: 2, 발행: 3, 탈락: 4 };

function sortCards(cards) {
  return cards.slice().sort((a, b) => (CARD_ORDER_[a.word] - CARD_ORDER_[b.word]) || (b.createdAt - a.createdAt));
}
