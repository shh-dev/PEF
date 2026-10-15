import test from 'node:test';
import assert from 'node:assert/strict';
import { mask } from '../src/mask.js';
import { validateResult } from '../src/schema.js';
import { mergeResults } from '../src/merge.js';
import { score } from '../src/score.js';
import { loadChecklists } from '../src/checklist.js';
import { kstStamp } from '../src/time.js';
import { parseKnip, parseSemgrep, parseOsv, parseDepcruise } from '../src/adapters.js';
import { buildAuditResult } from '../src/cli.js';

const finding = (o = {}) => ({ id: 'F-1', category: '4.13 보안', ruleId: 'SE-01', title: 't', severity: 'P1', verification: 'Confirmed', evidence: 'e', fixStatus: 'Open', filePath: 'a.js', line: 1, ...o });
const result = (o = {}) => ({ meta: { target: 'x', commit: 'abc', profile: 'p', auditedAt: '2026-10-15T18:00:00+09:00', scope: ['13-security.md'] }, findings: [], coverage: {}, ...o });
const all = (v) => Object.fromEntries([...loadChecklists().values()].flatMap((a) => a.ids).map((id) => [id, v]));

test('마스커: 시크릿·이메일·전화', () => {
  assert.ok(!mask('API_KEY=abcdef123456').includes('abcdef123456'));
  assert.ok(!mask('ghp_' + 'a'.repeat(30)).includes('aaaa'));
  assert.equal(mask('kkenter@x.com'), 'kke***@x.com');
  assert.equal(mask('010-1234-5678'), '***-****-5678');
});

test('체크리스트: 20개 영역과 항목 로드', () => {
  const l = loadChecklists();
  assert.equal(l.size, 20);
  assert.ok(l.get('4.13').ids.includes('SE-24'));
  for (const a of l.values()) assert.ok(a.ids.length > 0, `${a.area} 항목 0개 — ID 형식 파싱 실패`);
  assert.ok(l.get('4.9').ids.includes('C-02'));
});

test('스키마: 필수 항목 누락과 잘못된 enum 검출', () => {
  assert.equal(validateResult(result()).length, 0);
  assert.ok(validateResult(result({ findings: [finding({ severity: 'P9' })] })).length > 0);
  assert.ok(validateResult({ findings: [], coverage: {} }).length > 0);
});

test('합치기: 중복 Finding 1건, 판정 충돌은 더 심각한 쪽', () => {
  const a = result({ findings: [finding()], coverage: { 'SE-01': 'Clean' } });
  const b = result({ findings: [finding({ severity: 'P0' })], coverage: { 'SE-01': 'Confirmed' } });
  const { merged } = mergeResults([{ name: 'a', result: a }, { name: 'b', result: b }]);
  assert.equal(merged.findings.length, 1);
  assert.equal(merged.findings[0].severity, 'P0');
  assert.equal(merged.coverage['SE-01'], 'Confirmed');
  assert.ok(merged.coverageNotes['SE-01']);
});

test('점수: 전부 Clean이면 100, 커버리지 100%', () => {
  const s = score({ findings: [], coverage: all('Clean') });
  assert.equal(s.total, 100);
  assert.equal(s.coverage, 100);
  assert.equal(s.verdict, '차단 없음');
});

test('점수: 아무것도 검사 안 했으면 총점 없음 (만점 금지)', () => {
  const s = score({ findings: [], coverage: {} });
  assert.equal(s.total, null);
  assert.equal(s.confidence, '낮음');
});

test('점수: Confirmed P0 → 출시 차단, 감점 40, Suspected P0 → 보류', () => {
  const cov = all('Clean');
  const s = score({ findings: [finding({ severity: 'P0' })], coverage: cov });
  assert.equal(s.verdict, '출시 차단');
  assert.equal(s.lowest[0].score, 60);
  assert.equal(score({ findings: [finding({ severity: 'P0', verification: 'Suspected' })], coverage: cov }).verdict, '출시 보류 – 수동 확인 필요');
});

test('점수: AcceptedRisk·FalsePositive는 감점 없음', () => {
  const cov = all('Clean');
  assert.equal(score({ findings: [finding({ fixStatus: 'AcceptedRisk' }), finding({ id: 'F-2', verification: 'FalsePositive', line: 2 })], coverage: cov }).total, 100);
});

test('KST 파일명 타임스탬프', () => {
  assert.equal(kstStamp(new Date('2026-10-15T09:28:19Z')), '261015-182819');
});

