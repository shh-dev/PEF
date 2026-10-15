// 앱 유형별 고도화 프로파일: 방향 한 줄, 해당 없음 영역, 점수 가중치 (PLAYBOOK §1.5 표를 코드로).
// 기본 가중치(SCORING §1)에서 바뀐 값은 보고서에 "기본값 대비 변경 + 이유"로 반드시 나온다.
import { TYPE_LABEL } from './classify.js';

const UI = ['4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.20'];
const GROUPS = ['기능 완결성', 'UX/UI 완성도', '코드 및 아키텍처', '성능 및 경량화', '보안 및 개인정보', '안정성 및 테스트', '운영 및 유지보수'];
const w = (...n) => Object.fromEntries(GROUPS.map((g, i) => [g, n[i]]));

export const DEFAULT_WEIGHTS = w(20, 20, 15, 15, 15, 10, 5);

export const PROFILES = {
  web: { direction: '사용자 화면 품질(UX·접근성·반응형)과 보안·성능을 균형 있게 올린다', notApplicable: [], weights: DEFAULT_WEIGHTS, why: '일반 웹 서비스는 기본 가중치 그대로' },
  'internal-tool': {
    direction: '기능 완결성·데이터 정합성·권한을 우선하고, 화면 꾸밈은 덜 본다',
    notApplicable: [],
    weights: w(25, 10, 15, 10, 15, 15, 10),
    why: '내부 도구는 정확한 동작과 권한이 핵심이고 시각 완성도 비중은 낮음',
  },
  'api-server': {
    direction: '보안·신뢰성·API 효율·DB 정합성·관측성을 우선한다 (화면 영역은 제외)',
    notApplicable: UI,
    weights: w(20, 0, 15, 15, 25, 20, 5),
    why: '화면이 없어 UI 영역(4.2~4.7, 4.20)은 해당 없음',
  },
  desktop: {
    direction: '성능·메모리, 안정성(충돌·복구), 업데이트·배포를 우선한다 (브라우저 반응형은 제외)',
    notApplicable: ['4.6'],
    weights: w(20, 15, 15, 20, 10, 15, 5),
    why: '데스크톱은 브라우저 반응형(4.6)이 해당 없고 성능·안정성 비중이 큼',
  },
  mobile: {
    direction: '화면 크기·터치 UX, 성능·배터리, 안정성을 우선한다',
    notApplicable: [],
    weights: w(20, 20, 10, 20, 10, 15, 5),
    why: '모바일은 UX·성능·안정성 비중이 큼 (스토어 심사·OS별 항목은 체크리스트 보강 필요)',
  },
  'cli-library': {
    direction: '코드 품질·API 안정성·테스트·문서를 우선한다 (화면 영역은 제외)',
    notApplicable: ['4.3', '4.4', '4.5', '4.6', '4.7'],
    weights: w(20, 5, 25, 10, 10, 20, 10),
    why: '시각·인터랙션·반응형·접근성(4.3~4.7)은 해당 없음',
  },
  'batch-bot': {
    direction: '신뢰성·복구·멱등성, 관측성, 시크릿 관리를 우선한다 (화면 영역은 제외)',
    notApplicable: UI,
    weights: w(10, 0, 15, 10, 20, 30, 15),
    why: '화면이 없어 UI 영역은 해당 없고 실패해도 조용한 작업이라 신뢰성·관측성 비중이 큼',
  },
  unknown: { direction: '유형을 알 수 없다 — 사용자에게 확인 후 정한다', notApplicable: [], weights: DEFAULT_WEIGHTS, why: '유형 미확정이라 기본값' },
};

/** 분류 결과의 주 유형 → 프로파일 키 (cli 와 library 는 한 프로파일) */
export const profileKey = (type) => (type === 'cli' || type === 'library' ? 'cli-library' : type);

export function buildProfile(type, extra = {}) {
  const key = profileKey(type);
  const p = PROFILES[key];
  if (!p) throw new Error(`알 수 없는 유형: ${type} (가능: ${Object.keys(PROFILES).join(', ')})`);
  const changed = Object.entries(p.weights)
    .filter(([g, v]) => v !== DEFAULT_WEIGHTS[g])
    .map(([g, v]) => `${g}: ${DEFAULT_WEIGHTS[g]}→${v}`);
  return { type: key, label: TYPE_LABEL[key], direction: p.direction, notApplicable: p.notApplicable, weights: p.weights, why: p.why, weightChanges: changed, ...extra };
}
