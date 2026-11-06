// 플랫폼 공식 임베드 주소를 만든다. 브라우저와 Node 시험에서 함께 쓴다.
// 자동 재생은 소리 없이만 브라우저가 허용한다. 인스타 임베드에는 자동 재생 설정이 없다.
(function (root) {
  const SAFE_ID = /^[A-Za-z0-9_-]+$/;

  function embedFor(link, opts) {
    if (!link || !SAFE_ID.test(link.id || '')) return null;
    const id = link.id;
    const auto = !!(opts && opts.autoplay);
    if (link.platform === 'youtube') {
      return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}?playsinline=1&rel=0${auto ? '&autoplay=1&mute=1' : ''}`, ratio: '9/16' };
    }
    if (link.platform === 'instagram') {
      return { kind: 'iframe', src: `https://www.instagram.com/reel/${id}/embed/`, ratio: '9/16' };
    }
    if (link.platform === 'tiktok') {
      return { kind: 'iframe', src: `https://www.tiktok.com/player/v1/${id}${auto ? '?autoplay=1&muted=1' : ''}`, ratio: '9/16' };
    }
    return null;
  }

  if (typeof module !== 'undefined') module.exports = { embedFor };
  else root.embedFor = embedFor;
})(this);