test('어댑터 파서: 도구 출력 → Finding (실제 체크리스트 ID 사용)', () => {
  const knip = parseKnip(JSON.stringify({ issues: [{ file: 'a.ts', dependencies: [{ name: 'lodash' }] }] }));
  assert.equal(knip[0].ruleId, 'C-02');
  assert.equal(knip[0].verification, 'Suspected');
  const sg = parseSemgrep(JSON.stringify({ results: [{ check_id: 'x.y', path: 'b.js', start: { line: 3 }, extra: { severity: 'ERROR', message: 'bad', lines: 'SECRET=abc' } }] }));
  assert.equal(sg[0].severity, 'P1');
  assert.ok(!JSON.stringify(sg).includes('SECRET=abc')); // 코드 발췌는 넣지 않는다
  const osv = parseOsv(JSON.stringify({ results: [{ source: { path: 'package-lock.json' }, packages: [{ package: { name: 'x', version: '1.0.0' }, groups: [{ ids: ['GHSA-1'], max_severity: '9.8' }], vulnerabilities: [{ id: 'GHSA-1', summary: 's' }] }] }] }));
  assert.equal(osv[0].severity, 'P0');
  const dc = parseDepcruise(JSON.stringify({ summary: { violations: [{ from: 'a', to: 'b', rule: { name: 'no-circular' } }, { from: 'c', to: 'd', rule: { name: 'other' } }] } }));
  assert.equal(dc.length, 1);
});

test('audit 결과: 도구 미설치 항목은 NotTested (통과 처리 금지) 이고 스키마를 통과한다', () => {
  const disc = { stack: ['node'], supportLevel: 'Detection Only', git: { commit: 'abc1234', uncommittedChanges: 0, behindRemote: 0 } };
  const r = buildAuditResult('C:/x', disc, { findings: [], toolsUsed: [], notTested: [{ tool: 'knip', reason: '도구 미설치' }, { tool: 'osv-scanner', reason: '도구 미설치' }] });
  assert.equal(r.coverage['C-02'], 'NotTested');
  assert.equal(r.coverage['SE-11'], 'NotTested');
  assert.deepEqual(validateResult(r), []);
  assert.equal(score(mergeResults([{ name: 'a', result: r }]).merged).total, null);
});

test('처분: NoActionNow 는 근거(이유·확인한 근거·다시 볼 조건) 없으면 검증 실패', () => {
  const bare = finding({ disposition: 'NoActionNow' });
  assert.ok(validateResult(result({ findings: [bare] })).length >= 3);
  const ok = finding({ disposition: 'NoActionNow', dispositionReason: 'r', dispositionEvidence: 'git grep next/og → 0건', recheckWhen: 'next/og 사용 시' });
  assert.deepEqual(validateResult(result({ findings: [ok] })), []);
});

test('완결성: 미판정 항목·처분 없는 Finding이 있으면 미완결, 총점이 높아도 "차단 없음" 아님', () => {
  const s = score({ findings: [finding({ severity: 'P3', verification: 'Suspected' })], coverage: all('Clean') });
  assert.equal(s.completeness.complete, false);
  assert.deepEqual(s.completeness.untriaged, ['F-1']);
  assert.ok(s.verdict.includes('미완결'));
  const done = score({ findings: [finding({ severity: 'P3', verification: 'Suspected', disposition: 'Plan' })], coverage: all('Clean') });
  assert.equal(done.completeness.complete, true);
  assert.equal(done.verdict, '차단 없음');
  assert.equal(score({ findings: [], coverage: {} }).completeness.complete, false);
});

test('처분: 근거 있는 NoActionNow 는 감점·차단에서 빠지고 따로 나열된다', () => {
  const f = finding({ severity: 'P0', disposition: 'NoActionNow', dispositionReason: 'r', dispositionEvidence: 'e', recheckWhen: 'w' });
  const s = score({ findings: [f], coverage: all('Clean') });
  assert.equal(s.verdict, '차단 없음');
  assert.equal(s.total, 100);
  assert.equal(s.ignoredFindings.length, 1);
  assert.equal(s.completeness.complete, true);
});

test('OSV: 취약 버전 설치는 사실이지만 사용 여부를 모르므로 Suspected + NeedsCheck', () => {
  const osv = parseOsv(JSON.stringify({ results: [{ source: { path: 'l' }, packages: [{ package: { name: 'x', version: '1' }, groups: [{ ids: ['G'], max_severity: '9.8' }], vulnerabilities: [{ id: 'G', summary: 's' }] }] }] }));
  assert.equal(osv[0].verification, 'Suspected');
  assert.equal(osv[0].disposition, 'NeedsCheck');
});
