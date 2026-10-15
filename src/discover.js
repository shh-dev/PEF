// 대상 프로젝트 읽기 전용 탐색. .env* 는 파일 이름만 보고 내용은 열지 않는다 (PLAYBOOK §2-1).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const git = (dir, ...args) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

const FRAMEWORKS = ['next', 'react', 'vue', 'svelte', 'nuxt', 'express', 'fastify', 'hono', '@nestjs/core', 'electron', '@supabase/supabase-js', 'vite'];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'venv', '__pycache__']);

/** 한 폴더의 스택만 본다 (하위 폴더는 안 봄). */
function detect(dir) {
  const has = (f) => existsSync(join(dir, f));
  const stack = [];
  const frameworks = [];
  let packageManager = null;

  if (has('package.json')) {
    stack.push('node');
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      frameworks.push(...FRAMEWORKS.filter((f) => f in deps));
      if (pkg.workspaces) frameworks.push('monorepo');
    } catch {
      // 깨진 package.json 은 스택 정보만 남긴다
    }
    packageManager = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('package-lock.json') ? 'npm' : has('bun.lockb') ? 'bun' : null;
  }
  if (has('tsconfig.json')) stack.push('typescript');
  // 패키지 파일 없이 .py 만 있는 앱(의존성은 Dockerfile 의 pip 줄에만 있는 경우)도 파이썬으로 본다.
  if (has('pyproject.toml') || has('requirements.txt') || (!stack.length && readdirSync(dir).some((n) => n.endsWith('.py')))) stack.push('python');
  if (has('go.mod')) stack.push('go');
  if (has('Cargo.toml')) stack.push('rust');
  if (has('supabase')) frameworks.push('supabase');
  if (has('wrangler.toml') || has('wrangler.jsonc') || has('wrangler.json')) frameworks.push('cloudflare');
  return { stack, frameworks, packageManager, docker: has('Dockerfile'), tests: ['test', 'tests', '__tests__', 'e2e'].filter(has) };
}

/** 루트에 패키지 파일이 없는 "앱 여러 개 모음" 저장소용: 하위 폴더(깊이 3까지)에서 앱을 찾는다. 앱을 찾으면 그 안은 더 내려가지 않는다. */
function findApps(root, rel = '', depth = 0) {
  if (depth >= 3) return [];
  let names;
  try {
    names = readdirSync(join(root, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  const apps = [];
  for (const d of names) {
    if (!d.isDirectory() || d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue;
    const path = rel ? `${rel}/${d.name}` : d.name;
    const info = detect(join(root, path));
    if (info.stack.length) apps.push({ path, ...info });
    else apps.push(...findApps(root, path, depth + 1));
  }
  return apps;
}

export function discover(dir) {
  const { stack, frameworks, packageManager, docker, tests } = detect(dir);
  // 루트에서 스택을 못 찾았거나 워크스페이스면 하위 앱을 찾는다. 단일 앱이면 기존과 같다.
  const apps = !stack.length || frameworks.includes('monorepo') ? findApps(dir) : [];
  const allStack = [...new Set([...stack, ...apps.flatMap((a) => a.stack)])];

  const dirty = git(dir, 'status', '--short');
  const behind = git(dir, 'rev-list', '--count', 'HEAD..@{u}');

  return {
    target: dir,
    stack: allStack,
    frameworks: [...new Set([...frameworks, ...apps.flatMap((a) => a.frameworks)])],
    packageManager,
    // 지원 수준은 어댑터가 실제로 돌아야 올라간다. 탐지만 되는 지금은 솔직히 Detection Only.
    supportLevel: allStack.length ? 'Detection Only' : 'Unsupported',
    ci: existsSync(join(dir, '.github/workflows')),
    docker,
    tests,
    apps,
    envFiles: readdirSync(dir).filter((n) => n.startsWith('.env')),
    git:
      git(dir, 'rev-parse', '--git-dir') === null
        ? null
        : {
            commit: git(dir, 'rev-parse', '--short', 'HEAD'),
            branch: git(dir, 'branch', '--show-current'),
            uncommittedChanges: dirty ? dirty.split('\n').length : 0,
            behindRemote: behind === null ? null : Number(behind),
          },
  };
}
