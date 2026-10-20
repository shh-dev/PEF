import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADAPTERS, runAdapters } from './adapters.js';
import { classify, TYPE_LABEL } from './classify.js';
import { discover } from './discover.js';
import { renderHtml } from './html.js';
import { mask } from './mask.js';
import { continueFrom, mergeResults } from './merge.js';
import { buildPlan, renderPlan } from './plan.js';
import { buildProfile, PROFILES, profileKey } from './profile.js';
import { buildReceipt, renderReceiptHtml, renderReceiptMd } from './receipt.js';
import { renderReport } from './report.js';
import { validateResult } from './schema.js';
import { score } from './score.js';
import { kst, kstStamp } from './time.js';
import { auditTouch } from './touch.js';
import { changedNote, checkFormat, FORMAT, stamp, update } from './version.js';
import { auditWeb } from './web.js';

const HELP = `pef — Product Excellence Framework CLI (읽기 전용 도구, 대상 프로젝트 코드를 수정하지 않음)

사용법:
  pef web <주소> [--out 폴더]                실행 중인 사이트 점검: Lighthouse(접근성·성능) + 보안 헤더·쿠키 속성. 사용자가 준 주소에만 요청
  pef touch <주소> [--routes /a,/b] [--max 12] [--out 폴더]
                                             휴대폰 손가락 점검: 아이폰·갤럭시 크기로 화면·팝업을 열어 끝까지 스크롤·버튼 잘림·키보드 가림 확인 (Chrome 에뮬레이션, playwright-core 필요)
  pef plan [.pef 폴더]                       파트별 해야 할 일 계획표 (처음 부르면 1차 작성 시각 기록, 이후엔 남은 일을 다시 계산)
  pef update                               PEF 자신을 원격 최신으로 갱신 (fast-forward만). 이어 쓰던 프로젝트는 갱신 뒤 pef checkpoint 한 번으로 새 기준 적용
  pef discover [폴더]                      스택·git 상태 탐색 (JSON)
  pef audit [폴더] [--out 폴더]              설치된 검사 도구를 돌려 result 파일 생성 (기본 출력: <폴더>/.pef)
  pef receipt [폴더] [--out 폴더]            앱 영수증: 연결된 Cloudflare·Supabase·MCP·외부 서비스·환경변수 이름을 한 장으로 (값은 읽지 않음). --live 를 더하면 로그인된 wrangler/supabase CLI에 계정을 물어봄(읽기 전용, 승인 후)
  pef profile <유형> --out <.pef>             사용자가 확인한 앱 유형 저장 (방향·가중치·해당 없음 영역 결정). discover 가 유형을 추정해 줌
  pef validate <result.json...>              결과 파일이 스키마에 맞는지 검사
  pef report <result.json...> [--out 폴더] [--json]
                                             합치기 → 점수 → report.md (+ score.json)
  (report 에 --html 을 더하면 사람이 보기 쉬운 report.html 도 만든다)
  pef triage <result.json> --rule ID --disposition ActNow|Plan|NoActionNow --reason "이유" [--severity P3] [--source 도구] [--evidence "근거" --recheck "조건"]
                                             규칙 단위로 처분 일괄 지정 (NoActionNow 는 근거·다시 볼 조건 필수)
  pef checkpoint [result.json...] --out <.pef> --note "이번에 한 일"
                                             지속 고도화의 한 바퀴를 마감: 이전 상태에 이어 붙이고 점수 변화·한 일을 기록, report.html 갱신
  pef status [.pef 폴더]                     이어서 시작할 때 첫 명령: 기록·점수표·남은 일
  pef baseline <result.json...> --out 파일   현재 점수를 기준선으로 저장
  pef compare <기준선.json> <result.json...> 기준선과 비교 (같은 범위일 때만 판정)

종료 코드: 0 정상 / 1 출시 차단·보류 또는 회귀 / 2 입력 오류`;

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(resolve(p), 'utf8'));
  } catch (e) {
    // 어느 파일이 왜 안 읽히는지 알려 준다 (JSON.parse 의 위치 정보만으로는 파일을 알 수 없다)
    throw new Error(`${p}: ${e instanceof SyntaxError ? `JSON 형식이 깨졌습니다 (${e.message})` : e.code === 'ENOENT' ? '파일이 없습니다' : e.message}`);
  }
};
// 기록 파일은 임시 파일에 쓴 뒤 바꿔치기해서, 쓰다 끊겨도 반쪽짜리 파일이 남지 않게 한다
const writeJson = (file, data) => {
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${file}.tmp`, file);
};
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
      } else coverage[id] = hits.some((f) => f.verification === 'Confirmed') ? 'Confirmed' : hits.length ? 'Suspected' : 'Clean';
    }
  }
  const g = discovery.git;
  return {
    meta: {
      target: dir,
      commit: g ? `${g.commit} (미커밋 ${g.uncommittedChanges}건, 원격 대비 뒤처짐 ${g.behindRemote ?? '알 수 없음'})` : 'git 아님',
      profile: `자동 탐색 — ${discovery.stack.join('/') || '알 수 없음'} (${discovery.supportLevel}). 앱 프로파일은 사용자 확인 전`,
      auditedAt: kst(now),
      scope: ['도구 자동 검사'],
      toolsUsed: run.toolsUsed,
    },
    findings,
    coverage,
    coverageNotes,
  };
}

const fmt = (v) => (v === null || v === undefined ? '측정불충분' : `${v}`);
const diff = (a, b) => (a === null || a === undefined || b === null || b === undefined ? '' : b - a === 0 ? ' (변화 없음)' : ` (${b - a > 0 ? '+' : ''}${b - a})`);

/** 분야별 점수표 + 이번에 한 일 + 남은 일 (사용자에게 매번 보여 줄 텍스트) */
function progressText(prev, cur, s) {
  const lines = [`## 분야별 점수 — ${prev ? `${prev.at} → ${cur.at}` : cur.at}`, '', '| 분야 | 이전 | 지금 | 변화 |', '|---|---|---|---|'];
  cur.groups.forEach((g, i) => {
    const before = prev?.groups?.[i]?.score;
    lines.push(`| ${g.name} | ${prev ? fmt(before) : '-'} | ${fmt(g.score)} | ${prev ? diff(before, g.score).trim() || '-' : '-'} |`);
  });
  lines.push(`| **총점** | ${prev ? fmt(prev.total) : '-'} | **${fmt(cur.total)}** | ${prev ? diff(prev.total, cur.total).trim() || '-' : '-'} |`);
  lines.push('', `커버리지 ${cur.coverage}% · 신뢰도 ${cur.confidence} · ${cur.verdict}`);
  if (cur.note) lines.push(`이번에 한 일: ${cur.note}`);
  if (cur.newlyFixed) lines.push(`재검사에서 사라져 해결로 확인된 문제: ${cur.newlyFixed}건`);
  lines.push(`남은 일: 판정 없는 항목 ${s.completeness.unjudged.length}개 · 처분 없는 문제 ${s.completeness.untriaged.length}건 · ${s.completeness.complete ? '✅ 완결' : '❌ 미완결 (계속 진행)'}`);
  return lines.join('\n');
}

