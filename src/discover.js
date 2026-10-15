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

export function discover(dir) {
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
  if (has('pyproject.toml') || has('requirements.txt')) stack.push('python');
  if (has('go.mod')) stack.push('go');
  if (has('Cargo.toml')) stack.push('rust');
  if (has('supabase')) frameworks.push('supabase');
  if (has('wrangler.toml') || has('wrangler.jsonc') || has('wrangler.json')) frameworks.push('cloudflare');

  const dirty = git(dir, 'status', '--short');
  const behind = git(dir, 'rev-list', '--count', 'HEAD..@{u}');

  return {
    target: dir,
    stack,
    frameworks,
    packageManager,
    // 지원 수준은 어댑터가 실제로 돌아야 올라간다. 탐지만 되는 지금은 솔직히 Detection Only.
    supportLevel: stack.length ? 'Detection Only' : 'Unsupported',
    ci: has('.github/workflows'),
    docker: has('Dockerfile'),
    tests: ['test', 'tests', '__tests__', 'e2e'].filter(has),
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
