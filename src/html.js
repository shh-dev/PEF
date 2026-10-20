// 사람이 읽는 HTML 보고서 (자체 완결형 단일 파일, 외부 로딩 없음). 모든 문자열은 마스킹 후 이스케이프.
import { mask } from './mask.js';
import { kst } from './time.js';

const esc = (s) => mask(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SEV_ORDER = ['P0', 'P1', 'P2', 'P3', 'P4'];
const SEV_TEXT = { P0: '치명', P1: '높음', P2: '보통', P3: '낮음', P4: '참고' };

const verdictTone = (v) => (v.startsWith('출시 차단') ? 'bad' : v.startsWith('출시 보류') ? 'warn' : v.includes('미완결') ? 'warn' : 'ok');

function item(f) {
  const loc = f.filePath ? `${f.filePath}${f.line ? `:${f.line}` : ''}` : '';
  return `<li class="f">
  <div class="fh"><span class="sev ${f.severity}">${f.severity} ${SEV_TEXT[f.severity]}</span>
  <span class="ver">${esc(f.verification)}${f.needsLiveCheck ? ' · 라이브 확인 필요' : ''}</span>
  <b>${esc(f.title)}</b></div>
  ${f.impact ? `<p><em>무슨 문제?</em> ${esc(f.impact)}</p>` : ''}
  ${f.recommendedFix ? `<p><em>어떻게 고치나?</em> ${esc(f.recommendedFix)}</p>` : ''}
  ${f.dispositionReason ? `<p><em>처분 이유</em> ${esc(f.dispositionReason)}</p>` : ''}
  ${f.dispositionEvidence ? `<p><em>확인한 근거</em> ${esc(f.dispositionEvidence)}</p>` : ''}
  ${f.recheckWhen ? `<p><em>다시 볼 조건</em> ${esc(f.recheckWhen)}</p>` : ''}
  <p class="meta">${esc(f.id)} · ${esc(f.ruleId)}${loc ? ` · ${esc(loc)}` : ''}${f.evidence ? ` · 증거: ${esc(f.evidence)}` : ''}</p>
</li>`;
}

/** 같은 규칙의 Finding이 많으면 접어서 묶는다 */
function group(title, hint, findings, open = false) {
  if (!findings.length) return '';
  const sorted = [...findings].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const byRule = new Map();
  for (const f of sorted) byRule.set(f.ruleId, [...(byRule.get(f.ruleId) ?? []), f]);
  const body = [...byRule.entries()]
    .map(([rule, fs]) => (fs.length > 8 ? `<details><summary>${esc(rule)} — ${fs.length}건 (펼쳐서 보기)</summary><ul>${fs.map(item).join('')}</ul></details>` : `<ul>${fs.map(item).join('')}</ul>`))
    .join('');
  return `<section><details ${open ? 'open' : ''}><summary class="sec">${esc(title)} <span class="n">${findings.length}</span></summary><p class="hint">${esc(hint)}</p>${body}</details></section>`;
}

export function renderHtml(merged, s, now = new Date(), history = [], profile = null) {
  const m = merged.meta;
  const all = merged.findings;
  const dispo = (d) => all.filter((f) => f.disposition === d && !['FalsePositive', 'NotApplicable'].includes(f.verification));
  const act = dispo('ActNow');
  const plan = dispo('Plan');
  const noAction = s.ignoredFindings;
  const pending = all.filter((f) => (!f.disposition || f.disposition === 'NeedsCheck') && !['FalsePositive', 'NotApplicable'].includes(f.verification));
  const tone = verdictTone(s.verdict);
  const scoreText = s.total === null ? '점수 산출 불가' : `${s.total}점`;
  const manual = s.manualReview;

  const rows = s.groups
    .map(
      (g) =>
        `<tr><td>${esc(g.name)}</td><td>${g.na ? '<span class="dim">해당 없음</span>' : g.insufficient ? '<span class="dim">측정 불충분</span>' : `<div class="bar"><i style="width:${g.score}%"></i></div> <b>${g.score}</b>`}</td><td>${g.coverage}% <span class="dim">(${g.tested}/${g.applicable})</span></td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PEF 보고서</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--tx:#1b1f24;--dim:#6a737d;--line:#e3e6ea;--ok:#1a7f37;--warn:#b35900;--bad:#c62828;--okb:#e6f4ea;--warnb:#fff4e0;--badb:#fdecea;--ac:#2f6feb}
@media(prefers-color-scheme:dark){:root{--bg:#0f1318;--card:#171c23;--tx:#e6e9ed;--dim:#98a2ae;--line:#2a313a;--ok:#56d364;--warn:#f0a63a;--bad:#ff7b72;--okb:#12261a;--warnb:#2b2113;--badb:#2d1716;--ac:#79a8ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.6 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}
main{max-width:860px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:8px 0 2px}.sub{color:var(--dim);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
.verdict{border-left:6px solid var(--ok);background:var(--okb)}.verdict.warn{border-color:var(--warn);background:var(--warnb)}.verdict.bad{border-color:var(--bad);background:var(--badb)}
.verdict h2{margin:0 0 4px;font-size:18px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:10px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px}.kpi b{display:block;font-size:20px}.kpi span{color:var(--dim);font-size:12px}
table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
.bar{display:inline-block;width:90px;height:8px;background:var(--line);border-radius:4px;vertical-align:middle}.bar i{display:block;height:8px;background:var(--ac);border-radius:4px}
.dim{color:var(--dim)}
details>summary{cursor:pointer}summary.sec{font-weight:700;font-size:16px;padding:6px 0}.n{background:var(--ac);color:#fff;border-radius:10px;padding:0 8px;font-size:12px;margin-left:6px}
.hint{color:var(--dim);margin:2px 0 8px;font-size:13px}
ul{list-style:none;padding:0;margin:0}.f{border-top:1px solid var(--line);padding:10px 0}.f p{margin:4px 0}.f em{font-style:normal;color:var(--dim);margin-right:6px;font-size:12px}
.fh b{word-break:break-word}.meta{color:var(--dim);font-size:12px;word-break:break-all}
.sev{display:inline-block;border-radius:6px;padding:0 6px;font-size:12px;font-weight:700;color:#fff;margin-right:6px}
.P0{background:#b71c1c}.P1{background:#e65100}.P2{background:#b58900}.P3{background:#5c6bc0}.P4{background:#78909c}
.ver{font-size:12px;color:var(--dim);margin-right:6px}
</style></head><body><main>
<h1>PEF 보고서 — ${esc(m.target)}</h1>
<div class="sub">만든 시각 ${esc(kst(now))} · 검사 ${esc(m.auditedAt)} · 코드 버전 ${esc(m.commit)}</div>

${profile ? `<div class="card"><b>앱 분류와 고도화 방향</b><p><b>${esc(profile.label)}</b> — ${esc(profile.direction)}</p><p class="hint">점수 가중치 기본값 대비 변경: ${esc(profile.weightChanges.length ? profile.weightChanges.join(', ') : '없음')} · 해당 없음 영역: ${esc(profile.notApplicable.length ? profile.notApplicable.join(', ') : '없음')}<br>이유: ${esc(profile.why)}</p></div>` : ''}
<div class="card verdict ${tone}">
  <h2>${esc(s.verdict)}</h2>
  <div>${scoreText} · 커버리지 ${s.coverage}% · 신뢰도 ${esc(s.confidence)}</div>
  <div class="sub">${s.completeness.complete ? '✅ 완결 — 모든 항목을 보았고, 나온 문제마다 처분이 정해졌습니다.' : '❌ 미완결 — 아직 못 본 항목이나 판단 전인 문제가 남아 있어, "문제 없음"이라고 보장할 수 없습니다.'}</div>
  <div class="kpis">
    <div class="kpi"><b>${act.length}</b><span>지금 고쳐야 함</span></div>
    <div class="kpi"><b>${plan.length}</b><span>계획에 넣기</span></div>
    <div class="kpi"><b>${noAction.length}</b><span>당장 신경 안 써도 됨</span></div>
    <div class="kpi"><b>${pending.length}</b><span>판단 전</span></div>
    <div class="kpi"><b>${s.completeness.unjudged.length}</b><span>아직 못 본 항목</span></div>
  </div>
</div>

${group('지금 고쳐야 하는 것', '서비스나 사용자에게 실제 피해가 갈 수 있어 먼저 처리할 것들입니다.', act, true)}
${group('계획에 넣을 것', '급하진 않지만 고치기로 한 것들입니다.', plan)}
${group('당장 신경 쓰지 않아도 되는 것', '영향이 없다는 것을 실제로 확인한 것만 여기 들어옵니다. "다시 볼 조건"이 되면 다시 확인하세요.', noAction)}
${group('아직 판단 전인 것', '도구나 점검이 찾았지만 아직 지금/계획/무시 중 어느 쪽인지 정하지 않은 것입니다.', pending)}

${manual.length ? `<section class="card"><b>사람이 직접 확인할 것</b><p class="hint">코드만으로는 확정할 수 없고 실제 서버·DB·설정을 봐야 하는 것입니다.</p><p>${manual.map(esc).join(', ')}</p></section>` : ''}

${
  history.length
    ? `<section class="card"><b>고도화 진행 기록</b><p class="hint">점검할 때마다 쌓이는 기록입니다. 무슨 작업을 해서 점수가 어떻게 바뀌었는지 보여 줍니다.</p><table><tr><th>시각</th><th>점수</th><th>한 일</th></tr>${[
        ...history,
      ]
        .reverse()
        .map(
          (e, i, a) =>
            `<tr><td>${esc(e.at)}</td><td>${e.total === null ? '-' : e.total}${a[i + 1] && a[i + 1].total !== null && e.total !== null ? ` <span class="dim">(${e.total - a[i + 1].total >= 0 ? '+' : ''}${e.total - a[i + 1].total})</span>` : ''}</td><td>${esc(e.note || '')}</td></tr>`,
        )
        .join('')}</table></section>`
    : ''
}

<section class="card"><b>영역별 점수</b>
<table><tr><th>영역</th><th>점수</th><th>본 비율</th></tr>${rows}</table>
<p class="hint">영역별 최저: ${esc(s.lowest.map((d) => `${d.area} ${d.name} ${d.score}`).join(' · ') || '없음')}${s.weakAreas.length ? ` · ⚠ 취약: ${esc(s.weakAreas.map((d) => `${d.area} ${d.name}`).join(', '))}` : ''}</p></section>

${s.completeness.complete ? '' : `<section class="card"><details><summary class="sec">아직 못 본 항목 (${s.completeness.unjudged.length})</summary><p class="hint">판정이 없거나 사람 확인이 필요한 체크리스트 항목입니다.</p><p>${s.completeness.unjudged.map(esc).join(', ')}</p></details></section>`}
<p class="sub">이 점수는 PEF 자체 기준입니다. 정적 점검이라 실제 서버·DB·화면에서만 확인되는 문제는 빠질 수 있습니다.</p>
</main></body></html>
`;
}
