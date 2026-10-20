// docs/SCORING.md 구현. 가중치·매핑·감점표는 그 문서와 같은 값이어야 한다.
import { appliesTo, loadChecklists } from './checklist.js';

const SCORE_AREAS = [
  { name: '기능 완결성', weight: 20, areas: ['4.1'] },
  { name: 'UX/UI 완성도', weight: 20, areas: ['4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.20'] },
  { name: '코드 및 아키텍처', weight: 15, areas: ['4.8', '4.9'] },
  { name: '성능 및 경량화', weight: 15, areas: ['4.10', '4.11'] },
  { name: '보안 및 개인정보', weight: 15, areas: ['4.13', '4.14'] },
  { name: '안정성 및 테스트', weight: 10, areas: ['4.12', '4.15', '4.16'] },
  { name: '운영 및 유지보수', weight: 5, areas: ['4.17', '4.18', '4.19'] },
];

const DEDUCT = {
  Confirmed: { P0: 40, P1: 15, P2: 6, P3: 2, P4: 0 },
  Suspected: { P0: 20, P1: 8, P2: 3, P3: 1, P4: 0 },
};
// 고쳐졌거나(Fixed/Verified) 승인된 위험(AcceptedRisk)은 더 이상 감점·차단·미완결 요인이 아니다
const CLOSED = new Set(['Fixed', 'Verified', 'AcceptedRisk']);
const TESTED = new Set(['Clean', 'Confirmed', 'Suspected']);
const confidence = (c) => (c >= 0.8 ? '높음' : c >= 0.5 ? '중간' : '낮음');
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * 완결성: "다 봤고, 나온 문제마다 처분이 정해졌다"를 보장할 수 있을 때만 complete.
 * 하나라도 비면 어느 항목/Finding이 비었는지 그대로 돌려준다 (총점이 높아도 완결이 아니다).
 */
function completeness(merged, lists, na, type) {
  const unjudged = [...lists.values()]
    .filter((a) => !na.has(a.area))
    .flatMap((a) => a.ids)
    .filter((id) => appliesTo(id, type))
    .filter((id) => ['NotTested', 'RequiresManualReview', undefined].includes(merged.coverage[id]));
  const open = (f) => ['Confirmed', 'Suspected', 'RequiresManualReview'].includes(f.verification) && !(CLOSED.has(f.fixStatus) && (f.fixStatus !== 'AcceptedRisk' || f.acceptedBy));
  const untriaged = merged.findings.filter((f) => open(f) && (!f.disposition || f.disposition === 'NeedsCheck')).map((f) => f.id);
  return { complete: !unjudged.length && !untriaged.length, unjudged, untriaged };
}

/** @param {{findings: object[], coverage: Record<string,string>}} merged */
export function score(merged, profile = null) {
  const na = new Set(profile?.notApplicable ?? []); // 앱 유형상 해당 없는 영역 (프로파일)
  const lists = loadChecklists();
  const areaOf = (f) => f.category.match(/^4\.\d+/)?.[0];

  // 근거와 함께 "당장 신경 안 써도 됨"으로 처분된 Finding은 감점·차단에서 뺀다 (보고서에는 따로 나열). 근거 검증은 validateResult 몫.
  const original = merged;
  merged = { ...merged, findings: merged.findings.filter((f) => f.disposition !== 'NoActionNow') };

  // 세부 영역(4.x)
  const detail = new Map();
  for (const [area, { name, ids }] of lists) {
    const verdicts = ids.map((id) => (na.has(area) || !appliesTo(id, profile?.type) ? 'NotApplicable' : (merged.coverage[id] ?? 'NotTested')));
    const applicable = verdicts.filter((v) => v !== 'NotApplicable').length;
    const tested = verdicts.filter((v) => TESTED.has(v)).length;
    const deduction = merged.findings.filter((f) => areaOf(f) === area && DEDUCT[f.verification] && !CLOSED.has(f.fixStatus)).reduce((s, f) => s + DEDUCT[f.verification][f.severity], 0);
    detail.set(area, { area, name, applicable, tested, score: Math.max(0, 100 - deduction) });
  }

  // 점수 영역
  const groups = SCORE_AREAS.map((g0) => {
    const g = { ...g0, weight: profile?.weights?.[g0.name] ?? g0.weight };
    const ds = g.areas.map((a) => detail.get(a)).filter((d) => d.applicable > 0);
    const applicable = ds.reduce((s, d) => s + d.applicable, 0);
    const tested = ds.reduce((s, d) => s + d.tested, 0);
    const coverage = applicable ? tested / applicable : 0;
    const measured = ds.filter((d) => d.tested > 0);
    const insufficient = !applicable || coverage < 0.5 || !measured.length;
    return { ...g, na: !applicable, applicable, tested, coverage, insufficient, score: insufficient ? null : Math.round(avg(measured.map((d) => d.score))) };
  });

  const counted = groups.filter((g) => !g.insufficient);
  const wsum = counted.reduce((s, g) => s + g.weight, 0);
  const total = wsum ? Math.round(counted.reduce((s, g) => s + g.weight * g.score, 0) / wsum) : null;
  const applicable = groups.reduce((s, g) => s + g.applicable, 0);
  const tested = groups.reduce((s, g) => s + g.tested, 0);
  const coverage = applicable ? tested / applicable : 0;

  const confirmedP0 = merged.findings.filter((f) => f.severity === 'P0' && f.verification === 'Confirmed' && !CLOSED.has(f.fixStatus));
  const suspectedP0 = merged.findings.filter((f) => f.severity === 'P0' && f.verification === 'Suspected' && !CLOSED.has(f.fixStatus));
  const complete = completeness(original, lists, na, profile?.type);
  const bySeverity = Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4'].map((s) => [s, merged.findings.filter((f) => f.severity === s).length]));

  return {
    total,
    coverage: pct(tested, applicable),
    confidence: confidence(coverage),
    // 검사를 거의 못 했는데 "차단 없음"만 보이면 안전하다는 착각을 준다 → 신뢰도 낮음이면 명시
    verdict: confirmedP0.length ? '출시 차단' : suspectedP0.length ? '출시 보류 – 수동 확인 필요' : !complete.complete ? '차단 근거 없음 (미완결 — 안전하다는 보장 아님)' : '차단 없음',
    detail: [...detail.values()],
    groups: groups.map((g) => ({ ...g, coverage: pct(g.tested, g.applicable) })),
    weakAreas: [...detail.values()].filter((d) => d.tested > 0 && d.score < 50),
    lowest: [...detail.values()]
      .filter((d) => d.tested > 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 4),
    counts: { findings: merged.findings.length, ...bySeverity, tested, applicable },
    completeness: complete,
    ignoredFindings: original.findings.filter((f) => f.disposition === 'NoActionNow'),
    manualReview: merged.findings.filter((f) => f.needsLiveCheck || f.verification === 'RequiresManualReview').map((f) => f.id),
  };
}
