// 제이제이 수퍼스타 만들기 서버. 규칙은 logic.gs, 여기는 시트·메일·권한만 다룬다.
// 스크립트 속성: SECRET, PC_KEY, TOKENS, CODES, MAILS, OWNER, APP_URL, MAIL_TEST, LOGIN_FAILS
// 토큰·코드·메일 주소는 시트와 로그에 쓰지 않는다.

const TABS_ = {
  items: ['id', 'url', 'platform', 'videoId', 'line', 'account', 'title', 'thumbUrl', 'createdAt', 'produced', 'analysis', 'tries'],
  votes: ['id', 'voter', 'value', 'at'],
  results: ['id', 'json', 'at'],
  thumbs: ['id', 'b64', 'at'],
  mailLog: ['key', 'type', 'at']
};
const TAB_NAMES_ = { items: '레퍼런스', votes: '투표', results: '결과', thumbs: '첫화면', mailLog: '메일기록' };
const MAX_LOGIN_FAILS_ = 5;
const LOGIN_LOCK_MS_ = 15 * 60 * 1000;
const MAX_TRIES_ = 3;

function props_() { return PropertiesService.getScriptProperties(); }
function jsonProp_(key) { return JSON.parse(props_().getProperty(key) || '{}'); }
function has_(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

function tab_(key) {
  const ss = SpreadsheetApp.getActive();
  const name = TAB_NAMES_[key];
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, TABS_[key].length).setValues([TABS_[key]]);
    s.setFrozenRows(1);
  }
  return s;
}

function rows_(key) {
  const s = tab_(key);
  const n = s.getLastRow();
  if (n < 2) return [];
  const heads = TABS_[key];
  return s.getRange(2, 1, n - 1, heads.length).getValues().map((r, i) => {
    const o = { _row: i + 2 };
    heads.forEach((h, j) => { o[h] = r[j]; });
    return o;
  });
}

function append_(key, obj) {
  tab_(key).appendRow(TABS_[key].map((h) => (obj[h] === undefined ? '' : obj[h])));
}

function setCell_(key, row, field, value) {
  tab_(key).getRange(row, TABS_[key].indexOf(field) + 1).setValue(value);
}

function voterHash_(token) {
  const sig = Utilities.computeHmacSha256Signature(token, props_().getProperty('SECRET'));
  return Utilities.base64EncodeWebSafe(sig);
}

function tokenOk_(token) {
  return typeof token === 'string' && has_(jsonProp_('TOKENS'), token);
}

function pcOk_(key) {
  const want = props_().getProperty('PC_KEY');
  return !!want && key === want;
}

// ── 메일 ─────────────────────────────────────────────
function sendAll_(subject, bodyFor) {
  const mails = jsonProp_('MAILS');
  const tokens = jsonProp_('TOKENS');
  const app = props_().getProperty('APP_URL') || '';
  const owner = props_().getProperty('OWNER');
  const testOnly = props_().getProperty('MAIL_TEST') === '1';
  Object.keys(tokens).forEach((token) => {
    const to = mails[tokens[token]];
    if (!to) return;
    if (testOnly && to !== owner) return;
    MailApp.sendEmail({ to, subject, body: bodyFor(`${app}?t=${token}`), name: '제이제이 수퍼스타 만들기' });
  });
}

function sendOnce_(key, type, send) {
  if (rows_('mailLog').some((m) => m.key === key)) return;
  append_('mailLog', { key, type, at: Date.now() });
  send();
}

// ── 화면용 ───────────────────────────────────────────
function viewFor_(item, votes, voter) {
  const mine = votes.filter((v) => v.id === item.id);
  const t = tally(mine);
  let my = null;
  mine.forEach((v) => { if (v.voter === voter) my = v.value; });
  return publicView({
    id: item.id, url: item.url, platform: item.platform, videoId: item.videoId, line: item.line,
    account: item.account, title: item.title, thumbUrl: item.thumbUrl, createdAt: item.createdAt,
    analysis: item.analysis
  }, t, my, !!item.produced);
}

