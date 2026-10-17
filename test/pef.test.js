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

test('HTML 보고서: 이스케이프·마스킹, 처분별 섹션', async () => {
  const { renderHtml } = await import('../src/html.js');
  const f = finding({ title: '<script>x</script> API_KEY=abcdef123456', disposition: 'ActNow', impact: '쉬운 설명' });
  const merged = { meta: result().meta, findings: [f], coverage: all('Clean'), coverageNotes: {} };
  const html = renderHtml(merged, score(merged));
  assert.ok(!html.includes('<script>x'));
  assert.ok(!html.includes('abcdef123456'));
  assert.ok(html.includes('지금 고쳐야 하는 것'));
  assert.ok(html.includes('쉬운 설명'));
});

test('triage: 규칙 단위 일괄 처분, 이미 정한 처분은 덮어쓰지 않고, NoActionNow 근거 없으면 저장 안 함', async () => {
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { run } = await import('../src/cli.js');
  const dir = mkdtempSync(`${tmpdir()}/pef-t-`);
  const p = `${dir}/r.json`;
  writeFileSync(p, JSON.stringify(result({ findings: [finding({ id: 'A', ruleId: 'C-02', line: 1 }), finding({ id: 'B', ruleId: 'C-02', line: 2, disposition: 'ActNow' }), finding({ id: 'C', ruleId: 'SE-01', line: 3 })] })));
  const quiet = console.log; console.log = () => {}; const qe = console.error; console.error = () => {};
  try {
    assert.equal(run(['triage', p, '--rule', 'C-02', '--disposition', 'Plan', '--reason', '정리 예정']), 0);
    const r = JSON.parse(readFileSync(p, 'utf8'));
    assert.deepEqual(r.findings.map((f) => f.disposition), ['Plan', 'ActNow', undefined]);
    assert.equal(run(['triage', p, '--rule', 'SE-01', '--disposition', 'NoActionNow', '--reason', 'x']), 2);
    assert.equal(JSON.parse(readFileSync(p, 'utf8')).findings[2].disposition, undefined);
  } finally { console.log = quiet; console.error = qe; }
});

test('지속 고도화: checkpoint 가 이전 상태에 이어 붙고, 고쳐진 도구 Finding 은 Verified, 점수 변화가 기록된다', async () => {
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { run } = await import('../src/cli.js');
  const dir = mkdtempSync(`${tmpdir()}/pef-ck-`);
  const out = `${dir}/.pef`;
  const base = all('Clean');
  const bad = finding({ id: 'F-001', ruleId: 'SE-11', source: 'osv-scanner', verification: 'Confirmed', severity: 'P1', disposition: 'ActNow', line: null });
  writeFileSync(`${dir}/r1.json`, JSON.stringify(result({ findings: [bad], coverage: { ...base, 'SE-11': 'Confirmed' } })));
  writeFileSync(`${dir}/r2.json`, JSON.stringify(result({ findings: [], coverage: base })));
  const quiet = console.log; const logs = []; console.log = (m) => logs.push(m);
  try {
    assert.equal(run(['checkpoint', `${dir}/r1.json`, '--out', out, '--note', '처음 점검']), 0);
    assert.equal(run(['checkpoint', `${dir}/r2.json`, '--out', out, '--note', 'lodash 업그레이드']), 0);
    const hist = JSON.parse(readFileSync(`${out}/history.json`, 'utf8'));
    assert.equal(hist.length, 2);
    assert.ok(hist[1].total > hist[0].total, '고친 뒤 점수가 올라야 함');
    assert.equal(hist[1].newlyFixed, 1);
    const cur = JSON.parse(readFileSync(`${out}/current.json`, 'utf8'));
    assert.equal(cur.findings[0].fixStatus, 'Verified');
    assert.ok(logs.join('\n').includes('lodash 업그레이드'));
    assert.equal(run(['status', out]), 0);
    assert.ok(readFileSync(`${out}/report.html`, 'utf8').includes('고도화 진행 기록'));
  } finally { console.log = quiet; }
});

