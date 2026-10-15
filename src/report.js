import { mask } from './mask.js';
import { kst } from './time.js';

const sevOrder = ['P0', 'P1', 'P2', 'P3', 'P4'];

export function renderReport(merged, s, now = new Date()) {
  const m = merged.meta;
  const top = merged.findings.filter((f) => f.severity === 'P0' || f.severity === 'P1').sort((a, b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity));
  const row = (g) => `| ${g.name} | ${g.weight} | ${g.insufficient ? '측정 불충분' : g.score} | ${g.coverage}% (${g.tested}/${g.applicable}) |`;
  const out = [
    `# PEF 보고서 — ${m.target}`,
    '',
    `- 생성: ${kst(now)}`,
    `- 검사일시: ${m.auditedAt}`,
    `- Git commit: ${m.commit}`,
    `- 앱 프로파일: ${m.profile}`,
    '',
    '## 1. 요약',
    `**${s.verdict}** · ${s.total === null ? '총점 산출 불가' : `${s.total}점`} (커버리지 ${s.coverage}%, 신뢰도 ${s.confidence})`,
    `Finding ${s.counts.findings}건 = P0 ${s.counts.P0} / P1 ${s.counts.P1} / P2 ${s.counts.P2} / P3 ${s.counts.P3} / P4 ${s.counts.P4}`,
    '',
    '## 2. 점수',
    '| 점수 영역 | 가중치 | 점수 | 커버리지 |',
    '|---|---|---|---|',
    ...s.groups.map(row),
    '',
    `영역별 최저: ${s.lowest.map((d) => `${d.area} ${d.name} ${d.score}`).join(' · ') || '없음'}`,
    ...(s.weakAreas.length ? ['', `⚠ 취약 영역(50 미만): ${s.weakAreas.map((d) => `${d.area} ${d.name} ${d.score}`).join(', ')}`] : []),
    '',
    '## 3. 주요 Finding (P0~P1)',
    ...(top.length
      ? top.flatMap((f) => [
          `### ${f.id} [${f.severity}/${f.verification}] ${mask(f.title)}`,
          `- 위치: ${f.filePath ?? '-'}${f.line ? `:${f.line}` : ''}${f.needsLiveCheck ? ' · 라이브 확인 필요' : ''}`,
          ...(f.evidence ? [`- 증거: ${mask(f.evidence)}`] : []),
          ...(f.impact ? [`- 영향: ${mask(f.impact)}`] : []),
          ...(f.recommendedFix ? [`- 권장 수정: ${mask(f.recommendedFix)}`] : []),
          '',
        ])
      : ['없음', '']),
    '## 4. 사람이 직접 확인할 것',
    s.manualReview.length ? s.manualReview.map((id) => `- ${id}`).join('\n') : '없음',
    '',
  ];
  return out.join('\n');
}
