// 분담 감사 결과 합치기 (SCORING §4-3).
import { validateResult } from './schema.js';

const WORSE = ['Confirmed', 'Suspected', 'RequiresManualReview', 'NotTested', 'Clean', 'NotApplicable'];
const SEV = ['P0', 'P1', 'P2', 'P3', 'P4'];
const rank = (v) => WORSE.indexOf(v);

/** 같은 문제 = 같은 ruleId + 파일 + 줄 */
const key = (f) => [f.ruleId, f.filePath ?? '', f.line ?? ''].join('|');

/** @param {{name: string, result: object}[]} inputs */
export function mergeResults(inputs) {
  const errors = inputs.flatMap(({ name, result }) => validateResult(result).map((e) => `${name}: ${e}`));
  if (errors.length) return { errors };

  const findings = new Map();
  const coverage = {};
  const coverageNotes = {};
  const scope = new Set();
  const tools = new Set();

  for (const { name, result } of inputs) {
    result.meta.scope.forEach((s) => scope.add(s));
    (result.meta.toolsUsed ?? []).forEach((t) => tools.add(t));
    for (const f of result.findings) {
      const k = key(f);
      const prev = findings.get(k);
      if (!prev || SEV.indexOf(f.severity) < SEV.indexOf(prev.severity)) findings.set(k, { ...f });
    }
    for (const [id, v] of Object.entries(result.coverage)) {
      if (coverage[id] && coverage[id] !== v) {
        const worse = rank(v) < rank(coverage[id]) ? v : coverage[id];
        coverageNotes[id] = [coverageNotes[id], `${name}: ${coverage[id]}/${v} 충돌 → ${worse}`].filter(Boolean).join('; ');
        coverage[id] = worse;
      } else coverage[id] = v;
    }
    Object.entries(result.coverageNotes ?? {}).forEach(([id, n]) => (coverageNotes[id] = [coverageNotes[id], n].filter(Boolean).join('; ')));
  }

  // 서로 다른 입력의 Finding id 충돌 → 순번으로 재부여
  const seen = new Set();
  let n = 0;
  const list = [...findings.values()].map((f) => {
    if (seen.has(f.id)) f.id = `${f.id}-m${++n}`;
    seen.add(f.id);
    return f;
  });

  return {
    errors: [],
    merged: { meta: { ...inputs[0].result.meta, scope: [...scope], toolsUsed: [...tools] }, findings: list, coverage, coverageNotes },
  };
}
