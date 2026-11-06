// 실제 배포 서버 시험. 토큰·키를 출력하지 않는다. 사용: node tests/server.live.cjs <배포ID> <키파일>
const fs = require('fs');
const assert = require('node:assert');
const [, , deployId, keyFile] = process.argv;
const URL_ = `https://script.google.com/macros/s/${deployId}/exec`;

async function call(body) {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body), redirect: 'follow' });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { throw new Error(`JSON 아님 HTTP ${r.status}`); }
}

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('통과', name); } catch (e) { console.log('실패', name, String(e.message).slice(0, 200)); process.exitCode = 1; }
}

(async () => {
  let pcKey = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '';
  if (!pcKey) {
    const b = await call({ action: 'bootstrap' });
    assert.ok(b.ok, `bootstrap ${b.error}`);
    fs.writeFileSync(keyFile, b.pcKey);
    pcKey = b.pcKey;
    console.log('키 저장');
  }
  const pc = (a, x = {}) => call({ action: a, pcKey, ...x });
  await pc('adminClear', { confirm: '시험 데이터 지우기' });

  const names = ['t1', 't2', 't3', 't4', 't5'];
  const tok = {};
  const codes = {};
  for (const m of names) {
    const r = await pc('adminIssue', { member: m, email: m === 't1' ? process.env.OWNER_MAIL : undefined });
    tok[m] = r.token; codes[m] = r.code;
  }
  const u = (m, a, x = {}) => call({ action: a, token: tok[m], ...x });

  const bad = await call({ action: 'list', token: 'nope' });
  ok('잘못된 토큰 거부', () => assert.equal(bad.error, 'token'));
  const noKey = await call({ action: 'pcPending', pcKey: 'nope' });
  ok('잘못된 PC 키 거부', () => assert.equal(noKey.error, 'key'));

  const first = await u('t1', 'list');
  ok('시험 전 목록 비어 있음', () => assert.equal(first.cards.length, 0));
  const emptyLine = await u('t1', 'add', { url: 'https://www.youtube.com/watch?v=p6kY8-yTCwA', line: '   ' });
  ok('한 줄 비면 거부', () => assert.equal(emptyLine.error, 'line'));
  const badLink = await u('t1', 'add', { url: 'https://vimeo.com/1', line: '시험' });
  ok('다른 사이트 거부', () => assert.equal(badLink.error, 'link'));

  const a = await u('t1', 'add', { url: 'https://youtu.be/p6kY8-yTCwA?si=x', line: '=IMPORTXML("http://x","//a")' });
  ok('등록 성공', () => assert.ok(a.id));
  const dup = await u('t2', 'add', { url: 'https://www.youtube.com/shorts/p6kY8-yTCwA', line: '다른 설명' });
  ok('같은 영상 중복 안내', () => assert.equal(dup.duplicate, a.id));

  let t1list = await u('t1', 'list');
  const c0 = t1list.cards.find((c) => c.id === a.id);
  ok('수식이 글자로 저장됨', () => assert.ok(c0.line.includes('IMPORTXML') && c0.line.startsWith('=')));
  ok('유튜브 공식 정보 수집', () => assert.ok(c0.account && c0.thumbUrl));
  ok('투표 전 표 수 숨김', () => { assert.equal(c0.word, '투표'); assert.equal('likes' in c0, false); });
  ok('내 할 일 수', () => assert.equal(t1list.todo, 1));

  const v1 = await u('t1', 'vote', { id: a.id, value: 'like' });
  ok('좋아요 후 완료·표 공개', () => { assert.equal(v1.card.word, '완료'); assert.equal(v1.card.likes, 1); });
  const v1b = await u('t1', 'vote', { id: a.id, value: 'no' });
  ok('표 바꾸기', () => { assert.equal(v1b.card.likes, 0); assert.equal(v1b.card.nos, 1); });
  await u('t1', 'vote', { id: a.id, value: 'like' });

  const t2before = (await u('t2', 'list')).cards.find((c) => c.id === a.id);
  ok('다른 사람에게 표 수 숨김', () => assert.equal('likes' in t2before, false));

  const rs = await Promise.all(['t2', 't3', 't4'].map((m) => u(m, 'vote', { id: a.id, value: 'like' })));
  ok('동시 투표 응답', () => rs.forEach((r) => assert.ok(r.ok || r.error === 'closed', JSON.stringify({ e: r.error }))));
  const jp = rs.filter((r) => r.justProduced).length;
  ok('제작 전환은 한 번', () => assert.equal(jp, 1));
  const closed = await u('t5', 'vote', { id: a.id, value: 'no' });
  ok('제작 후 투표 불가', () => assert.equal(closed.error, 'closed'));
  const st1 = await pc('adminStatus');
  ok('제작 메일 기록 한 건', () => assert.equal(st1.mails, 1));

  const t5card = (await u('t5', 'list')).cards.find((c) => c.id === a.id);
  ok('제작은 내 표 없어도 제작', () => { assert.equal(t5card.word, '제작'); assert.ok(t5card.likes >= 3); });

  const pend = await pc('pcPending');
  ok('분석 대기에 나옴', () => assert.ok(pend.analyze.some((x) => x.id === a.id)));

  const res = await pc('pcResult', { id: a.id, result: { fit: true, why: '시험' } });
  ok('결과 저장', () => assert.ok(res.ok));
  const res2 = await pc('pcResult', { id: a.id, result: { fit: false } });
  ok('결과 두 번 쓰지 않음', () => assert.equal(res2.skipped, true));
  const it = await u('t2', 'item', { id: a.id });
  ok('결과 조회', () => assert.equal(it.result.why, '시험'));
  const pend2 = await pc('pcPending');
  ok('완료는 대기에서 빠짐', () => assert.equal(pend2.analyze.some((x) => x.id === a.id), false));

  const b = await u('t1', 'add', { url: 'https://www.instagram.com/reel/De_m5HoTw7A/?igsh=q', line: '탈락 시험' });
  for (const m of ['t1', 't2', 't3']) await u(m, 'vote', { id: b.id, value: 'no' });
  let cb = (await u('t4', 'list')).cards.find((c) => c.id === b.id);
  ok('아니에요 3개면 탈락', () => assert.equal(cb.word, '탈락'));
  await u('t1', 'vote', { id: b.id, value: 'like' });
  cb = (await u('t1', 'list')).cards.find((c) => c.id === b.id);
  ok('표가 바뀌면 탈락 풀림', () => assert.equal(cb.word, '완료'));
  const pendThumb = await pc('pcPending');
  ok('인스타 첫 화면 대기', () => assert.ok(pendThumb.thumbs.some((x) => x.id === b.id)));

  const f = await u('t1', 'add', { url: 'https://www.youtube.com/watch?v=YojzkmCrcmw', line: '실패 시험' });
  for (const m of ['t1', 't2', 't3']) await u(m, 'vote', { id: f.id, value: 'like' });
  const f1 = await pc('pcFail', { id: f.id });
  const f2 = await pc('pcFail', { id: f.id });
  const f3 = await pc('pcFail', { id: f.id });
  ok('세 번 실패하면 끝', () => { assert.equal(f1.final, false); assert.equal(f2.final, false); assert.equal(f3.final, true); });
  const fc = (await u('t1', 'item', { id: f.id })).card;
  ok('실패 상태 표시', () => assert.equal(fc.analysis, '실패'));
  const pend3 = await pc('pcPending');
  ok('실패는 다시 안 함', () => assert.equal(pend3.analyze.some((x) => x.id === f.id), false));

  const good = await call({ action: 'login', code: codes.t2 });
  ok('코드로 로그인', () => assert.equal(good.token, tok.t2));
  let last;
  for (let i = 0; i < 5; i++) last = await call({ action: 'login', code: `wrong${i}` });
  const locked = await call({ action: 'login', code: codes.t2 });
  ok('5번 틀리면 잠김', () => { assert.equal(last.error, 'badcode'); assert.equal(locked.error, 'locked'); });

  const st = await pc('adminStatus');
  console.log('메일 기록', st.mails, '| 시험 뒤 정리');
  await pc('adminClear', { confirm: '시험 데이터 지우기' });
  for (const m of names) await pc('adminRemove', { member: m });
  const st2 = await pc('adminStatus');
  ok('정리 후 비어 있음', () => { assert.equal(st2.members, 0); assert.equal(st2.items, 0); assert.equal(st2.votes, 0); });
  console.log(`통과 ${passed}`);
})().catch((e) => { console.log('중단', String(e.message).slice(0, 200)); process.exitCode = 1; });
