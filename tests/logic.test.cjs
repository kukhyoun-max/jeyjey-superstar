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

test('틱톡은 받지 않는다', () => {
  for (const x of ['https://www.tiktok.com/@a/video/6718335390845095173', 'https://vt.tiktok.com/ZSabc/', 'https://vm.tiktok.com/ZSabc']) {
    assert.equal(L.parseLink(x), null, x);
  }
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

test('아니에요 3개면 끝난 영상이다', () => {
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

test('카드 단어: 제작은 내 표와 관계없고, 아니에요 3개로 끝난 영상은 완료다', () => {
  assert.equal(L.cardWord('제작', null), '제작');
  assert.equal(L.cardWord('제작', 'no'), '제작');
  assert.equal(L.cardWord('탈락', null), '완료');
  assert.equal(L.cardWord('탈락', 'like'), '완료');
});

test('표는 한 번만, 아니에요 3개면 더 받지 않는다', () => {
  assert.equal(L.voteEnded({ likes: 0, nos: 0 }, false), false);
  assert.equal(L.voteEnded({ likes: 1, nos: 0 }, true), true);
  assert.equal(L.voteEnded({ likes: 0, nos: 3 }, false), true);
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

test('목록은 투표, 제작, 발행, 완료 순서다', () => {
  const r = L.sortCards([
    { id: '완', word: '완료', createdAt: 8 }, { id: '발', word: '발행', createdAt: 2 },
    { id: '제', word: '제작', createdAt: 7 }, { id: '투', word: '투표', createdAt: 1 }
  ]).map((c) => c.id);
  assert.deepEqual(r, ['투', '제', '발', '완']);
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

// ── 제작·발행 ─────────────────────────────────────
test('발행 링크가 있으면 상태와 도장이 발행이다', () => {
  assert.equal(L.itemStatus({ likes: 3, nos: 0 }, true, true), '발행');
  assert.equal(L.itemStatus({ likes: 3, nos: 0 }, true, false), '제작');
  assert.equal(L.cardWord('발행', 'like'), '발행');
  const v = L.publicView({ id: 'a' }, { likes: 3, nos: 1 }, null, true, true);
  assert.equal(v.word, '발행');
  assert.equal(v.likes, 3);
});

const MAKE = (o) => ({ member: '산하', produced: true, maker: '', expect: '', idea: '학식 줄에서 달리는 제이제이', ...o });

test('제작은 산하와 민우만 맡는다', () => {
  assert.deepEqual(L.checkMake(MAKE()), { maker: '산하', idea: '학식 줄에서 달리는 제이제이' });
  assert.equal(L.checkMake(MAKE({ member: '민우' })).maker, '민우');
  for (const member of ['국현', '하영', '실장님']) assert.equal(L.checkMake(MAKE({ member })).error, 'role');
});

test('제작으로 넘어간 영상만 맡을 수 있고 한 줄이 있어야 한다', () => {
  assert.equal(L.checkMake(MAKE({ produced: false })).error, 'notproduced');
  assert.equal(L.checkMake(MAKE({ idea: '   ' })).error, 'idea');
  assert.equal(L.checkMake(MAKE({ idea: '가'.repeat(81) })).error, 'idea');
});

test('내가 본 뒤 담당이 바뀌었으면 덮어쓰지 않는다', () => {
  assert.equal(L.checkMake(MAKE({ maker: '민우', expect: '' })).error, 'changed');
  assert.equal(L.checkMake(MAKE({ maker: '민우', expect: '민우' })).maker, '산하');
});

const PUB = (o) => ({ member: '국현', produced: true, maker: '산하', url: 'https://www.instagram.com/reel/OURS1/?igsh=x', refPlatform: 'youtube', refId: 'REF', ...o });

test('발행 링크는 국현, 산하, 민우가 넣고 주소를 정리한다', () => {
  for (const member of ['국현', '산하', '민우']) assert.deepEqual(L.checkPublish(PUB({ member })), { url: 'https://www.instagram.com/reel/OURS1/' });
  for (const member of ['하영', '실장님']) assert.equal(L.checkPublish(PUB({ member })).error, 'role');
});

test('담당이 없거나 링크가 틀리면 발행하지 않는다', () => {
  assert.equal(L.checkPublish(PUB({ produced: false })).error, 'notproduced');
  assert.equal(L.checkPublish(PUB({ maker: '' })).error, 'nomaker');
  assert.equal(L.checkPublish(PUB({ url: 'https://example.com/a' })).error, 'link');
});

test('레퍼런스 원본 링크를 발행 링크로 넣지 못한다', () => {
  assert.equal(L.checkPublish(PUB({ url: 'https://youtu.be/REF', refPlatform: 'youtube', refId: 'REF' })).error, 'same');
});
