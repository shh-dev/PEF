// Integration & Secrets Inspector (SPEC §10.1~10.3) — 읽기 전용.
//  - 시크릿 *값*은 읽지도 출력하지도 않는다. 기록하는 것은 이름·참조 위치·존재 여부뿐.
//  - .env* 파일은 이름과 git 추적 여부만 본다 (내용을 열지 않음, PLAYBOOK §2-1).
//  - 연결을 시도하지 않는다. 그래서 모든 연동의 연결 상태는 NotTested (SPEC §10.4: 설정 발견 ≠ 연결 성공).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, join, relative } from 'node:path';
import { mask } from './mask.js';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.output', '.vercel', '.wrangler', '.turbo', '.cache', '.pef', 'dist', 'build', 'out', 'coverage', 'vendor', 'target', '__pycache__', '.venv', 'venv']);
const CODE_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py|go|rs|rb|php)$/;
const MAX_FILES = 20_000;
const MAX_BYTES = 1024 * 1024;

const ENV_NAME = '([A-Z_][A-Z0-9_]*)';
const ENV_PATTERNS = [
  new RegExp(`process\\.env\\.${ENV_NAME}`, 'g'),
  new RegExp(`process\\.env\\[\\s*['"\`]${ENV_NAME}['"\`]\\s*\\]`, 'g'),
  new RegExp(`import\\.meta\\.env\\.${ENV_NAME}`, 'g'),
  new RegExp(`Deno\\.env\\.get\\(\\s*['"]${ENV_NAME}['"]`, 'g'),
  new RegExp(`os\\.(?:getenv|environ\\.get)\\(\\s*['"]${ENV_NAME}['"]`, 'g'),
  new RegExp(`os\\.environ\\[\\s*['"]${ENV_NAME}['"]\\s*\\]`, 'g'),
  new RegExp(`os\\.(?:Getenv|LookupEnv)\\(\\s*"${ENV_NAME}"`, 'g'),
  new RegExp(`env::var\\(\\s*"${ENV_NAME}"`, 'g'),
];
// const { A, B: b } = process.env
const ENV_DESTRUCTURE = /\{([^{}]{1,500})\}\s*=\s*(?:process\.env|import\.meta\.env)\b/g;

// 브라우저 번들에 그대로 들어가는 접두사 (Next.js·Vite·SvelteKit·Astro·Expo·CRA)
const CLIENT_PREFIX = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_|NUXT_PUBLIC_)/;
// 공개되면 안 되는 이름. ANON/PUBLISHABLE 키는 원래 공개용이라 뺀다.
const SECRET_NAME = /(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|PASSWD|_TOKEN$|ACCESS_TOKEN|API_?KEY$|SIGNING_KEY|CLIENT_SECRET|DATABASE_URL|DB_URL)/;
const PUBLIC_OK = /(?:ANON|PUBLISHABLE|PUBLIC_KEY|SITE_KEY|MEASUREMENT_ID)/;

