// 외부 검사 도구 어댑터 (SPEC §5). 원칙:
//  - 이미 PATH에 설치된 도구만 실행한다. 설치·npx 다운로드 금지 (PLAYBOOK §3). 없으면 NotTested.
//  - 대상 폴더는 읽기만 한다. 도구 출력은 마스킹을 거쳐 Finding에 들어간다.
//  - 도구가 실패/타임아웃이면 "통과"가 아니라 NotTested.
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { scanDesign, designFindings } from './design.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mask } from './mask.js';

const TIMEOUT_MS = 120_000;

const exe = (name) => (process.platform === 'win32' ? `${name}.cmd` : name);

function available(cmd) {
  for (const c of [cmd, exe(cmd)]) {
    try {
      execSync(`${c} --version`, { stdio: 'ignore', timeout: 15_000 });
      return c;
    } catch {
      // 다음 후보
    }
  }
  return null;
}

function runTool(cmd, args, cwd, emptyStatus) {
  // 명령·인자는 이 파일의 상수뿐이라 셸 문자열로 합쳐도 안전하다 (Windows .cmd 실행 때문에 셸 필요).
  const line = [cmd, ...args].map((a) => (/^[\w.:=/\\-]+$/.test(a) ? a : `"${a}"`)).join(' ');
  try {
    return execSync(line, { cwd, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    // 많은 도구가 "문제 발견" 시 0이 아닌 코드로 끝난다. 시간 초과가 아니고 출력이 있으면 결과로 쓴다.
    if (e.stdout && !e.killed) return e.stdout;
    if (e.status === emptyStatus) return "{}"; // 예: osv-scanner 128 = 검사할 패키지 파일 없음 → 취약점 0건
    throw e;
  }
}

const finding = (o) => ({
  category: o.category,
  ruleId: o.ruleId,
  title: mask(o.title),
  severity: o.severity,
  verification: o.verification ?? 'Confirmed',
  // 도구는 판단하지 않는다. 사람/에이전트가 처분을 정하기 전까지 NeedsCheck → 감사 미완결로 남는다.
  disposition: 'NeedsCheck',
  dispositionReason: '도구 결과 — 아직 사람/에이전트가 판단하지 않음',
  confidence: 'medium',
  evidence: mask(o.evidence ?? ''),
  filePath: o.filePath,
  line: o.line ?? null,
  fixStatus: 'Open',
  source: o.source,
  ...(o.recommendedFix ? { recommendedFix: o.recommendedFix } : {}),
});

// ── 출력 파서 (순수 함수 — 도구 없이 테스트 가능) ─────────────────────────────

/** knip --reporter json */
export function parseKnip(json) {
  const data = JSON.parse(json);
  const out = [];
  for (const issue of data.issues ?? []) {
    for (const kind of ['files', 'dependencies', 'devDependencies', 'exports', 'types', 'unlisted']) {
      const v = kind === 'files' ? (issue.files?.length ? [{ name: issue.file }] : []) : issue[kind] ?? [];
      for (const item of v) {
        out.push(
          finding({
            category: '4.9 코드 품질',
            ruleId: 'C-02',
            verification: 'Suspected',
            title: `미사용 ${kind}: ${item.name}`,
            severity: 'P3',
            evidence: `knip: ${kind} ${item.name}`,
            filePath: issue.file,
            line: item.line ?? null,
            source: 'knip',
          }),
        );
      }
    }
  }
  return out;
}

/** semgrep --json */
export function parseSemgrep(json) {
  const sev = { ERROR: 'P1', WARNING: 'P2', INFO: 'P3' };
  return (JSON.parse(json).results ?? []).map((r) =>
    finding({
      category: '4.13 보안',
      ruleId: 'EXTRA-보안-semgrep',
      verification: 'Suspected',
      title: r.extra?.message?.split('\n')[0] ?? r.check_id,
      severity: sev[r.extra?.severity] ?? 'P3',
      evidence: `semgrep ${r.check_id}`, // 코드 발췌(r.extra.lines)는 시크릿이 섞일 수 있어 넣지 않는다
      filePath: r.path,
      line: r.start?.line ?? null,
      source: 'semgrep',
    }),
  );
}

/** osv-scanner --format json */
export function parseOsv(json) {
  const out = [];
  for (const res of JSON.parse(json).results ?? []) {
    for (const pkg of res.packages ?? []) {
      for (const v of pkg.vulnerabilities ?? []) {
        const score = Number(pkg.groups?.find((g) => g.ids?.includes(v.id))?.max_severity ?? 0);
        out.push(
          finding({
            category: '4.13 보안',
            ruleId: 'SE-11',
            // 취약 버전이 *설치돼 있다*는 사실만 안다. 그 기능을 실제로 쓰는지는 모르므로 Suspected (사용 확인 시 Confirmed로 올림)
            verification: 'Suspected',
            title: `${pkg.package?.name}@${pkg.package?.version}: ${v.id}`,
            severity: score >= 9 ? 'P0' : score >= 7 ? 'P1' : score >= 4 ? 'P2' : 'P3',
            evidence: `osv ${v.id} ${(v.summary ?? '').slice(0, 120)}`,
            filePath: res.source?.path ?? 'lockfile',
            source: 'osv-scanner',
          }),
        );
      }
    }
  }
  return out;
}

/** depcruise --output-type json */
export function parseDepcruise(json) {
  const out = [];
  for (const v of JSON.parse(json).summary?.violations ?? []) {
    if (!/circular/.test(v.rule?.name ?? '')) continue;
    out.push(
      finding({
        category: '4.8 아키텍처',
        ruleId: 'AR-02',
        title: `순환 참조: ${v.from} → ${v.to}`,
        severity: 'P2',
        evidence: `depcruise ${v.rule.name}`,
        filePath: v.from,
        source: 'dependency-cruiser',
      }),
    );
  }
  return out;
}

// 설정 없이 돌리면 규칙이 없어 순환이 있어도 Clean으로 나오고 node_modules까지 훑는다 → 임시 설정 파일(대상 밖)을 쓴다.
function depcruiseArgs() {
  const cfg = join(mkdtempSync(join(tmpdir(), 'pef-dc-')), 'dc.json');
  writeFileSync(cfg, JSON.stringify({ forbidden: [{ name: 'no-circular', severity: 'warn', from: {}, to: { circular: true } }], options: { doNotFollow: { path: 'node_modules' }, exclude: { path: '(node_modules|\.next|\.git|dist|build|coverage)' } } }));
  return ['--config', cfg, '--output-type', 'json', '.'];
}

// ── 어댑터 목록 ──────────────────────────────────────────────────────────────

export const ADAPTERS = [
  { id: 'knip', needs: (d) => d.stack.includes('node'), args: ['--reporter', 'json', '--no-progress'], parse: parseKnip, items: ['C-02'] },
  { id: 'semgrep', needs: () => true, args: ['--json', '--quiet', '--config', 'auto', '.'], parse: parseSemgrep, items: [] },
  { id: 'osv-scanner', needs: () => true, args: ['--format', 'json', '-r', '.'], parse: parseOsv, items: ['SE-11'], emptyStatus: 128 },
  // 외부 도구 없이 이 프로세스에서 직접 센다 (run 이 있으면 설치 확인·셸 실행을 건너뜀). UI 소스가 없으면 해당 없음.
  { id: 'pef-design', needs: (d) => !!scanDesign(d.target), run: (dir) => designFindings(scanDesign(dir)).map(finding), items: ['V-01', 'V-02', 'V-03', 'V-04', 'V-05', 'V-06'] },
  { id: 'depcruise', needs: (d) => d.stack.includes('node'), args: depcruiseArgs, parse: parseDepcruise, items: ['AR-02'] },
];

/**
 * @returns {{findings: object[], toolsUsed: string[], notTested: {tool: string, reason: string}[]}}
 */
export function runAdapters(dir, discovery) {
  const findings = [];
  const toolsUsed = [];
  const notTested = [];
  for (const a of ADAPTERS) {
    if (!a.needs(discovery)) {
      notTested.push({ tool: a.id, reason: '이 스택에는 해당 없음' });
      continue;
    }
    if (a.run) {
      findings.push(...a.run(dir));
      toolsUsed.push(a.id);
      continue;
    }
    const cmd = available(a.id);
    if (!cmd) {
      notTested.push({ tool: a.id, reason: '도구 미설치 (설치는 사용자 승인 필요)' });
      continue;
    }
    try {
      findings.push(...a.parse(runTool(cmd, typeof a.args === 'function' ? a.args() : a.args, dir, a.emptyStatus)));
      toolsUsed.push(a.id);
    } catch (e) {
      notTested.push({ tool: a.id, reason: `실행 실패/타임아웃: ${mask(e.message).split('\n')[0]}` });
    }
  }
  return { findings, toolsUsed, notTested };
}
