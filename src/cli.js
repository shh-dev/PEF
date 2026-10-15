import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeResults } from './merge.js';
import { score } from './score.js';
import { renderReport } from './report.js';
import { renderHtml } from './html.js';
import { discover } from './discover.js';
import { runAdapters, ADAPTERS } from './adapters.js';
import { validateResult } from './schema.js';
import { mask } from './mask.js';
import { kst, kstStamp } from './time.js';

const HELP = `pef — Product Excellence Framework CLI (읽기 전용 도구, 대상 프로젝트 코드를 수정하지 않음)

사용법:
  pef discover [폴더]                        스택·git 상태 탐색 (JSON)
  pef audit [폴더] [--out 폴더]              설치된 검사 도구를 돌려 result 파일 생성 (기본 출력: <폴더>/.pef)
  pef validate <result.json...>              결과 파일이 스키마에 맞는지 검사
  pef report <result.json...> [--out 폴더] [--json]
                                             합치기 → 점수 → report.md (+ score.json)
  (report 에 --html 을 더하면 사람이 보기 쉬운 report.html 도 만든다)
  pef triage <result.json> --rule ID --disposition ActNow|Plan|NoActionNow --reason "이유" [--severity P3] [--source 도구] [--evidence "근거" --recheck "조건"]
                                             규칙 단위로 처분 일괄 지정 (NoActionNow 는 근거·다시 볼 조건 필수)
  pef baseline <result.json...> --out 파일   현재 점수를 기준선으로 저장
  pef compare <기준선.json> <result.json...> 기준선과 비교 (같은 범위일 때만 판정)

종료 코드: 0 정상 / 1 출시 차단·보류 또는 회귀 / 2 입력 오류`;

const readJson = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));
const fail = (msg) => {
  console.error(mask(msg));
  return 2;
};

/** audit: 어댑터 결과를 result.schema 형식으로 만든다. 못 돌린 도구의 항목은 NotTested로 명시. */
export function buildAuditResult(dir, discovery, run, now = new Date()) {
  const findings = run.findings.map((f, i) => ({ id: `F-${String(i + 1).padStart(3, '0')}`, firstDetected: now.toISOString(), ...f }));
  const coverage = {};
  const coverageNotes = {};
  for (const a of ADAPTERS) {
    const ran = run.toolsUsed.includes(a.id);
    for (const id of a.items) {
      const hits = findings.filter((f) => f.ruleId === id);
      if (!ran) {
        const why = run.notTested.find((n) => n.tool === a.id)?.reason ?? '미실행';
        coverage[id] = why.includes('해당 없음') ? 'NotApplicable' : 'NotTested';
        coverageNotes[id] = `${a.id}: ${why}`;
      } else {
        coverage[id] = hits.some((f) => f.verification === 'Confirmed') ? 'Confirmed' : hits.length ? 'Suspected' : 'Clean';
        // 앱 여러 개 중 일부에서만 돌았으면 "깨끗함"이라 말할 수 없다.
        const failed = run.notTested.filter((n) => n.tool === a.id);
        if (failed.length) {
          if (coverage[id] === 'Clean') coverage[id] = 'NotTested';
          coverageNotes[id] = `${a.id}: 일부만 검사됨 — ${failed.map((n) => n.reason).join(' / ')}`;
        }
      }
    }
  }
  const g = discovery.git;
  return {
    meta: {
      target: dir,
      commit: g ? `${g.commit} (미커밋 ${g.uncommittedChanges}건, 원격 대비 뒤처짐 ${g.behindRemote ?? '알 수 없음'})` : 'git 아님',
      profile: `자동 탐색 — ${discovery.stack.join('/') || '알 수 없음'} (${discovery.supportLevel})${discovery.apps?.length ? `, 앱 ${discovery.apps.length}개: ${discovery.apps.map((a) => a.path).join(', ')}` : ''}. 앱 프로파일은 사용자 확인 전`,
      auditedAt: kst(now),
      scope: ['도구 자동 검사'],
      toolsUsed: run.toolsUsed,
    },
    findings,
    coverage,
    coverageNotes,
  };
}

