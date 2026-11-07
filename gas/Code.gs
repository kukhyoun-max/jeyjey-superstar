// 제이제이 수퍼스타 만들기 서버. 규칙은 logic.gs, 여기는 시트·메일·권한만 다룬다.
// 방식(2026-11-06 담당자 결정): 공용 링크 + 처음 열 때 이름 고르기. 링크가 있으면 누구나 들어올 수 있다.
// 스크립트 속성: SECRET, PC_KEY, OWNER, APP_URL. 투표 기록에는 이름 대신 영상별 해시만 남긴다.

const TEAM_ = ['국현', '하영', '산하', '민우', '실장님'];
const TABS_ = {
  items: ['id', 'url', 'platform', 'videoId', 'line', 'account', 'title', 'thumbUrl', 'createdAt', 'produced', 'analysis', 'tries', 'retryAt', 'maker', 'idea', 'publishedUrl', 'publishedAt'],
  votes: ['id', 'voter', 'value', 'at'],
  results: ['id', 'json', 'at'],
  thumbs: ['id', 'b64', 'at'],
  mailLog: ['key', 'type', 'at']
};
// 숫자·날짜로 자동 변환되면 안 되는 열.
const TEXT_COLS_ = {
  items: ['id', 'url', 'platform', 'videoId', 'line', 'account', 'title', 'thumbUrl', 'analysis', 'maker', 'idea', 'publishedUrl'],
  votes: ['id', 'voter', 'value'],
  results: ['id', 'json'],
  thumbs: ['id', 'b64'],
  mailLog: ['key', 'type']
};
const TAB_NAMES_ = { items: '레퍼런스', votes: '투표', results: '결과', thumbs: '첫화면', mailLog: '메일기록' };
const MAX_TRIES_ = 3;
const RETRY_MS_ = 60 * 60 * 1000;

function props_() { return PropertiesService.getScriptProperties(); }
function has_(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

function applyText_(key, s) {
  TEXT_COLS_[key].forEach((h) => {
    s.getRange(1, TABS_[key].indexOf(h) + 1, s.getMaxRows(), 1).setNumberFormat('@');
  });
}

const upgraded_ = {};

function tab_(key) {
  const ss = SpreadsheetApp.getActive();
  const name = TAB_NAMES_[key];
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, TABS_[key].length).setValues([TABS_[key]]);
    s.setFrozenRows(1);
    applyText_(key, s);
  } else if (!upgraded_[key]) {
    // 새 열이 생기기 전에 만든 시트는 머리글을 채운다. 기존 줄은 그대로 둔다.
    if (s.getLastColumn() < TABS_[key].length) {
      s.getRange(1, 1, 1, TABS_[key].length).setValues([TABS_[key]]);
      applyText_(key, s);
    }
    upgraded_[key] = true;
  }
  return s;
}

function rows_(key) {
  const s = tab_(key);
  const n = s.getLastRow();
  if (n < 2) return [];
  const heads = TABS_[key];
  const text = TEXT_COLS_[key];
  return s.getRange(2, 1, n - 1, heads.length).getValues().map((r, i) => {
    const o = { _row: i + 2 };
    heads.forEach((h, j) => {
      o[h] = text.indexOf(h) >= 0 ? String(r[j]).replace(/^'(?=[=+\-@])/, '') : r[j];
    });
    return o;
  });
}

function append_(key, obj) {
  tab_(key).appendRow(TABS_[key].map((h) => (obj[h] === undefined ? '' : obj[h])));
}

function setCell_(key, row, field, value) {
  tab_(key).getRange(row, TABS_[key].indexOf(field) + 1).setValue(value);
}

function hmac_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, props_().getProperty('SECRET')));
}

function tokenFor_(member) { return hmac_(`token:${member}`); }
function memberOf_(token) {
  if (typeof token !== 'string' || !token) return null;
  return TEAM_.find((m) => tokenFor_(m) === token) || null;
}
// 영상마다 달라서 시트를 봐도 같은 사람의 표를 묶을 수 없다.
function voterHash_(token, id) { return hmac_(`vote:${memberOf_(token)}:${id}`); }

function pcOk_(key) {
  const want = props_().getProperty('PC_KEY');
  return !!want && key === want;
}

// ── 메일(담당자에게만) ───────────────────────────────
// 담당자 결정(2026-11-06): 알림 메일을 보내지 않는다. 다시 켜려면 true로 바꾼다.
const MAIL_ON_ = false;

function sendOwner_(subject, body) {
  if (!MAIL_ON_) return;
  MailApp.sendEmail({ to: props_().getProperty('OWNER'), subject, body: `${body}\n\n앱 열기: ${props_().getProperty('APP_URL') || ''}`, name: '제이제이 수퍼스타 만들기' });
}

