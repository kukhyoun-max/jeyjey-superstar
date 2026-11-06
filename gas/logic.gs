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
  if (u.host === 'vt.tiktok.com' || u.host === 'vm.tiktok.com' || (u.host === 'tiktok.com' && /^\/t\//.test(u.path))) {
    return { platform: 'tiktok', id: null, url: String(raw).trim().replace(/[?#].*$/, ''), needsResolve: true };
  }
  if (u.host === 'tiktok.com' || u.host === 'm.tiktok.com') {
    m = u.path.match(/^\/@([\w.-]+)\/video\/(\d+)/);
    return m ? { platform: 'tiktok', id: m[2], url: `https://www.tiktok.com/@${m[1]}/video/${m[2]}` } : null;
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

function itemStatus(t, produced) {
  if (produced) return '제작';
  if (t.nos >= GOAL_NOS) return '탈락';
  return '진행';
}

function cardWord(status, myVote) {
  if (status === '제작' || status === '탈락') return status;
  return myVote ? '완료' : '투표';
}

function canVote(produced) {
  return !produced;
}

function shouldProduce(t, produced) {
  return !produced && t.likes >= GOAL_LIKES;
}

// 내 표가 없고 진행 중이면 표 수를 넣지 않는다.
function publicView(item, t, myVote, produced) {
  const status = itemStatus(t, produced);
  const view = Object.assign({}, item, { word: cardWord(status, myVote), myVote: myVote || null });
  if (myVote || status !== '진행') {
    view.likes = t.likes;
    view.nos = t.nos;
  }
  return view;
}

const CARD_ORDER_ = { 투표: 0, 완료: 1, 제작: 2, 탈락: 3 };

function sortCards(cards) {
  return cards.slice().sort((a, b) => (CARD_ORDER_[a.word] - CARD_ORDER_[b.word]) || (b.createdAt - a.createdAt));
}