const reportOrBaseline = ({ cmd, args, flags, profileOf, load }) => {
  if (!args.length) return fail('result.json 경로가 필요합니다');
  const { errors, merged } = mergeResults(load(args));
  if (errors.length) return fail(`스키마 오류:\n${errors.join('\n')}`);
  const profile = profileOf(flags.out && resolve(flags.out));
  const s = score(merged, profile);
  if (cmd === 'baseline') {
    if (!flags.out) return fail('--out 기준선 파일 경로가 필요합니다');
    const scope = Object.keys(merged.coverage).sort();
    writeFileSync(
      resolve(flags.out),
      JSON.stringify({ savedAt: kst(), commit: merged.meta.commit, scope, score: s, findingKeys: merged.findings.map((f) => `${f.ruleId}|${f.filePath ?? ''}|${f.line ?? ''}`) }, null, 2),
    );
    console.log(`기준선 저장: ${resolve(flags.out)}`);
    return 0;
  }
  const md = renderReport(merged, s, new Date(), profile);
  if (flags.out) {
    const out = resolve(flags.out);
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/report.md`, md);
    if (flags.html) writeFileSync(`${out}/report.html`, renderHtml(merged, s, new Date(), [], profile));
    if (flags.json) writeFileSync(`${out}/score.json`, JSON.stringify({ score: s, merged }, null, 2));
    console.log(`저장: ${out}/report.md`);
  } else console.log(flags.json ? JSON.stringify(s, null, 2) : md);
  return s.verdict.startsWith('출시') ? 1 : 0;
};

// 명령별 처리 함수. 각 함수는 종료 코드(또는 그것을 돌려주는 Promise)를 반환한다.
const COMMANDS = {
  touch: ({ args, flags }) => {
    // 휴대폰 손가락 점검: 아이폰·갤럭시 크기로 화면과 팝업을 열어 스크롤·잘림·키보드를 확인한다 (사용자가 준 주소의 같은 사이트 안에서만 이동)
    if (!args[0]) return fail('사용법: pef touch <http(s)://주소> [--routes /a,/b] [--max 12] [--out 폴더]');
    const out = resolve(flags.out ?? '.pef');
    mkdirSync(out, { recursive: true });
    return auditTouch(args[0], { routes: flags.routes?.split(',').filter(Boolean), max: Number(flags.max) || 12, outDir: out }).then(
      (r) => {
        const file = `${out}/${kstStamp()}_touch_result.json`;
        writeFileSync(file, JSON.stringify(r, null, 2));
        console.log(`저장: ${file}\nFinding ${r.findings.length}건 · ${r.coverageNotes['R-02']}`);
        return 0;
      },
      (e) => fail(e.message),
    );
  },

  web: ({ args, flags }) => {
    // 실행 중인 사이트 점검: 사용자가 준 주소에만 요청한다 (Lighthouse 접근성·성능 + 보안 헤더·쿠키 속성)
    if (!args[0]) return fail('사용법: pef web <http(s)://주소> [--out 폴더]');
    return auditWeb(args[0]).then(
      (r) => {
        const out = resolve(flags.out ?? '.pef');
        mkdirSync(out, { recursive: true });
        const file = `${out}/${kstStamp()}_web_result.json`;
        writeFileSync(file, JSON.stringify(r, null, 2));
        console.log(`저장: ${file}\n실행한 도구: ${r.meta.toolsUsed.join(', ') || '없음'}\nFinding ${r.findings.length}건`);
        return 0;
      },
      (e) => fail(e.message),
    );
  },
  plan: ({ args, profileOf }) => {
    // 고도화를 시작하면 먼저 부르는 명령: 파트별 해야 할 일을 계산해 계획표로 보여 준다. 최초 작성 시각은 plan.json 에 남긴다.
    const out = resolve(args[0] ?? '.pef');
    if (!existsSync(`${out}/current.json`)) return fail(`${out}/current.json 이 없습니다 — pef audit 후 pef checkpoint 를 먼저 하세요`);
    const planFile = `${out}/plan.json`;
    const first = existsSync(planFile) ? readJson(planFile).firstDraftAt : kst();
    if (!existsSync(planFile)) writeFileSync(planFile, JSON.stringify({ firstDraftAt: first }, null, 2));
    const plan = buildPlan(readJson(`${out}/current.json`), profileOf(out));
    console.log(renderPlan(plan, first));
    return 0;
  },
  update: () => {
    const r = update();
    console.log(r.msg);
    return r.ok ? 0 : 1;
  },
  discover: ({ args }) => {
    const dir = resolve(args[0] ?? '.');
    const c = classify(dir);
    const main = c.types[0];
    console.log(
      JSON.stringify(
        {
          ...discover(dir),
          classification: { ...c, 추정: TYPE_LABEL[profileKey(main.type)] },
          proposedProfile: buildProfile(main.type),
          다음: '사용자에게 유형을 확인받고 pef profile <유형> --out <.pef> 로 확정',
        },
        null,
        2,
      ),
    );
    return 0;
  },
  receipt: ({ args, flags }) => {
    // 앱 영수증: 연결된 서비스·계정·MCP·환경변수 이름을 한 장으로. 시크릿 값은 읽지 않고 .env 파일은 열지 않는다.
    const dir = resolve(args[0] ?? '.');
    if (!existsSync(dir)) return fail(`폴더가 없습니다: ${dir}`);
    const r = buildReceipt(dir, new Date(), { liveCheck: !!flags.live });
    const out = resolve(flags.out ?? `${dir}/.pef`);
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/receipt.md`, renderReceiptMd(r));
    writeFileSync(`${out}/receipt.html`, renderReceiptHtml(r));
    console.log(`저장: ${out}/receipt.html (+ receipt.md)`);
    return 0;
  },
  profile: ({ args, flags }) => {
    // 사용자가 확인한 앱 유형을 저장한다. 이후 점수(가중치·해당 없음)와 보고서가 이 프로파일을 따른다.
    const [type] = args;
    if (!type || !flags.out) return fail(`사용법: pef profile <${Object.keys(PROFILES).join('|')}> --out <.pef 폴더> [--note "사용자 답변 요약"]`);
    const p = buildProfile(type, { confirmedAt: kst(), note: flags.note ?? '' });
    mkdirSync(resolve(flags.out), { recursive: true });
    writeFileSync(resolve(flags.out, 'profile.json'), JSON.stringify(p, null, 2));
    console.log(`프로파일 저장: ${p.label}
방향: ${p.direction}
기본값 대비 변경: ${p.weightChanges.join(', ') || '없음'}
해당 없음 영역: ${p.notApplicable.join(', ') || '없음'} (${p.why})`);
    return 0;
  },
  audit: ({ args, flags }) => {
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
  },
  validate: ({ args }) => {
    if (!args.length) return fail('result.json 경로가 필요합니다');
    let bad = 0;
    for (const f of args) {
      const errs = validateResult(readJson(f));
      console.log(errs.length ? `✗ ${f}\n  ${errs.join('\n  ')}` : `✓ ${f}`);
      bad += errs.length ? 1 : 0;
    }
    return bad ? 2 : 0;
  },
  report: reportOrBaseline,
  baseline: reportOrBaseline,
  triage: ({ args, flags }) => {
    // 규칙 단위 일괄 처분. 아직 처분이 없거나 NeedsCheck 인 Finding 에만 적용한다 (이미 정한 처분은 덮어쓰지 않음).
    const [file] = args;
    if (!file || !flags.rule || !flags.disposition)
      return fail('사용법: pef triage <result.json> --rule <ID> --disposition <ActNow|Plan|NoActionNow> --reason "이유" [--severity P3] [--source 도구] [--evidence "근거" --recheck "조건"]');
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
    writeJson(resolve(file), r);
    console.log(`${n}건에 ${flags.disposition} 처분 적용`);
    return 0;
  },
  checkpoint: ({ args, flags, profileOf, load }) => {
    // 고도화는 지속 작업이다: 매 반복의 끝에 호출 → 이전 상태에 이어 붙이고, 점수 변화·한 일을 기록하고, 보고서를 갱신한다.
    const out = resolve(flags.out ?? '.pef');
    mkdirSync(out, { recursive: true });
    const cur = `${out}/current.json`;
    const histFile = `${out}/history.json`;
    const history = existsSync(histFile) ? readJson(histFile) : [];
    const prior = existsSync(cur) ? checkFormat(readJson(cur), cur) : null;
    let merged;
    let newlyFixed = 0;
    if (args.length) {
      const r = mergeResults(load(args));
      if (r.errors.length) return fail(`스키마 오류:\n${r.errors.join('\n')}`);
      if (prior) ({ merged, newlyFixed } = continueFrom(prior, r.merged));
      else merged = r.merged;
    } else if (prior)
      merged = prior; // 결과 파일 없이 부르면 current.json(예: fixStatus 수정분)만 다시 계산
    else return fail('이어갈 current.json 이 없습니다. result.json 을 같이 주세요');
    const errs = validateResult(merged);
    if (errs.length) return fail(`검증 실패 (저장 안 함):\n${errs.slice(0, 8).join('\n')}`);

    const profile = profileOf(out);
    const s = score(merged, profile);
    const entry = {
      at: kst(),
      commit: merged.meta.commit,
      note: flags.note ?? '',
      total: s.total,
      coverage: s.coverage,
      confidence: s.confidence,
      verdict: s.verdict,
      complete: s.completeness.complete,
      groups: s.groups.map((g) => ({ name: g.name, score: g.score, coverage: g.coverage })),
      counts: s.counts,
      newlyFixed,
      ...stamp(),
    };
    const prev = history.at(-1);
    // 같은 상태로 다시 마감해도 기록이 불어나지 않게 한다 (더블 실행·재시도 안전)
    const same = prev && JSON.stringify({ ...prev, at: 0 }) === JSON.stringify({ ...entry, at: 0 });
    if (!same) history.push(entry);
    writeJson(cur, { schemaVersion: FORMAT, ...merged });
    writeJson(histFile, history);
    writeFileSync(`${out}/report.md`, renderReport(merged, s, new Date(), profile));
    writeFileSync(`${out}/report.html`, renderHtml(merged, s, new Date(), history, profile));
    console.log(progressText(prev, entry, s));
    const note = changedNote(prev);
    if (note) console.log(`\n⚠ ${note}`);
    console.log(`\n저장: ${out} (current.json, history.json, report.html)`);
    return s.verdict.startsWith('출시') ? 1 : 0;
  },
  status: ({ args, profileOf }) => {
    // 새 세션이 이어서 시작할 때 첫 번째로 부르는 명령: 지금까지의 기록과 남은 일
    const out = resolve(args[0] ?? '.pef');
    if (!existsSync(`${out}/history.json`)) return fail(`${out} 에 기록이 없습니다 — 처음부터 시작하세요 (pef audit)`);
    const history = readJson(`${out}/history.json`);
    const merged = checkFormat(readJson(`${out}/current.json`), `${out}/current.json`);
    const s = score(merged, profileOf(out));
    console.log(progressText(history.at(-2), history.at(-1), s));
    const note = changedNote(history.at(-1));
    if (note) console.log(`\n⚠ ${note}\n  → pef checkpoint --out ${args[0] ?? '.pef'} --note "PEF 갱신 반영" 한 번으로 새 기준을 적용하세요`);
    console.log('\n지금까지의 기록');
    for (const [i, e] of history.entries()) console.log(`  ${String(i + 1).padStart(2, '0')}. ${e.at}  ${e.total ?? '-'}점  ${e.note || ''}`);
    return 0;
  },
  compare: ({ args, load }) => {
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
  },
};

