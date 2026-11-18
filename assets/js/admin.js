/* 스튜디오 전산실 — 관리자 모드
   GitHub 토큰으로 사이트 저장소의 파일을 직접 고쳐 저장합니다.
   토큰은 이 기기의 브라우저에만 저장되고, 코드나 사이트에는 남지 않습니다. */
(function () {
  'use strict';
  var J = window.JSS, el = J.el, S = J.S;

  /* ---------- 설정 ---------- */
  var host = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  var OWNER = (S.site && S.site.repoOwner) || (host ? host[1] : 'jeonsansil');
  var REPO = (S.site && S.site.repoName) || (OWNER + '.github.io');
  var BRANCH = (S.site && S.site.repoBranch) || 'main';
  var LIMIT = 1024 * 1024 * 1024; // 1GB
  var API = 'https://api.github.com';
  var TK = 'jss-token', DRAFT = 'jss-draft';

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sess(v) { try { if (v) sessionStorage.setItem('jss-admin', '1'); else sessionStorage.removeItem('jss-admin'); } catch (e) {} }
  function token() { return load(TK); }

  /* ---------- 작은 도구 ---------- */
  function fill(n) { n.textContent = ''; for (var i = 1; i < arguments.length; i++) addKid(n, arguments[i]); return n; }
  function addKid(n, c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(function (x) { addKid(n, x); }); n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function kb(n) {
    if (n == null) return '-';
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + 'KB';
    if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + 'MB';
    return (n / 1073741824).toFixed(2) + 'GB';
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function rid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function btn(label, onclick, cls, attrs) { return el('button', Object.assign({ type: 'button', class: 'ja-btn ' + (cls || ''), onclick: onclick }, attrs || {}), label); }
  function field(label, input, hint) {
    return el('label', { class: 'ja-field' }, el('span', { class: 'ja-label', text: label }), input, hint ? el('span', { class: 'ja-hint', text: hint }) : null);
  }
  function input(val, attrs) { return el('input', Object.assign({ class: 'ja-in', value: val == null ? '' : val }, attrs || {})); }
  function area(val, attrs) { var t = el('textarea', Object.assign({ class: 'ja-in ja-area' }, attrs || {})); t.value = val == null ? '' : val; return t; }
  function toast(msg, kind) {
    var box = document.querySelector('.ja-toasts');
    if (!box) { box = el('div', { class: 'ja-toasts', 'aria-live': 'polite' }); document.body.appendChild(box); }
    var t = el('div', { class: 'ja-toast ' + (kind || ''), role: 'status', text: msg });
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, kind === 'err' ? 6000 : 3200);
    setTimeout(function () { t.remove(); }, kind === 'err' ? 6600 : 3800);
  }
  function errMsg(e) {
    var s = e && e.status;
    if (s === 401) return '토큰이 맞지 않거나 만료되었습니다. 설정에서 토큰을 다시 넣어 주세요.';
    if (s === 403) return '토큰에 권한이 부족합니다. Contents 권한이 "Read and write"인지 확인해 주세요.';
    if (s === 404) return '저장소를 찾지 못했습니다. 토큰이 ' + REPO + ' 저장소를 선택했는지 확인해 주세요.';
    if (s === 409 || s === 422) return '다른 곳에서 먼저 저장된 내용이 있습니다. 새로고침한 뒤 다시 저장해 주세요.';
    return '저장하지 못했습니다. ' + ((e && e.message) || '인터넷 연결을 확인해 주세요.');
  }

  /* ---------- 텍스트 ↔ base64 ---------- */
  function bytesToB64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function b64ToBytes(b64) {
    var s = atob(b64.replace(/\s+/g, '')), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function textToB64(t) { return bytesToB64(new TextEncoder().encode(t)); }
  function utf8Len(t) { return new TextEncoder().encode(t).length; }
  function sha(bytes) {
    return crypto.subtle.digest('SHA-256', bytes).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, 16);
    });
  }

  /* ---------- GitHub ---------- */
  function gh(method, path, body, accept) {
    return fetch(API + path, {
      method: method,
      headers: Object.assign({ Authorization: 'Bearer ' + token(), Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { var e = new Error(t.slice(0, 200)); e.status = r.status; throw e; });
      if (r.status === 204) return null;
      return accept && accept.indexOf('raw') >= 0 ? r : r.json();
    });
  }
  var R = '/repos/' + OWNER + '/' + REPO;
  function readText(path) {
    return gh('GET', R + '/contents/' + encodeURI(path) + '?ref=' + BRANCH, null, 'application/vnd.github.raw')
      .then(function (r) { return r.text(); })
      .catch(function (e) { if (e.status === 404) return null; throw e; });
  }
  function readBytes(path) {
    return gh('GET', R + '/contents/' + encodeURI(path) + '?ref=' + BRANCH, null, 'application/vnd.github.raw')
      .then(function (r) { return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); });
  }
  function readJSON(path, fallback) { return readText(path).then(function (t) { return t == null ? fallback : JSON.parse(t); }); }

  var treeCache = null;
  function tree(force) {
    if (treeCache && !force) return Promise.resolve(treeCache);
    return gh('GET', R + '/git/trees/' + BRANCH + '?recursive=1').then(function (t) {
      treeCache = {}; (t.tree || []).forEach(function (n) { if (n.type === 'blob') treeCache[n.path] = n; });
      return treeCache;
    });
  }
  // 여러 파일을 한 번에 저장(커밋 하나)
  function commit(changes, message, retried) {
    var refSha;
    return gh('GET', R + '/git/ref/heads/' + BRANCH)
      .then(function (ref) { refSha = ref.object.sha; return gh('GET', R + '/git/commits/' + refSha); })
      .then(function (c) {
        return Promise.all(changes.map(function (ch) {
          if (ch.delete) return Promise.resolve({ path: ch.path, mode: '100644', type: 'blob', sha: null });
          return gh('POST', R + '/git/blobs', { content: ch.b64 != null ? ch.b64 : textToB64(ch.text), encoding: 'base64' })
            .then(function (b) { return { path: ch.path, mode: '100644', type: 'blob', sha: b.sha }; });
        })).then(function (entries) { return gh('POST', R + '/git/trees', { base_tree: c.tree.sha, tree: entries }); });
      })
      .then(function (t) { return gh('POST', R + '/git/commits', { message: message, tree: t.sha, parents: [refSha] }); })
      .then(function (nc) { return gh('PATCH', R + '/git/refs/heads/' + BRANCH, { sha: nc.sha }); })
      .then(function () { treeCache = null; })
      .catch(function (e) {
        if (!retried && (e.status === 409 || e.status === 422) && /fast.?forward|Update is not/i.test(e.message)) return commit(changes, message, true);
        throw e;
      });
  }
  function json(o) { return JSON.stringify(o, null, 2) + '\n'; }
  function saved() { toast('저장했습니다. 1~2분 뒤 사이트에 반영됩니다.'); }

  /* ---------- 이미지 줄이기 ---------- */
  var MAX_SIDE = 1600;
  function shrink(bytes, mime) {
    // gif(움직이는 그림)와 svg는 건드리지 않습니다
    if (/gif|svg/.test(mime)) return Promise.resolve({ bytes: bytes, mime: mime });
    var blob = new Blob([bytes], { type: mime });
    return createImageBitmap(blob).then(function (bmp) {
      var w = bmp.width, h = bmp.height, k = Math.min(1, MAX_SIDE / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, 'image/webp', 0.82); });
    }).then(function (b) {
      if (!b || b.type !== 'image/webp') return { bytes: bytes, mime: mime };
      return b.arrayBuffer().then(function (ab) {
        var out = new Uint8Array(ab);
        return out.length < bytes.length * 0.9 ? { bytes: out, mime: 'image/webp' } : { bytes: bytes, mime: mime };
      });
    }).catch(function () { return { bytes: bytes, mime: mime }; });
  }
  // 이미 올린 이미지를 같은 형식으로 다시 줄입니다(주소가 바뀌지 않도록)
  function reshrink(bytes, mime) {
    if (/gif|svg/.test(mime)) return Promise.resolve(null);
    return createImageBitmap(new Blob([bytes], { type: mime })).then(function (bmp) {
      var w = bmp.width, h = bmp.height, k = Math.min(1, MAX_SIDE / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, mime, 0.8); });
    }).then(function (b) {
      if (!b || b.type !== mime) return null;
      return b.arrayBuffer().then(function (ab) { var o = new Uint8Array(ab); return o.length < bytes.length * 0.85 ? o : null; });
    }).catch(function () { return null; });
  }
  function extOf(mime) { return ({ 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' })[mime] || 'bin'; }
  function mimeOf(path) { var e = path.split('.').pop().toLowerCase(); return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' })[e] || ''; }

  // 글 안의 base64 이미지를 찾아 크기를 재고, 필요하면 줄입니다
  var DATA_RE = /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/gi;
  function analyze(html, doShrink) {
    var found = [], seen = {}, m;
    DATA_RE.lastIndex = 0;
    while ((m = DATA_RE.exec(html))) {
      var key = m[0];
      if (seen[key]) { seen[key].count++; continue; }
      var it = { uri: key, mime: m[1].toLowerCase(), b64: m[2], count: 1 };
      seen[key] = it; found.push(it);
    }
    return Promise.all(found.map(function (it) {
      it.bytes = b64ToBytes(it.b64);
      it.origSize = it.bytes.length;
      return (doShrink ? shrink(it.bytes, it.mime) : Promise.resolve({ bytes: it.bytes, mime: it.mime })).then(function (r) {
        it.out = r.bytes; it.outMime = r.mime;
        return sha(r.bytes).then(function (h) { it.path = 'assets/blog/' + h + '.' + extOf(r.mime); });
      });
    })).then(function () {
      var textOnly = html.replace(DATA_RE, '');
      return {
        images: found,
        pasted: utf8Len(html),
        text: utf8Len(textOnly),
        orig: found.reduce(function (s, i) { return s + i.origSize; }, 0),
        final: found.reduce(function (s, i) { return s + i.out.length; }, 0)
      };
    });
  }

  /* ---------- 화면 틀 ---------- */
  var bar, panel, body, tabsEl, curTab = 'posts', editing = false, dirty = {};
  function css() {
    if (document.getElementById('ja-css')) return;
    var s = document.createElement('style'); s.id = 'ja-css';
    s.textContent = [
      '.ja-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:90;display:flex;align-items:center;gap:6px;padding:6px 6px 6px 14px;background:#1B1A19;color:#F5F2EE;border-radius:999px;box-shadow:0 6px 24px rgba(27,26,25,.28);font:500 14px/1.2 var(--font);max-width:calc(100vw - 16px);flex-wrap:wrap;justify-content:center}',
      '.ja-bar .led{margin-right:4px}.ja-bar-t{margin-right:6px;white-space:nowrap}',
      '.ja-bar button{border:0;border-radius:999px;background:#33312F;color:#F5F2EE;padding:8px 13px;cursor:pointer;font:inherit}.ja-bar button:hover{background:#4a4744}',
      '.ja-bar .on{background:#C8211A}.ja-bar .on:hover{background:#A81B15}.ja-bar .save{background:#2FB24C;color:#10210f}.ja-bar .save:hover{background:#45c460}',
      'body.ja-editing [data-k]{outline:1px dashed rgba(200,33,26,.55);outline-offset:2px;border-radius:2px;cursor:text;min-width:1ch}',
      'body.ja-editing [data-k]:focus{outline:2px solid #C8211A;background:rgba(235,196,192,.35)}',
      'body.ja-editing [data-k].ja-dirty{background:rgba(235,196,192,.45)}',
      '.ja-panel{position:fixed;inset:0;z-index:95;display:flex;justify-content:flex-end;background:rgba(27,26,25,.32)}',
      '.ja-sheet{width:min(760px,100%);height:100%;background:#F5F2EE;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(27,26,25,.18);font:15px/1.55 var(--font);color:#1B1A19}',
      '.ja-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #D9D4CE;background:#EBE7E2}',
      '.ja-head h2{margin:0;font-size:17px;font-weight:600;display:flex;align-items:center;gap:10px}',
      '.ja-tabs{display:flex;gap:2px;padding:8px 12px;border-bottom:1px solid #D9D4CE;overflow-x:auto;background:#EBE7E2}',
      '.ja-tabs button{border:0;background:none;padding:8px 12px;border-radius:4px;cursor:pointer;white-space:nowrap;color:#5F5B56;font:inherit}.ja-tabs button:hover{background:#D6DAE0;color:#1B1A19}',
      '.ja-tabs button[aria-pressed=true]{background:#1B1A19;color:#F5F2EE}',
      '.ja-body{flex:1;overflow:auto;padding:20px 20px 120px}',
      '.ja-body h3{font-size:16px;margin:28px 0 10px;font-weight:600}.ja-body h3:first-child{margin-top:0}',
      '.ja-p{color:#5F5B56;margin:0 0 12px}',
      '.ja-btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:1px solid #1B1A19;background:transparent;border-radius:4px;cursor:pointer;font:inherit;font-size:14px;color:#1B1A19}',
      '.ja-btn:hover{background:#1B1A19;color:#F5F2EE}.ja-btn:disabled{opacity:.45;cursor:not-allowed;background:transparent;color:#1B1A19}',
      '.ja-btn.primary{background:#C8211A;border-color:#C8211A;color:#fff}.ja-btn.primary:hover{background:#A81B15}',
      '.ja-btn.ghost{border-color:#D9D4CE}.ja-btn.danger{border-color:#e3b5b1;color:#A81B15}.ja-btn.danger:hover{background:#A81B15;color:#fff}',
      '.ja-btn.tiny{min-height:30px;padding:0 9px;font-size:13px}',
      '.ja-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ja-row+.ja-row{margin-top:8px}',
      '.ja-field{display:flex;flex-direction:column;gap:4px;margin:0 0 14px}.ja-label{font-size:13px;font-weight:600;color:#5F5B56}.ja-hint{font-size:12px;color:#8C8781}',
      '.ja-in{width:100%;border:1px solid #D9D4CE;background:#fff;border-radius:4px;padding:8px 10px;font:inherit;font-size:14px}.ja-in:focus{outline:2px solid #C8211A;outline-offset:0;border-color:transparent}',
      '.ja-area{min-height:90px;resize:vertical}.ja-area.code{min-height:220px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}',
      '.ja-list{list-style:none;margin:0;padding:0;border-top:1px solid #D9D4CE}.ja-list li{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #D9D4CE}',
      '.ja-list .grow{flex:1;min-width:0}.ja-list .sub{display:block;font-size:12px;color:#8C8781}.ja-ellip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ja-box{border:1px solid #D9D4CE;border-radius:6px;padding:14px;background:#fff;margin:0 0 14px}.ja-box.warn{border-color:#E2A11B;background:#fdf7e8}.ja-box.bad{border-color:#e3b5b1;background:#fbefee}',
      '.ja-gauge{height:14px;border-radius:999px;background:#D6DAE0;overflow:hidden;margin:8px 0 6px}.ja-gauge i{display:block;height:100%;background:#2FB24C;border-radius:999px}',
      '.ja-gauge.mid i{background:#E2A11B}.ja-gauge.hi i{background:#C8211A}',
      '.ja-bars{display:grid;grid-template-columns:8.5rem 1fr 4.5rem;gap:6px 10px;align-items:center;font-size:14px}.ja-bars .b{height:8px;background:#D6DAE0;border-radius:999px;overflow:hidden}.ja-bars .b i{display:block;height:100%;background:#8C98B5}.ja-bars .n{text-align:right;color:#5F5B56;font-variant-numeric:tabular-nums}',
      '.ja-fs{border:1px solid #D9D4CE;border-radius:6px;padding:12px 12px 2px;margin:0 0 14px;background:rgba(255,255,255,.5)}.ja-fs>legend{font-size:13px;font-weight:600;padding:0 6px;color:#1B1A19}',
      '.ja-item{border-top:1px dashed #D9D4CE;padding-top:12px;margin-top:4px}.ja-item-tools{display:flex;gap:6px;justify-content:flex-end;margin:-4px 0 10px}',
      '.ja-preview{border:1px solid #D9D4CE;border-radius:6px;background:#fff;padding:8px;max-height:420px;overflow:auto;margin:0 0 14px}',
      '.ja-thumb{width:96px;aspect-ratio:16/9;object-fit:cover;border-radius:3px;background:#D6DAE0;flex:none}',
      '.ja-steps{margin:0 0 14px;padding-left:20px}.ja-steps li{margin:4px 0}.ja-steps b{font-weight:600}',
      '.ja-toast{background:#1B1A19;color:#F5F2EE;padding:10px 16px;border-radius:6px;font:14px/1.5 var(--font);box-shadow:0 6px 24px rgba(0,0,0,.2);transition:opacity .4s;max-width:calc(100vw - 24px)}',
      '.ja-toast.err{background:#A81B15}.ja-toast.out{opacity:0}',
      '.ja-chk{display:flex;gap:8px;align-items:flex-start;margin:0 0 12px;font-size:14px}.ja-chk input{margin-top:4px}',
      '.ja-busy{opacity:.55;pointer-events:none}',
      '.ja-sheet [hidden]{display:none!important}',
      '.ja-toasts{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;width:max-content;max-width:calc(100vw - 24px)}',
      '@media (max-width:720px){.ja-body{padding:16px 14px 120px}.ja-bars{grid-template-columns:6.5rem 1fr 4rem}.ja-bar{left:8px;right:8px;bottom:8px;transform:none;border-radius:14px;padding:6px;flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start}.ja-bar-t{display:none}.ja-bar .led{margin:0 4px 0 8px}.ja-bar button{white-space:nowrap;padding:9px 12px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function drawBar() {
    if (!bar) { bar = el('div', { class: 'ja-bar', role: 'toolbar', 'aria-label': '관리자 도구' }); document.body.appendChild(bar); }
    var n = Object.keys(dirty).length;
    fill(bar,
      el('span', { class: 'led led-red', 'aria-hidden': 'true' }),
      el('span', { class: 'ja-bar-t', text: '관리자 모드' }),
      el('button', { type: 'button', class: editing ? 'on' : '', 'aria-pressed': editing ? 'true' : 'false', onclick: toggleEdit }, editing ? '문구 수정 끄기' : '문구 수정'),
      n ? el('button', { type: 'button', class: 'save', onclick: saveInline }, '변경 ' + n + '개 저장') : null,
      n ? el('button', { type: 'button', onclick: cancelInline }, '취소') : null,
      el('button', { type: 'button', onclick: function () { openPanel('posts', true); } }, '새 글'),
      el('button', { type: 'button', onclick: function () { openPanel(curTab); } }, '관리판'),
      el('button', { type: 'button', onclick: exit, 'aria-label': '관리자 모드 나가기' }, '나가기'));
  }

  /* ---------- 그 자리에서 문구 고치기 ---------- */
  function markEditable(root) {
    (root || document).querySelectorAll('[data-k]').forEach(function (n) {
      if (!editing) { n.removeAttribute('contenteditable'); return; }
      try { n.contentEditable = 'plaintext-only'; } catch (e) { n.contentEditable = 'true'; }
      if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
      n.spellcheck = false;
      var k = n.getAttribute('data-k');
      if (dirty[k] != null) { n.textContent = dirty[k]; n.classList.add('ja-dirty'); }
    });
  }
  var mo = new MutationObserver(function (list) {
    if (!editing) return;
    list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) markEditable(n.parentNode || n); }); });
  });
  function toggleEdit() {
    editing = !editing;
    document.body.classList.toggle('ja-editing', editing);
    markEditable();
    if (editing) { mo.observe(document.getElementById('app'), { childList: true, subtree: true }); toast('점선으로 표시된 글귀를 눌러 바로 고칠 수 있습니다. 수정 중에는 링크가 열리지 않습니다.'); }
    else mo.disconnect();
    drawBar();
  }
  document.addEventListener('input', function (e) {
    var n = e.target.closest && e.target.closest('[data-k]');
    if (!editing || !n) return;
    var k = n.getAttribute('data-k');
    dirty[k] = n.innerText.replace(/\n$/, '');
    // 같은 글귀가 화면 여러 곳에 있으면 함께 바꿉니다
    document.querySelectorAll('[data-k="' + k + '"]').forEach(function (o) { if (o !== n) o.textContent = dirty[k]; o.classList.add('ja-dirty'); });
    n.classList.add('ja-dirty');
    drawBar();
  }, true);
  document.addEventListener('click', function (e) {
    if (!editing) return;
    var n = e.target.closest && e.target.closest('[data-k]');
    if (n && n.closest('a,button')) { e.preventDefault(); e.stopPropagation(); n.focus(); }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!editing) return;
    var n = e.target.closest && e.target.closest('[data-k]');
    if (n && e.key === 'Enter' && !/^(DIV|P|H1)$/.test(n.tagName)) { e.preventDefault(); n.blur(); }
  }, true);
  function saveInline() {
    var keys = Object.keys(dirty);
    if (!keys.length) return;
    var touchSite = false, touchApps = false, touchSounds = false;
    var site = clone(S.site), apps = clone(S.apps), sounds = clone(S.sounds || []);
    var tmp = { site: site, apps: apps, sounds: sounds };
    keys.forEach(function (k) {
      if (k.indexOf('site.') === 0) touchSite = true;
      if (k.indexOf('apps.') === 0) touchApps = true;
      if (k.indexOf('sounds.') === 0) touchSounds = true;
      var parts = k.split('.'), cur = tmp;
      for (var i = 0; i < parts.length - 1; i++) cur = stepIn(cur, parts[i]);
      if (cur) cur[parts[parts.length - 1]] = dirty[k];
    });
    var ch = [];
    if (touchSite) ch.push({ path: 'data/site.json', text: json(site) });
    if (touchApps) ch.push({ path: 'data/apps.json', text: json(apps) });
    if (touchSounds) ch.push({ path: 'data/sounds.json', text: json(sounds) });
    bar.classList.add('ja-busy');
    commit(ch, '문구 수정 (' + keys.length + '곳)').then(function () {
      S.site = site; S.apps = apps; S.sounds = sounds;
      dirty = {}; bar.classList.remove('ja-busy');
      document.querySelectorAll('.ja-dirty').forEach(function (n) { n.classList.remove('ja-dirty'); });
      drawBar(); saved();
    }).catch(function (e) { bar.classList.remove('ja-busy'); toast(errMsg(e), 'err'); });
  }
  function stepIn(cur, p) {
    if (Array.isArray(cur) && !/^\d+$/.test(p)) { for (var i = 0; i < cur.length; i++) if (cur[i].slug === p || cur[i].id === p) return cur[i]; return null; }
    return cur ? cur[p] : null;
  }
  function cancelInline() { dirty = {}; J.render(); markEditable(); drawBar(); }

  /* ---------- 관리판 ---------- */
  var TABS = [['posts', '글'], ['cats', '카테고리'], ['videos', '영상'], ['apps', '앱'], ['sounds', 'Sounds'], ['site', '사이트 문구'], ['storage', '저장공간'], ['settings', '설정']];
  function openPanel(tab, newPost) {
    if (!panel) {
      panel = el('div', { class: 'ja-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '관리판' });
      panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });
      panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
    }
    curTab = tab || curTab;
    tabsEl = el('div', { class: 'ja-tabs', role: 'tablist' });
    body = el('div', { class: 'ja-body' });
    fill(panel, el('div', { class: 'ja-sheet' },
      el('div', { class: 'ja-head' },
        el('h2', null, el('span', { class: 'led led-red', 'aria-hidden': 'true' }), '관리판'),
        btn('닫기', closePanel, 'ghost tiny')),
      tabsEl, body));
    document.body.appendChild(panel);
    document.body.style.overflow = 'hidden';
    if (!token()) { fill(tabsEl); return drawLogin(); }
    drawTabs();
    show(curTab, newPost);
  }
  function closePanel() { if (panel) panel.remove(); document.body.style.overflow = ''; }
  function drawTabs() {
    fill(tabsEl, TABS.map(function (t) {
      return el('button', { type: 'button', 'aria-pressed': curTab === t[0] ? 'true' : 'false', onclick: function () { show(t[0]); } }, t[1]);
    }));
  }
  function show(tab, arg) {
    curTab = tab; drawTabs(); body.scrollTop = 0;
    ({ posts: tabPosts, cats: tabCats, videos: tabVideos, apps: tabApps, sounds: tabSounds, site: tabSite, storage: tabStorage, settings: tabSettings })[tab](arg);
  }

  /* ---------- 토큰 입력 ---------- */
  function tokenGuide() {
    return el('ol', { class: 'ja-steps' },
      el('li', null, 'github.com에 로그인한 뒤, 오른쪽 위 프로필 사진 → ', el('b', { text: 'Settings' })),
      el('li', null, '왼쪽 맨 아래 ', el('b', { text: 'Developer settings' }), ' → ', el('b', { text: 'Personal access tokens' }), ' → ', el('b', { text: 'Fine-grained tokens' }), ' → ', el('b', { text: 'Generate new token' })),
      el('li', null, el('b', { text: 'Token name' }), ': 아무 이름(예: 전산실 관리자), ', el('b', { text: 'Expiration' }), ': 1년'),
      el('li', null, el('b', { text: 'Resource owner' }), ': ', el('b', { text: OWNER }), ' 선택'),
      el('li', null, el('b', { text: 'Repository access' }), ': Only select repositories → ', el('b', { text: REPO })),
      el('li', null, el('b', { text: 'Permissions' }), '에서 ', el('b', { text: 'Contents' }), '와 ', el('b', { text: 'Actions' }), '를 ', el('b', { text: 'Read and write' }), '로 바꿉니다'),
      el('li', null, '맨 아래 ', el('b', { text: 'Generate token' }), ' → 나온 긴 글자를 복사해 아래 칸에 붙여 넣습니다'));
  }
  function drawLogin() {
    var inp = input('', { type: 'password', placeholder: 'github_pat_... 로 시작하는 글자', autocomplete: 'off', 'aria-label': 'GitHub 토큰' });
    var msg = el('p', { class: 'ja-p' });
    var go = btn('확인', function () {
      var t = inp.value.trim(); if (!t) return;
      store(TK, t); go.disabled = true; msg.textContent = '확인하는 중…';
      gh('GET', R).then(function () {
        toast('토큰을 확인했습니다. 이 기기에서는 다시 넣지 않아도 됩니다.');
        refresh().then(function () { drawTabs(); show('posts'); });
      }).catch(function (e) { store(TK, null); go.disabled = false; msg.textContent = errMsg(e); });
    }, 'primary');
    fill(body,
      el('h3', { text: '처음 한 번, 토큰을 넣어 주세요' }),
      el('p', { class: 'ja-p', text: '토큰은 이 사이트 저장소를 고칠 수 있는 열쇠입니다. 이 기기의 브라우저에만 저장되고, 다른 사람에게 보내면 안 됩니다. 휴대폰에서도 한 번 넣어 두면 됩니다.' }),
      tokenGuide(),
      el('div', { class: 'ja-box warn' }, el('p', { class: 'ja-p', style: 'margin:0', text: 'Resource owner 목록에 ' + OWNER + '가 없으면: ' + OWNER + ' 조직 페이지 → Settings → Personal access tokens에서 Fine-grained 토큰 사용을 허용해 주세요.' })),
      field('토큰', inp), el('div', { class: 'ja-row' }, go), msg);
    if (window.innerWidth > 720) inp.focus();
  }

  /* ---------- 최신 내용 다시 읽기 ---------- */
  function refresh() {
    return Promise.all([
      readJSON('data/site.json', S.site), readJSON('data/apps.json', []), readJSON('data/categories.json', []),
      readJSON('data/posts/index.json', []), readJSON('data/videos.json', { playlists: [], videos: [] }), readJSON('data/sounds.json', [])
    ]).then(function (r) {
      S.site = J.withDefaults(r[0], J.DEFAULTS); S.apps = r[1]; S.cats = r[2]; S.posts = r[3]; S.videos = r[4]; S.sounds = r[5];
      J.render(); markEditable();
    }).catch(function (e) { toast(errMsg(e), 'err'); });
  }

  /* ---------- 글 ---------- */
  function sorted() { return S.posts.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }); }
  function tabPosts(newPost) {
    if (newPost === true) return editPost(null);
    var list = sorted();
    fill(body,
      el('div', { class: 'ja-row', style: 'justify-content:space-between;margin-bottom:12px' },
        el('strong', { text: '글 ' + list.length + '편' }),
        btn('새 글 쓰기', function () { editPost(null); }, 'primary')),
      list.length ? el('ul', { class: 'ja-list' }, list.map(function (p) {
        return el('li', null,
          el('span', { class: 'grow' },
            el('span', { class: 'ja-ellip', style: 'display:block' }, J.catName(p.category) ? '[' + J.catName(p.category) + '] ' : '', p.title),
            el('span', { class: 'sub' }, J.fmtDate(p.date) + ' · ' + (p.type === 'link' ? '브런치 링크' : '사이트 글' + (p.size ? ' · ' + kb(p.size) : '')))),
          btn('수정', function () { editPost(p); }, 'tiny'),
          btn('삭제', function () { delPost(p); }, 'danger tiny'));
      })) : el('p', { class: 'ja-p', text: '아직 글이 없습니다. 새 글 쓰기를 눌러 시작하세요.' }));
  }
  function delPost(p) {
    if (!confirm('"' + p.title + '" 글을 지울까요? 되돌릴 수 없습니다.')) return;
    var posts = S.posts.filter(function (x) { return x.id !== p.id; });
    var ch = [{ path: 'data/posts/index.json', text: json(posts) }];
    var job = Promise.resolve();
    if (p.type !== 'link') {
      job = Promise.all([readJSON('data/posts/search.json', {}), tree()]).then(function (r) {
        delete r[0][p.id];
        ch.push({ path: 'data/posts/search.json', text: json(r[0]) });
        if (r[1]['data/posts/' + p.id + '.html']) ch.push({ path: 'data/posts/' + p.id + '.html', delete: true });
      });
    }
    job.then(function () { return commit(ch, '글 삭제: ' + p.title); })
      .then(function () { S.posts = posts; J.render(); markEditable(); tabPosts(); saved(); })
      .catch(function (e) { toast(errMsg(e), 'err'); });
  }
  function editPost(p) {
    var isNew = !p;
    var draft = null;
    try { draft = JSON.parse(load(DRAFT) || 'null'); } catch (e) {}
    var d = p ? clone(p) : { id: '', type: 'html', title: '', summary: '', category: '', date: today(), url: '', images: [] };
    var html = '';
    var typeSel = el('select', { class: 'ja-in' }, el('option', { value: 'html', text: '썰풀이 HTML (사이트에서 읽는 글)' }), el('option', { value: 'link', text: '브런치 링크 (브런치로 이동)' }));
    var catSel = el('select', { class: 'ja-in' }, el('option', { value: '', text: '카테고리 없음' }), S.cats.map(function (c) { return el('option', { value: c.id, text: c.name }); }));
    var title = input(d.title, { placeholder: '글 제목' });
    var sum = input(d.summary, { placeholder: '목록에 보일 한 줄 소개 (비워도 됩니다)' });
    var date = input(d.date, { type: 'date' });
    var link = input(d.url, { type: 'url', placeholder: 'https://brunch.co.kr/@jeonsansil/...' });
    var code = area('', { class: 'ja-in ja-area code', placeholder: '썰풀이에서 복사한 HTML을 그대로 붙여 넣으세요', spellcheck: 'false' });
    var shrinkChk = el('input', { type: 'checkbox', checked: true });
    var sizeBox = el('div', { class: 'ja-box' }, el('p', { class: 'ja-p', style: 'margin:0', text: 'HTML을 붙여 넣으면 용량을 알려 드립니다.' }));
    var prev = el('div', { class: 'ja-preview', hidden: true });
    var linkWrap = field('브런치 글 주소', link);
    var htmlWrap = el('div', null,
      field('본문 (썰풀이 HTML)', code, '이미지는 저장할 때 따로 떼어 파일로 올립니다. 글이 가벼워집니다.'),
      el('label', { class: 'ja-chk' }, shrinkChk, el('span', null, '큰 이미지는 화질을 거의 유지한 채 줄여서 올리기 (권장)')),
      sizeBox, prev);
    typeSel.value = d.type; catSel.value = d.category || '';
    var analysis = null, aTimer = null;

    function sync() { var t = typeSel.value; linkWrap.hidden = t !== 'html' ? false : true; htmlWrap.hidden = t !== 'html'; }
    typeSel.addEventListener('change', sync);
    function runAnalyze() {
      clearTimeout(aTimer);
      aTimer = setTimeout(function () {
        var h = code.value;
        if (!title.value.trim()) {
          var m = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          if (m) title.value = J.plainText(m[1]).replace(/\.{2,}$/, '').trim();
        }
        if (!h.trim()) { analysis = null; fill(sizeBox, el('p', { class: 'ja-p', style: 'margin:0', text: 'HTML을 붙여 넣으면 용량을 알려 드립니다.' })); sizeBox.className = 'ja-box'; return; }
        fill(sizeBox, el('p', { class: 'ja-p', style: 'margin:0', text: '용량을 계산하는 중…' }));
        analyze(h, shrinkChk.checked).then(function (a) {
          analysis = a;
          var total = a.text + a.final;
          var lines = [];
          if (!a.images.length) lines.push('이미지가 없는 글입니다. 저장 용량은 ' + kb(a.text) + '입니다.');
          else {
            lines.push('이미지 ' + a.images.length + '개가 들어 있습니다. 붙여 넣은 그대로는 ' + kb(a.pasted) + '입니다.');
            lines.push('이미지를 파일로 떼어 내면 글은 ' + kb(a.text) + ', 이미지는 ' + kb(a.orig) + '입니다.');
            if (shrinkChk.checked && a.final < a.orig) lines.push('줄여서 올리면 이미지가 ' + kb(a.final) + '가 되어, 모두 ' + kb(total) + '입니다.');
            else if (!shrinkChk.checked && a.orig > 300 * 1024) lines.push('위 체크를 켜면 더 작게 올릴 수 있습니다.');
          }
          sizeBox.className = 'ja-box' + (total > 2 * 1048576 ? ' bad' : total > 800 * 1024 ? ' warn' : '');
          fill(sizeBox, lines.map(function (l, i) { return el('p', { class: 'ja-p', style: 'margin:' + (i ? '4px 0 0' : '0'), text: l }); }));
        });
      }, 350);
    }
    code.addEventListener('input', runAnalyze);
    shrinkChk.addEventListener('change', runAnalyze);

    function collect() { return { type: typeSel.value, category: catSel.value, title: title.value.trim(), summary: sum.value.trim(), date: date.value || today(), url: link.value.trim(), html: code.value }; }
    function preview() {
      var h = code.value;
      prev.hidden = !h.trim();
      if (prev.hidden) return;
      var root = prev.shadowRoot || prev.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>img{max-width:100%;height:auto}</style>' + J.fixAssetPaths(J.sanitizeHTML(h));
    }
    function saveDraft() { var c = collect(); c.editing = p ? p.id : ''; store(DRAFT, JSON.stringify(c)); toast('이 기기에 임시저장했습니다. 사이트에는 아직 올라가지 않았습니다.'); }
    function publish() {
      var c = collect();
      if (!c.title) { toast('제목을 넣어 주세요.', 'err'); title.focus(); return; }
      if (c.type === 'link' && !/^https?:\/\//.test(c.url)) { toast('브런치 글 주소를 넣어 주세요.', 'err'); link.focus(); return; }
      if (c.type === 'html' && !c.html.trim()) { toast('본문 HTML을 붙여 넣어 주세요.', 'err'); code.focus(); return; }
      saveBtn.disabled = true; saveBtn.textContent = '저장하는 중…';
      var id = p ? p.id : 'p-' + c.date.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7);
      var entry = { id: id, type: c.type, title: c.title, summary: c.summary, category: c.category, date: c.date, url: c.type === 'link' ? c.url : '', images: [], size: 0 };
      var job;
      if (c.type === 'link') {
        var ch = [];
        job = (p && p.type !== 'link') ? tree().then(function (t) { if (t['data/posts/' + id + '.html']) ch.push({ path: 'data/posts/' + id + '.html', delete: true }); return ch; }) : Promise.resolve(ch);
      } else {
        job = Promise.all([analysis ? Promise.resolve(analysis) : analyze(c.html, shrinkChk.checked), tree(), readJSON('data/posts/search.json', {})]).then(function (r) {
          var a = r[0], t = r[1], search = r[2];
          var h = c.html, ch = [];
          a.images.forEach(function (im) {
            h = h.split(im.uri).join('/assets/' + im.path.slice('assets/'.length));
            if (!t[im.path]) ch.push({ path: im.path, b64: bytesToB64(im.out) });
          });
          h = J.sanitizeHTML(h);
          var refs = {}; (h.match(/\/assets\/blog\/[A-Za-z0-9._-]+/g) || []).forEach(function (x) { refs[x.slice(1)] = 1; });
          entry.images = Object.keys(refs);
          entry.size = utf8Len(h) + entry.images.reduce(function (s, pth) {
            var im = a.images.filter(function (i) { return i.path === pth; })[0];
            return s + (im ? im.out.length : (t[pth] ? t[pth].size : 0));
          }, 0);
          search[id] = (c.title + ' ' + J.plainText(h)).slice(0, 20000);
          ch.push({ path: 'data/posts/' + id + '.html', text: h });
          ch.push({ path: 'data/posts/search.json', text: json(search) });
          return ch;
        });
      }
      job.then(function (ch) {
        var posts = S.posts.filter(function (x) { return x.id !== id; }).concat([entry]);
        ch.push({ path: 'data/posts/index.json', text: json(posts) });
        return commit(ch, (isNew ? '새 글: ' : '글 수정: ') + c.title).then(function () { S.posts = posts; });
      }).then(function () {
        var dr = null; try { dr = JSON.parse(load(DRAFT) || 'null'); } catch (e) {}
        if (dr && (dr.editing || '') === (p ? p.id : '')) store(DRAFT, null);
        J.render(); markEditable(); saved(); tabPosts();
      }).catch(function (e) { saveBtn.disabled = false; saveBtn.textContent = '공개 저장'; toast(errMsg(e), 'err'); });
    }
    var saveBtn = btn('공개 저장', publish, 'primary');
    var draftNote = null;
    if (draft && (draft.editing || '') === (p ? p.id : '')) {
      draftNote = el('div', { class: 'ja-box warn' }, el('div', { class: 'ja-row' },
        el('span', { class: 'grow', style: 'flex:1', text: '이 기기에 임시저장한 글이 있습니다' + (draft.title ? ' ("' + draft.title + '")' : '') + '.' }),
        btn('불러오기', function () {
          typeSel.value = draft.type || 'html'; catSel.value = draft.category || ''; title.value = draft.title || ''; sum.value = draft.summary || '';
          date.value = draft.date || today(); link.value = draft.url || ''; code.value = draft.html || '';
          sync(); runAnalyze(); draftNote.remove();
        }, 'tiny'),
        btn('지우기', function () { store(DRAFT, null); draftNote.remove(); }, 'ghost tiny')));
    }
    fill(body,
      el('div', { class: 'ja-row', style: 'justify-content:space-between;margin-bottom:14px' },
        el('strong', { text: isNew ? '새 글 쓰기' : '글 수정' }),
        btn('목록으로', function () { tabPosts(); }, 'ghost tiny')),
      draftNote,
      field('종류', typeSel), field('카테고리', catSel, '카테고리는 "카테고리" 탭에서 추가하거나 바꿀 수 있습니다.'),
      field('제목', title, '비워 두면 썰풀이 글의 제목을 가져옵니다.'), field('한 줄 소개', sum), field('날짜', date),
      linkWrap, htmlWrap,
      el('div', { class: 'ja-row' }, btn('미리보기', preview, 'ghost'), btn('임시저장', saveDraft, 'ghost'), saveBtn));
    sync();
    if (p && p.type !== 'link') {
      code.disabled = true; code.value = '불러오는 중…';
      readText('data/posts/' + p.id + '.html').then(function (h) { code.disabled = false; code.value = h || ''; html = h; runAnalyze(); })
        .catch(function (e) { code.disabled = false; code.value = ''; toast(errMsg(e), 'err'); });
    }
  }

  /* ---------- 카테고리 ---------- */
  function tabCats() {
    var cats = clone(S.cats);
    var listEl = el('ul', { class: 'ja-list' });
    function count(id) { return S.posts.filter(function (p) { return p.category === id; }).length; }
    function draw() {
      fill(listEl, cats.map(function (c, i) {
        var inp = input(c.name, { 'aria-label': '카테고리 이름' });
        inp.addEventListener('input', function () { c.name = inp.value; });
        return el('li', null, el('span', { class: 'grow' }, inp),
          el('span', { class: 'sub', style: 'white-space:nowrap', text: count(c.id) + '편' }),
          btn('위로', function () { if (i) { cats.splice(i - 1, 0, cats.splice(i, 1)[0]); draw(); } }, 'ghost tiny', { disabled: !i, 'aria-label': c.name + ' 위로' }),
          btn('아래로', function () { if (i < cats.length - 1) { cats.splice(i + 1, 0, cats.splice(i, 1)[0]); draw(); } }, 'ghost tiny', { disabled: i === cats.length - 1, 'aria-label': c.name + ' 아래로' }),
          btn('삭제', function () {
            var n = count(c.id);
            if (n && !confirm('"' + c.name + '"에 글이 ' + n + '편 있습니다. 지우면 그 글들은 "카테고리 없음"이 됩니다. 지울까요?')) return;
            cats.splice(i, 1); draw();
          }, 'danger tiny'));
      }));
    }
    var newIn = input('', { placeholder: '새 카테고리 이름 (예: 음반 이야기)' });
    function addCat() { var v = newIn.value.trim(); if (!v) return; cats.push({ id: rid('c-'), name: v }); newIn.value = ''; draw(); }
    newIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addCat(); } });
    draw();
    fill(body,
      el('h3', { text: '블로그 카테고리 (말머리)' }),
      el('p', { class: 'ja-p', text: '여기 순서대로 블로그 위쪽 버튼이 보입니다. 이름을 바꿔도 글에 붙은 카테고리는 그대로 따라옵니다.' }),
      listEl,
      el('div', { class: 'ja-row', style: 'margin:14px 0 20px' }, el('span', { style: 'flex:1;min-width:12rem' }, newIn), btn('추가', addCat)),
      el('div', { class: 'ja-row' }, btn('저장', function () {
        var ids = {}; cats.forEach(function (c) { ids[c.id] = 1; c.name = c.name.trim() || '이름 없음'; });
        var posts = clone(S.posts), changed = false;
        posts.forEach(function (p) { if (p.category && !ids[p.category]) { p.category = ''; changed = true; } });
        var ch = [{ path: 'data/categories.json', text: json(cats) }];
        if (changed) ch.push({ path: 'data/posts/index.json', text: json(posts) });
        commit(ch, '카테고리 수정').then(function () { S.cats = cats; S.posts = posts; J.render(); markEditable(); saved(); tabCats(); })
          .catch(function (e) { toast(errMsg(e), 'err'); });
      }, 'primary')));
  }

  /* ---------- 영상 ---------- */
  function tabVideos() {
    var v = clone(S.site.videos || {});
    v.picks = (v.picks || []).concat(['', '', '', '', '']).slice(0, 5);
    function vrow(val, label, onChange) {
      var img = el('img', { class: 'ja-thumb', alt: '' });
      var ttl = el('span', { class: 'sub ja-ellip' });
      var inp = input(val, { placeholder: '유튜브 주소 또는 영상 ID', 'aria-label': label });
      function upd() {
        var id = J.ytId(inp.value);
        img.src = id ? J.thumb(id) : 'data:,'; img.style.visibility = id ? 'visible' : 'hidden';
        var vv = id && (S.videos.videos || []).filter(function (x) { return x.id === id; })[0];
        ttl.textContent = inp.value && !id ? '주소를 알아보지 못했습니다' : (vv ? vv.title : '');
        onChange(id || '');
      }
      inp.addEventListener('input', upd); upd();
      return { node: el('div', { class: 'ja-row', style: 'flex-wrap:nowrap;margin-bottom:10px' }, img, el('span', { style: 'flex:1;min-width:0' }, el('span', { class: 'ja-label', style: 'display:block;margin-bottom:4px', text: label }), inp, ttl)), set: function (id) { inp.value = id; upd(); } };
    }
    var feat = vrow(v.featured, '대표 영상 (가장 크게, 자동재생)', function (id) { v.featured = id; });
    var picks = v.picks.map(function (p, i) { return vrow(p, '추천 영상 ' + (i + 1), function (id) { v.picks[i] = id; }); });
    var all = (S.videos.videos || []).slice().sort(function (a, b) { return String(b.published).localeCompare(String(a.published)); });
    var qIn = input('', { type: 'search', placeholder: '영상 제목으로 찾기' });
    var listEl = el('ul', { class: 'ja-list' });
    function drawList() {
      var n = qIn.value.trim().toLowerCase();
      var rows = all.filter(function (x) { return !n || x.title.toLowerCase().indexOf(n) >= 0; }).slice(0, 30);
      fill(listEl, rows.map(function (x) {
        return el('li', null, el('img', { class: 'ja-thumb', src: J.thumb(x.id, 'default'), alt: '', loading: 'lazy' }),
          el('span', { class: 'grow' }, el('span', { class: 'ja-ellip', style: 'display:block', text: x.title }), el('span', { class: 'sub', text: J.fmtDate(x.published) })),
          btn('대표로', function () { feat.set(x.id); toast('대표 영상으로 넣었습니다. 저장을 눌러야 반영됩니다.'); }, 'tiny'),
          btn('추천에', function () {
            var i = v.picks.indexOf(''); if (i < 0) { toast('추천 칸 5개가 모두 찼습니다. 하나를 비운 뒤 넣어 주세요.', 'err'); return; }
            picks[i].set(x.id); toast('추천 ' + (i + 1) + '번 칸에 넣었습니다.');
          }, 'tiny'));
      }));
    }
    qIn.addEventListener('input', drawList); drawList();
    fill(body,
      el('h3', { text: '대표 영상과 추천 영상' }),
      el('p', { class: 'ja-p', text: '대표 영상을 비워 두면 가장 최근 영상이 나옵니다. 대표 영상은 소리가 꺼진 채 자동재생됩니다.' }),
      feat.node, picks.map(function (p) { return p.node; }),
      el('div', { class: 'ja-row', style: 'margin:6px 0 4px' }, btn('저장', function () {
        var site = clone(S.site); site.videos = Object.assign(site.videos || {}, { featured: v.featured, picks: v.picks });
        commit([{ path: 'data/site.json', text: json(site) }], '영상 지정 수정').then(function () { S.site = site; J.render(); markEditable(); saved(); })
          .catch(function (e) { toast(errMsg(e), 'err'); });
      }, 'primary')),
      el('h3', { text: '내 영상에서 고르기' }),
      el('p', { class: 'ja-p', text: all.length ? '유튜브에서 가져온 영상 ' + all.length + '개 · 마지막 갱신 ' + (S.videos.updated ? S.videos.updated.replace('T', ' ').slice(0, 16) : '-') : '아직 유튜브에서 영상을 가져오지 않았습니다. 아래 버튼을 눌러 주세요.' }),
      el('div', { class: 'ja-row', style: 'margin-bottom:12px' },
        el('span', { style: 'flex:1;min-width:12rem' }, qIn),
        btn('유튜브에서 지금 새로 가져오기', function (e) {
          var b = e.currentTarget; b.disabled = true;
          gh('POST', R + '/actions/workflows/videos.yml/dispatches', { ref: BRANCH })
            .then(function () { toast('가져오기를 시작했습니다. 3~5분 뒤 새로고침하면 반영됩니다.'); })
            .catch(function (er) { b.disabled = false; toast(er.status === 403 ? '토큰의 Actions 권한을 "Read and write"로 바꿔 주세요.' : er.status === 404 ? '영상 가져오기 설정 파일(.github/workflows/videos.yml)이 아직 없습니다. 안내서의 마지막 단계를 확인해 주세요.' : errMsg(er), 'err'); });
        }, 'ghost')),
      listEl,
      el('p', { class: 'ja-p', style: 'margin-top:14px', text: '영상 카테고리는 유튜브 재생목록을 그대로 씁니다. 재생목록은 유튜브 스튜디오에서 정리해 주세요. 영상 목록은 매일 한 번 자동으로 갱신됩니다.' }));
  }

  /* ---------- 일반 입력 양식 (사이트 문구, 앱) ---------- */
  var LABELS = {
    name: '이름', nameEn: '영문 이름', nav: '상단 메뉴', home: '홈', intro: '소개 문구', apps: 'Apps 페이지', title: '제목', lead: '제목 아래 한 줄',
    statusLive: '"배포 중" 표시', statusSoon: '"준비 중" 표시', back: '돌아가기 글자', blog: 'Blog 페이지', all: '"전체" 버튼', brunchLabel: '브런치 글 표시',
    empty: '비어 있을 때 문구', noResult: '검색 결과가 없을 때 문구', brunchAll: '브런치 전체 보기 글자', prev: '이전 글 글자', next: '다음 글 글자',
    videos: 'Videos 페이지', picksTitle: '추천 영상 제목', listTitle: '전체 영상 제목', featured: '대표 영상', picks: '추천 영상',
    search: '검색창', placeholder: '검색창 안내 글자', button: '검색 버튼 글자', scopeTitle: '범위: 제목', scopeBody: '범위: 제목+내용', scopeCategory: '범위: 카테고리',
    about: 'About 페이지', body: '소개 글', history: '활동 소개', lecture: '강의 소개', lectureButton: '강의 버튼 글자', lectureUrl: '강의 안내 주소',
    links: '링크 (하단과 About에 표시, 주소를 비우면 숨김)', label: '이름', url: '주소', youtube: '유튜브 채널', handle: '채널 핸들', channelId: '채널 ID', channelUrl: '채널 주소',
    brunchUrl: '브런치 주소', footer: '하단 문구', description: '사이트 설명',
    slug: '주소 이름 (영문, 바꿀 수 없음)', tagline: '한 줄 설명', status: '상태', platforms: '지원 기기', featured_app: '홈에 표시', version: '버전', facts: '한 줄 정보 (버튼 아래)',
    downloads: '다운로드 버튼', video: '소개 영상 (유튜브 주소)', screenshots: '스크린샷 이미지 주소', warningTitle: '경고 안내 제목', warning: '경고 안내 내용',
    sounds: 'Sounds 페이지', buy: '구매 버튼 글자', free: '무료 받기 버튼 글자', freeBadge: '무료 표시', bandcampUrl: '밴드캠프 주소',
    changelogTitle: '변경 이력 제목', changelog: '변경 이력', text: '내용', date: '날짜', donateText: '후원 안내 문구', donateButton: '후원 버튼 글자'
  };
  var HIDE = { repoOwner: 1, repoName: 1, repoBranch: 1 };
  function lab(k, ctx) { if (ctx === 'app' && k === 'featured') return LABELS.featured_app; return LABELS[k] || k; }
  function form(obj, ctx, opts) {
    opts = opts || {};
    var root = el('div');
    function build(o, parent) {
      Object.keys(o).forEach(function (k) {
        if (HIDE[k] || (opts.skip && opts.skip[k])) return;
        var v = o[k];
        if (ctx === 'app' && k === 'status') {
          var s = el('select', { class: 'ja-in' }, el('option', { value: 'live', text: '배포 중 (초록 표시등)' }), el('option', { value: 'soon', text: '준비 중 (노란 표시등)' }));
          s.value = v; s.addEventListener('change', function () { o[k] = s.value; });
          parent.appendChild(field(lab(k, ctx), s)); return;
        }
        if (typeof v === 'boolean') {
          var c = el('input', { type: 'checkbox', checked: v }); c.addEventListener('change', function () { o[k] = c.checked; });
          parent.appendChild(el('label', { class: 'ja-chk' }, c, el('span', { text: lab(k, ctx) }))); return;
        }
        if (typeof v === 'string' || typeof v === 'number') {
          var long = String(v).length > 60 || /\n/.test(String(v)) || /body|warning|intro|history|text$/.test(k);
          var inp = long ? area(v) : input(v, { readonly: (ctx === 'app' && k === 'slug') ? true : null });
          inp.addEventListener('input', function () { o[k] = typeof v === 'number' ? Number(inp.value) : inp.value; });
          parent.appendChild(field(lab(k, ctx), inp)); return;
        }
        if (Array.isArray(v)) {
          var fs = el('fieldset', { class: 'ja-fs' }, el('legend', { text: lab(k, ctx) }));
          var box = el('div'); fs.appendChild(box);
          var tpl = (opts.templates && opts.templates[k]) || (v[0] && typeof v[0] === 'object' ? blank(v[0]) : '');
          (function drawArr() {
            fill(box);
            v.forEach(function (item, i) {
              var wrap = el('div', { class: 'ja-item' });
              var tools = el('div', { class: 'ja-item-tools' },
                btn('위로', function () { if (i) { v.splice(i - 1, 0, v.splice(i, 1)[0]); drawArr(); } }, 'ghost tiny', { disabled: !i }),
                btn('빼기', function () { v.splice(i, 1); drawArr(); }, 'danger tiny'));
              if (typeof item === 'object') { wrap.appendChild(tools); build(item, wrap); }
              else {
                var ii = input(item); ii.addEventListener('input', function () { v[i] = ii.value; });
                wrap.appendChild(el('div', { class: 'ja-row', style: 'flex-wrap:nowrap;margin-bottom:10px' }, el('span', { style: 'flex:1' }, ii), tools.lastChild));
              }
              box.appendChild(wrap);
            });
            box.appendChild(el('div', { class: 'ja-row', style: 'margin:6px 0 12px' }, btn('+ 추가', function () { v.push(typeof tpl === 'object' ? clone(tpl) : ''); drawArr(); }, 'ghost tiny')));
          })();
          parent.appendChild(fs); return;
        }
        if (v && typeof v === 'object') {
          var f2 = el('fieldset', { class: 'ja-fs' }, el('legend', { text: lab(k, ctx) }));
          build(v, f2); parent.appendChild(f2);
        }
      });
    }
    build(obj, root);
    return root;
  }
  function blank(o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = typeof o[k] === 'boolean' ? false : Array.isArray(o[k]) ? [] : typeof o[k] === 'object' ? blank(o[k]) : ''; }); return r; }

  /* ---------- 사이트 문구 ---------- */
  function tabSite() {
    var site = clone(S.site);
    fill(body,
      el('h3', { text: '사이트 문구' }),
      el('p', { class: 'ja-p', text: '사이트의 모든 글귀를 여기서 바꿀 수 있습니다. 페이지에서 바로 고치려면 아래쪽 막대의 "문구 수정"을 누르세요.' }),
      form(site, 'site', { skip: { videos: 0 } }),
      el('div', { class: 'ja-row' }, btn('저장', function () {
        var ch = [{ path: 'data/site.json', text: json(site) }];
        var metaChanged = site.name !== S.site.name || site.description !== S.site.description;
        var job = metaChanged ? metaFiles(site).then(function (files) { ch = ch.concat(files); }) : Promise.resolve();
        job.then(function () { return commit(ch, '사이트 문구 수정'); })
          .then(function () { S.site = site; J.render(); markEditable(); saved(); })
          .catch(function (e) { toast(errMsg(e), 'err'); });
      }, 'primary')));
  }
  // 링크 미리보기(카톡, SNS)에 쓰이는 설명도 함께 바꿉니다
  function metaFiles(site) {
    return tree().then(function (t) {
      var pages = Object.keys(t).filter(function (p) { return /\.html$/.test(p) && p.indexOf('data/') !== 0; });
      return Promise.all(pages.map(function (p) {
        return readText(p).then(function (h) {
          if (h == null) return null;
          var n = h.replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(site.description) + '$2')
            .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + esc(site.description) + '$2')
            .replace(/(<meta property="og:site_name" content=")[^"]*(")/, '$1' + esc(site.name) + '$2');
          return n !== h ? { path: p, text: n } : null;
        });
      })).then(function (r) { return r.filter(Boolean); });
    });
  }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  /* ---------- 앱 ---------- */
  function appStub(slug, name) {
    return '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(name) + ' · ' + esc(S.site.name) + '</title>\n<meta name="description" content="' + esc(S.site.description) + '">\n' +
      '<meta property="og:type" content="website">\n<meta property="og:site_name" content="' + esc(S.site.name) + '">\n<meta property="og:title" content="' + esc(name) + ' · ' + esc(S.site.name) + '">\n' +
      '<meta property="og:description" content="' + esc(S.site.description) + '">\n<meta property="og:image" content="https://' + OWNER + '.github.io/assets/img/og.png">\n' +
      '<meta name="twitter:card" content="summary_large_image">\n<meta name="theme-color" content="#F5F2EE">\n' +
      '<link rel="icon" type="image/png" href="../../assets/img/favicon.png">\n<link rel="apple-touch-icon" href="../../assets/img/apple-touch-icon.png">\n' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">\n' +
      '<link rel="stylesheet" href="../../assets/css/site.css">\n</head>\n<body data-page="app" data-slug="' + slug + '">\n<div id="app"></div>\n<script src="../../assets/js/site.js" defer></script>\n</body>\n</html>\n';
  }
  function tabApps(editSlug) {
    var apps = clone(S.apps);
    if (editSlug) {
      var a = apps.filter(function (x) { return x.slug === editSlug; })[0];
      if (!a) return tabApps();
      fill(body,
        el('div', { class: 'ja-row', style: 'justify-content:space-between;margin-bottom:14px' }, el('strong', { text: a.name + ' 페이지 수정' }), btn('목록으로', function () { tabApps(); }, 'ghost tiny')),
        el('p', { class: 'ja-p', text: '다운로드 주소는 GitHub Releases에 올린 파일 주소를 넣으세요. 주소가 비어 있으면 "준비 중"으로 보입니다.' }),
        form(a, 'app', { templates: { downloads: { label: '', url: '' }, changelog: { version: '', date: '', text: '' }, screenshots: '' } }),
        el('div', { class: 'ja-row' }, btn('저장', function () {
          commit([{ path: 'data/apps.json', text: json(apps) }], '앱 수정: ' + a.name).then(function () { S.apps = apps; J.render(); markEditable(); saved(); })
            .catch(function (e) { toast(errMsg(e), 'err'); });
        }, 'primary'), el('a', { class: 'ja-btn ghost', href: J.ROOT + 'apps/' + a.slug + '/', text: '페이지 보기' })));
      return;
    }
    var slugIn = input('', { placeholder: '주소 이름 (영문 소문자, 예: timeliners)', pattern: '[a-z0-9-]+' });
    var nameIn = input('', { placeholder: '앱 이름 (예: 타임라이너스)' });
    function save(list, extra, msg) {
      return commit([{ path: 'data/apps.json', text: json(list) }].concat(extra || []), msg).then(function () { S.apps = list; J.render(); markEditable(); saved(); tabApps(); })
        .catch(function (e) { toast(errMsg(e), 'err'); });
    }
    fill(body,
      el('h3', { text: '앱 목록' }),
      el('p', { class: 'ja-p', text: '여기 순서대로 Apps 페이지에 보입니다.' }),
      el('ul', { class: 'ja-list' }, apps.map(function (a, i) {
        return el('li', null,
          el('span', { class: 'led ' + (a.status === 'live' ? 'led-green' : 'led-amber'), 'aria-hidden': 'true' }),
          el('span', { class: 'grow' }, el('span', { style: 'display:block', text: a.name }), el('span', { class: 'sub', text: 'apps/' + a.slug + '/' + (a.featured ? ' · 홈에 표시' : '') })),
          btn('위로', function () { if (!i) return; var l = clone(apps); l.splice(i - 1, 0, l.splice(i, 1)[0]); save(l, null, '앱 순서 변경'); }, 'ghost tiny', { disabled: !i }),
          btn('수정', function () { tabApps(a.slug); }, 'tiny'),
          btn('삭제', function () {
            if (!confirm('"' + a.name + '" 앱 페이지를 지울까요?')) return;
            var l = apps.filter(function (x) { return x.slug !== a.slug; });
            tree().then(function (t) {
              var ex = t['apps/' + a.slug + '/index.html'] ? [{ path: 'apps/' + a.slug + '/index.html', delete: true }] : [];
              save(l, ex, '앱 삭제: ' + a.name);
            });
          }, 'danger tiny'));
      })),
      el('h3', { text: '새 앱 추가' }),
      field('주소 이름', slugIn, '사이트 주소가 됩니다: ' + OWNER + '.github.io/apps/주소이름/'),
      field('앱 이름', nameIn),
      el('div', { class: 'ja-row' }, btn('앱 페이지 만들기', function () {
        var slug = slugIn.value.trim().toLowerCase(), name = nameIn.value.trim();
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { toast('주소 이름은 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있습니다.', 'err'); return; }
        if (!name) { toast('앱 이름을 넣어 주세요.', 'err'); return; }
        if (apps.some(function (x) { return x.slug === slug; })) { toast('같은 주소 이름의 앱이 이미 있습니다.', 'err'); return; }
        var base = apps[0] ? blank(apps[0]) : {};
        var na = Object.assign(base, { slug: slug, name: name, status: 'soon', featured: false, changelogTitle: '변경 이력', warningTitle: '실행할 때 경고가 뜨나요?', donateButton: '후원하기', donateText: '마음에 드셨다면' });
        save(apps.concat([na]), [{ path: 'apps/' + slug + '/index.html', text: appStub(slug, name) }], '새 앱: ' + name);
      }, 'primary')));
  }

  /* ---------- Sounds (밴드캠프) ---------- */
  // 밴드캠프 임베드 코드에서 앨범 번호, 주소, 제목을 꺼냅니다
  function parseEmbed(code) {
    var c = String(code || ''), r = {};
    var m = c.match(/EmbeddedPlayer\/(?:v=2\/)?(album|track)=(\d+)/);
    if (m) r.embed = m[1] + '=' + m[2];
    var a = c.match(/<a[^>]+href=["'](https?:\/\/[^"']+bandcamp\.com\/(?:album|track)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (a) {
      r.url = a[1];
      var t = J.plainText(a[2]).replace(/\s+by\s+.+$/i, '').trim();
      if (t) r.title = t;
    } else {
      var u = c.match(/https?:\/\/[a-z0-9-]+\.bandcamp\.com\/(?:album|track)\/[a-z0-9-]+/i);
      if (u) r.url = u[0];
    }
    return r;
  }
  function saveSounds(list, msg, after) {
    return commit([{ path: 'data/sounds.json', text: json(list) }], msg)
      .then(function () { S.sounds = list; J.render(); markEditable(); saved(); (after || tabSounds)(); })
      .catch(function (e) { toast(errMsg(e), 'err'); });
  }
  function tabSounds(editId) {
    var list = clone(S.sounds || []);
    if (editId !== undefined) return editSound(list, editId);
    fill(body,
      el('div', { class: 'ja-row', style: 'justify-content:space-between;margin-bottom:12px' },
        el('strong', { text: '사운드팩 ' + list.length + '개' }),
        btn('새 사운드팩', function () { editSound(list, null); }, 'primary')),
      el('p', { class: 'ja-p', text: '여기 순서대로 Sounds 페이지에 보입니다. 플레이어가 없는 팩은 "수정"에서 밴드캠프 임베드 코드를 붙여 넣으세요.' }),
      el('ul', { class: 'ja-list' }, list.map(function (x, i) {
        return el('li', null,
          el('span', { class: 'led ' + (x.embed ? 'led-green' : 'led-amber'), title: x.embed ? '플레이어 있음' : '플레이어 없음', 'aria-hidden': 'true' }),
          el('span', { class: 'grow' }, el('span', { class: 'ja-ellip', style: 'display:block', text: x.title }),
            el('span', { class: 'sub', text: (x.free ? '무료 · ' : '') + (x.embed ? '플레이어 있음' : '플레이어 없음 (임베드 코드 필요)') })),
          btn('위로', function () { if (!i) return; var l = clone(list); l.splice(i - 1, 0, l.splice(i, 1)[0]); saveSounds(l, '사운드팩 순서 변경'); }, 'ghost tiny', { disabled: !i }),
          btn('수정', function () { editSound(list, x.id); }, 'tiny'),
          btn('삭제', function () {
            if (!confirm('"' + x.title + '"을 Sounds 페이지에서 뺄까요? 밴드캠프의 앨범은 그대로 남습니다.')) return;
            saveSounds(list.filter(function (y) { return y.id !== x.id; }), '사운드팩 삭제: ' + x.title);
          }, 'danger tiny'));
      })));
  }
  function editSound(list, id) {
    var isNew = id == null;
    var x = isNew ? { id: '', title: '', summary: '', url: '', embed: '', free: false } : list.filter(function (y) { return y.id === id; })[0];
    if (!x) return tabSounds();
    var code = area('', { class: 'ja-in ja-area code', placeholder: '<iframe style="border: 0; ..." src="https://bandcamp.com/EmbeddedPlayer/album=...', spellcheck: 'false' });
    var title = input(x.title, { placeholder: '사운드팩 이름' });
    var sum = input(x.summary, { placeholder: '한 줄 소개' });
    var url = input(x.url, { type: 'url', placeholder: 'https://jeonsansil.bandcamp.com/album/...' });
    var free = el('input', { type: 'checkbox', checked: !!x.free });
    var status = el('p', { class: 'ja-p', style: 'margin:0' });
    var prev = el('div');
    var embed = x.embed || '';
    function showPrev() {
      var src = J.bcSrc(embed);
      status.textContent = src ? '플레이어를 찾았습니다 (' + embed + ').' : '아직 플레이어가 없습니다. 임베드 코드를 붙여 넣으면 생깁니다.';
      fill(prev, src ? el('iframe', { src: src, title: '미리듣기', style: 'width:100%;height:120px;border:1px solid #D9D4CE;border-radius:4px;margin:10px 0 0;background:#fff' }) : null);
    }
    code.addEventListener('input', function () {
      var r = parseEmbed(code.value);
      if (r.embed) embed = r.embed;
      if (r.url && !url.value.trim()) url.value = r.url;
      if (r.title && !title.value.trim()) title.value = r.title;
      if (code.value.trim() && !r.embed) { status.textContent = '코드에서 앨범 번호를 찾지 못했습니다. 밴드캠프의 Share / Embed → Embed this album에서 나온 코드 전체를 붙여 넣어 주세요.'; fill(prev); return; }
      showPrev();
    });
    showPrev();
    fill(body,
      el('div', { class: 'ja-row', style: 'justify-content:space-between;margin-bottom:14px' },
        el('strong', { text: isNew ? '새 사운드팩' : '사운드팩 수정' }), btn('목록으로', function () { tabSounds(); }, 'ghost tiny')),
      field('밴드캠프 임베드 코드', code, '앨범 페이지 → Share / Embed → Embed this album → 오른쪽 아래 코드를 복사해 붙여 넣으세요. 제목과 주소도 자동으로 채워집니다.'),
      el('div', { class: 'ja-box' }, status, prev),
      field('제목', title), field('한 줄 소개', sum), field('밴드캠프 주소', url, '구매(또는 무료 받기) 버튼이 이 주소로 연결됩니다.'),
      el('label', { class: 'ja-chk' }, free, el('span', { text: '무료 배포 (무료 표시와 "무료로 받기" 버튼)' })),
      el('div', { class: 'ja-row' }, btn('저장', function () {
        var t = title.value.trim();
        if (!t) { toast('제목을 넣어 주세요.', 'err'); title.focus(); return; }
        var item = { id: x.id || (t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pack') + '-' + Math.random().toString(36).slice(2, 5),
          title: t, summary: sum.value.trim(), url: url.value.trim(), embed: embed, free: free.checked };
        var l = isNew ? list.concat([item]) : list.map(function (y) { return y.id === x.id ? item : y; });
        saveSounds(l, (isNew ? '새 사운드팩: ' : '사운드팩 수정: ') + t);
      }, 'primary')));
  }

  /* ---------- 저장공간 ---------- */
  function tabStorage() {
    fill(body, el('p', { class: 'ja-p', text: '저장공간을 계산하는 중…' }));
    Promise.all([tree(true), gh('GET', R)]).then(function (r) {
      var t = r[0], repo = r[1];
      var files = Object.keys(t).map(function (p) { return { path: p, size: t[p].size || 0 }; });
      var total = files.reduce(function (s, f) { return s + f.size; }, 0);
      var groups = [['블로그 이미지', /^assets\/blog\//], ['글 본문', /^data\/posts\//], ['사이트 이미지', /^(assets\/img\/|apps\/.*\.(png|jpe?g|webp|gif))/], ['사이트 파일', /./]];
      var sums = groups.map(function () { return 0; });
      files.forEach(function (f) { for (var i = 0; i < groups.length; i++) if (groups[i][1].test(f.path)) { sums[i] += f.size; break; } });
      var pct = total / LIMIT * 100;
      var used = {}; S.posts.forEach(function (p) { (p.images || []).forEach(function (im) { (used[im] = used[im] || []).push(p); }); });
      var imgs = files.filter(function (f) { return /^assets\/blog\/.+\.(png|jpe?g|webp|gif|svg|avif)$/i.test(f.path); });
      var orphans = imgs.filter(function (f) { return !used[f.path]; });
      var withSize = S.posts.filter(function (p) { return p.size > 0; });
      var avg = withSize.length ? withSize.reduce(function (s, p) { return s + p.size; }, 0) / withSize.length : 250 * 1024;
      var left = Math.max(0, Math.floor((LIMIT - total) / avg));
      var top = files.slice().sort(function (a, b) { return b.size - a.size; }).slice(0, 10);
      var max = Math.max.apply(null, sums.concat([1]));

      fill(body,
        el('h3', { text: '사이트 저장공간' }),
        el('div', { class: 'ja-gauge ' + (pct >= 90 ? 'hi' : pct >= 70 ? 'mid' : ''), role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': pct.toFixed(1), 'aria-label': '사용한 저장공간' },
          el('i', { style: 'width:' + Math.max(0.6, Math.min(100, pct)).toFixed(2) + '%' })),
        el('p', { class: 'ja-p' }, el('strong', { text: kb(total) + ' / 1GB (' + pct.toFixed(1) + '%)' }), ' · 평균 글 크기로 약 ' + left.toLocaleString() + '편 더 쓸 수 있습니다.'),
        el('div', { class: 'ja-bars' }, groups.map(function (g, i) {
          return [el('span', { text: g[0] }), el('span', { class: 'b' }, el('i', { style: 'width:' + (sums[i] / max * 100).toFixed(1) + '%' })), el('span', { class: 'n', text: kb(sums[i]) })];
        })),
        el('p', { class: 'ja-p', style: 'margin-top:12px;font-size:13px', text: 'GitHub가 세는 저장소 전체 크기(지운 파일의 기록 포함)는 ' + kb(repo.size * 1024) + '입니다. 지운 파일도 기록에는 남아서, 이 숫자는 줄지 않을 수 있습니다. 앱 다운로드 파일은 GitHub Releases에 따로 저장되어 여기에 포함되지 않습니다.' }),

        el('h3', { text: '용량 다이어트' }),
        el('div', { class: 'ja-box' },
          el('div', { class: 'ja-row', style: 'justify-content:space-between' },
            el('span', null, el('strong', { text: '안 쓰는 이미지 정리' }), el('span', { class: 'sub', style: 'display:block;color:#8C8781;font-size:13px', text: '지운 글이나 고친 글에서 남은 이미지 ' + orphans.length + '개 · ' + kb(orphans.reduce(function (s, f) { return s + f.size; }, 0)) })),
            btn(orphans.length ? orphans.length + '개 지우기' : '정리할 것 없음', function () {
              if (!confirm('어느 글에도 쓰이지 않는 이미지 ' + orphans.length + '개를 지울까요?')) return;
              commit(orphans.map(function (f) { return { path: f.path, delete: true }; }), '안 쓰는 이미지 정리 (' + orphans.length + '개)')
                .then(function () { toast('정리했습니다. ' + kb(orphans.reduce(function (s, f) { return s + f.size; }, 0)) + '를 비웠습니다.'); tabStorage(); })
                .catch(function (e) { toast(errMsg(e), 'err'); });
            }, '', { disabled: !orphans.length }))),
        el('div', { class: 'ja-box' },
          el('div', { class: 'ja-row', style: 'justify-content:space-between' },
            el('span', null, el('strong', { text: '큰 이미지 다시 줄이기' }), el('span', { class: 'sub', style: 'display:block;color:#8C8781;font-size:13px', text: '250KB가 넘는 블로그 이미지 ' + imgs.filter(function (f) { return f.size > 250 * 1024; }).length + '개를 화질을 거의 유지한 채 줄입니다.' })),
            btn('줄일 수 있는지 확인', function (e) { diet(imgs.filter(function (f) { return f.size > 250 * 1024; }), e.currentTarget); }, '', { disabled: !imgs.some(function (f) { return f.size > 250 * 1024; }) }))),
        el('p', { class: 'ja-p', style: 'font-size:13px', text: '같은 이미지는 한 번만 저장됩니다(이미지 이름이 내용에 따라 정해집니다). 중복은 자동으로 막아집니다.' }),

        el('h3', { text: '큰 파일 순위' }),
        el('ul', { class: 'ja-list' }, top.map(function (f) {
          var u = used[f.path];
          var isBlogImg = /^assets\/blog\//.test(f.path);
          return el('li', null,
            el('span', { class: 'grow' }, el('span', { class: 'ja-ellip', style: 'display:block', text: f.path }),
              el('span', { class: 'sub', text: kb(f.size) + (u ? ' · 쓰는 글: ' + u.map(function (p) { return p.title; }).join(', ') : isBlogImg ? ' · 쓰는 글 없음' : '') })),
            el('a', { class: 'ja-btn ghost tiny', href: J.ROOT + f.path, target: '_blank', rel: 'noopener', text: '보기' }),
            isBlogImg && /\.(png|jpe?g|webp)$/i.test(f.path) ? btn('줄이기', function (e) { diet([f], e.currentTarget); }, 'tiny') : null,
            isBlogImg ? btn('삭제', function () {
              if (!confirm(u ? '이 이미지는 글 ' + u.length + '편에서 쓰고 있습니다. 지우면 그 글에서 이미지가 보이지 않습니다. 지울까요?' : '이 이미지를 지울까요?')) return;
              commit([{ path: f.path, delete: true }], '이미지 삭제').then(function () { saved(); tabStorage(); }).catch(function (er) { toast(errMsg(er), 'err'); });
            }, 'danger tiny') : null);
        })));
    }).catch(function (e) { fill(body, el('p', { class: 'ja-p', text: errMsg(e) })); });
  }
  function diet(list, b) {
    if (!list.length) return;
    b.disabled = true; var orig = b.textContent; b.textContent = '확인하는 중… 0/' + list.length;
    var done = 0, plan = [];
    list.reduce(function (pr, f) {
      return pr.then(function () {
        return readBytes(f.path).then(function (bytes) { return reshrink(bytes, mimeOf(f.path)); }).then(function (out) {
          if (out) plan.push({ path: f.path, before: f.size, after: out.length, out: out });
          done++; b.textContent = '확인하는 중… ' + done + '/' + list.length;
        }).catch(function () { done++; });
      });
    }, Promise.resolve()).then(function () {
      b.disabled = false; b.textContent = orig;
      if (!plan.length) { toast('이미 충분히 작습니다. 줄일 이미지가 없습니다.'); return; }
      var before = plan.reduce(function (s, p) { return s + p.before; }, 0), after = plan.reduce(function (s, p) { return s + p.after; }, 0);
      if (!confirm('이미지 ' + plan.length + '개를 ' + kb(before) + ' → ' + kb(after) + '로 줄일 수 있습니다. ' + kb(before - after) + '를 아낍니다. 적용할까요?')) return;
      commit(plan.map(function (p) { return { path: p.path, b64: bytesToB64(p.out) }; }), '이미지 다시 줄이기 (' + plan.length + '개)')
        .then(function () {
          var posts = clone(S.posts), map = {}; plan.forEach(function (p) { map[p.path] = p.before - p.after; });
          posts.forEach(function (p) { (p.images || []).forEach(function (im) { if (map[im]) p.size = Math.max(0, p.size - map[im]); }); });
          return commit([{ path: 'data/posts/index.json', text: json(posts) }], '글 용량 정보 갱신').then(function () { S.posts = posts; });
        })
        .then(function () { toast(kb(before - after) + '를 아꼈습니다.'); tabStorage(); })
        .catch(function (e) { toast(errMsg(e), 'err'); });
    });
  }

  /* ---------- 설정 ---------- */
  function tabSettings() {
    var t = token() || '';
    fill(body,
      el('h3', { text: '토큰' }),
      el('p', { class: 'ja-p', text: '이 기기에 저장된 토큰: ' + (t ? t.slice(0, 11) + '••••••••' + t.slice(-4) : '없음') }),
      el('div', { class: 'ja-row' },
        btn('토큰 바꾸기', function () { store(TK, null); fill(tabsEl); drawLogin(); }),
        btn('이 기기에서 토큰 지우기', function () {
          if (!confirm('이 기기에서 토큰을 지울까요? 다시 쓰려면 토큰을 새로 넣어야 합니다.')) return;
          store(TK, null); exit(); toast('토큰을 지웠습니다.');
        }, 'danger')),
      el('p', { class: 'ja-p', style: 'margin-top:12px', text: '토큰이 새어 나갔다고 생각되면 GitHub → Settings → Developer settings → Fine-grained tokens에서 지우고 새로 만드세요.' }),
      el('h3', { text: '연결된 저장소' }),
      el('p', { class: 'ja-p' }, el('a', { href: 'https://github.com/' + OWNER + '/' + REPO, target: '_blank', rel: 'noopener', text: OWNER + '/' + REPO }), ' · ' + BRANCH + ' 브랜치'),
      el('h3', { text: '관리자 모드 여는 법' }),
      el('p', { class: 'ja-p', text: '키보드: ↑ ↑ ↓ ↓ ← → ← → B A\n휴대폰: 왼쪽 위 "스튜디오 전산실" 글자를 빠르게 5번 누르기', style: 'white-space:pre-line' }),
      el('div', { class: 'ja-row' }, btn('관리자 모드 나가기', exit)));
  }

  /* ---------- 열기, 나가기 ---------- */
  function exit() {
    if (Object.keys(dirty).length && !confirm('저장하지 않은 문구 수정이 있습니다. 버리고 나갈까요?')) return;
    dirty = {}; if (editing) toggleEdit();
    closePanel(); if (bar) { bar.remove(); bar = null; }
    sess(false); J.render();
  }
  var started = false;
  function open() {
    css();
    sess(true);
    if (!started) {
      started = true;
      document.addEventListener('jss:render', function () { markEditable(); });
      if (token()) refresh();
    }
    drawBar();
    if (!token()) openPanel('posts');
  }
  window.JSSAdmin = { open: open };
})();
