// 화면 시험: 서버는 가짜 응답, Edge 휴대폰 크기.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DOCS = path.join(__dirname, '..', 'docs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
let server, base, browser;

test.before(async () => {
  server = http.createServer((q, s) => {
    const p = path.join(DOCS, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    s.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
test.after(async () => { await browser.close(); server.close(); });

const CARD = (o) => ({ id: 'a', url: 'https://www.youtube.com/watch?v=p6kY8-yTCwA', platform: 'youtube', videoId: 'p6kY8-yTCwA', line: '학식 경주', account: '계정', title: '', thumbUrl: '', createdAt: 1, analysis: '', word: '투표', myVote: null, ...o });

async function open(handlers, { hash = '', token = 'tok', query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.slice(0, -1) });
  const calls = [];
  await ctx.route(/script\.google\.com/, async (route) => {
    const b = JSON.parse(route.request().postData());
    calls.push(b);
    const h = handlers[b.action];
    const out = typeof h === 'function' ? await h(b) : h;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out || { ok: false, error: 'action' }) });
  });
  await ctx.route(/youtube\.com\/embed|instagram\.com|tiktok\.com\/embed/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>영상</p>' }));
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const page = await ctx.newPage();
  if (token) await page.addInitScript((t) => { if (!localStorage.getItem('jj_token')) localStorage.setItem('jj_token', t); }, token);
  await page.goto(`${base}${query}${hash}`);
  return { page, calls, ctx };
}

test('토큰이 없으면 내 코드 화면이고 목록을 부르지 않는다', async () => {
  const { page, calls, ctx } = await open({}, { token: null });
  await page.getByRole('heading', { name: '내 코드' }).waitFor();
  assert.equal(calls.filter((c) => c.action === 'list').length, 0);
  await ctx.close();
});

test('코드를 넣으면 로그인하고 첫 화면으로 간다', async () => {
  const { page, ctx } = await open({ login: { ok: true, token: 'new' }, list: { ok: true, cards: [], todo: 0 } }, { token: null });
  await page.getByLabel('내 코드').fill('abcd1234');
  await page.getByRole('button', { name: '들어가기' }).click();
  await page.getByRole('heading', { name: /수퍼스타/ }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jj_token')), 'new');
  await ctx.close();
});

test('틀린 코드와 잠금을 안내한다', async () => {
  const { page, ctx } = await open({ login: { ok: false, error: 'locked' } }, { token: null });
  await page.getByLabel('내 코드').fill('x');
  await page.getByRole('button', { name: '들어가기' }).click();
  await page.getByText('15분').waitFor();
  await ctx.close();
});

test('주소의 토큰은 저장하고 주소에서 지운다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 } }, { token: null, query: '?t=abc123' });
  await page.getByRole('heading', { name: /수퍼스타/ }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jj_token')), 'abc123');
  assert.equal(page.url().includes('abc123'), false);
  await ctx.close();
});

test('서버가 토큰을 거부하면 내 코드 화면으로 돌아간다', async () => {
  const { page, ctx } = await open({ list: { ok: false, error: 'token' } });
  await page.getByRole('heading', { name: '내 코드' }).waitFor();
  await ctx.close();
});

test('첫 화면에 타이틀과 버튼, 내가 안 한 수가 있다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 2 } });
  await page.getByRole('button', { name: '찾은 영상 붙여넣기' }).waitFor();
  await page.getByRole('link', { name: /투표하기.*2/ }).waitFor();
  assert.equal(await page.getByText('전주대를 알리겠습니다').count(), 0);
  await ctx.close();
});

test('붙여넣기 후 한 줄이 없으면 등록할 수 없다', async () => {
  const { page, calls, ctx } = await open({ list: { ok: true, cards: [], todo: 0 } });
  await page.evaluate(() => navigator.clipboard.writeText('https://youtu.be/p6kY8-yTCwA'));
  await page.getByRole('button', { name: '찾은 영상 붙여넣기' }).click();
  await page.getByLabel('한 줄 설명').waitFor();
  assert.equal(await page.getByLabel('영상 링크').inputValue(), 'https://youtu.be/p6kY8-yTCwA');
  await page.getByRole('button', { name: '등록하기' }).click();
  await page.getByText('한 줄 설명을 써 주세요').waitFor();
  assert.equal(calls.filter((c) => c.action === 'add').length, 0);
  await ctx.close();
});

test('등록하면 단톡방 알리기 화면이 나오고 공유 문구에 토큰이 없다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 }, add: { ok: true, id: 'n' } }, { hash: '#/add' });
  await page.addInitScript(() => {});
  await page.evaluate(() => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; });
  await page.getByLabel('영상 링크').fill('https://youtu.be/p6kY8-yTCwA');
  await page.getByLabel('한 줄 설명').fill('학식 경주');
  await page.getByRole('button', { name: '등록하기' }).click();
  await page.getByRole('button', { name: '단톡방에 알리기' }).click();
  const s = await page.evaluate(() => window.__shared);
  assert.ok(s.text.includes('학식 경주'));
  assert.equal(JSON.stringify(s).includes('tok'), false);
  await ctx.close();
});

