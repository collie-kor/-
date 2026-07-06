/*
 * modal.js — 두들링 스타일 인앱 모달 (브라우저 기본 prompt/alert 대체)
 * window.Modal.input / alert / copy / choose  (모두 Promise 반환)
 */
(function () {
  'use strict';
  var overlay, titleEl, bodyEl, actionsEl;

  function ensure() {
    overlay = document.getElementById('modal-overlay');
    titleEl = document.getElementById('modal-title');
    bodyEl = document.getElementById('modal-body');
    actionsEl = document.getElementById('modal-actions');
  }
  function open() { ensure(); overlay.classList.remove('hidden'); }
  function close() { if (overlay) overlay.classList.add('hidden'); }
  function clear() { bodyEl.innerHTML = ''; actionsEl.innerHTML = ''; }
  function button(label, cls) {
    var b = document.createElement('button');
    b.className = 'doodle-btn ' + (cls || '');
    b.textContent = label;
    return b;
  }

  function input(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      ensure(); clear();
      titleEl.textContent = opts.title || '';
      if (opts.message) {
        var m = document.createElement('div'); m.className = 'modal-msg';
        m.textContent = opts.message; bodyEl.appendChild(m);
      }
      var inp = document.createElement('input');
      inp.className = 'modal-input'; inp.type = 'text';
      inp.placeholder = opts.placeholder || ''; inp.value = opts.value || '';
      bodyEl.appendChild(inp);
      var cancel = button(opts.cancelText || '취소', 'ghost');
      var ok = button(opts.confirmText || '확인', 'primary');
      cancel.onclick = function () { close(); resolve(null); };
      ok.onclick = function () { var v = inp.value.trim(); close(); resolve(v || null); };
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') ok.click();
        else if (e.key === 'Escape') cancel.click();
      });
      actionsEl.appendChild(cancel); actionsEl.appendChild(ok);
      open(); setTimeout(function () { inp.focus(); }, 30);
    });
  }

  function alert(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      ensure(); clear();
      titleEl.textContent = opts.title || '';
      if (opts.message) {
        var m = document.createElement('div'); m.className = 'modal-msg';
        m.innerHTML = opts.message; bodyEl.appendChild(m);
      }
      var ok = button(opts.confirmText || '확인', 'primary');
      ok.onclick = function () { close(); resolve(); };
      actionsEl.appendChild(ok);
      open();
    });
  }

  function copy(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      ensure(); clear();
      titleEl.textContent = opts.title || '초대 링크';
      if (opts.message) {
        var m = document.createElement('div'); m.className = 'modal-msg';
        m.textContent = opts.message; bodyEl.appendChild(m);
      }
      var field = document.createElement('input');
      field.className = 'modal-input'; field.type = 'text';
      field.readOnly = true; field.value = opts.value || '';
      bodyEl.appendChild(field);
      var close_ = button('닫기', 'ghost');
      var cp = button('복사', 'primary');
      close_.onclick = function () { close(); resolve(); };
      cp.onclick = function () {
        function done() { cp.textContent = '복사됨!'; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(opts.value).then(done).catch(function () {
            field.select(); try { document.execCommand('copy'); } catch (e) {} done();
          });
        } else {
          field.select(); try { document.execCommand('copy'); } catch (e) {} done();
        }
      };
      actionsEl.appendChild(close_); actionsEl.appendChild(cp);
      open(); setTimeout(function () { field.select(); }, 30);
    });
  }

  function choose(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      ensure(); clear();
      titleEl.textContent = opts.title || '선택';
      (opts.items || []).forEach(function (it) {
        var b = button(it.label, '');
        b.style.width = '100%'; b.style.marginBottom = '8px';
        b.onclick = function () { close(); resolve(it.value); };
        bodyEl.appendChild(b);
      });
      var cancel = button('취소', 'ghost');
      cancel.onclick = function () { close(); resolve(null); };
      actionsEl.appendChild(cancel);
      open();
    });
  }

  window.Modal = { input: input, alert: alert, copy: copy, choose: choose, close: close };
})();