export function run(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  const args = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--out') flags.out = rest[++i];
    else if (rest[i] === '--json') flags.json = true;
    else if (rest[i] === '--html') flags.html = true;
    else if (rest[i] === '--live') flags.live = true;
    else if (rest[i] === '--note') flags.note = rest[++i];
    else if (rest[i] === '--profile') flags.profile = rest[++i];
    else if (['--rule', '--severity', '--source', '--disposition', '--reason', '--evidence', '--recheck', '--routes', '--max'].includes(rest[i])) flags[rest[i].slice(2)] = rest[++i];
    else args.push(rest[i]);
  }
  // 확정된 앱 프로파일(.pef/profile.json 또는 --profile 파일). 없으면 기본 가중치.
  const profileOf = (outDir) => {
    const p = flags.profile ?? (outDir ? `${outDir}/profile.json` : null);
    return p && existsSync(resolve(p)) ? readJson(p) : null;
  };
  const load = (files) => files.map((f) => ({ name: f, result: readJson(f) }));

  try {
    if (!cmd || cmd === 'help' || cmd === '--help') {
      console.log(HELP);
      return 0;
    }

    const handler = COMMANDS[cmd];
    if (handler) return handler({ cmd, args, flags, profileOf, load });

    return fail(`알 수 없는 명령: ${cmd}\n\n${HELP}`);
  } catch (e) {
    return fail(`실행 실패: ${e.message}`);
  }
}