function fetchMeta_(link) {
  const api = link.platform === 'youtube' ? 'https://www.youtube.com/oembed?format=json&url='
    : link.platform === 'tiktok' ? 'https://www.tiktok.com/oembed?url=' : '';
  if (!api) return {};
  try {
    const r = UrlFetchApp.fetch(api + encodeURIComponent(link.url), { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return {};
    const j = JSON.parse(r.getContentText());
    return { account: j.author_name || '', title: j.title || '', thumbUrl: j.thumbnail_url || '' };
  } catch (e) {
    return {};
  }
}

function resolveShort_(link) {
  try {
    const r = UrlFetchApp.fetch(link.url, { followRedirects: false, muteHttpExceptions: true });
    const loc = r.getAllHeaders().Location || r.getAllHeaders().location;
    return loc ? parseLink(String(loc)) : null;
  } catch (e) {
    return null;
  }
}

// ── 동작 ─────────────────────────────────────────────
function aLogin_(b) {
  const now = Date.now();
  const fails = jsonProp_('LOGIN_FAILS');
  if (fails.until && now < fails.until) return { ok: false, error: 'locked' };
  const codes = jsonProp_('CODES');
  const code = String(b.code || '').trim();
  if (code && has_(codes, code)) {
    props_().deleteProperty('LOGIN_FAILS');
    return { ok: true, token: codes[code] };
  }
  const count = (fails.count || 0) + 1;
  props_().setProperty('LOGIN_FAILS', JSON.stringify(count >= MAX_LOGIN_FAILS_ ? { until: now + LOGIN_LOCK_MS_ } : { count }));
  return { ok: false, error: 'badcode' };
}

function aList_(b) {
  const voter = voterHash_(b.token);
  const votes = rows_('votes');
  const cards = rows_('items').map((i) => viewFor_(i, votes, voter));
  return { ok: true, cards: sortCards(cards), todo: cards.filter((c) => c.word === '투표').length };
}

function aAdd_(b) {
  const line = cleanLine(b.line);
  if (!line) return { ok: false, error: 'line' };
  let link = parseLink(b.url);
  if (link && link.needsResolve) link = resolveShort_(link);
  if (!link) return { ok: false, error: 'link' };
  const dup = rows_('items').find((i) => i.platform === link.platform && String(i.videoId) === String(link.id));
  if (dup) return { ok: true, duplicate: dup.id };
  const meta = fetchMeta_(link);
  const id = Utilities.getUuid().slice(0, 8);
  append_('items', {
    id, url: link.url, platform: link.platform, videoId: link.id, line: safeCell(line),
    account: safeCell(meta.account || ''), title: safeCell(meta.title || ''), thumbUrl: meta.thumbUrl || '',
    createdAt: Date.now(), produced: '', analysis: '', tries: 0
  });
  return { ok: true, id };
}

function aVote_(b) {
  if (b.value !== 'like' && b.value !== 'no') return { ok: false, error: 'value' };
  const voter = voterHash_(b.token);
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  if (!canVote(!!item.produced)) return { ok: false, error: 'closed' };
  append_('votes', { id: b.id, voter, value: b.value, at: Date.now() });
  const votes = rows_('votes');
  const t = tally(votes.filter((v) => v.id === b.id));
  const justProduced = shouldProduce(t, false);
  if (justProduced) {
    setCell_('items', item._row, 'produced', Date.now());
    setCell_('items', item._row, 'analysis', '대기');
    item.produced = 1;
    item.analysis = '대기';
  }
  return { ok: true, justProduced, card: viewFor_(item, votes, voter), _item: item };
}

function aItem_(b) {
  const voter = voterHash_(b.token);
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  const card = viewFor_(item, rows_('votes'), voter);
  const out = { ok: true, card };
  const th = rows_('thumbs').find((x) => x.id === b.id);
  if (th) out.thumb = th.b64;
  if (item.produced) {
    const r = rows_('results').find((x) => x.id === b.id);
    if (r) out.result = JSON.parse(r.json);
  }
  return out;
}

function aPcPending_() {
  const items = rows_('items');
  const thumbs = {};
  rows_('thumbs').forEach((x) => { thumbs[x.id] = 1; });
  return {
    ok: true,
    analyze: items.filter((i) => i.produced && i.analysis === '대기')
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
  if (rows_('results').some((r) => r.id === b.id)) return { ok: true, skipped: true };
  const json = JSON.stringify(b.result || {});
  if (json.length > 45000) return { ok: false, error: 'toolarge' };
  append_('results', { id: b.id, json, at: Date.now() });
  setCell_('items', item._row, 'analysis', '완료');
  return { ok: true, _done: item };
}

function aPcFail_(b) {
  const item = rows_('items').find((i) => i.id === b.id);
  if (!item) return { ok: false, error: 'notfound' };
  const tries = Number(item.tries || 0) + 1;
  const final = tries >= MAX_TRIES_;
  setCell_('items', item._row, 'tries', tries);
  setCell_('items', item._row, 'analysis', final ? '실패' : '대기');
  return { ok: true, final, _failed: final ? item : null };
}

// ── 관리(PC 키 필요) ─────────────────────────────────
function aAdminIssue_(b) {
  const member = String(b.member || '');
  if (!member) return { ok: false, error: 'member' };
  const tokens = jsonProp_('TOKENS');
  const codes = jsonProp_('CODES');
  const mails = jsonProp_('MAILS');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const code = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  Object.keys(tokens).forEach((t) => { if (tokens[t] === member) delete tokens[t]; });
  Object.keys(codes).forEach((c) => { if (tokens[codes[c]] === undefined) delete codes[c]; });
  tokens[token] = member;
  codes[code] = token;
  if (b.email) mails[member] = String(b.email);
  props_().setProperties({ TOKENS: JSON.stringify(tokens), CODES: JSON.stringify(codes), MAILS: JSON.stringify(mails) });
  return { ok: true, token, code };
}

function aAdminRemove_(b) {
  const tokens = jsonProp_('TOKENS');
  const codes = jsonProp_('CODES');
  const mails = jsonProp_('MAILS');
  Object.keys(tokens).forEach((t) => { if (tokens[t] === b.member) delete tokens[t]; });
  Object.keys(codes).forEach((c) => { if (!has_(tokens, codes[c])) delete codes[c]; });
  delete mails[b.member];
  props_().setProperties({ TOKENS: JSON.stringify(tokens), CODES: JSON.stringify(codes), MAILS: JSON.stringify(mails) });
  return { ok: true };
}

// 개인 링크와 코드를 본인 메일로만 보낸다. 응답·로그에 남기지 않는다.
function aAdminMailLink_(b) {
  const issued = aAdminIssue_(b);
  if (!issued.ok) return issued;
  const to = jsonProp_('MAILS')[b.member];
  if (!to) return { ok: false, error: 'mail' };
  const app = props_().getProperty('APP_URL') || '';
  MailApp.sendEmail({
    to, subject: '[제이제이] 수퍼스타 만들기 내 링크', name: '제이제이 수퍼스타 만들기',
    body: `내 전용 링크: ${app}?t=${issued.token}
내 코드: ${issued.code}

이 링크를 다른 사람에게 보내지 말아 주세요. 단톡방 링크로 들어갔을 때 코드를 묻으면 위 코드를 넣어 주세요.`
  });
  return { ok: true };
}

function aAdminSet_(b) {
  const allowed = ['APP_URL', 'MAIL_TEST'];
  if (allowed.indexOf(b.key) < 0) return { ok: false, error: 'key' };
  props_().setProperty(b.key, String(b.value));
  return { ok: true };
}

function aAdminStatus_() {
  return { ok: true, members: Object.keys(jsonProp_('TOKENS')).length, mails: rows_('mailLog').length, votes: rows_('votes').length, items: rows_('items').length, mailQuota: MailApp.getRemainingDailyQuota() };
}

function aAdminClear_(b) {
  if (b.confirm !== '시험 데이터 지우기') return { ok: false, error: 'confirm' };
  Object.keys(TABS_).forEach((k) => {
    const s = tab_(k);
    if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
  });
  props_().deleteProperty('LOGIN_FAILS');
  return { ok: true };
}

// 비어 있을 때 한 번만 비밀 값을 만든다.
function aBootstrap_() {
  if (props_().getProperty('SECRET')) return { ok: false, error: 'done' };
  const pcKey = Utilities.getUuid() + Utilities.getUuid();
  props_().setProperties({
    SECRET: Utilities.getUuid() + Utilities.getUuid(), PC_KEY: pcKey,
    TOKENS: '{}', CODES: '{}', MAILS: '{}', MAIL_TEST: '1',
    OWNER: Session.getEffectiveUser().getEmail()
  });
  Object.keys(TABS_).forEach(tab_);
  return { ok: true, pcKey };
}

const USER_ACTIONS_ = { list: aList_, add: aAdd_, vote: aVote_, item: aItem_ };
const PC_ACTIONS_ = {
  pcPending: aPcPending_, pcThumb: aPcThumb_, pcResult: aPcResult_, pcFail: aPcFail_,
  adminIssue: aAdminIssue_, adminMailLink: aAdminMailLink_, adminRemove: aAdminRemove_, adminSet: aAdminSet_, adminStatus: aAdminStatus_, adminClear: aAdminClear_
};
const NO_LOCK_ = { list: 1, item: 1, pcPending: 1, adminStatus: 1 };

function dispatch_(b) {
  const a = b.action;
  if (a === 'bootstrap') return aBootstrap_();
  if (a === 'login') return aLogin_(b);
  if (has_(USER_ACTIONS_, a)) return tokenOk_(b.token) ? USER_ACTIONS_[a](b) : { ok: false, error: 'token' };
  if (has_(PC_ACTIONS_, a)) return pcOk_(b.pcKey) ? PC_ACTIONS_[a](b) : { ok: false, error: 'key' };
  return { ok: false, error: 'action' };
}

// 메일은 잠금을 푼 뒤 보낸다. 기록은 sendOnce_가 맡아 한 번만 나간다.
function afterCommit_(out) {
  if (out.justProduced && out._item) {
    const it = out._item;
    sendOnce_(`produced:${it.id}`, 'produced', () => sendAll_(`[제이제이] 제작 결정: ${it.line}`,
      (link) => `좋아요 3개를 받아 제작으로 넘어갑니다.\n\n${it.line}\n${it.url}\n\n앱 열기: ${link}\n\nClaude 분석이 끝나면 다시 알려 드립니다.`));
  }
  if (out._done) {
    const it = out._done;
    sendOnce_(`done:${it.id}`, 'done', () => sendAll_(`[제이제이] 분석 완료: ${it.line}`,
      (link) => `분석과 프롬프트가 나왔습니다.\n\n${it.line}\n\n앱 열기: ${link}`));
  }
  if (out._failed) {
    const it = out._failed;
    const owner = props_().getProperty('OWNER');
    sendOnce_(`failed:${it.id}`, 'failed', () => MailApp.sendEmail({
      to: owner, subject: `[제이제이] 분석 실패: ${it.line}`,
      body: `분석을 ${MAX_TRIES_}번 시도했지만 실패했습니다.\n\n${it.line}\n${it.url}`, name: '제이제이 수퍼스타 만들기'
    }));
  }
  ['_item', '_done', '_failed'].forEach((k) => delete out[k]);
  return out;
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return reply_({ ok: false, error: 'json' }); }
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
    // 메일 기록을 동시에 쓰지 않게 잠근다.
    if (out.justProduced || out._done || out._failed) {
      const mailLock = LockService.getScriptLock();
      mailLock.waitLock(20000);
      try { afterCommit_(out); } finally { mailLock.releaseLock(); }
    }
  } catch (err) {
    console.error(String(err && err.message));
    ['_item', '_done', '_failed'].forEach((k) => delete out[k]);
  }
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
