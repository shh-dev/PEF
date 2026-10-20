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

// Finding 의 source → 그 도구를 돌렸다고 기록되는 toolsUsed 이름. 이번 결과가 그 도구를 *돌린* 경우에만 "사라짐=해결"로 본다.
const TOOL_ID = { knip: 'knip', semgrep: 'semgrep', 'osv-scanner': 'osv-scanner', 'dependency-cruiser': 'depcruise', gitleaks: 'gitleaks', 'pef-design': 'pef-design' };

/**
 * 이어서 고도화: 이전 상태(prior)에 이번 결과(fresh)를 얹는다.
 *  - 같은 Finding은 이전 처분·id를 유지 (사람이 정한 판단을 잃지 않음)
 *  - 도구가 이번에 더 이상 못 찾은 도구 Finding → fixStatus=Verified (고쳐졌다는 증거: 재검사에서 사라짐)
 *  - 판정(coverage)은 이번에 다시 본 항목은 이번 값으로 덮어쓴다 (고친 뒤 Confirmed → Clean 이 되어야 하므로)
 * @returns {{merged: object, newlyFixed: number}}
 */
export function continueFrom(prior, fresh) {
  const freshKeys = new Set(fresh.findings.map(key));
  const priorKeys = new Set(prior.findings.map(key));
  let newlyFixed = 0;

  const carried = prior.findings.map((f) => {
    const gone = (fresh.meta.toolsUsed ?? []).includes(TOOL_ID[f.source]) && !freshKeys.has(key(f)) && !['Fixed', 'Verified', 'AcceptedRisk'].includes(f.fixStatus);
    if (gone) newlyFixed++;
    return gone ? { ...f, fixStatus: 'Verified', verificationResult: 'Improved', fixEvidence: `재검사에서 ${f.source} 가 더 이상 찾지 못함 (${fresh.meta.auditedAt})` } : f;
  });
  const added = fresh.findings.filter((f) => !priorKeys.has(key(f)));
  const ids = new Set(carried.map((f) => f.id));
  let n = 0;
  for (const f of added) {
    while (ids.has(f.id)) f.id = `${f.id.replace(/-n\d+$/, '')}-n${++n}`;
    ids.add(f.id);
  }

  return {
    newlyFixed,
    merged: {
      meta: { ...prior.meta, ...fresh.meta, scope: [...new Set([...prior.meta.scope, ...fresh.meta.scope])], toolsUsed: [...new Set([...(prior.meta.toolsUsed ?? []), ...(fresh.meta.toolsUsed ?? [])])] },
      findings: [...carried, ...added],
      coverage: { ...prior.coverage, ...fresh.coverage },
      coverageNotes: { ...prior.coverageNotes, ...fresh.coverageNotes },
    },
  };
}
