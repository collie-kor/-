/*
 * character.js — 캐릭터 상태/대사 선택 순수 로직 (플랫폼 독립)
 * 기획서 5장. 안드로이드 이식 시 이 로직을 그대로 Kotlin으로 옮긴다.
 * DOM/캔버스에 의존하지 않는다.
 */
(function (global) {
  'use strict';

  // 30분 단위 대사 테이블 (기획서 5.3)
  // atMin: 누적 시간(분), text: 대사
  var LINES = [
    { atMin: 0,   text: '자, 시작해볼까!' },
    { atMin: 30,  text: '오, 집중 들어간다' },
    { atMin: 60,  text: '제대로 공부 시작했군..' },
    { atMin: 90,  text: '이 페이스 좋은데?' },
    { atMin: 120, text: '잘하고 있어! 계속해' },
    { atMin: 150, text: '슬슬 몸이 풀렸지?' },
    { atMin: 180, text: '집중력 짱이다! 대단해' },
    { atMin: 210, text: '여기서 조금만 더!' },
    { atMin: 240, text: '화이팅! 화이팅!' },
    { atMin: 270, text: '어라, 아직도 하네?' },
    { atMin: 300, text: '계속 하는거야..?' },
    { atMin: 330, text: '나 슬슬 힘든데..' },
    { atMin: 360, text: '무리하는거 아니지?' },
    { atMin: 390, text: '너 진짜 독하다..' },
    { atMin: 420, text: '나 자러가도 돼...?' },
    { atMin: 450, text: '눈이.. 감긴다..' },
    { atMin: 480, text: 'Zzz...' },
    { atMin: 540, text: '(쿨쿨.. 넌 계속 가는구나)' }
  ];

  // 단계별 짧은 상태 라벨(결과 카드용) — 기획서 5.2
  var STATE_LABELS = {
    1: '쌩쌩하게 응원 중',
    2: '흐뭇하게 응원 중',
    3: '감탄하는 중',
    4: '최고 텐션!',
    5: '살짝 의아해함',
    6: '걱정하기 시작',
    7: '꾸벅꾸벅 졸림',
    8: '먼저 잠들어버림'
  };

  /** 누적 시간(초) → 사용할 캐릭터 이미지 단계(1~8). floor(hours) clamp 1..8 */
  function stageForSeconds(sec) {
    var hours = sec / 3600;
    var stage = Math.floor(hours);
    if (stage < 1) stage = 1;
    if (stage > 8) stage = 8;
    return stage;
  }

  /** 누적 시간(초) → 현재 대사 (마지막으로 도달한 30분 구간) */
  function lineForSeconds(sec) {
    var min = sec / 60;
    var chosen = LINES[0].text;
    for (var i = 0; i < LINES.length; i++) {
      if (min >= LINES[i].atMin) chosen = LINES[i].text;
      else break;
    }
    return chosen;
  }

  function stateLabel(stage) {
    return STATE_LABELS[stage] || '';
  }

  /** 초 → "HH:MM:SS" */
  function formatHMS(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  global.PencilCharacter = {
    LINES: LINES,
    stageForSeconds: stageForSeconds,
    lineForSeconds: lineForSeconds,
    stateLabel: stateLabel,
    formatHMS: formatHMS,
    imagePath: function (stage) { return 'assets/pencil_' + stage + 'h.png'; }
  };
})(typeof window !== 'undefined' ? window : this);
