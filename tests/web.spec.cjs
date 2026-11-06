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
  await ctx.route(/youtube\.com\/embed|instagram\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>영상</p>' }));
  await ctx.route(/fonts\.g/, (r) => r.abort());
  const page = await ctx.newPage();
  if (token) await page.addInitScript((t) => { if (!localStorage.getItem('jj_token')) localStorage.setItem('jj_token', t); }, token);
  await page.goto(`${base}${query}${hash}`);
  return { page, calls, ctx };
}

test('이름을 안 골랐으면 이름 화면이고 목록을 부르지 않는다', async () => {
  const { page, calls, ctx } = await open({}, { token: null });
  await page.getByRole('heading', { name: '누구세요?' }).waitFor();
  for (const n of ['국현', '하영', '산하', '민우', '실장님']) await page.getByRole('button', { name: n, exact: true }).waitFor();
  assert.equal(calls.filter((c) => c.action === 'list').length, 0);
  await ctx.close();
});
test('이름을 고르면 기억하고 첫 화면으로 간다', async () => {
  const { page, calls, ctx } = await open({ pick: { ok: true, token: 'new', name: '하영' }, list: { ok: true, cards: [], todo: 0 } }, { token: null });
  await page.getByRole('button', { name: '하영', exact: true }).click();
  await page.getByRole('heading', { name: /수퍼스타/ }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jj_token')), 'new');
  assert.equal(calls.find((c) => c.action === 'pick').name, '하영');
  await page.getByText('하영').first().waitFor();
  await ctx.close();
});

test('첫 화면에서 이름을 바꿀 수 있다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 } });
  await page.getByRole('button', { name: '이름 바꾸기' }).click();
  await page.getByRole('heading', { name: '누구세요?' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jj_token')), null);
  await ctx.close();
});
test('이름을 고르지 못하면 안내한다', async () => {
  const { page, ctx } = await open({ pick: { ok: false, error: 'server' } }, { token: null });
  await page.getByRole('button', { name: '민우', exact: true }).click();
  await page.getByText('다시 눌러 주세요').waitFor();
  await ctx.close();
});
test('공유 주소로 열어도 토큰을 주소에 남기지 않는다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 } }, { token: null, query: '?x=1' });
  await page.getByRole('heading', { name: '누구세요?' }).waitFor();
  assert.equal(page.url().includes('tok'), false);
  await ctx.close();
});
test('서버가 토큰을 거부하면 이름 화면으로 돌아간다', async () => {
  const { page, ctx } = await open({ list: { ok: false, error: 'token' } });
  await page.getByRole('heading', { name: '누구세요?' }).waitFor();
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

test('등록하면 알림만 뜨고 입력 화면에 남아 계속 넣을 수 있다', async () => {
  let n = 0;
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 }, add: () => ({ ok: true, id: `n${++n}` }) }, { hash: '#/add' });
  await page.getByLabel('영상 링크').fill('https://youtu.be/p6kY8-yTCwA');
  await page.getByLabel('한 줄 설명').fill('학식 경주');
  await page.getByRole('button', { name: '등록하기' }).click();
  await page.getByRole('status').filter({ hasText: '등록했습니다' }).waitFor();
  assert.ok(page.url().endsWith('#/add'));
  assert.equal(await page.getByLabel('영상 링크').inputValue(), '');
  assert.equal(await page.getByLabel('한 줄 설명').inputValue(), '');
  await page.getByRole('button', { name: '단톡방에 1개 알리기' }).waitFor();
  await page.getByLabel('영상 링크').fill('https://youtu.be/YojzkmCrcmw');
  await page.getByLabel('한 줄 설명').fill('둘째 영상');
  await page.getByRole('button', { name: '등록하기' }).click();
  await page.getByRole('button', { name: '단톡방에 2개 알리기' }).waitFor();
  await ctx.close();
});

