// 서버 코드 시험: 가짜 시트로 Code.gs를 그대로 돌린다. 실제 시트를 건드리지 않는다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function fakeSheet(name, rows = []) {
  const s = {
    name, rows,
    getLastRow: () => s.rows.length,
    getLastColumn: () => Math.max(0, ...s.rows.map((r) => r.length)),
    getMaxRows: () => 1000,
    setFrozenRows() {},
    appendRow(r) { s.rows.push(r.slice()); },
    deleteRows(at, n) { s.rows.splice(at - 1, n); },
    getRange(r, c, nr = 1, nc = 1) {
      const cell = (i, j) => { const v = (s.rows[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; };
      const put = (i, j, v) => { const at = r - 1 + i; while (s.rows.length <= at) s.rows.push([]); s.rows[at][c - 1 + j] = v; };
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(i, j))),
        getValue: () => cell(0, 0),
        setValue: (v) => put(0, 0, v),
        setValues: (vs) => vs.forEach((row, i) => row.forEach((v, j) => put(i, j, v))),
        setNumberFormat() {}
      };
    }
  };
  return s;
}

function server(presetSheets = {}) {
  const sheets = { ...presetSheets };
  const props = { SECRET: 's', PC_KEY: 'pc' };
  const ctx = {
    console,
    SpreadsheetApp: {
      flush() {},
      getActive: () => ({
        getName: () => 'x',
        getSheetByName: (n) => sheets[n] || null,
        insertSheet: (n) => (sheets[n] = fakeSheet(n))
      })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; }, setProperties: (o) => Object.assign(props, o), deleteProperty: (k) => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (t, k) => crypto.createHmac('sha256', k).update(t).digest(),
      base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url')
    },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 404 }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail() { throw new Error('메일을 보내면 안 된다'); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'x' }) },
    ContentService: { MimeType: { JSON: 'j' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) }
  };
  const dir = path.join(__dirname, '..', 'gas');
  vm.runInNewContext(`${fs.readFileSync(path.join(dir, 'logic.gs'), 'utf8')}\n${fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8')}\nthis.doPost=doPost;`, ctx);
  const call = (b) => ctx.doPost({ postData: { contents: JSON.stringify(b) } });
  const token = (name) => call({ action: 'pick', name }).token;
  return { call, token, sheets };
}

function produced(sv) {
  const add = sv.call({ action: 'add', token: sv.token('국현'), url: 'https://www.youtube.com/watch?v=REF', line: '참고 영상' });
  for (const n of ['국현', '하영', '산하']) sv.call({ action: 'vote', token: sv.token(n), id: add.id, value: 'like' });
  return add.id;
}

test('같은 사람의 두 번째 표는 받지 않고 첫 표를 유지한다', () => {
  const sv = server();
  const add = sv.call({ action: 'add', token: sv.token('국현'), url: 'https://www.youtube.com/watch?v=ONE', line: '한 번만' });
  const t = sv.token('하영');
  assert.equal(sv.call({ action: 'vote', token: t, id: add.id, value: 'like' }).ok, true);
  const again = sv.call({ action: 'vote', token: t, id: add.id, value: 'no' });
  assert.equal(again.ok, false);
  assert.equal(again.error, 'ended');
  assert.equal(again.card.myVote, 'like');
  assert.equal(again.card.likes, 1);
  assert.equal(again.card.nos, 0);
  const card = sv.call({ action: 'item', token: t, id: add.id }).card;
  assert.equal(card.myVote, 'like');
  assert.equal(card.nos, 0);
});

test('아니에요 3개면 표를 안 넣은 사람에게도 완료로 보이고 표를 받지 않는다', () => {
  const sv = server();
  const add = sv.call({ action: 'add', token: sv.token('국현'), url: 'https://www.youtube.com/watch?v=TWO', line: '끝난 영상' });
  for (const n of ['국현', '하영', '산하']) sv.call({ action: 'vote', token: sv.token(n), id: add.id, value: 'no' });
  const t = sv.token('민우');
  const list = sv.call({ action: 'list', token: t });
  assert.equal(list.cards.find((c) => c.id === add.id).word, '완료');
  assert.equal(list.todo, 0);
  const v = sv.call({ action: 'vote', token: t, id: add.id, value: 'like' });
  assert.equal(v.error, 'ended');
  assert.equal(v.card.word, '완료');
  assert.equal(v.card.myVote, null);
});

