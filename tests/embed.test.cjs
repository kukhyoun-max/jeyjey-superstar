const test = require('node:test');
const assert = require('node:assert');
const { embedFor } = require('../docs/embed.js');

test('유튜브 쇼츠는 공식 임베드 주소를 낸다', () => {
  const e = embedFor({ platform: 'youtube', id: 'abc_123-X', url: 'https://www.youtube.com/shorts/abc_123-X' });
  assert.equal(e.kind, 'iframe');
  assert.ok(e.src.startsWith('https://www.youtube.com/embed/abc_123-X'));
  assert.ok(e.src.includes('playsinline=1'));
});

test('인스타 릴스는 공식 임베드 주소를 낸다', () => {
  const e = embedFor({ platform: 'instagram', id: 'DfOpK32O0P9', url: 'https://www.instagram.com/reel/DfOpK32O0P9/' });
  assert.equal(e.kind, 'iframe');
  assert.equal(e.src, 'https://www.instagram.com/reel/DfOpK32O0P9/embed/');
});

test('틱톡은 공식 임베드 주소를 낸다', () => {
  const e = embedFor({ platform: 'tiktok', id: '7300000000000000000', url: 'https://www.tiktok.com/@a/video/7300000000000000000' });
  assert.equal(e.kind, 'iframe');
  assert.equal(e.src, 'https://www.tiktok.com/embed/v2/7300000000000000000');
});

test('모르는 플랫폼은 null이다', () => {
  assert.equal(embedFor({ platform: 'vimeo', id: '1', url: 'https://vimeo.com/1' }), null);
});

test('아이디에 주소를 깨는 글자가 있으면 null이다', () => {
  assert.equal(embedFor({ platform: 'youtube', id: 'a"><script>', url: 'x' }), null);
});
