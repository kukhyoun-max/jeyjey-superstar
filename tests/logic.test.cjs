const test = require('node:test');
const assert = require('node:assert');
const L = require('../gas/logic.gs.cjs');

const V = (voter, value) => ({ voter, value });

test('인스타 릴스 주소에서 추적 값을 지우고 같은 값을 낸다', () => {
  const a = L.parseLink('https://www.instagram.com/reel/De_m5HoTw7A/?igsh=abc');
  const b = L.parseLink('https://instagram.com/reels/De_m5HoTw7A');
  assert.deepEqual(a, { platform: 'instagram', id: 'De_m5HoTw7A', url: 'https://www.instagram.com/reel/De_m5HoTw7A/' });
  assert.deepEqual(a, b);
});

test('인스타 일반 게시물 주소도 받는다', () => {
  assert.equal(L.parseLink('https://www.instagram.com/p/AbC_1/').id, 'AbC_1');
});

test('유튜브 주소 세 형태는 같은 값이 된다', () => {
  const want = { platform: 'youtube', id: 'p6kY8-yTCwA', url: 'https://www.youtube.com/watch?v=p6kY8-yTCwA' };
  assert.deepEqual(L.parseLink('https://youtu.be/p6kY8-yTCwA?si=x'), want);
  assert.deepEqual(L.parseLink('https://www.youtube.com/shorts/p6kY8-yTCwA'), want);
  assert.deepEqual(L.parseLink('https://m.youtube.com/watch?feature=a&v=p6kY8-yTCwA'), want);
});

test('틱톡 일반 주소는 영상 번호를 낸다', () => {
  assert.deepEqual(L.parseLink('https://www.tiktok.com/@a.b/video/6718335390845095173?lang=ko'),
    { platform: 'tiktok', id: '6718335390845095173', url: 'https://www.tiktok.com/@a.b/video/6718335390845095173' });
});

test('틱톡 짧은 주소는 풀어야 한다고 표시한다', () => {
  assert.deepEqual(L.parseLink('https://vt.tiktok.com/ZSabc/'), { platform: 'tiktok', id: null, url: 'https://vt.tiktok.com/ZSabc/', needsResolve: true });
  assert.equal(L.parseLink('https://vm.tiktok.com/ZSabc').needsResolve, true);
});

test('다른 사이트와 빈 값, 비슷한 도메인은 null이다', () => {
  for (const x of ['', null, 'hello', 'https://vimeo.com/1', 'https://instagram.com.evil.kr/reel/a/', 'javascript:alert(1)']) {
    assert.equal(L.parseLink(x), null, String(x));
  }
});

test('같은 사람은 마지막 표만 센다', () => {
  assert.deepEqual(L.tally([V('a', 'like'), V('a', 'no'), V('b', 'like')]), { likes: 1, nos: 1 });
});

test('좋아요 2개는 진행, 3개는 제작 대상이다', () => {
  const t2 = { likes: 2, nos: 0 }, t3 = { likes: 3, nos: 0 };
  assert.equal(L.itemStatus(t2, false), '진행');
  assert.equal(L.shouldProduce(t2, false), false);
  assert.equal(L.shouldProduce(t3, false), true);
});

test('이미 제작이면 다시 제작 대상이 아니다', () => {
  assert.equal(L.shouldProduce({ likes: 4, nos: 0 }, true), false);
});

test('좋아요 3개와 아니에요 2개는 제작이다', () => {
  assert.equal(L.itemStatus({ likes: 3, nos: 2 }, true), '제작');
});

test('아니에요 3개는 탈락이고 표가 바뀌면 풀린다', () => {
  assert.equal(L.itemStatus({ likes: 0, nos: 3 }, false), '탈락');
  assert.equal(L.itemStatus({ likes: 1, nos: 2 }, false), '진행');
});

test('제작은 나중에 표가 줄어도 되돌리지 않는다', () => {
  assert.equal(L.itemStatus({ likes: 2, nos: 3 }, true), '제작');
});

test('카드 단어: 내 표 없음은 투표, 있으면 완료', () => {
  assert.equal(L.cardWord('진행', null), '투표');
  assert.equal(L.cardWord('진행', 'like'), '완료');
  assert.equal(L.cardWord('진행', 'no'), '완료');
});

test('카드 단어: 제작과 탈락은 내 표와 관계없다', () => {
  assert.equal(L.cardWord('제작', null), '제작');
  assert.equal(L.cardWord('제작', 'no'), '제작');
  assert.equal(L.cardWord('탈락', null), '탈락');
  assert.equal(L.cardWord('탈락', 'like'), '탈락');
});

test('제작 후에는 투표할 수 없다', () => {
  assert.equal(L.canVote(true), false);
  assert.equal(L.canVote(false), true);
});

test('내 표가 없고 진행 중이면 표 수를 숨긴다', () => {
  const v = L.publicView({ id: 'x', line: '한 줄' }, { likes: 2, nos: 1 }, null, false);
  assert.equal(v.word, '투표');
  assert.equal('likes' in v, false);
  assert.equal('nos' in v, false);
});

test('내 표가 있으면 표 수를 보여 준다', () => {
  const v = L.publicView({ id: 'x', line: '한 줄' }, { likes: 2, nos: 1 }, 'like', false);
  assert.equal(v.word, '완료');
  assert.equal(v.likes, 2);
  assert.equal(v.myVote, 'like');
});

test('제작이면 내 표가 없어도 표 수를 보여 준다', () => {
  const v = L.publicView({ id: 'x', line: '한 줄' }, { likes: 3, nos: 0 }, null, true);
  assert.equal(v.word, '제작');
  assert.equal(v.likes, 3);
});

test('내 표 없는 진행 카드가 먼저, 탈락이 맨 뒤다', () => {
  const r = L.sortCards([
    { id: '탈', word: '탈락', createdAt: 9 }, { id: '완', word: '완료', createdAt: 8 },
    { id: '제', word: '제작', createdAt: 7 }, { id: '투', word: '투표', createdAt: 1 }
  ]).map((c) => c.id);
  assert.deepEqual(r, ['투', '완', '제', '탈']);
});

test('한 줄 설명은 앞뒤 공백을 지우고, 비었거나 80자를 넘으면 null이다', () => {
  assert.equal(L.cleanLine('  학식 경주  '), '학식 경주');
  assert.equal(L.cleanLine('   '), null);
  assert.equal(L.cleanLine(null), null);
  assert.equal(L.cleanLine('가'.repeat(81)), null);
  assert.equal(L.cleanLine('줄\n바꿈'), '줄 바꿈');
});

test('시트에 수식으로 들어갈 수 있는 글은 앞에 작은따옴표를 붙인다', () => {
  assert.equal(L.safeCell('=IMPORTXML("x")'), "'=IMPORTXML(\"x\")");
  assert.equal(L.safeCell('+1'), "'+1");
  assert.equal(L.safeCell('-1'), "'-1");
  assert.equal(L.safeCell('@a'), "'@a");
  assert.equal(L.safeCell('학식'), '학식');
});