test('중복 링크는 기존 투표 화면으로 보낸다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [CARD({ id: 'd' })], todo: 1 }, add: { ok: true, duplicate: 'd' }, item: { ok: true, card: CARD({ id: 'd' }) } }, { hash: '#/add' });
  await page.getByLabel('영상 링크').fill('https://youtu.be/p6kY8-yTCwA');
  await page.getByLabel('한 줄 설명').fill('다른 설명');
  await page.getByRole('button', { name: '등록하기' }).click();
  await page.getByRole('button', { name: '좋아요' }).waitFor();
  assert.ok(page.url().includes('#/vote/d'));
  await ctx.close();
});

const FOUR = [CARD({ id: 'a' }), CARD({ id: 'b', word: '완료', myVote: 'like', likes: 2, nos: 0 }), CARD({ id: 'c', word: '제작', likes: 3, nos: 0 }), CARD({ id: 'd', word: '탈락', nos: 3, likes: 0, line: '<img src=x onerror=window.__x=1>' })];

test('목록의 도장 단어와 색이 맞고 HTML은 글자로 나온다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: FOUR, todo: 1 } }, { hash: '#/list' });
  await page.locator('.stamp').first().waitFor();
  assert.deepEqual(await page.locator('.stamp').allTextContents(), ['투표', '완료', '제작', '탈락']);
  const colors = await page.locator('.stamp').evaluateAll((e) => e.map((x) => getComputedStyle(x).color));
  assert.equal(colors[1], 'rgb(255, 217, 59)');
  assert.equal(colors[2], 'rgb(255, 217, 59)');
  assert.equal(colors[3], 'rgb(198, 203, 210)');
  await page.getByText('<img src=x onerror=window.__x=1>').waitFor();
  assert.equal(await page.evaluate(() => window.__x), undefined);
  await ctx.close();
});

test('보기 전환을 기기에 기억한다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: FOUR, todo: 1 } }, { hash: '#/list' });
  await page.locator('#grid.two').waitFor();
  await page.getByRole('button', { name: '한 줄에 하나' }).click();
  await page.reload();
  await page.locator('.stamp').first().waitFor();
  assert.equal(await page.locator('#grid.two').count(), 0);
  await ctx.close();
});

test('목록의 제작 카드는 결과로, 투표 카드는 투표 화면으로 간다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: FOUR, todo: 1 }, item: { ok: true, card: FOUR[2] } }, { hash: '#/list' });
  await page.locator('.stamp', { hasText: '제작' }).click();
  await page.waitForURL(/#\/result\/c/);
  await ctx.close();
});

