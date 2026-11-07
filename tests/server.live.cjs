// 실제 배포 서버 시험. 시작과 끝에 시트 데이터를 모두 지운다. 운영 시작 뒤에는 돌리지 않는다.
// 키를 출력하지 않는다. 사용: node tests/server.live.cjs <배포ID> <키파일>
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
  const pcKey = fs.readFileSync(keyFile, 'utf8').trim();
  const pc = (a, x = {}) => call({ action: a, pcKey, ...x });
  const cleared = await pc('adminClear', { confirm: '시험 데이터 지우기' });
  assert.ok(cleared.ok, `지우기 실패 ${cleared.error}`);

  const names = ['국현', '하영', '산하', '민우', '실장님'];
  const tok = {};
  for (const m of names) tok[m] = (await call({ action: 'pick', name: m })).token;
  const u = (m, a, x = {}) => call({ action: a, token: tok[m], ...x });

  ok('이름마다 토큰이 다르다', () => assert.equal(new Set(Object.values(tok)).size, 5));
  const stranger = await call({ action: 'pick', name: '모르는 사람' });
  ok('명단에 없는 이름 거부', () => assert.equal(stranger.error, 'name'));
  const bad = await call({ action: 'list', token: 'nope' });
  ok('잘못된 토큰 거부', () => assert.equal(bad.error, 'token'));
  const badVote = await call({ action: 'vote', token: 'nope', id: 'x', value: 'like' });
  ok('잘못된 토큰 투표 거부', () => assert.equal(badVote.error, 'token'));
  const noKey = await call({ action: 'pcPending', pcKey: 'nope' });
  ok('잘못된 PC 키 거부', () => assert.equal(noKey.error, 'key'));

  const first = await u('국현', 'list');
  ok('시험 전 목록 비어 있음', () => assert.equal(first.cards.length, 0));
  const emptyLine = await u('국현', 'add', { url: 'https://www.youtube.com/watch?v=p6kY8-yTCwA', line: '   ' });
  ok('한 줄 비면 거부', () => assert.equal(emptyLine.error, 'line'));
  const badLink = await u('국현', 'add', { url: 'https://vimeo.com/1', line: '시험' });
  ok('다른 사이트 거부', () => assert.equal(badLink.error, 'link'));

  const a = await u('국현', 'add', { url: 'https://youtu.be/p6kY8-yTCwA?si=x', line: '=IMPORTXML("http://x","//a")' });
  ok('등록 성공', () => assert.ok(a.id));
  ok('카드 ID는 글자로 시작', () => assert.ok(/^r/.test(a.id)));
  const dup = await u('하영', 'add', { url: 'https://www.youtube.com/shorts/p6kY8-yTCwA', line: '다른 설명' });
  ok('같은 영상 중복 안내', () => assert.equal(dup.duplicate, a.id));

  const tt = await u('국현', 'add', { url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173', line: '틱톡' });
  ok('틱톡 거부', () => assert.equal(tt.error, 'link'));
  const nums = await u('국현', 'add', { url: 'https://www.youtube.com/watch?v=12345678901', line: '1/2' });
  const numsDup = await u('하영', 'add', { url: 'https://youtu.be/12345678901', line: '또' });
  ok('숫자만 있는 영상 ID 중복 인식', () => assert.equal(numsDup.duplicate, nums.id));

  const t1list = await u('국현', 'list');
  const c0 = t1list.cards.find((c) => c.id === a.id);
  const cT = t1list.cards.find((c) => c.id === nums.id);
  ok('숫자만 있는 영상 ID 유지', () => assert.equal(cT.videoId, '12345678901'));
  ok('날짜처럼 보이는 설명 유지', () => assert.equal(cT.line, '1/2'));
  ok('수식이 글자로 저장됨', () => assert.ok(c0.line.includes('IMPORTXML') && c0.line.startsWith('=')));
  ok('유튜브 공식 정보 수집', () => assert.ok(c0.account && c0.thumbUrl));
  ok('투표 전 표 수 숨김', () => { assert.equal(c0.word, '투표'); assert.equal('likes' in c0, false); });
  ok('내 할 일 수', () => assert.equal(t1list.todo, 2));

  const v1 = await u('국현', 'vote', { id: a.id, value: 'like' });
  ok('좋아요 후 완료·표 공개', () => { assert.equal(v1.card.word, '완료'); assert.equal(v1.card.likes, 1); });
  const v1b = await u('국현', 'vote', { id: a.id, value: 'no' });
  ok('두 번째 표는 받지 않음', () => { assert.equal(v1b.error, 'ended'); assert.equal(v1b.card.likes, 1); assert.equal(v1b.card.nos, 0); });
  await u('국현', 'vote', { id: a.id, value: 'like' });

  const again = (await call({ action: 'pick', name: '국현' })).token;
  ok('이름을 다시 골라도 같은 사람', () => assert.equal(again, tok['국현']));
  const stillOne = (await u('국현', 'list')).cards.find((c) => c.id === a.id);
  ok('다시 골라도 한 표', () => assert.equal(stillOne.likes, 1));

  const t2before = (await u('하영', 'list')).cards.find((c) => c.id === a.id);
  ok('다른 사람에게 표 수 숨김', () => assert.equal('likes' in t2before, false));

  const rs = await Promise.all(['하영', '산하', '민우'].map((m) => u(m, 'vote', { id: a.id, value: 'like' })));
  ok('동시 투표 응답', () => rs.forEach((r) => assert.ok(r.ok || r.error === 'closed', JSON.stringify({ e: r.error }))));
  ok('제작 전환은 한 번', () => assert.equal(rs.filter((r) => r.justProduced).length, 1));
  ok('내부 값이 응답에 없다', () => rs.forEach((r) => assert.equal('_item' in r, false)));
  const closed = await u('실장님', 'vote', { id: a.id, value: 'no' });
  ok('제작 후 투표 불가', () => assert.equal(closed.error, 'closed'));
  const st1 = await pc('adminStatus');
  ok('제작 메일 기록 한 건', () => assert.equal(st1.mails, 1));

  const t5card = (await u('실장님', 'list')).cards.find((c) => c.id === a.id);
  ok('제작은 내 표 없어도 제작', () => { assert.equal(t5card.word, '제작'); assert.ok(t5card.likes >= 3); });

  const pend = await pc('pcPending');
  ok('분석 대기에 나옴', () => assert.ok(pend.analyze.some((x) => x.id === a.id)));
  const res = await pc('pcResult', { id: a.id, result: { fit: true, why: '시험' } });
  ok('결과 저장', () => assert.ok(res.ok && !('_done' in res)));
  const res2 = await pc('pcResult', { id: a.id, result: { fit: false } });
  ok('결과 두 번 쓰지 않음', () => assert.equal(res2.skipped, true));
  const failAfter = await pc('pcFail', { id: a.id });
  ok('완료 뒤 실패로 덮어쓰지 않음', () => assert.equal(failAfter.skipped, true));
  const it = await u('하영', 'item', { id: a.id });
  ok('결과 조회', () => assert.equal(it.result.why, '시험'));
  const pend2 = await pc('pcPending');
  ok('완료는 대기에서 빠짐', () => assert.equal(pend2.analyze.some((x) => x.id === a.id), false));

  const b = await u('국현', 'add', { url: 'https://www.instagram.com/reel/De_m5HoTw7A/?igsh=q', line: '탈락 시험' });
  for (const m of ['국현', '하영', '산하']) await u(m, 'vote', { id: b.id, value: 'no' });
  let cb = (await u('민우', 'list')).cards.find((c) => c.id === b.id);
  ok('아니에요 3개면 표가 없어도 완료', () => assert.equal(cb.word, '완료'));
  const vb = await u('민우', 'vote', { id: b.id, value: 'like' });
  ok('끝난 영상은 표를 받지 않음', () => assert.equal(vb.error, 'ended'));

  const f = await u('국현', 'add', { url: 'https://www.youtube.com/watch?v=YojzkmCrcmw', line: '실패 시험' });
  for (const m of ['국현', '하영', '산하']) await u(m, 'vote', { id: f.id, value: 'like' });
  const f1 = await pc('pcFail', { id: f.id });
  ok('한 번 실패는 끝이 아니다', () => assert.equal(f1.final, false));
  const waiting = await pc('pcPending');
  ok('실패 직후에는 바로 다시 안 함', () => assert.equal(waiting.analyze.some((x) => x.id === f.id), false));
  const f2 = await pc('pcFail', { id: f.id });
  const f3 = await pc('pcFail', { id: f.id });
  ok('세 번 실패하면 끝', () => { assert.equal(f2.final, false); assert.equal(f3.final, true); });
  const fc = (await u('국현', 'item', { id: f.id })).card;
  ok('실패 상태 표시', () => assert.equal(fc.analysis, '실패'));
  const retry = await pc('adminRetry', { id: f.id });
  const back = await pc('pcPending');
  ok('다시 시도로 되살림', () => { assert.ok(retry.ok); assert.ok(back.analyze.some((x) => x.id === f.id)); });
  const dead = await pc('pcFail', { id: f.id, final: true });
  ok('삭제된 영상은 바로 실패', () => assert.equal(dead.final, true));

  const st = await pc('adminStatus');
  console.log('메일 기록', st.mails, '| 시험 뒤 정리');
  await pc('adminClear', { confirm: '시험 데이터 지우기' });
  const st2 = await pc('adminStatus');
  ok('정리 후 비어 있음', () => { assert.equal(st2.items, 0); assert.equal(st2.votes, 0); assert.equal(st2.mails, 0); });
  console.log(`통과 ${passed}`);
})().catch((e) => { console.log('중단', String(e.message).slice(0, 200)); process.exitCode = 1; });
