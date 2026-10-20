// 고도화 작업 계획: 현재 상태(current.json)에서 "파트별 남은 일"을 계산한다. 저장된 체크 표시가 아니라 상태에서 매번 계산하므로 어긋나지 않는다.
import { loadChecklists } from './checklist.js';
import { score } from './score.js';

const CLOSED = new Set(['Fixed', 'Verified', 'AcceptedRisk']);
const OPEN_V = new Set(['Confirmed', 'Suspected', 'RequiresManualReview']);

/** @returns {{parts: object[], done: boolean, totals: object}} */
export function buildPlan(merged, profile = null) {
  const s = score(merged, profile);
  const lists = loadChecklists();
  const areaOfId = new Map([...lists.values()].flatMap((a) => a.ids.map((id) => [id, a.area])));
  const unjudged = new Set(s.completeness.unjudged);
  const untriaged = new Set(s.completeness.untriaged);
  const open = merged.findings.filter((f) => OPEN_V.has(f.verification) && !CLOSED.has(f.fixStatus));

  const parts = s.groups
    .filter((g) => !g.na)
    .map((g) => {
      const inGroup = (area) => g.areas.includes(area);
      const ids = [...unjudged].filter((id) => inGroup(areaOfId.get(id)));
      const mine = open.filter((f) => inGroup(f.category.match(/^4\.\d+/)?.[0]));
      const toTriage = mine.filter((f) => untriaged.has(f.id)).length;
      const actNow = mine.filter((f) => f.disposition === 'ActNow').length;
      const plan = mine.filter((f) => f.disposition === 'Plan').length;
      const needsCheck = mine.filter((f) => f.disposition === 'NeedsCheck').length;
      const left = ids.length + toTriage + actNow;
      return { name: g.name, score: g.score, unjudged: ids.length, toTriage, actNow, plan, needsCheck, left, done: left === 0 };
    });
  return {
    parts,
    done: parts.every((p) => p.done),
    totals: { unjudged: unjudged.size, toTriage: untriaged.size, plan: parts.reduce((a, p) => a + p.plan, 0) },
  };
}

export function renderPlan(plan, firstDraftAt) {
  const L = [`## 고도화 작업 계획 (1차 작성 ${firstDraftAt})`, '', '| 파트 | 점수 | 판정할 항목 | 처분할 문제 | 지금 고칠 것 | 나중에 할 것 | 상태 |', '|---|---|---|---|---|---|---|'];
  for (const p of plan.parts) L.push(`| ${p.name} | ${p.score ?? '측정불충분'} | ${p.unjudged} | ${p.toTriage} | ${p.actNow} | ${p.plan} | ${p.done ? '✅ 끝' : '👉 남음'} |`);
  const next = plan.parts.find((p) => !p.done);
  L.push('');
  if (next) L.push(`다음 파트: **${next.name}** — 끝나면 보고하고 다음 파트로 넘어갑니다.`);
  else
    L.push(
      plan.totals.plan
        ? `✅ 이번 계획의 모든 파트가 끝났고 새로 생긴 작업물이 없습니다. 이제 "나중에 할 것" ${plan.totals.plan}건을 다음 계획으로 보고하세요.`
        : '✅ 모든 파트가 끝났고 남은 작업물이 없습니다. 재검사로 새 문제가 없는지 확인한 뒤 다음 계획을 보고하세요.',
    );
  return L.join('\n');
}
