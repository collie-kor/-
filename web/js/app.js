/*
 * app.js — 화면 전환 / 카메라 / 통합 렌더 / 변신 타임랩스 생성
 * (프로토타입: 브라우저에서 실행. 안드로이드에서는 CameraX + Media3로 대체)
 */
(function () {
  'use strict';
  var C = window.PencilCharacter;

  // ---------- DOM ----------
  var screens = {
    entry: document.getElementById('screen-entry'),
    home: document.getElementById('screen-home'),
    capture: document.getElementById('screen-capture'),
    result: document.getElementById('screen-result')
  };
  var captureScreen = document.getElementById('screen-capture');
  var capCanvas = document.getElementById('cap-canvas');
  var cctx = capCanvas.getContext('2d');
  var demoSpeedSel = document.getElementById('demo-speed');
  var homeChar = document.getElementById('home-char');

  // ---------- 상태 ----------
  var charImgs = {};          // stage(1~8) -> Image
  var stream = null;          // MediaStream
  var video = null;           // <video> for camera
  var noCamera = false;
  var running = false;
  var paused = false;         // 일시정지 (타이머·프레임 캡처 정지)
  var studySeconds = 0;       // 실제 공부 누적 시간(초, 일시정지 제외)
  var lastTs = 0;
  var rafId = 0;
  var frames = [];            // 타임랩스용 캡처된 ImageBitmap 배열 (쉬는 구간 제외)
  var lastCaptureTs = 0;
  var CAPTURE_INTERVAL_MS = 400;
  var FRAME_W = 405;          // 타임랩스 프레임 가로 (촬영 시작 시 방향에 맞춰 설정)
  var FRAME_H = 720;
  var captureLandscape = false; // 촬영 시작 순간 감지해 고정하는 방향
  var lastVideoBlobUrl = null;

  // ---------- 유틸 ----------
  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('active', k === name);
    });
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  // ---------- 로컬 저장 (Room 대체) ----------
  var STORE_KEY = 'pencil_stats_v1';
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function isYesterday(dateStr) {
    var d = new Date(); d.setDate(d.getDate() - 1);
    return dateStr === d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function commitSession(sec) {
    var s = loadStats();
    var today = todayStr();
    if (s.date === today) {
      s.todaySeconds = (s.todaySeconds || 0) + sec;
    } else {
      // 연속(스트릭) 계산
      if (s.date && isYesterday(s.date)) s.streak = (s.streak || 0) + 1;
      else s.streak = 1;
      s.date = today;
      s.todaySeconds = sec;
    }
    if (!s.streak) s.streak = 1;
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
    return s;
  }
  function renderHomeStats() {
    var s = loadStats();
    var today = todayStr();
    var todaySec = s.date === today ? (s.todaySeconds || 0) : 0;
    document.getElementById('stat-today').textContent = C.formatHMS(todaySec);
    document.getElementById('stat-streak').textContent = (s.streak || 0) + '일';
  }

  // ---------- 이미지 프리로드 ----------
  function preload() {
    var done = 0;
    return new Promise(function (resolve) {
      for (var i = 1; i <= 8; i++) {
        (function (stage) {
          var img = new Image();
          img.onload = img.onerror = function () {
            done++; if (done === 8) resolve();
          };
          img.src = C.imagePath(stage);
          charImgs[stage] = img;
        })(i);
      }
    });
  }

  // ---------- 손그림 말풍선 ----------
  // 정점에 미세한 고정 흔들림을 줘 손으로 그린 느낌 (프레임마다 떨지 않도록 정적)
  function handRoundRect(ctx, x, y, w, h, r) {
    var j = function (n) { return ((n * 9301 + 49297) % 233280) / 233280 * 2 - 1; };
    ctx.beginPath();
    var pts = [
      [x + r, y], [x + w - r, y],
      [x + w, y + r], [x + w, y + h - r],
      [x + w - r, y + h], [x + r, y + h],
      [x, y + h - r], [x, y + r]
    ];
    ctx.moveTo(pts[0][0] + j(1) * 1.5, pts[0][1] + j(2) * 1.5);
    ctx.lineTo(pts[1][0] + j(3) * 1.5, pts[1][1] + j(4) * 1.5);
    ctx.quadraticCurveTo(x + w, y, pts[2][0], pts[2][1]);
    ctx.lineTo(pts[3][0] + j(5) * 1.5, pts[3][1]);
    ctx.quadraticCurveTo(x + w, y + h, pts[4][0], pts[4][1]);
    ctx.lineTo(pts[5][0], pts[5][1] + j(6) * 1.5);
    ctx.quadraticCurveTo(x, y + h, pts[6][0], pts[6][1]);
    ctx.lineTo(pts[7][0], pts[7][1] + j(7) * 1.5);
    ctx.quadraticCurveTo(x, y, pts[0][0], pts[0][1]);
    ctx.closePath();
  }

  function drawSpeechBubble(ctx, cx, tailX, bottomY, timerText, lineText, scale) {
    scale = scale || 1;
    ctx.save();
    ctx.font = 700 * 1 + ' ' + Math.round(22 * scale) + "px Gaegu, sans-serif";
    var tw1 = ctx.measureText(timerText).width;
    ctx.font = Math.round(21 * scale) + "px Gaegu, sans-serif";
    var tw2 = ctx.measureText(lineText).width;
    var padX = 18 * scale, padY = 12 * scale, lineGap = 6 * scale;
    var w = Math.max(tw1, tw2) + padX * 2;
    var lineH = 24 * scale;
    var h = padY * 2 + lineH * 2 + lineGap;
    var x = cx - w / 2;
    var y = bottomY - h;
    if (x < 6) x = 6;
    if (x + w > ctx.canvas.width - 6) x = ctx.canvas.width - 6 - w;

    // 몸통
    ctx.lineWidth = 2.6 * scale;
    ctx.strokeStyle = '#2B2B2B';
    ctx.fillStyle = 'rgba(250,247,239,0.94)';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    handRoundRect(ctx, x, y, w, h, 16 * scale);
    ctx.fill(); ctx.stroke();

    // 꼬리 (캐릭터 방향)
    ctx.beginPath();
    var tx = Math.min(Math.max(tailX, x + 22 * scale), x + w - 22 * scale);
    ctx.moveTo(tx - 9 * scale, y + h - 1);
    ctx.lineTo(tx + 9 * scale, y + h - 1);
    ctx.lineTo(tx + 2 * scale, y + h + 14 * scale);
    ctx.closePath();
    ctx.fillStyle = 'rgba(250,247,239,0.98)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx - 9 * scale, y + h - 1);
    ctx.lineTo(tx + 2 * scale, y + h + 14 * scale);
    ctx.lineTo(tx + 9 * scale, y + h - 1);
    ctx.stroke();

    // 글자
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2B2B2B';
    ctx.font = '700 ' + Math.round(23 * scale) + "px Gaegu, sans-serif";
    ctx.fillText(timerText, x + w / 2, y + padY + lineH / 2);
    ctx.fillStyle = '#6B6B6B';
    ctx.font = Math.round(21 * scale) + "px Gaegu, sans-serif";
    ctx.fillText(lineText, x + w / 2, y + padY + lineH + lineGap + lineH / 2);
    ctx.restore();
  }

  // ---------- 한 프레임 합성 (라이브/베이크 공용) ----------
  // ctx 크기 기준으로 그린다. time 은 애니메이션 위상용.
  function drawScene(ctx, W, H, sourceDraw, secs, animPhase) {
    // 1) 배경/촬영 프레임
    ctx.clearRect(0, 0, W, H);
    if (sourceDraw) {
      sourceDraw(ctx, W, H);
    } else {
      ctx.fillStyle = '#FAF7EF';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#B9B2A0';
      ctx.textAlign = 'center';
      ctx.font = Math.round(W * 0.05) + "px Gaegu, sans-serif";
      ctx.fillText('카메라 없음 · 데모 모드', W / 2, H * 0.42);
    }

    // 크기 기준: 방향과 무관하게 짧은 변 기준으로 잡아 세로/가로 모두 일관되게
    var base = Math.min(W, H);

    // 2) 상단 공부 타이머 (영상에 함께 구움)
    var timer = C.formatHMS(secs);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '700 ' + Math.round(base * 0.09) + "px Gaegu, sans-serif";
    ctx.lineWidth = Math.max(3, base * 0.013);
    ctx.strokeStyle = 'rgba(250,247,239,0.85)';
    ctx.strokeText(timer, W / 2, base * 0.035);
    ctx.fillStyle = '#2B2B2B';
    ctx.fillText(timer, W / 2, base * 0.035);
    ctx.restore();

    // 3) 캐릭터 (우하단 구석, 살짝 통통) — 세로/가로 모두 구석 배치
    var stage = C.stageForSeconds(secs);
    var img = charImgs[stage];
    var bob = Math.sin(animPhase * 2.2) * (base * 0.008);
    var chH = base * 0.34;
    var chW = img && img.width ? chH * (img.width / img.height) : chH * 0.9;
    var margin = base * 0.05;
    var chX = W - chW - margin;
    var chY = H - chH - margin + bob;
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, chX, chY, chW, chH);
    }

    // 4) 말풍선 (캐릭터 위)
    var line = C.lineForSeconds(secs);
    var bubbleScale = base / 405;
    drawSpeechBubble(ctx, chX + chW / 2, chX + chW * 0.4, chY - base * 0.01,
      timer, line, bubbleScale);
  }

  // ---------- 카메라 프리뷰를 캔버스에 cover 로 ----------
  function makeCoverDraw() {
    return function (ctx, W, H) {
      if (noCamera || !video || video.readyState < 2) {
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
        return;
      }
      var vw = video.videoWidth, vh = video.videoHeight;
      var scale = Math.max(W / vw, H / vh);
      var dw = vw * scale, dh = vh * scale;
      var dx = (W - dw) / 2, dy = (H - dh) / 2;
      ctx.save();
      ctx.translate(W, 0); ctx.scale(-1, 1); // 거울 모드
      ctx.drawImage(video, W - dx - dw, dy, dw, dh);
      ctx.restore();
    };
  }

  // ---------- 라이브 렌더 루프 ----------
  function sizeCanvasToDisplay(canvas) {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
  }

  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;

    if (!paused) {
      var scale = parseFloat(demoSpeedSel.value) || 1;
      studySeconds += dt * scale;   // 일시정지 중에는 누적하지 않음
    }

    sizeCanvasToDisplay(capCanvas);
    var W = capCanvas.width, H = capCanvas.height;
    drawScene(cctx, W, H, makeCoverDraw(), studySeconds, ts / 1000);

    // 타임랩스 프레임 캡처 (일시정지 구간은 캡처 안 함 → 영상에서 자연히 이어붙음)
    if (!paused && ts - lastCaptureTs >= CAPTURE_INTERVAL_MS) {
      lastCaptureTs = ts;
      captureFrame();
    }
    rafId = requestAnimationFrame(loop);
  }

  function togglePause() {
    paused = !paused;
    captureScreen.classList.toggle('paused', paused);
    document.getElementById('rec-label').textContent = paused ? '일시정지' : 'REC';
    document.getElementById('btn-pause').textContent = paused ? '▶' : '❚❚';
  }

  // 현재 장면을 프레임 캔버스에 다운스케일해 저장
  var frameCanvas = document.createElement('canvas');
  frameCanvas.width = FRAME_W; frameCanvas.height = FRAME_H;
  var fctx = frameCanvas.getContext('2d');
  function captureFrame() {
    drawScene(fctx, FRAME_W, FRAME_H, makeCoverDraw(), studySeconds, performance.now() / 1000);
    if (window.createImageBitmap) {
      createImageBitmap(frameCanvas).then(function (bmp) { frames.push(bmp); });
    } else {
      var c = document.createElement('canvas');
      c.width = FRAME_W; c.height = FRAME_H;
      c.getContext('2d').drawImage(frameCanvas, 0, 0);
      frames.push(c);
    }
  }

  // ---------- 카메라 시작 ----------
  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      noCamera = true; return Promise.resolve();
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 1280 } },
      audio: false
    }).then(function (s) {
      stream = s;
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.srcObject = s;
      return video.play();
    }).catch(function () {
      noCamera = true;
    });
  }
  function stopCamera() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    video = null;
  }

  // ---------- 세션 시작/정지 ----------
  function beginSession() {
    studySeconds = 0; frames = []; lastTs = 0; lastCaptureTs = 0; noCamera = false;
    paused = false;
    captureScreen.classList.remove('paused');
    document.getElementById('rec-label').textContent = 'REC';
    document.getElementById('btn-pause').textContent = '❚❚';

    // 촬영 시작 순간의 방향 감지 후 고정 (중간에 폰 돌려도 영상 방향 불변)
    captureLandscape = window.innerWidth > window.innerHeight;
    if (captureLandscape) { FRAME_W = 720; FRAME_H = 405; }
    else { FRAME_W = 405; FRAME_H = 720; }
    frameCanvas.width = FRAME_W; frameCanvas.height = FRAME_H;

    show('capture');
    startCamera().then(function () {
      running = true;
      rafId = requestAnimationFrame(loop);
    });
  }

  function endSession() {
    running = false;
    cancelAnimationFrame(rafId);
    stopCamera();
    var finalSec = Math.floor(studySeconds);
    var s = commitSession(finalSec);

    // 결과 화면 채우기
    document.getElementById('result-total').textContent = C.formatHMS(finalSec);
    var stage = C.stageForSeconds(finalSec);
    document.getElementById('result-state').textContent =
      '[ 연필: ' + C.stateLabel(stage) + ' ]';
    document.getElementById('result-line').textContent =
      '"' + C.lineForSeconds(finalSec) + '"';
    homeChar.src = C.imagePath(1);
    renderHomeStats();

    show('result');
    buildTimelapse();
  }

  // ---------- 변신 타임랩스 영상 생성 ----------
  function pickMime() {
    var cands = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (var i = 0; i < cands.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(cands[i])) return cands[i];
    }
    return '';
  }

  function buildTimelapse() {
    var vidEl = document.getElementById('result-video');
    if (!frames.length || !window.MediaRecorder) {
      // 폴백: 프레임을 캔버스로 슬라이드쇼만
      toast('영상 생성 미지원 환경');
      return;
    }
    var out = document.createElement('canvas');
    out.width = FRAME_W; out.height = FRAME_H;
    var octx = out.getContext('2d');
    // 첫 프레임 미리 표시
    octx.drawImage(frames[0], 0, 0);

    var mime = pickMime();
    var stream = out.captureStream(0);
    var rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      toast('영상 인코딩 실패'); return;
    }
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var blob = new Blob(chunks, { type: mime || 'video/webm' });
      if (lastVideoBlobUrl) URL.revokeObjectURL(lastVideoBlobUrl);
      lastVideoBlobUrl = URL.createObjectURL(blob);
      window._lastTimelapseBlob = blob;
      vidEl.src = lastVideoBlobUrl;
      vidEl.play().catch(function () {});
    };

    var track = stream.getVideoTracks()[0];
    var fps = 18, delay = 1000 / fps, i = 0;
    rec.start();
    (function step() {
      if (i >= frames.length) {
        // 마지막 프레임 잠깐 유지 후 종료
        setTimeout(function () { try { rec.stop(); } catch (e) {} }, 500);
        return;
      }
      octx.drawImage(frames[i], 0, 0, out.width, out.height);
      if (track.requestFrame) track.requestFrame();
      i++;
      setTimeout(step, delay);
    })();
  }

  // ---------- 저장 / 공유 ----------
  function saveVideo() {
    var blob = window._lastTimelapseBlob;
    if (!blob) { toast('아직 영상이 준비 중이에요'); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'study_timelapse_' + Date.now() + '.webm';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('갤러리(다운로드)에 저장했어요');
  }
  function shareVideo() {
    var blob = window._lastTimelapseBlob;
    if (!blob) { toast('아직 영상이 준비 중이에요'); return; }
    var file = new File([blob], 'study_timelapse.webm', { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: '오늘의 공부 타임랩스' })
        .catch(function () {});
    } else {
      toast('이 브라우저는 공유 시트를 지원 안 해요 (안드로이드에서 동작)');
    }
  }

  // ---------- 이벤트 ----------
  // 진입(모드 선택)
  document.getElementById('btn-mode-solo').addEventListener('click', function () {
    renderHomeStats(); show('home');
  });
  document.getElementById('btn-mode-friends').addEventListener('click', function () {
    toast('친구와 함께하기는 2차 업데이트에서 열려요 (서버 연동)');
  });
  document.getElementById('btn-home-back').addEventListener('click', function () {
    show('entry');
  });

  document.getElementById('btn-start').addEventListener('click', beginSession);
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-stop').addEventListener('click', endSession);
  document.getElementById('btn-back').addEventListener('click', function () {
    renderHomeStats(); show('home');
  });
  document.getElementById('btn-again').addEventListener('click', beginSession);
  document.getElementById('btn-save').addEventListener('click', saveVideo);
  document.getElementById('btn-share').addEventListener('click', shareVideo);

  // ---------- 초기화 ----------
  renderHomeStats();
  preload();
  // 폰트 로드 후 홈 캐릭터 살짝 리렌더 불필요 — 이미지라 무관
})();
