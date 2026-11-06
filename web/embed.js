// 플랫폼 공식 임베드 주소를 만든다. 브라우저와 Node 시험에서 함께 쓴다.
(function (root) {
  const SAFE_ID = /^[A-Za-z0-9_-]+$/;

  function embedFor(link) {
    if (!link || !SAFE_ID.test(link.id || '')) return null;
    const id = link.id;
    if (link.platform === 'youtube') {
      return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}?playsinline=1&rel=0`, ratio: '9/16' };
    }
    if (link.platform === 'instagram') {
      return { kind: 'iframe', src: `https://www.instagram.com/reel/${id}/embed/`, ratio: '9/16' };
    }
    if (link.platform === 'tiktok') {
      return { kind: 'iframe', src: `https://www.tiktok.com/embed/v2/${id}`, ratio: '9/16' };
    }
    return null;
  }

  if (typeof module !== 'undefined') module.exports = { embedFor };
  else root.embedFor = embedFor;
})(this);
