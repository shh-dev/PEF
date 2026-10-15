// 앱 유형·대상 운영체제 추정 (파일 존재와 의존성만 본다 — 코드 실행·네트워크 없음).
// 추정은 틀릴 수 있으므로 항상 근거(evidence)와 신뢰도를 같이 돌려주고, 최종 확정은 사용자 확인 몫이다 (PLAYBOOK §1.5).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const readText = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};
const readJson = (p) => {
  try {
    return JSON.parse(readText(p));
  } catch {
    return null;
  }
};
const dirs = (p) => {
  try {
    return readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory());
  } catch {
    return [];
  }
};

const WEB = ['next', 'nuxt', 'react-dom', 'vue', 'svelte', '@sveltejs/kit', '@angular/core', 'solid-js', 'astro', '@remix-run/react'];
const SERVER = ['express', 'fastify', 'hono', '@nestjs/core', 'koa', '@hapi/hapi', 'elysia'];
const BOT = ['discord.js', 'telegraf', 'grammy', '@slack/bolt', 'node-cron', 'node-schedule', 'bullmq', 'agenda', 'bree'];
const PRIORITY = ['desktop', 'mobile', 'web', 'api-server', 'batch-bot', 'cli', 'library'];

export const TYPE_LABEL = {
  web: '웹앱',
  'internal-tool': '내부 도구·관리자 페이지',
  'api-server': 'API·백엔드 서버',
  desktop: '데스크톱 앱',
  mobile: '모바일 앱',
  'cli-library': 'CLI·라이브러리',
  'batch-bot': '배치·봇·파이프라인',
  unknown: '알 수 없음',
};

