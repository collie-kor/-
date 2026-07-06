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
      chain = doJoin(code).then(function (g) { if (g) currentGroup = g; });
    }
    chain.then(function () {
      // 로그인 후 홈으로 (홈에서 바로 공부 시작 + 친구 피드 이동)
      if (window.App && window.App.goHome) window.App.goHome();
      else show('home');
      updateHome();
      // 초대링크로 들어온 경우엔 바로 그 그룹 피드로
      if (currentGroup) openFeed(currentGroup);
    });
  }

  // 홈의 "친구 피드" 버튼 노출 (로그인 상태에서만)
  function updateHome() {
    var b = document.getElementById('btn-friends-feed');
    if (!b) return;
    if (session) b.classList.remove('hidden');
    else b.classList.add('hidden');
  }

  // ---------- 그룹 ----------
  function loadGroups() {
    return client().from('groups').select('id,name,invite_code,created_by')
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
    Modal.input({
      title: '새 그룹 만들기',
      placeholder: '그룹 이름 (예: 고3 스터디)',
      confirmText: '만들기'
    }).then(function (name) {
      if (!name) return;
      client().rpc('create_group', { group_name: name }).then(function (r) {
        if (r.error) { toast('생성 오류: ' + r.error.message); return; }
        var g = r.data;
        var link = inviteLink(g.invite_code);
        Modal.copy({
          title: '그룹을 만들었어요!',
          message: '이 초대 링크를 받은 친구만 들어올 수 있어요',
          value: link
        }).then(openGroups);
      });
    });
  }

  // 초대 코드 또는 링크에서 코드만 추출
  function parseCode(raw) {
    raw = (raw || '').trim();
    var m = raw.match(/[?&]join=([^&\s]+)/);
    return m ? decodeURIComponent(m[1]) : raw;
  }
  function inviteLink(code) {
    return location.origin + location.pathname + '?join=' + code;
  }

  function doJoin(code) {
    return client().rpc('join_group', { p_code: parseCode(code) }).then(function (r) {
      if (r.error) { toast('참여 오류: 코드를 확인해주세요'); return null; }
      toast('그룹에 참여했어요');
      return r.data;
    });
  }
  function joinGroupPrompt() {
    Modal.input({
      title: '초대 코드로 참여',
      message: '친구가 보낸 초대 코드나 링크를 붙여넣으세요',
      placeholder: '초대 코드 또는 링크',
      confirmText: '참여'
    }).then(function (code) {
      if (!code) return;
      doJoin(code).then(function (g) { if (g) openGroups(); });
    });
  }

  // ---------- 피드 ----------
  function openFeed(group) {
    currentGroup = group;
    show('feed');
    document.getElementById('feed-group-name').textContent = group.name;
    // 삭제 버튼은 생성자에게만
    var del = document.getElementById('btn-delete-group');
    var myId = session && session.user && session.user.id;
    if (group.created_by && group.created_by === myId) del.classList.remove('hidden');
    else del.classList.add('hidden');
    renderFeed();
  }

  function leaveGroup() {
    if (!currentGroup) return;
    Modal.confirm({
      title: '그룹 나가기',
      message: '"' + esc(currentGroup.name) + '" 그룹에서 나갈까요?<br/>내가 올린 기록은 그룹에 남아요.',
      confirmText: '나가기', danger: true
    }).then(function (ok) {
      if (!ok) return;
      client().from('group_members').delete()
        .eq('group_id', currentGroup.id).eq('user_id', session.user.id)
        .then(function (r) {
          if (r.error) { toast('나가기 오류: ' + r.error.message); return; }
          toast('그룹에서 나왔어요');
          currentGroup = null;
          openGroups();
        });
    });
  }

  function deleteGroup() {
    if (!currentGroup) return;
    Modal.confirm({
      title: '그룹 삭제',
      message: '"' + esc(currentGroup.name) + '" 그룹을 삭제할까요?<br/>모든 멤버의 기록·영상이 사라지고 되돌릴 수 없어요.',
      confirmText: '삭제', danger: true
    }).then(function (ok) {
      if (!ok) return;
      client().from('groups').delete().eq('id', currentGroup.id)
        .then(function (r) {
          if (r.error) { toast('삭제 오류: ' + r.error.message); return; }
          toast('그룹을 삭제했어요');
          currentGroup = null;
          openGroups();
        });
    });
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
          if (s.error || !s.data || !s.data.signedUrl) {
            var note = document.createElement('div');
            note.className = 'feed-line sub-text';
            note.textContent = '⚠ 영상을 불러올 수 없어요';
            card.appendChild(note);
            if (s.error) console.error('[feed] signed url error', s.error);
            return;
          }
          var v = document.createElement('video');
          // 결과 화면과 동일하게 자동재생(무음) — webm 자동재생 트리거
          v.setAttribute('playsinline', '');
          v.setAttribute('muted', '');
          v.muted = true;
          v.autoplay = true;
          v.loop = true;
          v.controls = true;
          v.preload = 'auto';
          v.className = 'feed-video';
          v.onerror = function () { console.error('[feed] video error', p.video_url); };
          v.src = s.data.signedUrl;
          card.appendChild(v);
          var play = v.play();
          if (play && play.catch) play.catch(function () { /* 사용자 제스처 필요 시 무시 */ });
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
      // 내가 올린 기록이면 삭제 버튼
      if (p.author_id && p.author_id === myId) {
        var spacer = document.createElement('span');
        spacer.style.flex = '1';
        bar.appendChild(spacer);
        var del = document.createElement('button');
        del.className = 'post-del';
        del.textContent = '🗑 삭제';
        del.addEventListener('click', function () { deletePost(p); });
        bar.appendChild(del);
      }
      card.appendChild(bar);
      return card;
    });
  }

  function deletePost(p) {
    Modal.confirm({
      title: '기록 삭제',
      message: '이 공부 기록을 삭제할까요?<br/>되돌릴 수 없어요.',
      confirmText: '삭제', danger: true
    }).then(function (ok) {
      if (!ok) return;
      var path = p.video_url;
      // 게시물 먼저 삭제 → 그 영상을 참조하는 게시물이 하나도 안 남았을 때만 스토리지 삭제
      client().from('posts').delete().eq('id', p.id).then(function (r) {
        if (r.error) { toast('삭제 오류: ' + r.error.message); return; }
        maybeDeleteOrphanVideo(path).then(function () {
          toast('기록을 삭제했어요');
          renderFeed();
        });
      });
    });
  }

  // 이 영상 경로를 참조하는 게시물이 하나도 없으면 스토리지에서 실제 삭제
  // (같은 영상을 그룹 2개에 올렸다가 하나만 지운 경우엔 남겨둠 → 공간 안전)
  function maybeDeleteOrphanVideo(path) {
    if (!path) return Promise.resolve();
    return client().from('posts').select('id').eq('video_url', path).limit(1)
      .then(function (r) {
        if (!r.error && (!r.data || r.data.length === 0)) {
          return client().storage.from('feed-videos').remove([path]).then(function () {});
        }
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
      if (!groups.length) {
        toast('먼저 그룹을 만들어주세요'); openGroups(); return;
      }
      if (groups.length === 1) { doUpload(groups[0], blob, info); return; }
      Modal.choose({
        title: '어느 그룹에 올릴까요?',
        items: groups.map(function (g) { return { label: g.name, value: g.id }; })
      }).then(function (gid) {
        if (!gid) return;
        var target = groups.filter(function (g) { return g.id === gid; })[0];
        if (target) doUpload(target, blob, info);
      });
    });
  }

  var uploadedThisSession = {};   // videoId -> true (같은 촬영을 여러 그룹에 올릴 때 재업로드 방지)

  function doUpload(target, blob, info) {
    var btn = document.getElementById('btn-feed-upload');
    var C = window.PencilCharacter;
    var c = client();
    var uid = session.user.id;
    // 촬영 1건 = 파일 1개. 여러 그룹에 올려도 같은 경로(공유).
    var path = uid + '/' + info.videoId + '.webm';
    btn.disabled = true; btn.textContent = '올리는 중…';

    function ensureUploaded() {
      if (uploadedThisSession[info.videoId]) return Promise.resolve();
      return c.storage.from('feed-videos').upload(path, blob, { contentType: 'video/webm', upsert: true })
        .then(function (up) {
          if (up.error) throw up.error;
          uploadedThisSession[info.videoId] = true;
        });
    }

    // 같은 날, 같은 그룹의 내 기록이 있는지 (하루 한 장)
    c.from('posts')
      .select('id,study_seconds,video_url')
      .eq('group_id', target.id).eq('author_id', uid).eq('study_date', info.date)
      .maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        var existing = r.data;
        return ensureUploaded().then(function () {
          if (existing) {
            // 그날 공부시간 누적 + 최신 영상으로 갱신
            var total = (existing.study_seconds || 0) + info.seconds;
            var oldPath = existing.video_url;
            return c.from('posts').update({
              study_seconds: total,
              final_stage: C.stageForSeconds(total),
              final_line: C.lineForSeconds(total),
              video_url: path,
              created_at: new Date().toISOString()
            }).eq('id', existing.id).then(function (res) {
              if (res.error) throw res.error;
              // 이전 영상이 다른 게시물에서도 안 쓰이면 정리
              var cleanup = (oldPath && oldPath !== path) ? maybeDeleteOrphanVideo(oldPath) : Promise.resolve();
              return cleanup.then(function () { return { added: true, total: total }; });
            });
          }
          // 그날 첫 기록: 새 게시물
          var postId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
            : (Date.now() + '-' + Math.floor(Math.random() * 1e9));
          return c.from('posts').insert({
            id: postId, group_id: target.id, study_date: info.date,
            study_seconds: info.seconds, final_stage: C.stageForSeconds(info.seconds),
            final_line: C.lineForSeconds(info.seconds), video_url: path
          }).then(function (res) {
            if (res.error) throw res.error;
            return { added: false, total: info.seconds };
          });
        });
      })
      .then(function (out) {
        toast(out.added ? '오늘 기록에 더했어요! (총 ' + C.formatHMS(out.total) + ')' : '친구 피드에 올렸어요!');
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
    Modal.copy({
      title: '초대 링크',
      message: '이 링크를 받은 친구만 이 그룹에 들어올 수 있어요',
      value: inviteLink(currentGroup.invite_code)
    });
  }

  // ---------- 이벤트/초기화 ----------
  function bind() {
    document.getElementById('btn-google').addEventListener('click', signInGoogle);
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-create-group').addEventListener('click', createGroup);
    document.getElementById('btn-join-group').addEventListener('click', joinGroupPrompt);
    document.getElementById('btn-invite').addEventListener('click', copyInvite);
    document.getElementById('btn-leave-group').addEventListener('click', leaveGroup);
    document.getElementById('btn-delete-group').addEventListener('click', deleteGroup);
    document.getElementById('btn-feed-upload').addEventListener('click', uploadToFeed);
    document.getElementById('btn-friends-feed').addEventListener('click', function () {
      if (!session) { show('login'); return; }
      openGroups();
    });
    var gos = document.querySelectorAll('[data-go]');
    for (var i = 0; i < gos.length; i++) {
      (function (el) {
        el.addEventListener('click', function () {
          var t = el.getAttribute('data-go');
          if (t === 'home' && window.App && window.App.goHome) window.App.goHome();
          else show(t);
        });
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
        updateHome();
        if (session && (pendingJoin || params.get('friends') === '1')) afterLogin();
      });
      c.auth.onAuthStateChange(function (_evt, s) {
        session = s;
        updateHome();
        if (!s) {
          var btn = document.getElementById('btn-feed-upload');
          if (btn) btn.classList.add('hidden');
        }
      });
    }
  }

  window.Friends = { enter: enter, onResultReady: onResultReady, updateHome: updateHome };
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
