/* 스튜디오 전산실 — 사이트 화면
   내용은 모두 data/*.json 에서 읽어 옵니다. 관리자 모드는 admin.js 에 있습니다. */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  var ROOT = new URL('../../', SCRIPT.src).href; // assets/js/site.js 기준으로 사이트 루트
  var PAGE = document.body.getAttribute('data-page') || 'home';
  var SLUG = document.body.getAttribute('data-slug') || '';
  var PER_PAGE = 10;

  var S = { site: null, apps: [], cats: [], posts: [], videos: { playlists: [], videos: [] }, search: null };

  /* ---------- 작은 도구 ---------- */
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(n, arguments[i]);
    return n;
  }
  function add(n, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(n, x); }); return; }
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  function fill(n) { n.textContent = ''; for (var i = 1; i < arguments.length; i++) add(n, arguments[i]); return n; }
  function url(p) { return ROOT + (p || ''); }

  // 'site.home.intro', 'apps.ssulpuri.downloads.0.label' 같은 경로로 값 찾기
  function segs(key) { return key.split('.'); }
  function getPath(key) {
    var cur = S, parts = segs(key);
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = step(cur, parts[i]);
    }
    return cur;
  }
  function step(cur, p) {
    if (Array.isArray(cur) && !/^\d+$/.test(p)) {
      for (var i = 0; i < cur.length; i++) if (cur[i] && (cur[i].slug === p || cur[i].id === p)) return cur[i];
      return undefined;
    }
    return cur[p];
  }
  function setPath(key, val) {
    var parts = segs(key), cur = S;
    for (var i = 0; i < parts.length - 1; i++) cur = step(cur, parts[i]);
    if (cur) cur[parts[parts.length - 1]] = val;
  }
  // 수정 가능한 글귀: data-k 로 표시해 두면 관리자 모드에서 그 자리에서 고칠 수 있습니다
  function T(tag, key, cls, attrs) {
    var v = getPath(key);
    var a = Object.assign({ class: cls, 'data-k': key, text: v == null ? '' : String(v) }, attrs || {});
    return el(tag, a);
  }
  function has(key) { var v = getPath(key); return v != null && String(v).trim() !== ''; }

  function getJSON(p) {
    return fetch(url(p), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(p + ' ' + r.status);
      return r.json();
    });
  }
  function fmtDate(d) {
    if (!d) return '';
    var m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '.' + m[2] + '.' + m[3] : d;
  }
  function q(name) { return new URLSearchParams(location.search).get(name) || ''; }
  function setQuery(obj) {
    var sp = new URLSearchParams(location.search);
    for (var k in obj) { if (obj[k]) sp.set(k, obj[k]); else sp.delete(k); }
    var s = sp.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' '); }
  function catName(id) {
    for (var i = 0; i < S.cats.length; i++) if (S.cats[i].id === id) return S.cats[i].name;
    return '';
  }
  function ytId(s) {
    s = String(s || '').trim();
    if (!s) return '';
    var m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : '';
  }
  function thumb(id, size) { return 'https://i.ytimg.com/vi/' + id + '/' + (size || 'mqdefault') + '.jpg'; }
  function embed(id, opts) {
    var p = new URLSearchParams(Object.assign({ rel: '0', playsinline: '1', modestbranding: '1' }, opts || {}));
    return 'https://www.youtube-nocookie.com/embed/' + id + '?' + p.toString();
  }
  function videoById(id) {
    var v = S.videos.videos || [];
    for (var i = 0; i < v.length; i++) if (v[i].id === id) return v[i];
    return null;
  }

  /* 썰풀이 HTML을 안전하게 정리합니다 (스크립트, 이벤트 속성 제거) */
  function sanitizeHTML(html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    doc.querySelectorAll('script,object,embed,link,meta,base,form,frame,frameset,noscript').forEach(function (n) { n.remove(); });
    doc.querySelectorAll('iframe').forEach(function (n) {
      var src = n.getAttribute('src') || '';
      if (!/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//.test(src)) n.remove();
    });
    doc.body.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var nm = a.name.toLowerCase();
        if (nm.indexOf('on') === 0 || nm === 'contenteditable' || nm === 'srcdoc') n.removeAttribute(a.name);
        else if ((nm === 'href' || nm === 'src' || nm === 'xlink:href') && /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
      });
    });
    return doc.body.innerHTML;
  }
  function plainText(html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    doc.querySelectorAll('style,script').forEach(function (n) { n.remove(); });
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  // 글 안의 '/assets/...' 경로를 사이트 위치에 맞게 바꿉니다
  function fixAssetPaths(html) {
    return html
      .replace(/(\s(?:src|href)=["'])\/assets\//g, '$1' + ROOT + 'assets/')
      .replace(/url\((['"]?|&quot;)\/assets\//g, 'url($1' + ROOT + 'assets/');
  }

  /* ---------- 공통 틀 ---------- */
  function header() {
    var items = [['apps', 'apps/'], ['blog', 'blog/'], ['videos', 'videos/'], ['about', 'about/']];
    var cur = PAGE === 'app' ? 'apps' : PAGE === 'post' ? 'blog' : PAGE;
    var brand = el('a', { class: 'brand', href: url(''), 'aria-label': S.site.name + ' 홈' },
      el('span', { class: 'led led-red brand-led', 'aria-hidden': 'true' }),
      T('span', 'site.name', 'brand-name'));
    brandTaps(brand);
    return el('header', { class: 'top' },
      el('div', { class: 'wrap top-inner' }, brand,
        el('nav', { class: 'nav', 'aria-label': '주 메뉴' }, items.map(function (it) {
          return el('a', { href: url(it[1]), 'aria-current': cur === it[0] ? 'page' : null }, T('span', 'site.nav.' + it[0]));
        }))));
  }
  function footer() {
    return el('footer', { class: 'foot' },
      el('div', { class: 'wrap foot-inner' },
        T('span', 'site.footer', 'foot-copy'),
        linkRow('foot-links')));
  }
  function linkRow(cls) {
    var list = (S.site.links || []).filter(function (l) { return l.url; });
    return el('ul', { class: cls }, list.map(function (l) {
      return el('li', null, el('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label));
    }));
  }

  /* ---------- 홈 ---------- */
  function wave() {
    // 컴프레서 화면처럼: 슬레이트 블루 파형, 기준선을 넘는 봉우리만 붉게
    var W = 1000, H = 200, N = 200, seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    var v = [], base = 0.42;
    for (var i = 0; i < N; i++) {
      base += (rnd() - 0.5) * 0.08; base = Math.max(0.25, Math.min(0.6, base));
      var spike = rnd() > 0.9 ? rnd() * 0.42 : rnd() * 0.12;
      v.push(Math.min(0.97, base + spike));
    }
    var d = 'M0 ' + H;
    v.forEach(function (y, i) { d += ' L' + (i / (N - 1) * W).toFixed(1) + ' ' + (H - y * H).toFixed(1); });
    d += ' L' + W + ' ' + H + ' Z';
    var th = H - 0.66 * H;
    var NS = 'http://www.w3.org/2000/svg';
    function s(tag, a) { var n = document.createElementNS(NS, tag); for (var k in a) n.setAttribute(k, a[k]); return n; }
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', class: 'wave' + (rendered ? ' wave-still' : ''), 'aria-hidden': 'true', focusable: 'false' });
    var defs = s('defs', {});
    var cpTop = s('clipPath', { id: 'wv-top' }); cpTop.appendChild(s('rect', { x: 0, y: 0, width: W, height: th }));
    var cpReveal = s('clipPath', { id: 'wv-reveal' }); cpReveal.appendChild(s('rect', { class: 'wave-reveal', x: 0, y: 0, width: W, height: H }));
    defs.appendChild(cpTop); defs.appendChild(cpReveal); svg.appendChild(defs);
    var g = s('g', { 'clip-path': 'url(#wv-reveal)' });
    g.appendChild(s('path', { d: d, class: 'wave-body' }));
    g.appendChild(s('path', { d: d, class: 'wave-over', 'clip-path': 'url(#wv-top)' }));
    g.appendChild(s('line', { x1: 0, x2: W, y1: th, y2: th, class: 'wave-th' }));
    svg.appendChild(g);
    return svg;
  }
  function pageHome() {
    var featured = S.apps.filter(function (a) { return a.featured; });
    return el('main', { class: 'wrap home', id: 'main' },
      el('section', { class: 'hero' },
        wave(),
        T('h1', 'site.home.intro', 'intro')),
      featured.length ? el('ul', { class: 'home-apps' }, featured.map(function (a) {
        return el('li', null,
          el('a', { class: 'home-app', href: url('apps/' + a.slug + '/') },
            T('span', 'apps.' + a.slug + '.name', 'home-app-name'),
            el('span', { class: 'go', 'aria-hidden': 'true' })),
          T('p', 'apps.' + a.slug + '.tagline', 'home-app-tag'));
      })) : null);
  }

  /* ---------- Apps ---------- */
  function statusLed(a) {
    var live = a.status === 'live';
    return el('span', { class: 'status' },
      el('span', { class: 'led ' + (live ? 'led-green' : 'led-amber'), 'aria-hidden': 'true' }),
      T('span', live ? 'site.apps.statusLive' : 'site.apps.statusSoon'));
  }
  function pageApps() {
    return el('main', { class: 'wrap', id: 'main' },
      el('div', { class: 'page-head' },
        T('h1', 'site.apps.title', 'page-title'),
        T('p', 'site.apps.lead', 'lead')),
      el('ul', { class: 'app-list' }, S.apps.map(function (a) {
        var k = 'apps.' + a.slug + '.';
        return el('li', null, el('a', { class: 'app-row', href: url('apps/' + a.slug + '/') },
          el('span', { class: 'app-main' },
            T('span', k + 'name', 'app-name'),
            T('span', k + 'tagline', 'app-tag')),
          el('span', { class: 'app-side' },
            has(k + 'platforms') ? T('span', k + 'platforms', 'app-plat') : null,
            statusLed(a))));
      })));
  }
  function pageApp() {
    var a = getPath('apps.' + SLUG);
    if (!a) return notFound();
    document.title = a.name + ' · ' + S.site.name;
    var k = 'apps.' + a.slug + '.';
    var donate = (S.site.links || []).filter(function (l) { return /후원|donate/i.test(l.label) && l.url; })[0];
    var vid = ytId(a.video);
    return el('main', { class: 'wrap app-page', id: 'main' },
      el('a', { class: 'back', href: url('apps/') }, T('span', 'site.apps.back')),
      el('div', { class: 'page-head' },
        el('div', { class: 'app-title-row' }, T('h1', k + 'name', 'page-title'), statusLed(a)),
        T('p', k + 'tagline', 'lead')),
      (a.downloads || []).length ? el('div', { class: 'downloads' }, a.downloads.map(function (d, i) {
        var lab = T('span', k + 'downloads.' + i + '.label');
        return d.url
          ? el('a', { class: 'btn btn-primary', href: d.url, rel: 'noopener' }, lab)
          : el('span', { class: 'btn btn-off', 'aria-disabled': 'true', title: '아직 준비 중입니다' }, lab, el('small', { text: '준비 중' }));
      })) : null,
      (a.version || a.facts) ? el('p', { class: 'facts' },
        a.version ? el('span', null, '버전 ', T('span', k + 'version')) : null,
        a.version && a.facts ? ' · ' : null,
        a.facts ? T('span', k + 'facts') : null) : null,
      has(k + 'body') ? T('div', k + 'body', 'prose pre') : null,
      vid ? el('div', { class: 'player' }, el('iframe', { src: embed(vid), title: a.name + ' 영상', allow: 'encrypted-media; picture-in-picture; fullscreen', loading: 'lazy' })) : null,
      (a.screenshots || []).length ? el('div', { class: 'shots' }, a.screenshots.map(function (s) {
        var src = /^https?:/.test(s) ? s : url(String(s).replace(/^\//, ''));
        return el('img', { src: src, alt: a.name + ' 화면', loading: 'lazy' });
      })) : null,
      has(k + 'warning') ? el('section', { class: 'sec' },
        T('h2', k + 'warningTitle', 'sec-title'),
        T('p', k + 'warning', 'pre')) : null,
      (a.changelog || []).length ? el('section', { class: 'sec' },
        T('h2', k + 'changelogTitle', 'sec-title'),
        el('dl', { class: 'changes' }, a.changelog.map(function (c, i) {
          return el('div', { class: 'change' },
            el('dt', null, T('span', k + 'changelog.' + i + '.version', 'chg-ver'), T('span', k + 'changelog.' + i + '.date', 'chg-date')),
            el('dd', null, T('span', k + 'changelog.' + i + '.text')));
        }))) : null,
      (donate && a.donateButton) ? el('section', { class: 'sec donate' },
        T('span', k + 'donateText'),
        el('a', { class: 'btn', href: donate.url, target: '_blank', rel: 'noopener' }, T('span', k + 'donateButton'))) : null);
  }

  /* ---------- 검색과 페이지 넘김 (블로그, 영상 공통) ---------- */
  function searchBar(scope, query, onSearch) {
    var sel = el('select', { class: 'search-scope', 'aria-label': '검색 범위' },
      el('option', { value: 'title', text: S.site.search.scopeTitle }),
      el('option', { value: 'body', text: S.site.search.scopeBody }),
      el('option', { value: 'cat', text: S.site.search.scopeCategory }));
    sel.value = scope || 'title';
    var inp = el('input', { type: 'search', class: 'search-input', placeholder: S.site.search.placeholder, 'aria-label': '검색어', value: query || '' });
    var form = el('form', { class: 'search', role: 'search' }, sel, inp,
      el('button', { type: 'submit', class: 'btn btn-small', text: S.site.search.button }));
    form.addEventListener('submit', function (e) { e.preventDefault(); onSearch(sel.value, inp.value.trim()); });
    return form;
  }
  function pager(total, page, onGo) {
    var pages = Math.ceil(total / PER_PAGE);
    if (pages <= 1) return null;
    var nav = el('nav', { class: 'pager', 'aria-label': '페이지' });
    function btn(p, label, cur) {
      return el('button', { type: 'button', class: cur ? 'is-cur' : null, 'aria-current': cur ? 'page' : null, 'aria-label': label ? null : p + '쪽', onclick: function () { onGo(p); } }, label || String(p));
    }
    if (page > 1) nav.appendChild(btn(page - 1, '이전'));
    var start = Math.max(1, page - 3), end = Math.min(pages, start + 6);
    start = Math.max(1, end - 6);
    for (var p = start; p <= end; p++) nav.appendChild(btn(p, null, p === page));
    if (page < pages) nav.appendChild(btn(page + 1, '다음'));
    return nav;
  }
  function tabs(items, cur, onPick, label) {
    return el('div', { class: 'tabs', role: 'group', 'aria-label': label }, items.map(function (it) {
      return el('button', { type: 'button', class: 'tab' + (it.id === cur ? ' is-on' : ''), 'aria-pressed': it.id === cur ? 'true' : 'false', onclick: function () { onPick(it.id); } },
        it.key ? T('span', it.key) : it.name);
    }));
  }

  /* ---------- Blog ---------- */
  function sortedPosts() {
    return S.posts.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)); });
  }
  function pageBlog() {
    var st = { cat: q('cat'), q: q('q'), scope: q('scope') || 'title', page: parseInt(q('page'), 10) || 1 };
    var listBox = el('div', { class: 'list-box' });
    var catBox = el('div');
    var main = el('main', { class: 'wrap', id: 'main' },
      el('div', { class: 'page-head page-head-row' },
        el('div', null, T('h1', 'site.blog.title', 'page-title'), T('p', 'site.blog.lead', 'lead')),
        searchBar(st.scope, st.q, function (scope, query) {
          st.scope = scope; st.q = query; st.page = 1;
          if (scope === 'body' && query && !S.search) {
            getJSON('data/posts/search.json').then(function (j) { S.search = j; draw(); }).catch(function () { S.search = {}; draw(); });
          } else draw();
        })),
      catBox, listBox,
      has('site.brunchUrl') ? el('p', { class: 'more' }, el('a', { href: S.site.brunchUrl, target: '_blank', rel: 'noopener' }, T('span', 'site.blog.brunchAll'))) : null);

    function draw() {
      setQuery({ cat: st.cat, q: st.q, scope: st.q ? st.scope : '', page: st.page > 1 ? st.page : '' });
      fill(catBox, tabs([{ id: '', key: 'site.blog.all' }].concat(S.cats), st.cat, function (id) { st.cat = id; st.page = 1; draw(); }, '카테고리'));
      var list = sortedPosts().filter(function (p) { return !st.cat || p.category === st.cat; });
      if (st.q) {
        var n = norm(st.q);
        list = list.filter(function (p) {
          if (st.scope === 'cat') return norm(catName(p.category)).indexOf(n) >= 0;
          if (st.scope === 'body') return norm(p.title + ' ' + p.summary + ' ' + ((S.search || {})[p.id] || '')).indexOf(n) >= 0;
          return norm(p.title).indexOf(n) >= 0;
        });
      }
      var total = list.length;
      var pages = Math.max(1, Math.ceil(total / PER_PAGE));
      if (st.page > pages) st.page = pages;
      var slice = list.slice((st.page - 1) * PER_PAGE, st.page * PER_PAGE);
      fill(listBox, 
        total ? el('ol', { class: 'post-list' }, slice.map(postRow))
          : T('p', st.q ? 'site.blog.noResult' : 'site.blog.empty', 'empty'),
        pager(total, st.page, function (p) { st.page = p; draw(); main.scrollIntoView({ behavior: 'smooth' }); }));
    }
    if (st.scope === 'body' && st.q) getJSON('data/posts/search.json').then(function (j) { S.search = j; draw(); }).catch(draw);
    setTimeout(draw, 0);
    return main;
  }
  function postRow(p) {
    var link = p.type === 'link';
    var cn = catName(p.category);
    var a = el('a', link
      ? { class: 'post-row', href: p.url, target: '_blank', rel: 'noopener' }
      : { class: 'post-row', href: url('blog/post/?id=' + encodeURIComponent(p.id)) },
      el('span', { class: 'post-title' },
        cn ? el('span', { class: 'cat', text: '[' + cn + ']' }) : null,
        el('span', { text: p.title })),
      el('time', { class: 'post-date', datetime: p.date, text: fmtDate(p.date) }),
      p.summary ? el('span', { class: 'post-sum', text: p.summary }) : null,
      link ? el('span', { class: 'post-src' }, T('span', 'site.blog.brunchLabel'), el('span', { class: 'ext', 'aria-hidden': 'true', text: '↗' })) : null);
    return el('li', null, a);
  }
  function pagePost() {
    var id = q('id');
    var list = sortedPosts().filter(function (p) { return p.type !== 'link'; });
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) idx = i;
    var p = list[idx];
    if (!p) return notFound();
    document.title = p.title + ' · ' + S.site.name;
    var host = el('div', { class: 'post-body' });
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = '<p style="color:#8a857f;font:15px/1.6 sans-serif">불러오는 중…</p>';
    fetch(url('data/posts/' + encodeURIComponent(p.id) + '.html'), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (html) {
        root.innerHTML = '<style>:host{display:block}img,video{max-width:100%;height:auto}*{box-sizing:border-box}</style>' + fixAssetPaths(sanitizeHTML(html));
      })
      .catch(function () { root.innerHTML = '<p style="color:#8a857f;font:15px/1.6 sans-serif">글을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>'; });
    var newer = list[idx - 1], older = list[idx + 1];
    var cn = catName(p.category);
    return el('main', { class: 'wrap post-page', id: 'main' },
      el('a', { class: 'back', href: url('blog/' + (p.category ? '?cat=' + p.category : '')) }, T('span', 'site.blog.back')),
      el('header', { class: 'post-head' },
        el('h1', { class: 'post-h1' }, cn ? el('span', { class: 'cat', text: '[' + cn + ']' }) : null, el('span', { text: p.title })),
        el('p', { class: 'post-meta' }, fmtDate(p.date), ' · ', T('span', 'site.about.name'))),
      host,
      el('nav', { class: 'post-nav', 'aria-label': '다른 글' },
        older ? el('a', { class: 'pn pn-prev', href: url('blog/post/?id=' + encodeURIComponent(older.id)) }, T('span', 'site.blog.prev', 'pn-label'), el('span', { class: 'pn-title', text: older.title })) : el('span'),
        newer ? el('a', { class: 'pn pn-next', href: url('blog/post/?id=' + encodeURIComponent(newer.id)) }, T('span', 'site.blog.next', 'pn-label'), el('span', { class: 'pn-title', text: newer.title })) : el('span')));
  }

  /* ---------- Videos ---------- */
  function pageVideos() {
    var all = (S.videos.videos || []).slice().sort(function (a, b) { return String(b.published).localeCompare(String(a.published)); });
    var featured = ytId(S.site.videos.featured) || (all[0] && all[0].id) || '';
    var picks = (S.site.videos.picks || []).map(ytId).filter(Boolean).slice(0, 5);
    var st = { pl: q('pl'), q: q('q'), scope: q('scope') || 'title', page: parseInt(q('page'), 10) || 1 };
    var playerBox = el('div', { class: 'player player-hero' });
    var heroTitle = el('p', { class: 'hero-title' });
    function play(id, sound) {
      if (!id) { fill(playerBox, el('a', { class: 'player-empty', href: S.site.youtube.channelUrl, target: '_blank', rel: 'noopener' }, T('span', 'site.videos.empty'))); return; }
      var opts = sound ? { autoplay: '1' } : { autoplay: '1', mute: '1' };
      var v = videoById(id);
      fill(playerBox, el('iframe', { src: embed(id, opts), title: (v && v.title) || '유튜브 영상', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true }));
      heroTitle.textContent = v ? v.title : '';
    }
    function pick(id) { play(id, true); playerBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    play(featured, false);

    var listBox = el('div', { class: 'list-box' }), tabBox = el('div');
    function plName(id) { var p = (S.videos.playlists || []).filter(function (x) { return x.id === id; })[0]; return p ? p.title : ''; }
    function draw() {
      setQuery({ pl: st.pl, q: st.q, scope: st.q ? st.scope : '', page: st.page > 1 ? st.page : '' });
      var pls = (S.videos.playlists || []).map(function (p) { return { id: p.id, name: p.title }; });
      fill(tabBox, pls.length ? tabs([{ id: '', key: 'site.videos.all' }].concat(pls), st.pl, function (id) { st.pl = id; st.page = 1; draw(); }, '재생목록') : null);
      var list = all.filter(function (v) { return !st.pl || (v.playlists || []).indexOf(st.pl) >= 0; });
      if (st.q) {
        var n = norm(st.q);
        list = list.filter(function (v) {
          if (st.scope === 'cat') return (v.playlists || []).some(function (id) { return norm(plName(id)).indexOf(n) >= 0; });
          if (st.scope === 'body') return norm(v.title + ' ' + (v.description || '')).indexOf(n) >= 0;
          return norm(v.title).indexOf(n) >= 0;
        });
      }
      var total = list.length, pages = Math.max(1, Math.ceil(total / PER_PAGE));
      if (st.page > pages) st.page = pages;
      var slice = list.slice((st.page - 1) * PER_PAGE, st.page * PER_PAGE);
      fill(listBox, 
        total ? el('ol', { class: 'video-list' }, slice.map(function (v) {
          return el('li', null, el('button', { type: 'button', class: 'video-row', onclick: function () { pick(v.id); } },
            el('img', { src: thumb(v.id, 'default'), alt: '', loading: 'lazy', width: '72', height: '40' }),
            el('span', { class: 'video-title', text: v.title }),
            el('time', { class: 'post-date', datetime: v.published, text: fmtDate(v.published) })));
        })) : T('p', st.q ? 'site.videos.noResult' : 'site.videos.empty', 'empty'),
        pager(total, st.page, function (p) { st.page = p; draw(); }));
    }
    setTimeout(draw, 0);

    return el('main', { class: 'wrap', id: 'main' },
      el('div', { class: 'page-head page-head-row' },
        T('h1', 'site.videos.title', 'page-title'),
        searchBar(st.scope, st.q, function (scope, query) { st.scope = scope; st.q = query; st.page = 1; draw(); listBox.scrollIntoView({ behavior: 'smooth' }); })),
      playerBox, heroTitle,
      picks.length ? el('section', { class: 'sec' },
        T('h2', 'site.videos.picksTitle', 'sec-title'),
        el('ul', { class: 'picks' }, picks.map(function (id) {
          var v = videoById(id);
          return el('li', null, el('button', { type: 'button', class: 'pick', onclick: function () { pick(id); } },
            el('img', { src: thumb(id), alt: '', loading: 'lazy' }),
            el('span', { class: 'pick-title', text: v ? v.title : '' })));
        }))) : null,
      el('section', { class: 'sec' },
        T('h2', 'site.videos.listTitle', 'sec-title'),
        tabBox, listBox));
  }

  /* ---------- About ---------- */
  function pageAbout() {
    var a = 'site.about.';
    return el('main', { class: 'wrap about', id: 'main' },
      el('figure', { class: 'about-fig' }, el('img', { src: url('assets/img/hanchi.webp'), alt: '한치 캐릭터 그림. 3D 안경과 마스크를 쓴 사람', width: '900', height: '866' })),
      el('div', { class: 'about-text' },
        el('h1', { class: 'page-title' }, T('span', a + 'name'), el('span', { class: 'name-en' }, T('span', a + 'nameEn'))),
        T('p', a + 'body', 'prose pre'),
        has(a + 'history') ? T('p', a + 'history', 'prose pre muted') : null,
        has(a + 'lecture') ? el('div', { class: 'lecture' },
          T('span', a + 'lecture'),
          has(a + 'lectureUrl') ? el('a', { class: 'btn btn-small', href: S.site.about.lectureUrl, target: '_blank', rel: 'noopener' }, T('span', a + 'lectureButton')) : null) : null,
        linkRow('about-links')));
  }

  function notFound() {
    return el('main', { class: 'wrap', id: 'main' },
      el('div', { class: 'page-head' }, el('h1', { class: 'page-title', text: '페이지를 찾지 못했습니다' }),
        el('p', { class: 'lead' }, '주소가 바뀌었거나 지워진 페이지입니다. ', el('a', { href: url(''), text: '홈으로 가기' }))));
  }

  /* ---------- 그리기 ---------- */
  var PAGES = { home: pageHome, apps: pageApps, app: pageApp, blog: pageBlog, post: pagePost, videos: pageVideos, about: pageAbout, '404': notFound };
  var rendered = false;
  function render() {
    var app = document.getElementById('app');
    fill(app, 
      el('a', { class: 'skip', href: '#main', text: '본문 바로가기' }),
      header(), (PAGES[PAGE] || notFound)(), footer());
    if (PAGE === 'home' || PAGE === 'apps' || PAGE === 'about') document.title = PAGE === 'home' ? S.site.name : (getPath('site.nav.' + PAGE) + ' · ' + S.site.name);
    if (PAGE === 'blog' || PAGE === 'videos') document.title = getPath('site.nav.' + PAGE) + ' · ' + S.site.name;
    rendered = true;
    document.dispatchEvent(new CustomEvent('jss:render'));
  }

  /* ---------- 관리자 모드 열기: 코나미 커맨드, 또는 로고 5번 ---------- */
  var KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  var kpos = 0;
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    kpos = (k === KONAMI[kpos]) ? kpos + 1 : (k === KONAMI[0] ? 1 : 0);
    if (kpos === KONAMI.length) { kpos = 0; openAdmin(); }
  });
  function brandTaps(a) {
    var n = 0, t = null;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      n++;
      clearTimeout(t);
      if (n >= 5) { n = 0; openAdmin(); return; }
      t = setTimeout(function () { if (n === 1 && PAGE !== 'home') location.href = a.href; n = 0; }, 450);
    });
  }
  function loadAdmin(cb) {
    if (window.JSSAdmin) return cb();
    var s = document.createElement('script');
    s.src = ROOT + 'assets/js/admin.js?v=' + Date.now();
    s.onload = cb;
    s.onerror = function () { alert('관리자 모드를 불러오지 못했습니다.'); };
    document.head.appendChild(s);
  }
  function openAdmin() { loadAdmin(function () { window.JSSAdmin.open(); }); }

  /* admin.js 에서 쓰는 것들 */
  window.JSS = {
    ROOT: ROOT, PAGE: PAGE, SLUG: SLUG, S: S, render: render, el: el,
    getPath: getPath, setPath: setPath, sanitizeHTML: sanitizeHTML, plainText: plainText,
    fixAssetPaths: fixAssetPaths, ytId: ytId, thumb: thumb, catName: catName, fmtDate: fmtDate
  };

  /* ---------- 시작 ---------- */
  Promise.all([
    getJSON('data/site.json'),
    getJSON('data/apps.json').catch(function () { return []; }),
    getJSON('data/categories.json').catch(function () { return []; }),
    getJSON('data/posts/index.json').catch(function () { return []; }),
    (PAGE === 'videos' ? getJSON('data/videos.json') : Promise.resolve({ playlists: [], videos: [] })).catch(function () { return { playlists: [], videos: [] }; })
  ]).then(function (r) {
    S.site = r[0]; S.apps = r[1]; S.cats = r[2]; S.posts = r[3]; S.videos = r[4];
    render();
    try { if (sessionStorage.getItem('jss-admin') === '1') openAdmin(); } catch (e) {}
  }).catch(function (err) {
    document.getElementById('app').textContent = '사이트 내용을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    console.error(err);
  });
})();