test('모아서 알리면 설명이 모두 들어가고 토큰은 없으며 수가 비워진다', async () => {
  let n = 0;
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 }, add: () => ({ ok: true, id: `n${++n}` }) }, { hash: '#/add' });
  await page.evaluate(() => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; });
  for (const [u, l] of [['https://youtu.be/p6kY8-yTCwA', '학식 경주'], ['https://youtu.be/YojzkmCrcmw', '둘째 영상']]) {
    await page.getByLabel('영상 링크').fill(u);
    await page.getByLabel('한 줄 설명').fill(l);
    await page.getByRole('button', { name: '등록하기' }).click();
    await page.getByLabel('영상 링크').and(page.locator('[value=""], input')).waitFor();
    await page.waitForFunction(() => document.getElementById('url').value === '');
  }
  await page.getByRole('button', { name: '단톡방에 2개 알리기' }).click();
  await page.waitForFunction(() => window.__shared);
  const s = await page.evaluate(() => window.__shared);
  assert.ok(s.text.includes('학식 경주') && s.text.includes('둘째 영상'));
  assert.equal(JSON.stringify(s).includes('tok'), false);
  await page.getByRole('button', { name: /단톡방에/ }).waitFor({ state: 'detached' });
  await ctx.close();
});

test('입력 화면의 붙여넣기 버튼으로 다음 링크를 넣는다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 } }, { hash: '#/add' });
  await page.evaluate(() => navigator.clipboard.writeText('https://youtu.be/YojzkmCrcmw'));
  await page.getByRole('button', { name: '붙여넣기', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('url').value.includes('YojzkmCrcmw'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'line');
  await ctx.close();
});
test('중복 링크는 알림으로 알리고 입력 화면에 남는다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [CARD({ id: 'd' })], todo: 1 }, add: { ok: true, duplicate: 'd' } }, { hash: '#/add' });
  await page.getByLabel('영상 링크').fill('https://youtu.be/p6kY8-yTCwA');
  await page.getByLabel('한 줄 설명').fill('다른 설명');
  await page.getByRole('button', { name: '등록하기' }).click();
  await page.getByRole('status').filter({ hasText: '이미 등록된 영상' }).waitFor();
  assert.ok(page.url().endsWith('#/add'));
  assert.equal(await page.getByRole('link', { name: '투표하러 가기' }).getAttribute('href'), '#/vote/d');
  assert.equal(await page.getByRole('button', { name: /단톡방에/ }).count(), 0);
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

test('인스타는 화면을 가득 채우고 버튼과 제목은 그 위에 있다', async () => {
  const ig = CARD({ platform: 'instagram', videoId: 'De_m5HoTw7A', url: 'https://www.instagram.com/reel/De_m5HoTw7A/' });
  const { page, ctx } = await open({ list: { ok: true, cards: [ig], todo: 1 }, item: { ok: true, card: ig } }, { hash: '#/vote/a' });
  await page.locator('.frame.ig iframe').waitFor();
  const f = await page.locator('.slide.current .frame').boundingBox();
  const i = await page.locator('.frame iframe').boundingBox();
  assert.ok(Math.abs(f.width - 390) < 1 && Math.abs(f.height - 844) < 1, `틀 ${f.width}x${f.height}`);
  const video = Math.max(f.width, f.height * 9 / 16);
  assert.ok(Math.abs(i.width - video * 1.4222) < 2, `임베드 폭 ${i.width}`);
  const videoH = video * 16 / 9;
  const videoTop = i.y + 54;
  assert.ok(videoTop <= f.y + 1 && videoTop + videoH >= f.y + f.height - 1, '영상이 위아래를 채운다');
  const videoLeft = i.x + (i.width - video) / 2;
  assert.ok(videoLeft <= f.x + 1 && videoLeft + video >= f.x + f.width - 1, '영상이 좌우를 채운다');
  const b = await page.getByRole('button', { name: '좋아요' }).boundingBox();
  assert.ok(b.y + b.height <= 844 && b.y > f.y, '버튼이 영상 위에 있다');
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y).textContent, [b.x + b.width / 2, b.y + b.height / 2]);
  assert.equal(hit, '좋아요');
  await ctx.close();
});
test('좋아요 뒤 다음 영상으로 스스로 넘어가고 다시 불러오지 않는다', async () => {
  const cards = [CARD({ id: 'a' }), CARD({ id: 'b', line: '둘째', videoId: 'YojzkmCrcmw' })];
  const { page, calls, ctx } = await open({
    list: { ok: true, cards, todo: 2 },
    item: (x) => ({ ok: true, card: cards.find((c) => c.id === x.id) }),
    vote: { ok: true, card: CARD({ word: '완료', myVote: 'like', likes: 1, nos: 0 }) }
  }, { hash: '#/vote/a' });
  await page.getByRole('button', { name: '좋아요' }).click();
  await page.locator('.slide.current iframe[src*="YojzkmCrcmw"]').waitFor({ timeout: 5000 });
  await page.waitForURL(/#\/vote\/b/);
  assert.equal(calls.filter((c) => c.action === 'item' && c.id === 'b').length, 0);
  await page.locator('.below').getByText('둘째').waitFor();
  await ctx.close();
});

test('손으로 넘기면 다음 영상이 현재가 되고 표는 그 영상에 들어간다', async () => {
  const cards = [CARD({ id: 'a', line: '첫째' }), CARD({ id: 'b', line: '둘째', videoId: 'YojzkmCrcmw' })];
  const { page, calls, ctx } = await open({
    list: { ok: true, cards, todo: 2 },
    vote: { ok: true, card: CARD({ id: 'b', word: '완료', myVote: 'no', likes: 0, nos: 1 }) }
  }, { hash: '#/vote/a' });
  await page.locator('.slide.current iframe').waitFor();
  await page.locator('.feed').evaluate((n) => n.scrollTo(0, n.clientHeight));
  await page.locator('.below').getByText('둘째').waitFor();
  await page.waitForURL(/#\/vote\/b/);
  await page.getByRole('button', { name: '아니에요' }).click();
  await page.locator('.stamp', { hasText: '완료' }).waitFor();
  assert.equal(calls.find((c) => c.action === 'vote').id, 'b');
  await ctx.close();
});

test('유튜브는 지금 영상만 자동 재생으로 불러오고 지나간 영상은 내린다', async () => {
  const cards = ['a', 'b', 'c', 'd'].map((id, i) => CARD({ id, line: id, videoId: `vid${i}` }));
  const { page, ctx } = await open({ list: { ok: true, cards, todo: 4 } }, { hash: '#/vote/a' });
  await page.locator('.slide.current iframe').waitFor();
  assert.equal(await page.locator('.feed iframe').count(), 1);
  assert.ok((await page.locator('.slide.current iframe').getAttribute('src')).includes('autoplay=1'));
  await page.locator('.feed').evaluate((n) => n.scrollTo(0, n.clientHeight * 2));
  await page.locator('.below').getByText('c', { exact: true }).waitFor();
  const srcs = await page.locator('.feed iframe').evaluateAll((x) => x.map((i) => i.src));
  assert.equal(srcs.length, 1);
  assert.ok(srcs[0].includes('vid2'));
  await ctx.close();
});

test('인스타는 다음 영상을 미리 불러 둔다', async () => {
  const cards = ['a', 'b'].map((id, i) => CARD({ id, line: id, platform: 'instagram', videoId: `ig${i}`, url: `https://www.instagram.com/reel/ig${i}/` }));
  const { page, ctx } = await open({ list: { ok: true, cards, todo: 2 } }, { hash: '#/vote/a' });
  await page.locator('.slide.current iframe').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.feed iframe').length === 2);
  await ctx.close();
});

test('좋아요와 아니에요는 크기가 같다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [CARD()], todo: 1 } }, { hash: '#/vote/a' });
  const a = await page.getByRole('button', { name: '아니에요' }).boundingBox();
  const b = await page.getByRole('button', { name: '좋아요' }).boundingBox();
  assert.ok(Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);
  await ctx.close();
});

test('누른 버튼은 서버 응답 전에 바로 반응한다', async () => {
  const { page, ctx } = await open({
    list: { ok: true, cards: [CARD()], todo: 1 },
    vote: async () => { await new Promise((r) => setTimeout(r, 700)); return { ok: true, card: CARD({ word: '완료', myVote: 'no', likes: 0, nos: 1 }) }; }
  }, { hash: '#/vote/a' });
  await page.getByRole('button', { name: '아니에요' }).click();
  await page.locator('.acts .no.picked').waitFor({ timeout: 300 });
  assert.equal(await page.locator('.acts .yes.dim').count(), 1);
  await ctx.close();
});
test('영상 위아래는 넘기기 구역이고 가운데는 플레이어가 터치를 받는다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [CARD()], todo: 1 } }, { hash: '#/vote/a' });
  await page.locator('.slide.current iframe').waitFor();
  const f = await page.locator('.slide.current .frame').boundingBox();
  const at = (r) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.tagName + (e.className ? '.' + e.className : ''); }, [f.x + f.width / 2, f.y + f.height * r]);
  assert.equal(await at(0.5), 'IFRAME');
  assert.equal(await at(0.15), 'DIV.swipe-zone top');
  assert.equal(await at(0.72), 'DIV.swipe-zone bottom');
  await ctx.close();
});