function sendOnce_(key, type, send) {
  if (rows_('mailLog').some((m) => m.key === key)) return;
  append_('mailLog', { key, type, at: Date.now() });
  send();
}

// ── 화면용 ───────────────────────────────────────────
function viewFor_(item, votes, token) {
  const voter = voterHash_(token, item.id);
  const mine = votes.filter((v) => v.id === item.id);
  const t = tally(mine);
  let my = null;
  mine.forEach((v) => { if (v.voter === voter) my = v.value; });
  return publicView({
    id: item.id, url: item.url, platform: item.platform, videoId: item.videoId, line: item.line,
    account: item.account, title: item.title, thumbUrl: item.thumbUrl, createdAt: item.createdAt,
    analysis: item.analysis, maker: item.maker, idea: item.idea, publishedUrl: item.publishedUrl
  }, t, my, !!item.produced, !!item.publishedUrl);
}

function fetchMeta_(link) {
  if (link.platform !== 'youtube') return {}; // 인스타는 공식 oEmbed에 토큰이 필요하다.
  const api = 'https://www.youtube.com/oembed?format=json&url=';
  try {
    const r = UrlFetchApp.fetch(api + encodeURIComponent(link.url), { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return {};
    const j = JSON.parse(r.getContentText());
    return { account: j.author_name || '', title: j.title || '', thumbUrl: j.thumbnail_url || '' };
  } catch (e) {
    return {};
  }
}

// ── 동작 ─────────────────────────────────────────────
function aPick_(b) {
  if (TEAM_.indexOf(b.name) < 0) return { ok: false, error: 'name' };
  return { ok: true, token: tokenFor_(b.name), name: b.name };
}

function aList_(b) {
  const votes = rows_('votes');
  const cards = rows_('items').map((i) => viewFor_(i, votes, b.token));
  return { ok: true, cards: sortCards(cards), todo: cards.filter((c) => c.word === '투표').length };
}

function aAdd_(b) {
  const line = cleanLine(b.line);
  if (!line) return { ok: false, error: 'line' };
  const link = parseLink(b.url);
  if (!link) return { ok: false, error: 'link' };
  const dup = rows_('items').find((i) => i.platform === link.platform && i.videoId === String(link.id));
  if (dup) return { ok: true, duplicate: dup.id };
  const meta = fetchMeta_(link);
  const id = `r${Utilities.getUuid().slice(0, 8)}`;
  append_('items', {
    id, url: link.url, platform: link.platform, videoId: String(link.id), line: safeCell(line),
    account: safeCell(String(meta.account || '').trim()), title: safeCell(String(meta.title || '').trim()), thumbUrl: meta.thumbUrl || '',
    createdAt: Date.now(), produced: '', analysis: '', tries: 0
  });
  return { ok: true, id };
}

function aVote_(b) {
  if (b.value !== 'like' && b.value !== 'no') return { ok: false, error: 'value' };
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  if (!canVote(!!item.produced)) return { ok: false, error: 'closed' };
  const voter = voterHash_(b.token, b.id);
  const before = rows_('votes');
  const mine = before.filter((v) => v.id === b.id);
  if (voteEnded(tally(mine), mine.some((v) => v.voter === voter))) {
    return { ok: false, error: 'ended', card: viewFor_(item, before, b.token) };
  }
  append_('votes', { id: b.id, voter, value: b.value, at: Date.now() });
  SpreadsheetApp.flush();
  const votes = rows_('votes');
  const t = tally(votes.filter((v) => v.id === b.id));
  const justProduced = shouldProduce(t, false);
  if (justProduced) {
    setCell_('items', item._row, 'produced', Date.now());
    setCell_('items', item._row, 'analysis', '대기');
    item.produced = 1;
    item.analysis = '대기';
  }
  return { ok: true, justProduced, card: viewFor_(item, votes, b.token), _item: justProduced ? item : undefined };
}

function aItem_(b) {
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  const out = { ok: true, card: viewFor_(item, rows_('votes'), b.token) };
  const th = rows_('thumbs').find((x) => x.id === b.id);
  if (th) out.thumb = th.b64;
  if (item.produced) {
    const r = rows_('results').find((x) => x.id === b.id);
    if (r) out.result = JSON.parse(r.json);
  }
  return out;
}

function aMake_(b) {
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  const c = checkMake({ member: memberOf_(b.token), produced: !!item.produced, maker: item.maker, expect: b.expect, idea: b.idea });
  if (c.error) return { ok: false, error: c.error };
  setCell_('items', item._row, 'maker', c.maker);
  setCell_('items', item._row, 'idea', safeCell(c.idea));
  item.maker = c.maker;
  item.idea = c.idea;
  return { ok: true, card: viewFor_(item, rows_('votes'), b.token) };
}

function aPublish_(b) {
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  const c = checkPublish({ member: memberOf_(b.token), produced: !!item.produced, maker: item.maker, url: b.url, refPlatform: item.platform, refId: item.videoId });
  if (c.error) return { ok: false, error: c.error };
  setCell_('items', item._row, 'publishedUrl', c.url);
  setCell_('items', item._row, 'publishedAt', Date.now());
  item.publishedUrl = c.url;
  return { ok: true, card: viewFor_(item, rows_('votes'), b.token) };
}

function aPcPending_() {
  const items = rows_('items');
  const thumbs = {};
  rows_('thumbs').forEach((x) => { thumbs[x.id] = 1; });
  const now = Date.now();
  return {
    ok: true,
    analyze: items.filter((i) => i.produced && i.analysis === '대기' && Number(i.retryAt || 0) <= now)
      .map((i) => ({ id: i.id, url: i.url, platform: i.platform, line: i.line, account: i.account, title: i.title, tries: i.tries })),
    thumbs: items.filter((i) => !i.thumbUrl && !thumbs[i.id]).map((i) => ({ id: i.id, url: i.url, platform: i.platform }))
  };
}

function aPcThumb_(b) {
  if (!rows_('items').some((i) => i.id === b.id)) return { ok: false, error: 'notfound' };
  if (rows_('thumbs').some((x) => x.id === b.id)) return { ok: true, skipped: true };
  if (String(b.b64 || '').length > 45000) return { ok: false, error: 'toolarge' };
  append_('thumbs', { id: b.id, b64: b.b64, at: Date.now() });
  return { ok: true };
}

function aPcResult_(b) {
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  if (rows_('results').some((r) => r.id === b.id)) {
    // 저장과 상태 변경 사이에 중단됐어도 다시 분석하지 않게 맞춘다.
    if (item.analysis !== '완료') setCell_('items', item._row, 'analysis', '완료');
    return { ok: true, skipped: true };
  }
  const json = JSON.stringify(b.result || {});
  if (json.length > 45000) return { ok: false, error: 'toolarge' };
  append_('results', { id: b.id, json, at: Date.now() });
  setCell_('items', item._row, 'analysis', '완료');
  return { ok: true, _done: Object.assign({}, item, { fit: (b.result || {}).fit }) };
}

// 일시 장애로 바로 끝나지 않게 시도 사이를 1시간 둔다. final이면 바로 끝낸다(삭제된 영상 등).
function aPcFail_(b) {
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  if (item.analysis !== '대기') return { ok: true, skipped: true };
  const tries = Number(item.tries || 0) + 1;
  const final = !!b.final || tries >= MAX_TRIES_;
  setCell_('items', item._row, 'tries', tries);
  setCell_('items', item._row, 'analysis', final ? '실패' : '대기');
  setCell_('items', item._row, 'retryAt', final ? '' : Date.now() + RETRY_MS_);
  return { ok: true, final, _failed: final ? item : null };
}

// ── 관리(PC 키 필요) ─────────────────────────────────
function aAdminRetry_(b) {
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  if (rows_('results').some((r) => r.id === b.id)) return { ok: false, error: 'done' };
  setCell_('items', item._row, 'analysis', '대기');
  setCell_('items', item._row, 'tries', 0);
  setCell_('items', item._row, 'retryAt', '');
  return { ok: true };
}

function aAdminSet_(b) {
  if (b.key !== 'APP_URL') return { ok: false, error: 'key' };
  props_().setProperty(b.key, String(b.value));
  return { ok: true };
}

function aAdminStatus_() {
  return { ok: true, members: TEAM_.length, mails: rows_('mailLog').length, votes: rows_('votes').length, items: rows_('items').length, mailQuota: MailApp.getRemainingDailyQuota() };
}

function aAdminClear_(b) {
  if (b.confirm !== '시험 데이터 지우기') return { ok: false, error: 'confirm' };
  Object.keys(TABS_).forEach((k) => {
    const s = tab_(k);
    if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
    s.getRange(1, 1, 1, TABS_[k].length).setValues([TABS_[k]]);
    applyText_(k, s);
  });
  ['TOKENS', 'CODES', 'MAILS', 'MAIL_TEST', 'LOGIN_FAILS'].forEach((k) => props_().deleteProperty(k));
  return { ok: true };
}

// 비어 있을 때 한 번만 비밀 값을 만든다.
function aBootstrap_() {
  if (props_().getProperty('SECRET')) return { ok: false, error: 'done' };
  const pcKey = Utilities.getUuid() + Utilities.getUuid();
  props_().setProperties({ SECRET: Utilities.getUuid() + Utilities.getUuid(), PC_KEY: pcKey, OWNER: Session.getEffectiveUser().getEmail() });
  Object.keys(TABS_).forEach(tab_);
  return { ok: true, pcKey };
}

const USER_ACTIONS_ = { list: aList_, add: aAdd_, vote: aVote_, item: aItem_, make: aMake_, publish: aPublish_ };
const PC_ACTIONS_ = {
  pcPending: aPcPending_, pcThumb: aPcThumb_, pcResult: aPcResult_, pcFail: aPcFail_,
  adminRetry: aAdminRetry_, adminSet: aAdminSet_, adminStatus: aAdminStatus_, adminClear: aAdminClear_
};
const NO_LOCK_ = { pick: 1, bootstrap: 1, list: 1, item: 1, pcPending: 1, adminStatus: 1 };

// 잠금을 잡기 전에 권한을 본다. 잘못된 요청이 진짜 투표를 기다리게 하지 않는다.
function allowed_(b) {
  if (has_(USER_ACTIONS_, b.action)) return memberOf_(b.token) ? null : 'token';
  if (has_(PC_ACTIONS_, b.action)) return pcOk_(b.pcKey) ? null : 'key';
  return b.action === 'bootstrap' || b.action === 'pick' ? null : 'action';
}

function dispatch_(b) {
  if (b.action === 'bootstrap') return aBootstrap_();
  if (b.action === 'pick') return aPick_(b);
  return has_(USER_ACTIONS_, b.action) ? USER_ACTIONS_[b.action](b) : PC_ACTIONS_[b.action](b);
}

function afterCommit_(out) {
  if (out.justProduced && out._item) {
    const it = out._item;
    sendOnce_(`produced:${it.id}`, 'produced', () => sendOwner_(`[제이제이] 제작 결정: ${it.line}`, `좋아요 3개를 받아 제작으로 넘어갑니다.\n\n${it.line}\n${it.url}\n\nClaude 분석이 끝나면 다시 알려 드립니다.`));
  }
  if (out._done) {
    const it = out._done;
    const unfit = it.fit === false;
    sendOnce_(`done:${it.id}`, 'done', () => sendOwner_(`[제이제이] ${unfit ? '이 형식은 안 맞음' : '분석 완료'}: ${it.line}`, `${unfit ? '프롬프트 대신 맞지 않는 이유가 나왔습니다.' : '분석과 프롬프트가 나왔습니다.'}\n\n${it.line}`));
  }
  if (out._failed) {
    const it = out._failed;
    sendOnce_(`failed:${it.id}`, 'failed', () => sendOwner_(`[제이제이] 분석 실패: ${it.line}`, `분석하지 못했습니다. 영상이 삭제됐거나 분석 프로그램에 문제가 있을 수 있습니다.\n\n${it.line}\n${it.url}`));
  }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return reply_({ ok: false, error: 'json' }); }
  if (!b || typeof b !== 'object') return reply_({ ok: false, error: 'json' });
  const denied = allowed_(b);
  if (denied) return reply_({ ok: false, error: denied });
  let out;
  const lock = NO_LOCK_[b.action] ? null : LockService.getScriptLock();
  try {
    if (lock) lock.waitLock(20000);
    out = dispatch_(b);
    // 잠금을 풀기 전에 쓰기를 확정한다. 안 하면 다음 요청이 옛 값을 읽어 제작이 두 번 잡힌다.
    if (lock) SpreadsheetApp.flush();
  } catch (err) {
    out = { ok: false, error: 'server' };
    console.error(String(err && err.message));
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (x) { /* 잠금을 못 잡았을 때 */ } }
  }
  try {
    if (out.justProduced || out._done || out._failed) {
      const mailLock = LockService.getScriptLock();
      mailLock.waitLock(20000);
      try { afterCommit_(out); SpreadsheetApp.flush(); } finally { mailLock.releaseLock(); }
    }
  } catch (err) {
    console.error('메일 실패');
  }
  ['_item', '_done', '_failed'].forEach((k) => delete out[k]);
  return reply_(out);
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return reply_({ ok: true, service: 'jeyjey-superstar' });
}

// 편집기에서 한 번 실행해 권한을 허용하는 함수.
function authorize() {
  SpreadsheetApp.getActive().getName();
  MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch('https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dp6kY8-yTCwA', { muteHttpExceptions: true });
  Session.getEffectiveUser().getEmail();
}