export function run(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  const args = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--out') flags.out = rest[++i];
    else if (rest[i] === '--json') flags.json = true;
    else if (rest[i] === '--html') flags.html = true;
    else if (['--rule', '--severity', '--source', '--disposition', '--reason', '--evidence', '--recheck'].includes(rest[i])) flags[rest[i].slice(2)] = rest[++i];
    else args.push(rest[i]);
  }
  const load = (files) => files.map((f) => ({ name: f, result: readJson(f) }));

  try {
    if (!cmd || cmd === 'help' || cmd === '--help') {
      console.log(HELP);
      return 0;
    }

    if (cmd === 'discover') {
      console.log(JSON.stringify(discover(resolve(args[0] ?? '.')), null, 2));
      return 0;
    }

    if (cmd === 'audit') {
      const dir = resolve(args[0] ?? '.');
      const discovery = discover(dir);
      const result = buildAuditResult(dir, discovery, runAdapters(dir, discovery));
      const out = resolve(flags.out ?? `${dir}/.pef`);
      mkdirSync(out, { recursive: true });
      const file = `${out}/${kstStamp()}_result.json`;
      writeFileSync(file, JSON.stringify(result, null, 2));
      console.log(`저장: ${file}`);
      console.log(`실행한 도구: ${result.meta.toolsUsed.join(', ') || '없음'}`);
      for (const [id, note] of Object.entries(result.coverageNotes)) console.log(`  미검사 ${id}: ${note}`);
      return 0;
    }

    if (cmd === 'validate') {
      if (!args.length) return fail('result.json 경로가 필요합니다');
      let bad = 0;
      for (const f of args) {
        const errs = validateResult(readJson(f));
        console.log(errs.length ? `✗ ${f}\n  ${errs.join('\n  ')}` : `✓ ${f}`);
        bad += errs.length ? 1 : 0;
      }
      return bad ? 2 : 0;
    }

    if (cmd === 'report' || cmd === 'baseline') {
      if (!args.length) return fail('result.json 경로가 필요합니다');
      const { errors, merged } = mergeResults(load(args));
      if (errors.length) return fail(`스키마 오류:\n${errors.join('\n')}`);
      const s = score(merged);
      if (cmd === 'baseline') {
        if (!flags.out) return fail('--out 기준선 파일 경로가 필요합니다');
        const scope = Object.keys(merged.coverage).sort();
        writeFileSync(resolve(flags.out), JSON.stringify({ savedAt: kst(), commit: merged.meta.commit, scope, score: s, findingKeys: merged.findings.map((f) => `${f.ruleId}|${f.filePath ?? ''}|${f.line ?? ''}`) }, null, 2));
        console.log(`기준선 저장: ${resolve(flags.out)}`);
        return 0;
      }
      const md = renderReport(merged, s);
      if (flags.out) {
        const out = resolve(flags.out);
        mkdirSync(out, { recursive: true });
        writeFileSync(`${out}/report.md`, md);
        if (flags.html) writeFileSync(`${out}/report.html`, renderHtml(merged, s));
        if (flags.json) writeFileSync(`${out}/score.json`, JSON.stringify({ score: s, merged }, null, 2));
        console.log(`저장: ${out}/report.md`);
      } else console.log(flags.json ? JSON.stringify(s, null, 2) : md);
      return s.verdict.startsWith('출시') ? 1 : 0;
    }

    if (cmd === 'triage') {
      // 규칙 단위 일괄 처분. 아직 처분이 없거나 NeedsCheck 인 Finding 에만 적용한다 (이미 정한 처분은 덮어쓰지 않음).
      const [file] = args;
      if (!file || !flags.rule || !flags.disposition) return fail('사용법: pef triage <result.json> --rule <ID> --disposition <ActNow|Plan|NoActionNow> --reason "이유" [--severity P3] [--source 도구] [--evidence "근거" --recheck "조건"]');
      const r = readJson(file);
      let n = 0;
      for (const f of r.findings) {
        const open = !f.disposition || f.disposition === 'NeedsCheck';
        if (!open || f.ruleId !== flags.rule || (flags.severity && f.severity !== flags.severity) || (flags.source && f.source !== flags.source)) continue;
        f.disposition = flags.disposition;
        f.dispositionReason = flags.reason ?? '';
        if (flags.evidence) f.dispositionEvidence = flags.evidence;
        if (flags.recheck) f.recheckWhen = flags.recheck;
        n++;
      }
      const errs = validateResult(r);
      if (errs.length) return fail(`처분 적용 후 검증 실패 (저장 안 함):\n${errs.slice(0, 5).join('\n')}`);
      writeFileSync(resolve(file), JSON.stringify(r, null, 2));
      console.log(`${n}건에 ${flags.disposition} 처분 적용`);
      return 0;
    }

    if (cmd === 'compare') {
      const [basePath, ...files] = args;
      if (!basePath || !files.length) return fail('사용법: pef compare <기준선.json> <result.json...>');
      const base = readJson(basePath);
      const { errors, merged } = mergeResults(load(files));
      if (errors.length) return fail(`스키마 오류:\n${errors.join('\n')}`);
      const now = score(merged);
      const scope = Object.keys(merged.coverage).sort();
      if (JSON.stringify(scope) !== JSON.stringify(base.scope)) {
        console.log('Inconclusive — 점검 범위(체크리스트 항목)가 기준선과 달라 비교 불가 (SCORING §6)');
        return 0;
      }
      const keys = new Set(merged.findings.map((f) => `${f.ruleId}|${f.filePath ?? ''}|${f.line ?? ''}`));
      const added = [...keys].filter((k) => !base.findingKeys.includes(k));
      const resolved = base.findingKeys.filter((k) => !keys.has(k));
      const delta = (now.total ?? 0) - (base.score.total ?? 0);
      const verdict = added.length && delta < 0 ? 'Regressed' : delta > 0 || resolved.length ? (added.length ? 'Inconclusive' : 'Improved') : added.length ? 'Regressed' : 'Unchanged';
      console.log(`${verdict} — 점수 ${base.score.total} → ${now.total} (${delta >= 0 ? '+' : ''}${delta}), 새 Finding ${added.length}, 해결 ${resolved.length}`);
      return verdict === 'Regressed' ? 1 : 0;
    }

    return fail(`알 수 없는 명령: ${cmd}\n\n${HELP}`);
  } catch (e) {
    return fail(`실행 실패: ${e.message}`);
  }
}