test('영상 양옆도 넘기기 구역이다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [CARD()], todo: 1 } }, { hash: '#/vote/a' });
  await page.locator('.slide.current iframe').waitFor();
  const name = await page.evaluate(() => { const e = document.elementFromPoint(12, innerHeight / 2); return e.className; });
  assert.equal(name, 'swipe-zone left');
  const right = await page.evaluate(() => document.elementFromPoint(innerWidth - 12, innerHeight / 2).className);
  assert.equal(right, 'swipe-zone right');
  await ctx.close();
});

test('목록, 투표, 결과 화면에서 처음으로 돌아갈 수 있다', async () => {
  for (const [hash, item] of [['#/list', null], ['#/vote/a', null], ['#/result/a', { ok: true, card: CARD({ word: '제작', analysis: '대기' }) }]]) {
    const { page, ctx } = await open({ list: { ok: true, cards: [CARD()], todo: 1 }, item }, { hash });
    const link = page.getByRole('link', { name: /처음으로/ });
    await link.waitFor();
    await link.click();
    await page.getByRole('heading', { name: /수퍼스타/ }).waitFor();
    await ctx.close();
  }
});

test('영상을 보지 않은 분석이면 결과에 그렇게 표시한다', async () => {
  const { page, ctx } = await open({ list: { ok: true, cards: [], todo: 0 }, item: { ok: true, card: CARD({ word: '제작', analysis: '완료' }), result: { ...RES, seenVideo: false } } }, { hash: '#/result/a' });
  await page.getByText('영상을 직접 보지 않고').waitFor();
  await ctx.close();
});

