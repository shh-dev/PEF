import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/html.js';
import { score } from '../src/score.js';

test('완료 항목은 미해결 집계에서 제외하고 확인 근거와 함께 보존한다', () => {
  const findings = [
    { id: 'active', disposition: 'ActNow', fixStatus: 'Open' },
    { id: 'verified', disposition: 'ActNow', fixStatus: 'Verified', fixEvidence: '테스트 통과 <script>bad()</script>' },
    { id: 'fixed', disposition: 'Plan', fixStatus: 'Fixed', fixEvidence: '컴파일 확인' },
    { id: 'done-pending', disposition: 'NeedsCheck', fixStatus: 'Verified', fixEvidence: '재검사 통과' },
    { id: 'pending', disposition: 'NeedsCheck', fixStatus: 'Open' },
    { id: 'planned', disposition: 'Plan', fixStatus: 'Planned' },
  ].map(f => ({ category: '4.13 보안', ruleId: 'SE-01', title: f.id, severity: 'P1', verification: 'Confirmed', evidence: '확인', ...f }));
  const merged = { meta: { target: 'fixture', commit: 'abc', auditedAt: 'now' }, findings, coverage: {} };
  const html = renderHtml(merged, score(merged));
  for (const label of ['지금 고쳐야 함', '계획에 넣기', '판단 전']) {
    assert.ok(html.includes(`<b>1</b><span>${label}</span>`), label);
  }
  const completed = html.match(/<section><details[^>]*><summary class="sec">수정 완료 및 검증 결과[\s\S]*?<\/section>/)?.[0];
  assert.ok(completed, '완료 기록이 사라지면 안 됨');
  for (const id of ['verified', 'fixed', 'done-pending']) assert.ok(completed.includes(`<b>${id}</b>`));
  assert.ok(completed.includes('테스트 통과 &lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad()</script>'));
});