test('투표 전에는 표 수가 없고 좋아요 후 완료 도장과 별이 나온 뒤 다음으로 간다', async () => {
  const cards = [CARD({ id: 'a' }), CARD({ id: 'b', line: '둘째' })];
  const { page, ctx } = await open({
    list: { ok: true, cards, todo: 2 },
    item: (b) => ({ ok: true, card: cards.find((c) => c.id === b.id) }),
    vote: { ok: true, justProduced: false, card: CARD({ id: 'a', word: '완료', myVote: 'like', likes: 2, nos: 0 }) }
  }, { hash: '#/vote/a' });
  await page.getByRole('button', { name: '좋아요' }).waitFor();
  assert.equal(await page.locator('.stars').count(), 0);
  await page.getByRole('button', { name: '좋아요' }).click();
  await page.locator('.stamp', { hasText: '완료' }).waitFor();
  assert.equal(await page.locator('.stars').getAttribute('aria-label'), '좋아요 2개');
  await page.waitForURL(/#\/vote\/b/, { timeout: 5000 });
  await ctx.close();
});

test('세 번째 좋아요면 제작 도장이 나온다', async () => {
  const { page, ctx } = await open({
    list: { ok: true, cards: [CARD()], todo: 1 }, item: { ok: true, card: CARD() },
    vote: { ok: true, justProduced: true, card: CARD({ word: '제작', myVote: 'like', likes: 3, nos: 0 }) }
  }, { hash: '#/vote/a' });
  await page.getByRole('button', { name: '좋아요' }).click();
  await page.locator('.stamp', { hasText: '제작' }).waitFor();
  await page.getByText('분석을 시작합니다').waitFor();
  await ctx.close();
});

test('연타해도 투표는 한 번만 보낸다', async () => {
  const { page, calls, ctx } = await open({
    list: { ok: true, cards: [CARD()], todo: 1 }, item: { ok: true, card: CARD() },
    vote: async () => { await new Promise((r) => setTimeout(r, 400)); return { ok: true, card: CARD({ word: '완료', myVote: 'like', likes: 1, nos: 0 }) }; }
  }, { hash: '#/vote/a' });
  const b = page.getByRole('button', { name: '좋아요' });
  await b.waitFor();
  await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '좋아요'); x.click(); x.click(); x.click(); });
  await page.locator('.stamp', { hasText: '완료' }).waitFor();
  assert.equal(calls.filter((c) => c.action === 'vote').length, 1);
  await ctx.close();
});

test('완료한 영상은 내 표를 바꿀 수 있고 제작은 버튼이 없다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: FOUR, todo: 1 }, item: (b) => ({ ok: true, card: FOUR.find((c) => c.id === b.id) }) }, { hash: '#/vote/b' });
  await page.getByRole('button', { name: '좋아요' }).waitFor();
  await page.getByText('내 표: 좋아요').waitFor();
  await page.goto(`${base}#/vote/c`);
  await page.waitForURL(/#\/result\/c/);
  assert.equal(await page.getByRole('button', { name: '좋아요' }).count(), 0);
  await ctx.close();
});

test('투표 화면에 임베드와 원본 영상 보기가 있고 버튼이 화면 안에 있다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [CARD()], todo: 1 }, item: { ok: true, card: CARD() } }, { hash: '#/vote/a' });
  await page.locator('iframe').waitFor();
  assert.ok((await page.locator('iframe').getAttribute('src')).includes('youtube.com/embed/p6kY8-yTCwA'));
  const link = page.getByRole('link', { name: '원본 영상 보기' });
  assert.equal(await link.getAttribute('href'), CARD().url);
  const box = await page.getByRole('button', { name: '좋아요' }).boundingBox();
  assert.ok(box.y + box.height <= 844);
  await ctx.close();
});

const RES = { fit: true, why: '첫 1초에 움직임이 있다', format: '경주 중계', change: ['무대를 학식 줄로'], clips: [{ order: 1, prompt: 'PROMPT ONE', reference: '01 제이제이 기본 정면.png', seconds: 3 }], captions: ['근데 있잖아—'] };

test('결과 화면은 프롬프트를 복사한다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 }, item: { ok: true, card: CARD({ word: '제작', analysis: '완료' }), result: RES } }, { hash: '#/result/a' });
  await page.getByText('첫 1초에 움직임이 있다').waitFor();
  await page.getByText('01 제이제이 기본 정면.png').waitFor();
  await page.getByRole('button', { name: '클립 1 복사' }).click();
  await page.getByRole('button', { name: '복사했습니다' }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'PROMPT ONE');
  await ctx.close();
});