test('좋아요 3개 뒤 산하가 맡고 국현이 발행 링크를 넣으면 카드가 발행이 된다', () => {
  const sv = server();
  const id = produced(sv);
  assert.equal(sv.call({ action: 'item', token: sv.token('하영'), id }).card.word, '제작');

  const made = sv.call({ action: 'make', token: sv.token('산하'), id, idea: '학식 줄에서 달리는 제이제이', expect: '' });
  assert.equal(made.ok, true);
  assert.equal(made.card.maker, '산하');
  assert.equal(made.card.idea, '학식 줄에서 달리는 제이제이');

  const pub = sv.call({ action: 'publish', token: sv.token('국현'), id, url: 'https://www.instagram.com/reel/OURS1/?igsh=x' });
  assert.equal(pub.ok, true);
  assert.equal(pub.card.word, '발행');
  assert.equal(pub.card.publishedUrl, 'https://www.instagram.com/reel/OURS1/');

  const list = sv.call({ action: 'list', token: sv.token('실장님') });
  assert.equal(list.cards[0].word, '발행');
  assert.equal(list.cards[0].maker, '산하');
});

test('권한 없는 사람은 맡거나 발행하지 못한다', () => {
  const sv = server();
  const id = produced(sv);
  assert.equal(sv.call({ action: 'make', token: sv.token('하영'), id, idea: '한 줄', expect: '' }).error, 'role');
  assert.equal(sv.call({ action: 'publish', token: sv.token('산하'), id, url: 'https://www.instagram.com/reel/O/' }).error, 'nomaker');
  sv.call({ action: 'make', token: sv.token('민우'), id, idea: '한 줄', expect: '' });
  assert.equal(sv.call({ action: 'publish', token: sv.token('실장님'), id, url: 'https://www.instagram.com/reel/O/' }).error, 'role');
  assert.equal(sv.call({ action: 'make', id, idea: '한 줄', expect: '' }).error, 'token');
});

test('두 사람이 동시에 맡으면 뒤의 사람은 덮어쓰지 못하고, 이어받기는 된다', () => {
  const sv = server();
  const id = produced(sv);
  sv.call({ action: 'make', token: sv.token('산하'), id, idea: '산하 안', expect: '' });
  assert.equal(sv.call({ action: 'make', token: sv.token('민우'), id, idea: '민우 안', expect: '' }).error, 'changed');
  const taken = sv.call({ action: 'make', token: sv.token('민우'), id, idea: '민우 안', expect: '산하' });
  assert.equal(taken.card.maker, '민우');
  assert.equal(taken.card.idea, '민우 안');
});

test('수식처럼 시작하는 한 줄도 그대로 돌려준다', () => {
  const sv = server();
  const id = produced(sv);
  assert.equal(sv.call({ action: 'make', token: sv.token('산하'), id, idea: '=제이제이 경주', expect: '' }).card.idea, '=제이제이 경주');
});

test('예전 시트(새 열 없음)도 기존 줄을 지키며 새 열을 쓴다', () => {
  const OLD = ['id', 'url', 'platform', 'videoId', 'line', 'account', 'title', 'thumbUrl', 'createdAt', 'produced', 'analysis', 'tries', 'retryAt'];
  const old = ['r1', 'https://www.youtube.com/watch?v=REF', 'youtube', 'REF', '옛 영상', '', '', '', 1, 5, '대기', 0, ''];
  const items = fakeSheet('레퍼런스', [OLD.slice(), old.slice()]);
  const sv = server({ 레퍼런스: items });
  const made = sv.call({ action: 'make', token: sv.token('산하'), id: 'r1', idea: '옛 영상 바꾸기', expect: '' });
  assert.equal(made.ok, true);
  assert.equal(made.card.line, '옛 영상');
  assert.deepEqual(items.rows[1].slice(0, 13), old);
  assert.ok(items.rows[0].includes('maker') && items.rows[0].includes('publishedUrl'));
  assert.equal(items.rows[1][items.rows[0].indexOf('maker')], '산하');
});
