/*
 * friends.js — 친구 모드 (2차) 클라이언트
 * Supabase 구글 로그인 / 초대링크 그룹 / 날짜별 피드 / 스탬프 / 피드 업로드
 */
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG;
  var sb = null;
  var session = null;
  var pendingJoin = null;   // 초대링크 ?join=CODE
  var currentGroup = null;  // {id, name, invite_code}

  var STAMPS = [{ k: 'like', e: '👍' }, { k: 'fire', e: '🔥' }, { k: 'wow', e: '👏' }];

  function client() {
    if (!sb) {
      if (!window.supabase || !cfg) return null;
      sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
    }
    return sb;
  }
  function toast(m) { if (window.App) window.App.toast(m); }
  function show(n) { window.showScreen(n); }

  // ---------- 진입 ----------
  function enter() {
    var c = client();
    if (!c) { toast('로그인 모듈 로딩 실패'); return; }
    c.auth.getSession().then(function (res) {
      session = res.data.session;
      if (session) afterLogin();
      else show('login');
    });
  }

  function signInGoogle() {
    var c = client();
    var q = '?friends=1' + (pendingJoin ? ('&join=' + encodeURIComponent(pendingJoin)) : '');
    var redirectTo = location.origin + location.pathname + q;
    c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo } })
      .then(function (r) { if (r.error) toast('로그인 오류: ' + r.error.message); });
  }

  function logout() {
    client().auth.signOut().then(function () {
      session = null; currentGroup = null; show('entry');
    });
  }

  function afterLogin() {
    var chain = Promise.resolve();
    if (pendingJoin) {
      var code = pendingJoin; pendingJoin = null;
      chain = doJoin(code);
    }
    chain.then(openGroups);
  }

  // ---------- 그룹 ----------
  function loadGroups() {
    return client().from('groups').select('id,name,invite_code')
      .order('created_at', { ascending: true })
      .then(function (r) { return r.error ? [] : (r.data || []); });
  }

  function openGroups() {
    show('groups');
    return loadGroups().then(function (groups) {
      var list = document.getElementById('group-list');
      list.innerHTML = '';
      if (!groups.length) {
        list.innerHTML = '<div class="empty sub-text">아직 그룹이 없어요.<br/>새 그룹을 만들거나 초대 코드로 참여하세요.</div>';
        return;
      }
      groups.forEach(function (g) {
        var el = document.createElement('button');
        el.className = 'group-item doodle-box';
        el.textContent = g.name;
        el.addEventListener('click', function () { openFeed(g); });
        list.appendChild(el);
      });
    });
  }

  function createGroup() {
    var name = prompt('그룹 이름을 정해주세요 (예: 고3 스터디)');
    if (!name || !name.trim()) return;
    client().rpc('create_group', { group_name: name.trim() }).then(function (r) {
      if (r.error) { toast('생성 오류: ' + r.error.message); return; }
      toast('그룹을 만들었어요');
      openGroups();
    });
  }

  function doJoin(code) {
    return client().rpc('join_group', { p_code: code.trim() }).then(function (r) {
      if (r.error) { toast('참여 오류: 코드를 확인해주세요'); return null; }
      toast('그룹에 참여했어요');
      return r.data;
    });
  }
  function joinGroupPrompt() {
    var code = prompt('초대 코드를 붙여넣어 주세요');
    if (!code) return;
    doJoin(code).then(function (g) { if (g) openGroups(); });
  }

  // ---------- 피드 ----------
  function openFeed(group) {
    currentGroup = group;
    show('feed');
    document.getElementById('feed-group-name').textContent = group.name;
    renderFeed();
  }

  function renderFeed() {
    var list = document.getElementById('feed-list');
    list.innerHTML = '<div class="sub-text" style="text-align:center;padding:20px;">불러오는 중…</div>';
    var c = client();
    c.from('posts')
      .select('id,study_date,study_seconds,final_stage,final_line,video_url,author_id,profiles(nickname)')
      .eq('group_id', currentGroup.id)
      .order('study_date', { ascending: false })
      .order('created_at', { ascending: false })
      .then(function (r) {
        if (r.error) { list.innerHTML = '<div class="sub-text">피드 오류</div>'; return; }
        var posts = r.data || [];
        if (!posts.length) {
          list.innerHTML = '<div class="empty sub-text" style="text-align:center;padding:24px;">아직 올라온 기록이 없어요.<br/>공부하고 결과 화면에서<br/>"친구 피드에 올리기"를 눌러보세요.</div>';
          return;
        }
        var ids = posts.map(function (p) { return p.id; });
        c.from('reactions').select('post_id,stamp,user_id').in('post_id', ids)
          .then(function (rr) {
            var reacts = rr.data || [];
            list.innerHTML = '';
            var lastDate = null;
            var seq = Promise.resolve();
            posts.forEach(function (p) {
              seq = seq.then(function () {
                if (p.study_date !== lastDate) {
                  lastDate = p.study_date;
                  var dh = document.createElement('div');
                  dh.className = 'feed-date';
                  dh.textContent = dateLabel(p.study_date);
                  list.appendChild(dh);
                }
                return postCard(p, reacts).then(function (card) { list.appendChild(card); });
              });
            });
          });
      });
  }

  function postCard(p, reacts) {
    var card = document.createElement('div');
    card.className = 'feed-card doodle-box';
    var nick = (p.profiles && p.profiles.nickname) || '연필친구';
    var head = document.createElement('div');
    head.className = 'feed-card-head';
    head.innerHTML = '<span class="nick">' + esc(nick) + '</span>' +
      '<span class="ftime">' + fmt(p.study_seconds) + '</span>';
    card.appendChild(head);

    var afterVideo = Promise.resolve();
    if (p.video_url) {
      afterVideo = client().storage.from('feed-videos').createSignedUrl(p.video_url, 3600)
        .then(function (s) {
          if (s.data && s.data.signedUrl) {
            var v = document.createElement('video');
            v.src = s.data.signedUrl;
            v.playsInline = true; v.loop = true; v.muted = true; v.controls = true;
            v.className = 'feed-video';
            card.appendChild(v);
          }
        });
    }

    return afterVideo.then(function () {
      var line = document.createElement('div');
      line.className = 'feed-line sub-text';
      line.textContent = '연필: "' + (p.final_line || '') + '"';
      card.appendChild(line);

      var bar = document.createElement('div'); bar.className = 'stamp-bar';
      var myId = session && session.user && session.user.id;
      STAMPS.forEach(function (s) {
        var mine = reacts.some(function (r) { return r.post_id === p.id && r.stamp === s.k && r.user_id === myId; });
        var count = reacts.filter(function (r) { return r.post_id === p.id && r.stamp === s.k; }).length;
        var b = document.createElement('button');
        b.className = 'stamp' + (mine ? ' on' : '');
        b.textContent = s.e + (count ? (' ' + count) : '');
        b.addEventListener('click', function () { toggleStamp(p.id, s.k, mine); });
        bar.appendChild(b);
      });
      card.appendChild(bar);
      return card;
    });
  }

  function toggleStamp(postId, stamp, mine) {
    var c = client();
    var op = mine
      ? c.from('reactions').delete().eq('post_id', postId).eq('stamp', stamp).eq('user_id', session.user.id)
      : c.from('reactions').insert({ post_id: postId, stamp: stamp });
    op.then(function (r) {
      if (r.error) { toast('반응 오류'); return; }
      renderFeed();
    });
  }

  // ---------- 결과 화면 → 피드 업로드 ----------
  function onResultReady() {
    var btn = document.getElementById('btn-feed-upload');
    if (!btn) return;
    if (session) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
    btn.disabled = false;
    btn.textContent = '친구 피드에 올리기';
    btn.onclick = uploadToFeed;
  }

  function uploadToFeed() {
    if (!session) { toast('먼저 친구 모드로 로그인하세요'); return; }
    var blob = window.App.getTimelapseBlob();
    var info = window.App.getLastSession();
    if (!blob || !info) { toast('영상이 아직 준비 중이에요'); return; }

    loadGroups().then(function (groups) {
      if (!groups.length) { toast('먼저 그룹을 만들어주세요'); openGroups(); return; }
      var target;
      if (groups.length === 1) target = groups[0];
      else {
        var names = groups.map(function (g, i) { return (i + 1) + '. ' + g.name; }).join('\n');
        var pick = prompt('어느 그룹에 올릴까요?\n' + names + '\n번호 입력:');
        var idx = parseInt(pick, 10) - 1;
        if (isNaN(idx) || !groups[idx]) return;
        target = groups[idx];
      }
      doUpload(target, blob, info);
    });
  }

  function doUpload(target, blob, info) {
    var btn = document.getElementById('btn-feed-upload');
    btn.disabled = true; btn.textContent = '올리는 중…';
    var postId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : (Date.now() + '-' + Math.floor(Math.random() * 1e9));
    var path = target.id + '/' + postId + '.webm';
    client().storage.from('feed-videos').upload(path, blob, { contentType: 'video/webm', upsert: true })
      .then(function (up) {
        if (up.error) throw up.error;
        return client().from('posts').insert({
          id: postId, group_id: target.id, study_date: info.date,
          study_seconds: info.seconds, final_stage: info.stage,
          final_line: info.line, video_url: path
        });
      })
      .then(function (ins) {
        if (ins.error) throw ins.error;
        toast('친구 피드에 올렸어요!');
        btn.disabled = false; btn.textContent = '피드에서 보기';
        btn.onclick = function () { openFeed(target); };
      })
      .catch(function (e) {
        toast('업로드 오류: ' + (e.message || e));
        btn.disabled = false; btn.textContent = '친구 피드에 올리기';
      });
  }

  // ---------- 유틸 ----------
  function fmt(sec) { return window.PencilCharacter.formatHMS(sec); }
  function esc(s) {
    return (s + '').replace(/[<>&]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
    });
  }
  function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function dateLabel(ds) {
    var d = new Date(ds + 'T00:00:00');
    var diff = Math.round((stripTime(new Date()) - stripTime(d)) / 86400000);
    if (diff === 0) return '오늘';
    if (diff === 1) return '어제';
    if (diff === 2) return '그저께';
    return ds;
  }

  function copyInvite() {
    if (!currentGroup) return;
    var link = location.origin + location.pathname + '?join=' + currentGroup.invite_code;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link)
        .then(function () { toast('초대 링크를 복사했어요'); })
        .catch(function () { prompt('초대 링크 (복사하세요):', link); });
    } else {
      prompt('초대 링크 (복사하세요):', link);
    }
  }

  // ---------- 이벤트/초기화 ----------
  function bind() {
    document.getElementById('btn-google').addEventListener('click', signInGoogle);
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-create-group').addEventListener('click', createGroup);
    document.getElementById('btn-join-group').addEventListener('click', joinGroupPrompt);
    document.getElementById('btn-invite').addEventListener('click', copyInvite);
    document.getElementById('btn-feed-upload').addEventListener('click', uploadToFeed);
    var gos = document.querySelectorAll('[data-go]');
    for (var i = 0; i < gos.length; i++) {
      (function (el) {
        el.addEventListener('click', function () { show(el.getAttribute('data-go')); });
      })(gos[i]);
    }
  }

  function init() {
    bind();
    var params = new URLSearchParams(location.search);
    var join = params.get('join');
    if (join) pendingJoin = join;

    var c = client();
    if (c) {
      c.auth.getSession().then(function (res) {
        session = res.data.session;
        if (session && (pendingJoin || params.get('friends') === '1')) afterLogin();
      });
      c.auth.onAuthStateChange(function (_evt, s) {
        session = s;
        if (!s) {
          var btn = document.getElementById('btn-feed-upload');
          if (btn) btn.classList.add('hidden');
        }
      });
    }
  }

  window.Friends = { enter: enter, onResultReady: onResultReady };
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