const SERVICES = [
  { id: 'Supabase', deps: [/^@supabase\//, /^supabase$/], env: /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_)?SUPABASE_/, files: ['supabase/config.toml'] },
  { id: 'Firebase', deps: [/^firebase(?:-admin)?$/, /^@firebase\//], env: /FIREBASE_/, files: ['firebase.json', '.firebaserc'] },
  { id: 'Cloudflare', deps: [/^wrangler$/, /^@cloudflare\//], env: /^(?:CLOUDFLARE_|CF_)/, files: ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'] },
  { id: 'Vercel', deps: [/^@vercel\//, /^vercel$/], env: /^VERCEL_/, files: ['vercel.json'] },
  { id: 'Netlify', deps: [/^@netlify\//, /^netlify-cli$/], env: /^NETLIFY_/, files: ['netlify.toml'] },
  { id: 'AWS', deps: [/^@aws-sdk\//, /^aws-sdk$/, /^boto3$/], env: /^AWS_/, files: [] },
  { id: 'Google Cloud', deps: [/^@google-cloud\//, /^googleapis$/, /^google-cloud-/], env: /^(?:GCP_|GOOGLE_CLOUD_|GOOGLE_APPLICATION_CREDENTIALS)/, files: [] },
  { id: 'Azure', deps: [/^@azure\//, /^azure-/], env: /^AZURE_/, files: [] },
  { id: 'OpenAI', deps: [/^openai$/, /^@ai-sdk\/openai$/], env: /^OPENAI_/, files: [] },
  { id: 'Google Gemini', deps: [/^@google\/genai$/, /^@google\/generative-ai$/, /^google-genai$/, /^@ai-sdk\/google$/], env: /^(?:GEMINI_|GOOGLE_GENERATIVE_AI_)/, files: [] },
  { id: 'Anthropic', deps: [/^@anthropic-ai\//, /^anthropic$/, /^@ai-sdk\/anthropic$/], env: /^ANTHROPIC_/, files: [] },
  { id: 'Stripe', deps: [/^stripe$/, /^@stripe\//], env: /^(?:NEXT_PUBLIC_)?STRIPE_/, files: [] },
  { id: 'Toss Payments', deps: [/^@tosspayments\//], env: /TOSS_/, files: [] },
  { id: 'Slack', deps: [/^@slack\//, /^slack[-_]sdk$/], env: /^SLACK_/, files: [] },
  { id: 'GitHub', deps: [/^@octokit\//, /^octokit$/, /^PyGithub$/i], env: /^(?:GITHUB_|GH_)/, files: [] },
  { id: 'Redis', deps: [/^redis$/, /^ioredis$/, /^@upstash\/redis$/], env: /^(?:REDIS_|UPSTASH_REDIS_|KV_)/, files: [] },
  { id: 'PostgreSQL', deps: [/^pg$/, /^postgres$/, /^@neondatabase\//, /^psycopg2?(?:-binary)?$/, /^asyncpg$/], env: /^(?:DATABASE_URL|POSTGRES_|PG(?:HOST|USER|PASSWORD|DATABASE)$)/, files: [] },
  { id: 'Sentry', deps: [/^@sentry\//, /^sentry-sdk$/], env: /^(?:NEXT_PUBLIC_)?SENTRY_/, files: ['sentry.client.config.ts', 'sentry.server.config.ts'] },
  { id: 'Resend', deps: [/^resend$/], env: /^RESEND_/, files: [] },
  { id: 'SendGrid', deps: [/^@sendgrid\//, /^sendgrid$/], env: /^SENDGRID_/, files: [] },
  { id: 'Twilio', deps: [/^twilio$/], env: /^TWILIO_/, files: [] },
];

// 프로젝트 안에 있는 MCP 설정만 본다. 홈 디렉터리 등 사용자별 설정은 승인 없이 탐색하지 않는다 (SPEC §10.1).
const MCP_FILES = [
  { path: '.mcp.json', client: 'Claude Code', key: 'mcpServers' },
  { path: '.cursor/mcp.json', client: 'Cursor', key: 'mcpServers' },
  { path: '.vscode/mcp.json', client: 'VS Code', key: 'servers' },
  { path: '.gemini/settings.json', client: 'Gemini CLI', key: 'mcpServers' },
  { path: '.codex/config.toml', client: 'Codex', toml: true },
];

/** 검사할 파일과 .env* 파일 경로(내용은 열지 않음)를 나눠 돌려준다 */
function walk(dir) {
  const files = [];
  const envPaths = [];
  const stack = [dir];
  while (stack.length && files.length < MAX_FILES) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(join(cur, e.name));
      } else if (e.isFile()) (e.name.startsWith('.env') ? envPaths : files).push(join(cur, e.name));
    }
  }
  return { files: files.sort(), envPaths: envPaths.sort() };
}

const readSmall = (file) => {
  try {
    return statSync(file).size <= MAX_BYTES ? readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
};

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** 코드 한 파일에서 환경변수 이름과 줄 번호를 뽑는다 (순수 함수). */
export function scanEnvRefs(text) {
  const out = [];
  for (const re of ENV_PATTERNS) for (const m of text.matchAll(re)) out.push({ name: m[1], line: lineAt(text, m.index) });
  for (const m of text.matchAll(ENV_DESTRUCTURE)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':')[0].split('=')[0].trim();
      if (/^[A-Z_][A-Z0-9_]*$/.test(name)) out.push({ name, line: lineAt(text, m.index) });
    }
  }
  return out;
}

/** GitHub Actions 워크플로에서 secrets.X / vars.X 이름 (순수 함수). */
export function scanCiRefs(text) {
  // secrets.GITHUB_TOKEN 은 Actions 가 자동으로 주는 값이라 관리 대상이 아니다
  return [...text.matchAll(/\b(secrets|vars)\.([A-Za-z_][A-Za-z0-9_]*)/g)].filter((m) => !(m[1] === 'secrets' && m[2] === 'GITHUB_TOKEN')).map((m) => ({ kind: m[1], name: m[2], line: lineAt(text, m.index) }));
}

/** 이름만 보고 "공개되면 안 되는 값이 브라우저 번들로 나갈 수 있는가" 판단 */
export const isClientExposedSecret = (name) => CLIENT_PREFIX.test(name) && SECRET_NAME.test(name.replace(CLIENT_PREFIX, '')) && !PUBLIC_OK.test(name);

const isRef = (v) => typeof v !== 'string' || !v.trim() || /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$|^\$\{(?:env|input):[^}]+\}$/.test(v.trim());
const secretKey = (k) => /SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE|AUTH/i.test(k);

/** MCP 서버 한 개 설정을 메타데이터로 바꾼다. 값은 담지 않고, 값이 박혀 있으면 위험으로만 표시 (순수 함수). */
export function describeMcpServer(name, s, file, client) {
  const transport = s.type ?? s.transport ?? (s.url || s.serverUrl ? 'http' : s.command ? 'stdio' : 'unknown');
  let endpoint = null;
  if (s.url || s.serverUrl) {
    try {
      endpoint = new URL(s.url ?? s.serverUrl).host; // 경로·쿼리에 토큰이 붙는 경우가 있어 호스트만
    } catch {
      endpoint = '(URL 형식 아님)';
    }
  }
  const envNames = Object.keys(s.env ?? {});
  const risks = [];
  for (const [k, v] of Object.entries(s.env ?? {})) if (secretKey(k) && !isRef(v)) risks.push(`env.${k} 에 값이 직접 적혀 있음`);
  for (const [k, v] of Object.entries(s.headers ?? {})) if (secretKey(k) && !isRef(String(v).replace(/^Bearer\s+/i, ''))) risks.push(`headers.${k} 에 값이 직접 적혀 있음`);
  if ((s.args ?? []).some((a) => mask(a) !== a)) risks.push('args 에 시크릿처럼 보이는 값이 있음');
  if ((s.url ?? s.serverUrl ?? '') !== mask(s.url ?? s.serverUrl ?? '') || /[?&](?:key|token|api_?key|secret)=/i.test(s.url ?? s.serverUrl ?? '')) risks.push('URL 에 토큰이 붙어 있음');
  if (s.command && !s.args?.length && /\s/.test(s.command)) risks.push('command 한 줄에 인자까지 들어 있음 (값 노출 가능성 확인)');
  return { name, client, file, transport, command: s.command ? basename(String(s.command).split(/\s+/)[0]) : null, endpoint, envNames, connection: 'NotTested', risks };
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    // JSONC: 줄 주석·끝 쉼표 허용 (문자열 안의 // 는 URL 등에서 흔하므로 줄 시작 주석만 지운다)
    return JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
  }
}

/** Codex config.toml 의 [mcp_servers.X] 블록 최소 파싱 (순수 함수). */
export function parseCodexMcp(text) {
  const servers = {};
  let cur = null;
  let sub = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const head = line.match(/^\[mcp_servers\.([^\].]+)(?:\.(env|headers|http_headers))?\]$/);
    if (head) {
      cur = servers[head[1]] ??= {};
      sub = head[2] ? (cur[head[2] === 'http_headers' ? 'headers' : head[2]] ??= {}) : null;
      continue;
    }
    if (line.startsWith('[')) {
      cur = sub = null;
      continue;
    }
    const kv = cur && line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const val = kv[2].trim();
    const str = val.match(/^"(.*)"$/)?.[1];
    if (sub) sub[kv[1]] = str ?? val;
    else if (kv[1] === 'args') cur.args = [...val.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    else if (kv[1] === 'env' || kv[1] === 'http_headers') cur[kv[1] === 'env' ? 'env' : 'headers'] = Object.fromEntries([...val.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
    else cur[kv[1]] = str ?? val;
  }
  return servers;
}

function readDeps(dir) {
  const deps = new Map(); // 이름 → 근거 파일
  const pkg = join(dir, 'package.json');
  if (existsSync(pkg)) {
    try {
      const p = JSON.parse(readFileSync(pkg, 'utf8'));
      for (const name of Object.keys({ ...p.dependencies, ...p.devDependencies })) deps.set(name, 'package.json');
    } catch {
      // 깨진 package.json 은 discover 가 이미 보고한다
    }
  }
  for (const f of ['requirements.txt', 'pyproject.toml']) {
    const text = existsSync(join(dir, f)) ? readSmall(join(dir, f)) : null;
    for (const m of text?.matchAll(/^\s*"?([A-Za-z0-9][A-Za-z0-9._-]*)/gm) ?? []) deps.set(m[1], f);
  }
  return deps;
}

function gitState(dir, file) {
  const run = (...args) => {
    try {
      execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore', timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  };
  return { tracked: run('ls-files', '--error-unmatch', '--', file), ignored: run('check-ignore', '-q', '--', file) };
}

/**
 * @returns {{envVars: object[], envFiles: object[], ciSecrets: object[], mcpServers: object[], services: object[], findings: object[]}}
 */
export function inspectIntegrations(dir) {
  const rel = (f) => relative(dir, f).split('\\').join('/');
  const { files, envPaths } = walk(dir);

  // 1) 코드 속 환경변수 참조
  const env = new Map();
  for (const f of files.filter((f) => CODE_EXT.test(f))) {
    const text = readSmall(f);
    if (!text) continue;
    for (const { name, line } of scanEnvRefs(text)) {
      if (!env.has(name)) env.set(name, []);
      const refs = env.get(name);
      if (refs.length < 20 && !refs.some((r) => r.file === rel(f) && r.line === line)) refs.push({ file: rel(f), line });
    }
  }
  const envVars = [...env].sort(([a], [b]) => a.localeCompare(b)).map(([name, refs]) => ({ name, refs, clientExposed: CLIENT_PREFIX.test(name) }));

  // 2) CI 시크릿 이름
  const ci = new Map();
  for (const f of files.filter((f) => /[\\/]\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/.test(f))) {
    for (const { kind, name, line } of scanCiRefs(readSmall(f) ?? '')) {
      const key = `${kind}.${name}`;
      if (!ci.has(key)) ci.set(key, { kind, name, refs: [] });
      ci.get(key).refs.push({ file: rel(f), line });
    }
  }

  // 3) .env* 파일 — 이름과 git 상태만
  const envFiles = envPaths.map((f) => ({ name: rel(f), template: /\.(?:example|sample|template|dist)$/.test(f), ...gitState(dir, rel(f)) }));

  // 4) MCP 설정
  const mcpServers = [];
  for (const m of MCP_FILES) {
    const text = existsSync(join(dir, m.path)) ? readSmall(join(dir, m.path)) : null;
    if (!text) continue;
    let servers;
    try {
      servers = m.toml ? parseCodexMcp(text) : parseJsonLoose(text)?.[m.key] ?? {};
    } catch {
      mcpServers.push({ name: '(파싱 실패)', client: m.client, file: m.path, transport: 'unknown', command: null, endpoint: null, envNames: [], connection: 'NotTested', risks: ['설정 파일을 읽지 못함'] });
      continue;
    }
    for (const [name, s] of Object.entries(servers)) mcpServers.push(describeMcpServer(name, s ?? {}, m.path, m.client));
  }

  // 5) 외부 서비스 후보 — 근거별로 기록. 의존성만 있으면 "후보", 설정·환경변수까지 있으면 "설정됨"
  const deps = readDeps(dir);
  const ciNames = [...ci.values()].map((c) => c.name);
  const services = [];
  for (const s of SERVICES) {
    const evidence = [];
    for (const [name, from] of deps) if (s.deps.some((re) => re.test(name))) evidence.push({ kind: 'dependency', detail: `${name} (${from})` });
    for (const f of s.files) if (existsSync(join(dir, f))) evidence.push({ kind: 'config', detail: f });
    for (const v of envVars) if (s.env.test(v.name)) evidence.push({ kind: 'env', detail: v.name });
    for (const n of ciNames) if (s.env.test(n)) evidence.push({ kind: 'ci', detail: n });
    for (const m of mcpServers) if (m.name.toLowerCase().includes(s.id.toLowerCase().split(' ')[0])) evidence.push({ kind: 'mcp', detail: `${m.name} (${m.file})` });
    if (!evidence.length) continue;
    const configured = evidence.some((e) => e.kind !== 'dependency');
    services.push({ service: s.id, status: configured ? 'Configured' : 'Candidate', connection: 'NotTested', evidence });
  }

  // 6) 위험 → Finding (이름만 보고 내린 판단이라 Suspected)
  const findings = [];
  const add = (o) =>
    findings.push({
      category: '4.13 보안',
      ruleId: 'SE-10',
      verification: 'Suspected',
      disposition: 'NeedsCheck',
      dispositionReason: 'integrations 자동 탐지 — 아직 사람/에이전트가 판단하지 않음',
      confidence: 'medium',
      fixStatus: 'Open',
      source: 'pef-integrations',
      line: null,
      ...o,
      title: mask(o.title),
      evidence: mask(o.evidence),
    });
  for (const v of envVars.filter((v) => isClientExposedSecret(v.name))) {
    add({ title: `공개 접두사 환경변수에 비밀값 이름: ${v.name}`, severity: 'P1', evidence: `${v.name} 는 브라우저 번들에 그대로 들어가는 접두사. 참조 ${v.refs.length}곳`, filePath: v.refs[0].file, line: v.refs[0].line, recommendedFix: '서버 전용 이름으로 바꾸고 서버에서만 읽기. 이미 배포됐다면 키 교체' });
  }
  for (const e of envFiles.filter((e) => e.tracked && !e.template)) {
    add({ title: `.env 파일이 git 에 올라가 있음: ${e.name}`, severity: 'P0', evidence: `git ls-files 에 ${e.name} 존재 (내용은 열지 않음)`, filePath: e.name, recommendedFix: 'git 추적 해제 + .gitignore 추가 + 들어 있던 키 전부 교체 (히스토리에 남음)' });
  }
  for (const e of envFiles.filter((e) => !e.tracked && !e.template && !e.ignored)) {
    add({ title: `.env 파일이 .gitignore 에 없음: ${e.name}`, severity: 'P2', evidence: `git check-ignore 결과 무시 대상 아님 — 실수로 커밋될 수 있음`, filePath: e.name, recommendedFix: '.gitignore 에 .env* 추가' });
  }
  for (const m of mcpServers.filter((m) => m.risks.length)) {
    add({ title: `MCP 설정에 시크릿이 직접 적혀 있을 수 있음: ${m.name}`, severity: 'P1', evidence: `${m.file}: ${m.risks.join(', ')}`, filePath: m.file, recommendedFix: '값 대신 ${VAR} 환경변수 참조로 바꾸고, 커밋된 적 있으면 키 교체' });
  }

  return { envVars, envFiles, ciSecrets: [...ci.values()], mcpServers, services, findings };
}