test('자동으로 넘어가는 순간 누른 표는 다음 영상에 들어간다', async () => {
  const cards = [CARD({ id: 'a', line: '첫째' }), CARD({ id: 'b', line: '둘째', videoId: 'YojzkmCrcmw' })];
  const { page, calls, ctx } = await open({
    list: { ok: true, cards, todo: 2 },
    vote: (x) => ({ ok: true, card: CARD({ id: x.id, word: '완료', myVote: 'like', likes: 1, nos: 0 }) })
  }, { hash: '#/vote/a' });
  await page.addStyleTag({ content: '.feed{scroll-behavior:auto!important}' });
  await page.getByRole('button', { name: '좋아요' }).click();
  await page.locator('.done-msg').waitFor();
  await page.locator('.acts').waitFor({ timeout: 3000 }); // 버튼이 돌아온 바로 그때 누른다
  await page.evaluate(() => [...document.querySelectorAll('.acts button')].find((b) => b.textContent === '좋아요').click());
  await page.waitForFunction(() => document.querySelectorAll('.stamp').length >= 1);
  await page.waitForTimeout(200);
  const votes = calls.filter((c) => c.action === 'vote').map((c) => c.id);
  assert.deepEqual(votes, ['a', 'b']);
  await ctx.close();
});

test('인스타 재생 중 위로 되돌리면 지나간 영상을 다시 불러 소리를 멈춘다', async () => {
  const cards = ['a', 'b'].map((id, i) => CARD({ id, line: id, platform: 'instagram', videoId: `ig${i}`, url: `https://www.instagram.com/reel/ig${i}/` }));
  const { page, ctx } = await open({ list: { ok: true, cards, todo: 2 } }, { hash: '#/vote/a' });
  await page.waitForFunction(() => document.querySelectorAll('.feed iframe').length === 2);
  await page.locator('.feed').evaluate((n) => n.scrollTo(0, n.clientHeight));
  await page.locator('.below').getByText('b', { exact: true }).waitFor();
  await page.evaluate(() => { document.querySelector('.slide.current iframe').dataset.playing = '1'; });
  await page.locator('.feed').evaluate((n) => n.scrollTo(0, 0));
  await page.locator('.below').getByText('a', { exact: true }).waitFor();
  assert.equal(await page.locator('iframe[data-playing]').count(), 0);
  await ctx.close();
});