test('안 맞는 형식과 분석 중, 실패를 표시한다', async () => {
  let r = await open({ list: { ok: true, cards: [], todo: 0 }, item: { ok: true, card: CARD({ word: '제작', analysis: '완료' }), result: { fit: false, reason: '전주대 요소로 바꾸기 어려움' } } }, { hash: '#/result/a' });
  await r.page.getByText('이 형식은 안 맞음').waitFor();
  await r.page.getByText('전주대 요소로 바꾸기 어려움').waitFor();
  await r.ctx.close();
  r = await open({ list: { ok: true, cards: [], todo: 0 }, item: { ok: true, card: CARD({ word: '제작', analysis: '대기' }) } }, { hash: '#/result/a' });
  await r.page.getByText('분석 중').waitFor();
  await r.ctx.close();
  r = await open({ list: { ok: true, cards: [], todo: 0 }, item: { ok: true, card: CARD({ word: '제작', analysis: '실패' }) } }, { hash: '#/result/a' });
  await r.page.getByText('분석 실패').waitFor();
  await r.ctx.close();
});

test('서버에 연결하지 못하면 다시 시도 안내가 나온다', async () => {
  const { page, ctx } = await open({ list: { ok: false, error: 'server' } }, { hash: '#/list' });
  await page.getByText('불러오지 못했습니다').waitFor();
  await page.getByRole('button', { name: '다시 불러오기' }).waitFor();
  await ctx.close();
});

test('투표 직후 영상을 빼서 소리를 멈춘다', async () => {
  const { page, ctx } = await open({
    list: { ok: true, cards: [CARD()], todo: 1 }, item: { ok: true, card: CARD() },
    vote: { ok: true, card: CARD({ word: '완료', myVote: 'like', likes: 1, nos: 0 }) }
  }, { hash: '#/vote/a' });
  await page.locator('iframe').waitFor();
  await page.getByRole('button', { name: '좋아요' }).click();
  await page.locator('.stamp', { hasText: '완료' }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await ctx.close();
});

test('인스타는 임베드 여백을 잘라 9:16으로 보여 주고 버튼은 화면 안에 있다', async () => {
  const ig = CARD({ platform: 'instagram', videoId: 'De_m5HoTw7A', url: 'https://www.instagram.com/reel/De_m5HoTw7A/' });
  const { page, ctx } = await open({ list: { ok: true, cards: [ig], todo: 1 }, item: { ok: true, card: ig } }, { hash: '#/vote/a' });
  await page.locator('.frame.ig iframe').waitFor();
  const f = await page.locator('.frame').boundingBox();
  const i = await page.locator('.frame iframe').boundingBox();
  assert.ok(Math.abs(f.width / f.height - 9 / 16) < 0.01, `틀 비율 ${f.width / f.height}`);
  assert.ok(Math.abs(i.width / f.width - 1.4222) < 0.01, `임베드 폭 ${i.width / f.width}`);
  assert.ok(Math.abs(i.y - (f.y - 54)) < 1, '머리 54px 밀기');
  const b = await page.getByRole('button', { name: '좋아요' }).boundingBox();
  assert.ok(b.y + b.height <= 844);
  await ctx.close();
});

test('좋아요 뒤 다음 영상이 다시 불러오지 않고 위로 올라온다', async () => {
  const cards = [CARD({ id: 'a' }), CARD({ id: 'b', line: '둘째', videoId: 'YojzkmCrcmw' })];
  const { page, calls, ctx } = await open({
    list: { ok: true, cards, todo: 2 },
    item: (x) => ({ ok: true, card: cards.find((c) => c.id === x.id) }),
    vote: { ok: true, card: CARD({ word: '완료', myVote: 'like', likes: 1, nos: 0 }) }
  }, { hash: '#/vote/a' });
  // 짧은 전환을 놓치지 않게 시험에서만 느리게 한다.
  await page.addStyleTag({ content: '.vote.rise,.vote.leave{animation-duration:1.5s!important}' });
  await page.getByRole('button', { name: '좋아요' }).click();
  await page.locator('.vote.rise').waitFor({ timeout: 4000, state: 'attached' });
  assert.ok((await page.locator('.vote.rise iframe').getAttribute('src')).includes('YojzkmCrcmw'));
  assert.equal(calls.filter((c) => c.action === 'item' && c.id === 'b').length, 0);
  await page.locator('.vote.leave').waitFor({ state: 'detached', timeout: 3000 });
  await page.getByText('둘째').waitFor();
  await ctx.close();
});
