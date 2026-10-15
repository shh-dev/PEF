// "앱 영수증": 이 앱이 어떤 서비스·계정·MCP·환경변수와 연결돼 있는지 한 장으로 모은다.
// 원칙: 읽기 전용 / 시크릿 값은 절대 읽어 출력하지 않는다(이름·존재·위치만) / .env* 파일은 열지 않는다 /
//       날짜는 git 기록 기준(실제 계정 연결 시점이 아니라 "저장소에 처음 나타난 날")이며 그렇게 표기한다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { mask } from './mask.js';
import { kst } from './time.js';

const text = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

/** // 와 /* *​/ 주석 제거 (문자열 안의 // 는 보존) */
function stripJsonc(src) {
  let out = '';
  let str = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (str) {
      out += c;
      if (c === '\\') out += src[++i] ?? '';
      else if (c === '"') str = false;
    } else if (c === '"') {
      str = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}
const json = (p) => {
  try {
    return JSON.parse(stripJsonc(text(p)));
  } catch {
    return null;
  }
};

const git = (dir, ...a) => {
  try {
    return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
};
const firstLine = (s) => s.split('\n')[0] || null;
/** 파일이 저장소에 처음 추가된 날 */
const addedOn = (dir, file) => firstLine(git(dir, 'log', '--diff-filter=A', '--format=%cs', '--reverse', '--', file));
/** 문자열(needle)이 파일에 처음 등장한 커밋 날짜 */
const introducedOn = (dir, needle, file) => firstLine(git(dir, 'log', `-S${needle}`, '--format=%cs', '--reverse', '--', file));

const idMask = (s) => (s && s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)} (${s.length}자)` : s ?? '');

const SERVICES = {
  '@supabase/supabase-js': 'Supabase', '@supabase/ssr': 'Supabase', stripe: 'Stripe', '@tosspayments/payment-sdk': '토스페이먼츠', '@tosspayments/tosspayments-sdk': '토스페이먼츠',
  firebase: 'Firebase', 'firebase-admin': 'Firebase', 'aws-sdk': 'AWS', '@aws-sdk/client-s3': 'AWS S3', '@aws-sdk/lib-storage': 'AWS S3', '@aws-sdk/client-ses': 'AWS SES',
  '@sentry/nextjs': 'Sentry', '@sentry/node': 'Sentry', '@sentry/react': 'Sentry', 'posthog-js': 'PostHog', 'posthog-node': 'PostHog', resend: 'Resend', nodemailer: '이메일(SMTP)',
  twilio: 'Twilio', solapi: 'Solapi(문자)', openai: 'OpenAI', '@anthropic-ai/sdk': 'Anthropic', '@google/generative-ai': 'Google AI', '@google/genai': 'Google AI', googleapis: 'Google API',
  'next-auth': 'NextAuth', '@clerk/nextjs': 'Clerk', '@auth0/nextjs-auth0': 'Auth0', '@upstash/redis': 'Upstash Redis', '@vercel/analytics': 'Vercel Analytics',
  wrangler: 'Cloudflare Workers', '@opennextjs/cloudflare': 'Cloudflare(OpenNext)', '@cloudflare/workers-types': 'Cloudflare Workers', 'mixpanel-browser': 'Mixpanel',
  '@slack/bolt': 'Slack', 'discord.js': 'Discord', telegraf: 'Telegram', '@octokit/rest': 'GitHub API', algoliasearch: 'Algolia', '@mux/mux-node': 'Mux', '@vimeo/vimeo': 'Vimeo',
  cloudinary: 'Cloudinary', pusher: 'Pusher', '@neondatabase/serverless': 'Neon', '@planetscale/database': 'PlanetScale', mongodb: 'MongoDB', pg: 'PostgreSQL(직접 연결)',
  mysql2: 'MySQL', redis: 'Redis', ioredis: 'Redis', '@prisma/client': 'Prisma', 'drizzle-orm': 'Drizzle ORM',
};

const ENV_SERVICE = [
  [/^SUPABASE/, 'Supabase'], [/^(CLOUDFLARE|CF_)/, 'Cloudflare'], [/^R2_/, 'Cloudflare R2'], [/^TOSS/, '토스페이먼츠'], [/^STRIPE/, 'Stripe'], [/^SENTRY/, 'Sentry'],
  [/^OPENAI/, 'OpenAI'], [/^ANTHROPIC/, 'Anthropic'], [/^GOOGLE|^GEMINI/, 'Google'], [/^KAKAO/, '카카오'], [/^NAVER/, '네이버'], [/^(SOLAPI|SMS_)/, '문자 발송'],
  [/^(INSTAGRAM|META_|FACEBOOK|FB_|THREADS)/, 'Meta(인스타 등)'], [/^AWS/, 'AWS'], [/^VERCEL/, 'Vercel'], [/^GITHUB/, 'GitHub'], [/^SLACK/, 'Slack'], [/^DISCORD/, 'Discord'],
  [/^TELEGRAM/, 'Telegram'], [/^(RESEND|SMTP|MAIL)/, '이메일'], [/^UPSTASH/, 'Upstash'], [/^REDIS/, 'Redis'], [/^(DATABASE|DB_|POSTGRES|PG)/, '데이터베이스'],
  [/^(JWT|AUTH|SESSION|NEXTAUTH|CRON)/, '인증·내부'],
];
const envService = (n) => ENV_SERVICE.find(([re]) => re.test(n.replace(/^(NEXT_PUBLIC_|VITE_|PUBLIC_)/, '')))?.[1] ?? '기타';
const isPublicEnv = (n) => /^(NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(n);

function walk(dir, limit = 4000) {
  const out = [];
  const skip = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turbo', '.open-next', '.wrangler', '.pef']);
  const rec = (d) => {
    if (out.length >= limit) return;
    let names = [];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const n of names) {
      if (skip.has(n)) continue;
      const p = join(d, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) rec(p);
      else if (st.size < 400_000 && /\.(m?[jt]sx?|cjs|json|jsonc|toml|ya?ml|sh|ps1|py|go|rs)$/i.test(n)) out.push(p);
    }
  };
  rec(dir);
  return out;
}

// ── 섹션 수집기 ──────────────────────────────────────────────────────────────

function cloudflare(dir) {
  const files = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].filter((f) => existsSync(join(dir, f)));
  return files.map((f) => {
    const raw = text(join(dir, f));
    const cfg = f.endsWith('toml') ? null : json(join(dir, f));
    const toml = (re) => raw.match(re)?.[1];
    const names = (arr, key) => (Array.isArray(arr) ? arr.map((x) => x[key] ?? x.name).filter(Boolean) : []);
    const envs = cfg?.env ? Object.keys(cfg.env) : [...raw.matchAll(/^\[env\.([\w-]+)\]/gm)].map((m) => m[1]);
    return {
      file: f,
      addedOn: addedOn(dir, f),
      name: cfg?.name ?? toml(/^name\s*=\s*"([^"]+)"/m),
      accountId: cfg?.account_id ?? toml(/^account_id\s*=\s*"([^"]+)"/m) ?? null,
      compatibilityDate: cfg?.compatibility_date ?? toml(/^compatibility_date\s*=\s*"([^"]+)"/m),
      routes: cfg ? (cfg.routes ?? []).map((r) => (typeof r === 'string' ? r : r.pattern)) : [...raw.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
      crons: cfg?.triggers?.crons ?? [...raw.matchAll(/crons\s*=\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])),
      bindings: {
        KV: names(cfg?.kv_namespaces, 'binding'), D1: names(cfg?.d1_databases, 'binding'), R2: names(cfg?.r2_buckets, 'binding'),
        Queues: names(cfg?.queues?.producers, 'binding'), Hyperdrive: names(cfg?.hyperdrive, 'binding'), Services: names(cfg?.services, 'binding'),
      },
      varNames: cfg?.vars ? Object.keys(cfg.vars) : [], // 값은 읽지 않는다
      environments: envs,
    };
  });
}

function supabase(dir) {
  const refs = new Map();
  const re = /\b([a-z0-9]{20})\.supabase\.co\b/g;
  for (const f of walk(dir, 1500)) {
    const t = text(f);
    for (const m of t.matchAll(re)) refs.set(m[1], [...(refs.get(m[1]) ?? []), f.slice(dir.length + 1)].slice(0, 3));
  }
  const sd = join(dir, 'supabase');
  const ls = (p) => {
    try {
      return readdirSync(p);
    } catch {
      return [];
    }
  };
  const tempRef = text(join(sd, '.temp', 'project-ref')).trim();
  const cfg = text(join(sd, 'config.toml'));
  return {
    present: existsSync(sd) || refs.size > 0,
    projectIdInConfig: cfg.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? null,
    linkedRef: tempRef || null,
    refsInCode: [...refs.entries()].map(([ref, files]) => ({ ref, files })),
    migrations: ls(join(sd, 'migrations')).filter((n) => n.endsWith('.sql')).length,
    functions: ls(join(sd, 'functions')).filter((n) => !n.startsWith('_') && !n.startsWith('.')),
    firstMigrationOn: addedOn(dir, 'supabase/migrations'),
  };
}

function hosting(dir) {
  const out = [];
  const remotes = [...new Set(git(dir, 'remote', '-v').split('\n').filter(Boolean).map((l) => l.split(/\s+/)[1].replace(/\/\/[^@/]+@/, '//')))];
  if (remotes.length) out.push({ service: 'Git 원격', detail: remotes.join(', ') });
  const wf = join(dir, '.github', 'workflows');
  if (existsSync(wf)) {
    for (const n of readdirSync(wf).filter((x) => /\.ya?ml$/.test(x))) {
      const t = text(join(wf, n));
      const deploy = ['wrangler', 'vercel', 'ssh ', 'docker push', 'fly deploy', 'netlify', 'aws '].filter((k) => t.includes(k));
      const sched = [...t.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      out.push({ service: 'GitHub Actions', detail: `${n}${deploy.length ? ` — 배포 단서: ${deploy.join(', ')}` : ''}${sched.length ? ` — 예약: ${sched.join(', ')}` : ''}`, since: addedOn(dir, `.github/workflows/${n}`) });
    }
  }
  const vp = json(join(dir, '.vercel', 'project.json'));
  if (vp) out.push({ service: 'Vercel', detail: `projectId ${idMask(vp.projectId)}, orgId ${idMask(vp.orgId)}` });
  if (existsSync(join(dir, 'vercel.json'))) out.push({ service: 'Vercel', detail: 'vercel.json', since: addedOn(dir, 'vercel.json') });
  for (const [f, label] of [['netlify.toml', 'Netlify'], ['fly.toml', 'Fly.io'], ['render.yaml', 'Render'], ['railway.json', 'Railway'], ['firebase.json', 'Firebase Hosting'], ['Dockerfile', 'Docker']]) {
    if (existsSync(join(dir, f))) out.push({ service: label, detail: f, since: addedOn(dir, f) });
  }
  const fb = json(join(dir, '.firebaserc'));
  if (fb?.projects) out.push({ service: 'Firebase 프로젝트', detail: Object.values(fb.projects).join(', ') });
  return out;
}

function dependencies(dir) {
  const pkg = json(join(dir, 'package.json'));
  if (!pkg) return [];
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const byService = new Map();
  for (const name of Object.keys(all)) {
    const s = SERVICES[name];
    if (s) byService.set(s, [...(byService.get(s) ?? []), name]);
  }
  return [...byService.entries()].map(([service, pkgs]) => ({ service, packages: pkgs, since: introducedOn(dir, `"${pkgs[0]}"`, 'package.json') }));
}

const safeArg = (a) => (/^[@\w./:-]+$/.test(a) && !a.startsWith('-') && !/token|key|secret|password/i.test(a) ? a : '…');

function mcpFromJson(obj, source, dir, extra = {}) {
  const servers = obj?.mcpServers ?? obj?.servers ?? obj?.mcp?.servers ?? {};
  return Object.entries(servers).map(([name, s]) => {
    let host = null;
    try {
      host = s.url ? new URL(s.url).host : null;
    } catch {
      host = '(주소 해석 불가)';
    }
    return {
      name,
      source,
      kind: s.url ? 'URL(원격)' : '명령 실행(로컬)',
      command: s.command ? `${basename(String(s.command))} ${(s.args ?? []).map(safeArg).join(' ')}`.trim() : null,
      host,
      envNames: Object.keys(s.env ?? {}),
      headerNames: Object.keys(s.headers ?? {}),
      since: dir ? addedOn(dir, source) : null,
      ...extra,
    };
  });
}

function mcp(dir) {
  const servers = [];
  const projectFiles = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', '.windsurf/mcp.json', '.gemini/settings.json', '.claude/settings.json', '.claude/settings.local.json'];
  for (const f of projectFiles) {
    const p = join(dir, f);
    if (existsSync(p)) servers.push(...mcpFromJson(json(p), f, dir, { scope: '이 프로젝트' }));
  }
  const codex = text(join(dir, '.codex', 'config.toml'));
  for (const m of codex.matchAll(/^\[mcp_servers\.([\w-]+)\]/gm)) servers.push({ name: m[1], source: '.codex/config.toml', kind: '(codex)', scope: '이 프로젝트', since: addedOn(dir, '.codex/config.toml'), envNames: [], headerNames: [] });

  // 사용자 전역: 이 프로젝트에 붙은 것만 + 전역 공통 서버 이름
  const home = json(join(homedir(), '.claude.json'));
  const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
  const proj = home?.projects ? Object.entries(home.projects).find(([k]) => norm(k) === norm(dir)) : null;
  if (proj) servers.push(...mcpFromJson(proj[1], '~/.claude.json (이 프로젝트)', null, { scope: '이 프로젝트(사용자 설정)' }));
  if (home?.mcpServers) servers.push(...mcpFromJson(home, '~/.claude.json (전역)', null, { scope: '전역(모든 프로젝트 공통)' }));
  const plugins = Object.entries(json(join(homedir(), '.claude', 'settings.json'))?.enabledPlugins ?? {}).filter(([, on]) => on).map(([n]) => n);

  const skills = [];
  for (const base of ['.claude/skills', '.agents/skills']) {
    try {
      for (const n of readdirSync(join(dir, base))) skills.push({ name: n, source: base, since: addedOn(dir, `${base}/${n}`) });
    } catch {
      /* 없음 */
    }
  }
  const lock = json(join(dir, 'skills-lock.json'));
  const locked = lock ? Object.keys(lock.skills ?? lock) : [];
  const uniq = skills.filter((x, i) => skills.findIndex((y) => y.name === x.name) === i);
  return { servers, plugins, skills: uniq, locked };
}

function envInfo(dir) {
  const top = (() => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  })();
  const exampleFiles = top.filter((n) => /^\.(env|dev\.vars)(\..+)?\.(example|sample|template)$/.test(n) || n === '.dev.vars.example');
  const documented = new Set();
  for (const f of exampleFiles) for (const m of text(join(dir, f)).matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)) documented.add(m[1]);
  const refs = new Map();
  const re = /(?:process\.env|import\.meta\.env|\benv|Deno\.env\.get\(\s*['"]|os\.environ(?:\.get\()?\[?\s*['"]|getenv\(\s*['"]|process\.env\[\s*['"])\.?([A-Z][A-Z0-9_]{2,})/g;
  for (const f of walk(dir)) {
    for (const m of text(f).matchAll(re)) {
      const r = refs.get(m[1]) ?? { files: new Set() };
      r.files.add(f.slice(dir.length + 1));
      refs.set(m[1], r);
    }
  }
  const real = top.filter((n) => /^\.(env|dev\.vars)(\..+)?$/.test(n) && !exampleFiles.includes(n));
  const tracked = real.filter((n) => git(dir, 'ls-files', '--', n));
  const rows = [...new Set([...documented, ...refs.keys()])].sort().map((name) => ({
    name,
    service: envService(name),
    public: isPublicEnv(name),
    documented: documented.has(name),
    usedInFiles: refs.get(name)?.files.size ?? 0,
    sample: [...(refs.get(name)?.files ?? [])].slice(0, 2),
  }));
  return { exampleFiles, realFiles: real, trackedRealFiles: tracked, rows };
}

function schedules(dir, cf, hostingItems) {
  const out = [];
  for (const c of cf) for (const cron of c.crons) out.push({ where: `Cloudflare(${c.file})`, cron });
  const vj = json(join(dir, 'vercel.json'));
  for (const c of vj?.crons ?? []) out.push({ where: 'Vercel 크론', cron: `${c.schedule} → ${c.path}` });
  for (const h of hostingItems.filter((x) => x.service === 'GitHub Actions' && x.detail.includes('예약:'))) out.push({ where: h.detail.split(' — ')[0], cron: h.detail.split('예약: ')[1] });
  return out;
}

function webhooks(dir) {
  const hits = [];
  for (const f of walk(dir, 3000)) {
    const rel = f.slice(dir.length + 1).replace(/\\/g, '/');
    if (/webhook/i.test(rel)) hits.push(rel);
  }
  return hits.slice(0, 15);
}

// ── 실시간 계정 확인 (옵트인: --live). 로그인된 CLI에 "누구냐"만 묻는 읽기 전용 호출이다. ──────

/** wrangler whoami 출력 → 이메일(마스킹)·계정 목록 */
export function parseWhoami(out) {
  const email = out.match(/email\s+([^\s,]+?)\.?\s*$/m)?.[1] ?? null;
  const accounts = [...out.matchAll(/│\s*([^│]+?)\s*│\s*([0-9a-f]{32})\s*│/g)].map((m) => ({ name: m[1], id: m[2] }));
  return { email: email ? mask(email) : null, accounts };
}

/** supabase projects list 출력 → 프로젝트 목록 */
export function parseSupabaseProjects(out) {
  return out
    .split('\n')
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.length >= 5 && /^[a-z0-9]{20}$/.test(c[2] ?? ''))
    .map((c) => ({ ref: c[2], name: c[3], region: c[4], created: c[5] ?? '' }));
}

const tryRun = (cmd) => {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', timeout: 40000, stdio: ['ignore', 'pipe', 'ignore'] }) };
  } catch (e) {
    return { ok: false, out: '', why: String(e.message).split('\n')[0] };
  }
};

function live(cf, sb) {
  const res = { cloudflare: null, supabase: null };
  if (cf.length) {
    const r = tryRun('wrangler whoami');
    res.cloudflare = r.ok ? { ...parseWhoami(r.out), codeAccountIds: cf.map((c) => c.accountId).filter(Boolean) } : { error: r.why };
  }
  if (sb.present) {
    const r = tryRun('supabase projects list');
    res.supabase = r.ok ? { projects: parseSupabaseProjects(r.out).map((p) => ({ ...p, usedByApp: sb.refsInCode.some((x) => x.ref === p.ref) || p.ref === sb.linkedRef })) } : { error: r.why };
  }
  return res;
}

// ── 영수증 만들기 ────────────────────────────────────────────────────────────

export function buildReceipt(dir, now = new Date(), { liveCheck = false } = {}) {
  const cf = cloudflare(dir);
  const sb = supabase(dir);
  const host = hosting(dir);
  const deps = dependencies(dir);
  const m = mcp(dir);
  const env = envInfo(dir);
  const sched = schedules(dir, cf, host);
  const hooks = webhooks(dir);
  const firstCommit = firstLine(git(dir, 'log', '--reverse', '--format=%cs'));
  const pkg = json(join(dir, 'package.json'));

  const undocumented = env.rows.filter((r) => !r.documented && r.usedInFiles > 0 && !/^(NODE_ENV|NEXT_RUNTIME|CI|PORT|TZ|PATH|HOME)$/.test(r.name));
  const forgotten = [];
  if (env.trackedRealFiles.length) forgotten.push(`⚠ git이 추적 중인 실제 환경 파일: ${env.trackedRealFiles.join(', ')} (시크릿이 저장소에 올라갔을 수 있음 — 값은 열어보지 않음)`);
  if (env.realFiles.length) forgotten.push(`실제 환경 파일이 있음: ${env.realFiles.join(', ')} — 내용은 열지 않았고, 어느 계정/DB를 가리키는지는 확인 못 함`);
  if (undocumented.length) forgotten.push(`코드가 쓰는데 .env.example 에 없는 환경변수 ${undocumented.length}개: ${undocumented.slice(0, 12).map((r) => r.name).join(', ')}${undocumented.length > 12 ? ' …' : ''}`);
  if (cf.some((c) => !c.accountId)) forgotten.push('Cloudflare 계정 ID가 파일에 없음 → 어느 계정에 배포되는지 파일만으로는 알 수 없음 (대시보드 또는 wrangler whoami 로 확인)');
  if (sb.present && !sb.projectIdInConfig && !sb.linkedRef && !sb.refsInCode.length) forgotten.push('Supabase 사용 흔적은 있으나 프로젝트 주소(ref)를 찾지 못함');
  if (sb.refsInCode.length > 1) forgotten.push(`코드에 서로 다른 Supabase 프로젝트 주소가 ${sb.refsInCode.length}개 보임 (운영/스테이징 구분인지 확인): ${sb.refsInCode.map((r) => r.ref).join(', ')}`);
  const globalMcp = m.servers.filter((s) => s.scope.startsWith('전역'));
  if (m.servers.length) forgotten.push(`MCP 서버 ${m.servers.length}개가 붙어 있음 — 각 서버가 어느 계정으로 로그인됐는지는 설정 파일에 없어 확인 못 함${globalMcp.length ? ` (전역 ${globalMcp.length}개는 모든 프로젝트에 공통 적용)` : ''}`);
  if (sched.length) forgotten.push(`예약 작업 ${sched.length}개 — 실제로 호출·실행되는지는 코드만으로 확인 못 함`);

  return {
    issuedAt: kst(now),
    target: dir,
    name: pkg?.name ?? basename(dir),
    git: { firstCommit, branch: git(dir, 'branch', '--show-current'), commit: git(dir, 'rev-parse', '--short', 'HEAD') },
    cloudflare: cf,
    supabase: sb,
    hosting: host,
    dependencies: deps,
    mcp: m,
    env,
    schedules: sched,
    webhooks: hooks,
    live: liveCheck ? live(cf, sb) : null,
    forgotten,
    notChecked: ['계정 소유자·결제·요금제', '키·토큰 만료일', '대시보드에서만 보이는 설정(도메인·DNS·권한)', '실제 환경변수 값(열지 않음)', '로그인 상태(어느 계정으로 연결됐는지)'],
  };
}

// ── 출력 ─────────────────────────────────────────────────────────────────────

const d = (s) => (s ? s : '날짜 기록 없음');
const list = (a) => (a.length ? a.join(', ') : '없음');

export function renderReceiptMd(r) {
  const L = [];
  const h = (t) => L.push('', `## ${t}`);
  L.push(`# 🧾 앱 영수증 — ${r.name}`, '', `- 발행: ${r.issuedAt}`, `- 위치: ${r.target}`, `- 저장소 첫 커밋: ${d(r.git.firstCommit)} · 현재 \`${r.git.branch || '-'}\` @ \`${r.git.commit || '-'}\``);
  L.push('- 날짜는 **git 기록(저장소에 처음 나타난 날)** 기준입니다. 실제로 계정을 연결한 날과 다를 수 있습니다.');

  h('잊기 쉬운 것 (먼저 보세요)');
  L.push(...(r.forgotten.length ? r.forgotten.map((x) => `- ${x}`) : ['- 없음']));

  h('Cloudflare');
  if (!r.cloudflare.length) L.push('- 설정 파일 없음');
  for (const c of r.cloudflare) {
    L.push(`- **${c.name ?? '(이름 없음)'}** (${c.file}, 저장소 추가 ${d(c.addedOn)})`);
    L.push(`  - 계정 ID: ${c.accountId ? idMask(c.accountId) : '파일에 없음'}`);
    L.push(`  - 도메인(routes): ${list(c.routes)} · 예약(크론): ${list(c.crons)} · 환경: ${list(c.environments)}`);
    L.push(`  - 연결 자원: ${Object.entries(c.bindings).filter(([, v]) => v.length).map(([k, v]) => `${k}(${v.join(', ')})`).join(' · ') || '없음'}`);
    L.push(`  - 설정된 vars 이름: ${list(c.varNames)} (값은 읽지 않음)`);
  }

  h('Supabase');
  const s = r.supabase;
  if (!s.present) L.push('- 사용 흔적 없음');
  else {
    L.push(`- config project_id: ${s.projectIdInConfig ?? '없음'} · CLI 연결 ref: ${s.linkedRef ?? '없음'}`);
    L.push(`- 코드에 나온 프로젝트 주소(ref): ${s.refsInCode.length ? s.refsInCode.map((x) => `${x.ref} (${x.files.join(', ')})`).join(' / ') : '없음'}`);
    L.push(`- 마이그레이션 ${s.migrations}개 (처음 추가 ${d(s.firstMigrationOn)}) · 엣지 함수: ${list(s.functions)}`);
  }

  h('배포·저장소·자동화');
  L.push(...(r.hosting.length ? r.hosting.map((x) => `- **${x.service}**: ${x.detail}${x.since ? ` (추가 ${x.since})` : ''}`) : ['- 없음']));

  if (r.live) {
    h('계정 확인 (실시간 · 읽기 전용 · 로그인된 CLI에 물어봄)');
    const c = r.live.cloudflare;
    if (c) {
      if (c.error) L.push(`- Cloudflare: 확인 실패 (${c.error}) — 로그인 안 됐거나 wrangler 없음`);
      else L.push(`- Cloudflare 로그인: ${c.email ?? '이메일 확인 불가'} · 접근 가능한 계정: ${c.accounts.length ? c.accounts.map((a) => `${a.name} (${idMask(a.id)})${c.codeAccountIds.includes(a.id) ? ' ← 이 앱 설정과 일치' : ''}`).join(' / ') : '목록 없음'}`);
    }
    const sp = r.live.supabase;
    if (sp) {
      if (sp.error) L.push(`- Supabase: 확인 실패 (${sp.error}) — 로그인 안 됐거나 supabase CLI 없음`);
      else L.push(...sp.projects.map((p) => `- Supabase 프로젝트 **${p.name}** (${p.ref}, ${p.region}, 생성 ${p.created})${p.usedByApp ? ' ← **이 앱이 쓰는 프로젝트**' : ''}`), ...(sp.projects.length ? [] : ['- Supabase: 접근 가능한 프로젝트 없음']));
    }
    L.push('- ⚠ "지금 로그인된 계정"이지 "이 앱이 배포되는 계정"이 같다는 보장은 아닙니다. 위에서 "일치"라고 표시된 것만 확인된 것입니다.');
  }

  h('연결된 외부 서비스 (의존성 기준)');
  L.push(...(r.dependencies.length ? r.dependencies.map((x) => `- **${x.service}** — ${x.packages.join(', ')} (처음 추가 ${d(x.since)})`) : ['- 없음']));

  h('MCP·스킬·플러그인');
  L.push(...(r.mcp.servers.length ? r.mcp.servers.map((x) => `- **${x.name}** [${x.scope}] ${x.kind}${x.host ? ` · ${x.host}` : ''}${x.command ? ` · \`${x.command}\`` : ''}${x.envNames.length ? ` · env 이름: ${x.envNames.join(', ')}` : ''}${x.headerNames.length ? ` · 헤더 이름: ${x.headerNames.join(', ')}` : ''} — ${x.source}${x.since ? `, 추가 ${x.since}` : ''}`) : ['- MCP 서버 설정 없음']));
  if (r.mcp.plugins.length) L.push(`- 켜 둔 플러그인(전역): ${r.mcp.plugins.join(', ')}`);
  if (r.mcp.skills.length || r.mcp.locked.length) L.push(`- 스킬: ${[...r.mcp.skills.map((x) => `${x.name}(${x.since ?? '날짜 없음'})`), ...r.mcp.locked.filter((n) => !r.mcp.skills.some((x) => x.name === n))].join(', ')}`);

  h('환경변수 (이름만 · 값은 읽지 않음)');
  const groups = new Map();
  for (const e of r.env.rows) groups.set(e.service, [...(groups.get(e.service) ?? []), e]);
  if (!groups.size) L.push('- 없음');
  for (const [svc, rows] of [...groups.entries()].sort()) L.push(`- **${svc}** (${rows.length}): ${rows.map((e) => `${e.name}${e.public ? '🌐' : ''}${e.documented ? '' : '❓'}`).join(', ')}`);
  L.push('- 🌐 = 브라우저에 공개되는 변수 · ❓ = .env.example 에 없음');

  h('예약 작업 · 웹훅');
  L.push(...(r.schedules.length ? r.schedules.map((x) => `- ${x.where}: ${x.cron}`) : ['- 예약 작업 없음']));
  L.push(...(r.webhooks.length ? [`- 웹훅 관련 파일: ${r.webhooks.join(', ')}`] : ['- 웹훅 파일 없음']));

  h('이 영수증이 확인 못 한 것');
  L.push(...r.notChecked.map((x) => `- ${x}`));
  return mask(L.join('\n')) + '\n';
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderReceiptHtml(r) {
  // 마크다운 본문을 영수증 모양 카드로 감싼다: ## → 구분선 + 제목, - → 줄, **x** → 굵게
  const md = renderReceiptMd(r);
  const body = md
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return `<h1>${esc(line.slice(2))}</h1>`;
      if (line.startsWith('## ')) return `<h2>${esc(line.slice(3))}</h2>`;
      if (/^\s*- /.test(line)) {
        const indent = line.match(/^\s*/)[0].length;
        return `<div class="row" style="margin-left:${indent * 6}px">${esc(line.replace(/^\s*- /, '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')}</div>`;
      }
      return line.trim() ? `<p>${esc(line)}</p>` : '';
    })
    .join('\n');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>앱 영수증</title>
<style>
:root{--bg:#ece9e2;--paper:#fffdf8;--tx:#222;--dim:#777;--line:#bbb;--warn:#b35900}
@media(prefers-color-scheme:dark){:root{--bg:#14161a;--paper:#1c1f25;--tx:#e8e8e8;--dim:#9aa;--line:#444;--warn:#f0a63a}}
body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.55 "D2Coding","Consolas","Malgun Gothic",monospace}
main{max-width:720px;margin:20px auto;background:var(--paper);padding:22px 20px;box-shadow:0 2px 14px rgba(0,0,0,.18);border-radius:4px}
h1{font-size:19px;margin:0 0 6px;text-align:center}h2{font-size:15px;margin:20px 0 6px;padding-top:10px;border-top:2px dashed var(--line)}
.row{padding:2px 0;word-break:break-word}p{margin:3px 0;color:var(--dim)}code{background:rgba(127,127,127,.18);padding:0 4px;border-radius:3px}
</style></head><body><main>
${body}
</main></body></html>
`;
}