async function tmpProject(files) {
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { dirname, join } = await import('node:path');
  const dir = mkdtempSync(`${tmpdir()}/pef-c-`);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

test('분류: 웹앱·데스크톱·API·CLI·Tauri·알 수 없음', async () => {
  const { classify } = await import('../src/classify.js');
  const web = classify(await tmpProject({ 'package.json': { dependencies: { next: '1', react: '1', 'react-dom': '1' } }, 'wrangler.jsonc': '{}' }));
  assert.equal(web.types[0].type, 'web');
  assert.ok(web.platforms.some((p) => p.includes('Cloudflare')));
  const el = classify(await tmpProject({ 'package.json': { dependencies: { electron: '1', react: '1', 'react-dom': '1' }, build: { win: {}, mac: {} } } }));
  assert.equal(el.types[0].type, 'desktop'); // 웹 프레임워크가 같이 있어도 electron 이 우선
  assert.deepEqual(el.platforms.filter((p) => ['Windows', 'macOS'].includes(p)), ['Windows', 'macOS']);
  assert.equal(classify(await tmpProject({ 'package.json': { dependencies: { express: '1' } } })).types[0].type, 'api-server');
  assert.equal(classify(await tmpProject({ 'package.json': { bin: { x: 'a.js' } } })).types[0].type, 'cli');
  assert.equal(classify(await tmpProject({ 'src-tauri/tauri.conf.json': '{}' })).types[0].type, 'desktop');
  assert.equal(classify(await tmpProject({ 'readme.txt': 'x' })).types[0].type, 'unknown');
});

test('프로파일: API 서버는 UI 영역이 해당 없음 → 판정 안 해도 미완결 요인 아님, 가중치 변경이 보고됨', async () => {
  const { buildProfile } = await import('../src/profile.js');
  const p = buildProfile('api-server');
  const lists = loadChecklists();
  const noUi = Object.fromEntries([...lists.values()].filter((a) => !p.notApplicable.includes(a.area)).flatMap((a) => a.ids).map((id) => [id, 'Clean']));
  const withProfile = score({ findings: [], coverage: noUi }, p);
  assert.equal(withProfile.completeness.complete, true);
  assert.equal(withProfile.groups.find((g) => g.name === 'UX/UI 완성도').na, true);
  assert.equal(withProfile.total, 100);
  assert.equal(score({ findings: [], coverage: noUi }).completeness.complete, false); // 프로파일 없으면 UI 항목 미판정 → 미완결
  assert.ok(p.weightChanges.length > 0);
});

test('profile 명령: 저장 후 checkpoint 가 자동으로 따른다', async () => {
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { run } = await import('../src/cli.js');
  const dir = mkdtempSync(`${tmpdir()}/pef-p-`);
  const out = `${dir}/.pef`;
  const cov = Object.fromEntries([...loadChecklists().values()].filter((a) => !['4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.20'].includes(a.area)).flatMap((a) => a.ids).map((id) => [id, 'Clean']));
  writeFileSync(`${dir}/r.json`, JSON.stringify(result({ coverage: cov })));
  const quiet = console.log; const qe = console.error; console.log = () => {}; console.error = () => {};
  try {
    assert.equal(run(['profile', 'api-server', '--out', out, '--note', '사용자: 서버만']), 0);
    assert.equal(run(['checkpoint', `${dir}/r.json`, '--out', out, '--note', 'x']), 0);
    const hist = JSON.parse(readFileSync(`${out}/history.json`, 'utf8'));
    assert.equal(hist[0].complete, true);
    assert.ok(readFileSync(`${out}/report.html`, 'utf8').includes('앱 분류와 고도화 방향'));
    assert.equal(run(['profile', '없는유형', '--out', out]), 2);
  } finally { console.log = quiet; console.error = qe; }
});

test('유형 전용 항목: DK-* 는 데스크톱에서만, MB-* 는 모바일에서만 점검 대상 (웹은 해당 없음으로 셈)', async () => {
  const { appliesTo } = await import('../src/checklist.js');
  const { buildProfile } = await import('../src/profile.js');
  assert.equal(appliesTo('DK-01', 'desktop'), true);
  assert.equal(appliesTo('DK-01', 'web'), false);
  assert.equal(appliesTo('MB-01', 'mobile'), true);
  assert.equal(appliesTo('SE-01', 'web'), true);
  assert.equal(appliesTo('DK-01', undefined), false);
  const webIds = [...loadChecklists().values()].flatMap((a) => a.ids).filter((id) => appliesTo(id, 'web'));
  const cov = Object.fromEntries(webIds.map((id) => [id, 'Clean']));
  assert.equal(score({ findings: [], coverage: cov }).completeness.complete, true); // 웹은 DK/MB 안 봐도 완결
  const desk = buildProfile('desktop');
  const s = score({ findings: [], coverage: cov }, desk);
  assert.equal(s.completeness.complete, false); // 데스크톱으로 확정하면 DK-* 미판정이 남음
  assert.ok(s.completeness.unjudged.some((id) => id.startsWith('DK-')));
  assert.ok(!s.completeness.unjudged.some((id) => id.startsWith('MB-')));
});

test('영수증: .env 값은 절대 읽지 않고 이름만, 시크릿·토큰은 출력에 없다', async () => {
  const { buildReceipt, renderReceiptMd, renderReceiptHtml } = await import('../src/receipt.js');
  const dir = await tmpProject({
    'package.json': { name: 'demo', dependencies: { '@supabase/supabase-js': '1', stripe: '1' } },
    '.env.local': 'SUPABASE_SERVICE_ROLE_KEY=sb_secret_REALVALUE_should_never_appear_123456\n',
    '.env.example': 'SUPABASE_SERVICE_ROLE_KEY=\nSTRIPE_SECRET_KEY=\n',
    'src/a.ts': 'const u = process.env.NEXT_PUBLIC_SUPABASE_URL; const k = process.env.STRIPE_SECRET_KEY; const x = process.env.ONLY_IN_CODE_TOKEN;',
    'wrangler.jsonc': '{ // 주석\n "name": "demo-worker", "account_id": "0123456789abcdef0123456789abcdef", "routes": [{"pattern":"demo.example.com/*"}], "triggers": {"crons":["0 * * * *"]}, "vars": {"APP_ENV":"production-value-hidden"} }',
    '.mcp.json': { mcpServers: { files: { command: 'npx', args: ['-y', '@x/mcp', '--token=SECRETTOKEN12345'], env: { MY_API_KEY: 'LEAKME_VALUE_999999' } }, remote: { url: 'https://mcp.example.com/sse?key=LEAKQUERY', headers: { Authorization: 'Bearer LEAKBEARER_abcdefghijk' } } } },
  });
  const r = buildReceipt(dir);
  const md = renderReceiptMd(r);
  const html = renderReceiptHtml(r);
  for (const leak of ['REALVALUE_should_never', 'SECRETTOKEN12345', 'LEAKME_VALUE', 'LEAKQUERY', 'LEAKBEARER', 'production-value-hidden']) {
    assert.ok(!md.includes(leak) && !html.includes(leak), `${leak} 가 영수증에 노출됨`);
  }
  assert.ok(md.includes('SUPABASE_SERVICE_ROLE_KEY') && md.includes('ONLY_IN_CODE_TOKEN')); // 이름은 나온다
  assert.ok(md.includes('MY_API_KEY') && md.includes('mcp.example.com')); // MCP 는 env 이름·호스트만
  assert.ok(md.includes('0123…cdef')); // 계정 ID 는 가림
  assert.ok(md.includes('demo.example.com/*') && md.includes('0 * * * *'));
  assert.ok(r.env.realFiles.includes('.env.local')); // 존재만 알림
  assert.ok(md.includes('.env.example 에 없는 환경변수') && md.includes('ONLY_IN_CODE_TOKEN'));
});

test('영수증: 실시간 확인 출력 파서 (wrangler whoami, supabase projects list)', async () => {
  const { parseWhoami, parseSupabaseProjects } = await import('../src/receipt.js');
  const w = parseWhoami('👋 You are logged in with an OAuth Token, associated with the email someone@example.com.\n┌──┬──┐\n│ Account Name │ Account ID │\n│ My Account │ 0123456789abcdef0123456789abcdef │\n└──┴──┘');
  assert.equal(w.accounts[0].name, 'My Account');
  assert.ok(w.email.startsWith('som') && !w.email.includes('someone@'));
  const s = parseSupabaseProjects('  LINKED | ORG ID | REFERENCE ID | NAME | REGION | CREATED AT\n  ● | org123 | abcdefghijklmnopqrst | My Proj | Northeast Asia (Seoul) | 2026-06-28 00:00:00');
  assert.deepEqual(s.map((p) => [p.ref, p.name]), [['abcdefghijklmnopqrst', 'My Proj']]);
});

test('PEF 기준 지문: 버전·항목 지문이 같으면 안내 없음, 다르면 안내', async () => {
  const { stamp, changedNote } = await import('../src/version.js');
  const now = stamp();
  assert.match(now.rules, /^[0-9a-f]{8}$/);
  assert.equal(changedNote(null), null);
  assert.equal(changedNote({ ...now }), null);
  assert.ok(changedNote({ pef: '0.0.1', rules: 'deadbeef' }).includes('기준이 바뀌었습니다'));
  assert.ok(changedNote({}).includes('버전이 없습니다')); // 버전 기록이 없던 옛 기록
});

test('작업 계획: 파트별 남은 일 계산, 다 끝나면 done', async () => {
  const { buildPlan } = await import('../src/plan.js');
  const open = buildPlan(result({ findings: [finding({ disposition: 'ActNow' })], coverage: all('Clean') }));
  const sec = open.parts.find((p) => p.name === '보안 및 개인정보');
  assert.equal(sec.actNow, 1);
  assert.equal(open.done, false);
  const none = buildPlan(result({ coverage: all('Clean') }));
  assert.equal(none.done, true);
  const untested = buildPlan(result({ coverage: {} }));
  assert.ok(untested.parts.every((p) => p.unjudged > 0) && !untested.done);
});