/** @returns {{types: {type: string, confidence: string, evidence: string[]}[], platforms: string[]}} */
export function classify(dir) {
  const found = new Map(); // type -> evidence[]
  const platforms = new Set();
  const add = (type, why) => found.set(type, [...(found.get(type) ?? []), why]);

  // package.json 은 루트 + 모노레포 하위(apps/packages/services) 한 단계까지
  const pkgDirs = [dir, ...['apps', 'packages', 'services'].flatMap((g) => dirs(join(dir, g)).map((d) => join(dir, g, d)))];
  for (const d of pkgDirs) {
    const pkg = readJson(join(d, 'package.json'));
    if (!pkg) continue;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const has = (list) => list.filter((x) => x in deps);
    const rel = d === dir ? '' : ` (${d.slice(dir.length + 1)})`;

    if ('electron' in deps) {
      add('desktop', `electron 의존성${rel}`);
      const b = pkg.build ?? {};
      if (b.win || existsSync(join(d, 'electron-builder.yml'))) platforms.add('Windows');
      if (b.mac) platforms.add('macOS');
      if (b.linux) platforms.add('Linux');
    }
    if ('react-native' in deps || 'expo' in deps) add('mobile', `react-native/expo 의존성${rel}`);
    const web = has(WEB);
    if (web.length) add('web', `${web.join(', ')} 의존성${rel}`);
    const srv = has(SERVER);
    if (srv.length) add('api-server', `${srv.join(', ')} 의존성${rel}`);
    const bot = has(BOT);
    if (bot.length) add('batch-bot', `${bot.join(', ')} 의존성${rel}`);
    if (pkg.bin) add('cli', `package.json bin${rel}`);
    else if ((pkg.main || pkg.exports) && !web.length && !srv.length && !('electron' in deps)) add('library', `package.json main/exports${rel}`);
  }

  // Tauri / Flutter / .NET / Android / Apple
  if (existsSync(join(dir, 'src-tauri', 'tauri.conf.json'))) add('desktop', 'src-tauri/tauri.conf.json');
  if (existsSync(join(dir, 'pubspec.yaml'))) {
    const mobile = ['android', 'ios'].filter((n) => existsSync(join(dir, n)));
    const desk = ['windows', 'macos', 'linux'].filter((n) => existsSync(join(dir, n)));
    if (mobile.length || !desk.length) add('mobile', `Flutter(pubspec.yaml) 모바일 폴더: ${mobile.join(', ') || '없음'}`);
    if (desk.length) add('desktop', `Flutter 데스크톱 폴더: ${desk.join(', ')}`);
    if (existsSync(join(dir, 'web'))) add('web', 'Flutter web 폴더');
    for (const [n, label] of [['android', 'Android'], ['ios', 'iOS'], ['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux']]) if (existsSync(join(dir, n))) platforms.add(label);
  }
  const top = (() => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  })();
  for (const n of top.filter((x) => x.endsWith('.csproj'))) {
    const t = readText(join(dir, n));
    if (/UseWPF|UseWindowsForms|-windows/.test(t)) {
      add('desktop', `${n}: WPF/WinForms/windows 대상`);
      platforms.add('Windows');
    } else if (/Microsoft\.NET\.Sdk\.Web/.test(t)) add('api-server', `${n}: ASP.NET`);
    else if (/<OutputType>\s*Exe/.test(t)) add('cli', `${n}: 콘솔 앱`);
  }
  if (top.some((x) => x.endsWith('.xcodeproj'))) {
    add('mobile', 'Xcode 프로젝트 (iOS 또는 macOS — 확인 필요)');
    platforms.add('Apple(iOS/macOS)');
  }
  if (existsSync(join(dir, 'app', 'src', 'main', 'AndroidManifest.xml')) || existsSync(join(dir, 'AndroidManifest.xml'))) {
    add('mobile', 'AndroidManifest.xml');
    platforms.add('Android');
  }

  // Python / Go / Rust
  const py = `${readText(join(dir, 'requirements.txt'))}\n${readText(join(dir, 'pyproject.toml'))}`.toLowerCase();
  if (py.trim()) {
    if (/django/.test(py)) add(existsSync(join(dir, 'templates')) ? 'web' : 'api-server', 'django');
    else if (/fastapi|flask/.test(py)) add('api-server', 'fastapi/flask');
    if (/discord\.py|celery|apscheduler|python-telegram-bot/.test(py)) add('batch-bot', 'discord.py/celery/apscheduler');
    if (/\[project\.scripts\]|console_scripts/.test(py)) add('cli', 'python 콘솔 스크립트');
    if (/pyqt|pyside|tkinter|wxpython/.test(py)) add('desktop', 'PyQt/PySide/wx');
  }
  const gomod = readText(join(dir, 'go.mod'));
  if (gomod) add(/gin-gonic|labstack\/echo|gofiber|go-chi/.test(gomod) ? 'api-server' : /cobra|urfave\/cli/.test(gomod) ? 'cli' : 'library', 'go.mod');
  const cargo = readText(join(dir, 'Cargo.toml'));
  if (cargo) add(/axum|actix-web|rocket/.test(cargo) ? 'api-server' : existsSync(join(dir, 'src', 'main.rs')) ? 'cli' : 'library', 'Cargo.toml');

  // 대상 환경 힌트
  if (found.has('web') || found.has('api-server')) {
    platforms.add('브라우저/서버(사용자 OS 무관)');
    if (['wrangler.toml', 'wrangler.jsonc', 'wrangler.json'].some((f) => existsSync(join(dir, f)))) platforms.add('배포: Cloudflare');
    if (existsSync(join(dir, 'vercel.json'))) platforms.add('배포: Vercel');
  }
  if (existsSync(join(dir, 'Dockerfile'))) platforms.add('배포: Docker(Linux 컨테이너)');
  if (top.some((x) => /\.(ps1|bat|cmd)$/i.test(x))) platforms.add('Windows 스크립트 있음');
  if (top.some((x) => /\.sh$/i.test(x))) platforms.add('Unix 셸 스크립트 있음');

  const types = [...found.entries()]
    .map(([type, evidence]) => ({ type, confidence: evidence.length >= 2 ? 'high' : 'medium', evidence }))
    .sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
  // 웹 프레임워크(next 등)는 API 라우트를 포함하므로 web 이 있으면 api-server 는 부가 정보로 낮춘다
  const hasWeb = types.some((t) => t.type === 'web');
  for (const t of types) if (hasWeb && t.type === 'api-server') t.confidence = 'low';
  return { types: types.length ? types : [{ type: 'unknown', confidence: 'low', evidence: ['앱 유형을 알려 주는 파일을 찾지 못함'] }], platforms: [...platforms] };
}
