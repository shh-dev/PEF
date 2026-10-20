// 디자인 값 세기 (V-01~V-06): 외부 도구 없이 소스의 색·글자 크기·여백·모서리·아이콘 라이브러리 종류를 센다.
// 개수가 많다는 것은 "의심"일 뿐 결함의 증명이 아니므로 모두 Suspected 로 낸다. 대상 폴더는 읽기만 한다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '.pef', '.turbo', 'out', 'vendor']);
const EXT = new Set(['.css', '.scss', '.sass', '.less', '.html', '.vue', '.svelte', '.jsx', '.tsx', '.astro']);
const ICONS = {
  lucide: /lucide/,
  'react-icons': /react-icons/,
  heroicons: /heroicons/,
  fontawesome: /fortawesome|font-awesome/,
  'mui-icons': /@mui\/icons/,
  phosphor: /phosphor/,
  tabler: /tabler/,
  feather: /feather-icons|react-feather/,
  radix: /radix-ui\/react-icons/,
};
const MAX_FILES = 3000;
const MAX_BYTES = 512 * 1024;

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= MAX_FILES) break;
    if (e.isDirectory()) {
      if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(join(dir, e.name), out);
    } else if (EXT.has(extname(e.name)) && statSync(join(dir, e.name)).size <= MAX_BYTES) out.push(join(dir, e.name));
  }
  return out;
};

const tally = (map, key, file) => {
  const m = map.get(key) ?? { n: 0, file };
  m.n++;
  map.set(key, m);
};
const top = (map, k = 5) =>
  [...map]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, k)
    .map(([v, m]) => `${v}×${m.n}`)
    .join(', ');
const px = (v, unit) => Math.round(Number(v) * (unit === 'px' ? 1 : 16) * 100) / 100;

/** 소스 문자열 하나를 집계에 더한다 (순수 함수 — 테스트용) */
export function scanText(text, file, acc) {
  for (const line of text.split('\n')) {
    const isToken = /(^|[{;\s])--[\w-]+\s*:/.test(line) || /(tokens?|theme|tailwind\.config)/i.test(file);
    if (/var\(--/.test(line)) acc.varUses += (line.match(/var\(--/g) ?? []).length;
    if (isToken) {
      acc.tokenDefs += (line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) ?? []).length;
      continue;
    }
    for (const m of line.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) tally(acc.colors, m[0].toLowerCase().replace(/\s+/g, ''), file);
    for (const m of line.matchAll(/font-size\s*:\s*(\d*\.?\d+)(px|rem|em)/g)) tally(acc.fonts, `${px(m[1], m[2])}px`, file);
    // 자바스크립트 스타일 객체: fontSize: 14 / padding: '12px' / borderRadius: 8
    for (const m of line.matchAll(/\bfontSize\s*:\s*['"]?(\d*\.?\d+)(px|rem)?/g)) tally(acc.fonts, `${px(m[1], m[2] ?? 'px')}px`, file);
    for (const m of line.matchAll(/\b(?:margin|padding|gap)(?:Top|Bottom|Left|Right|Inline|Block)?\s*:\s*['"]?(\d*\.?\d+)(px|rem)?/g)) tally(acc.spaces, `${px(m[1], m[2] ?? 'px')}px`, file);
    for (const m of line.matchAll(/\bborderRadius\s*:\s*['"]?(\d*\.?\d+)(px|rem)?/g)) tally(acc.radii, `${px(m[1], m[2] ?? 'px')}px`, file);
    // Tailwind: 임의값 text-[13px] p-[7px] rounded-[9px], 글자 크기·둥글기 눈금(text-lg, rounded-xl). 여백 눈금(p-4)은 4px 격자 자체라 세지 않는다.
    for (const m of line.matchAll(/\b(text|p[xytblr]?|m[xytblr]?|gap|rounded)-\[(\d*\.?\d+)(px|rem)\]/g))
      tally(m[1] === 'text' ? acc.fonts : m[1] === 'rounded' ? acc.radii : acc.spaces, `${px(m[2], m[3])}px`, file);
    for (const m of line.matchAll(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/g)) tally(acc.fonts, `tw-${m[1]}`, file);
    for (const m of line.matchAll(/\brounded(?:-[a-z]+)?-(none|sm|md|lg|xl|2xl|3xl|full)\b|\brounded\b(?![-\w])/g)) tally(acc.radii, `tw-${m[1] ?? 'base'}`, file);
    for (const d of line.matchAll(/(?:margin|padding|gap)(?:-[a-z]+)?\s*:\s*([^;}]+)/g)) for (const m of d[1].matchAll(/(\d*\.?\d+)(px|rem)\b/g)) tally(acc.spaces, `${px(m[1], m[2])}px`, file);
    for (const d of line.matchAll(/border-radius\s*:\s*([^;}]+)/g)) for (const m of d[1].matchAll(/(\d*\.?\d+)(px|rem)\b/g)) tally(acc.radii, `${px(m[1], m[2])}px`, file);
  }
}

const newAcc = () => ({ colors: new Map(), fonts: new Map(), spaces: new Map(), radii: new Map(), varUses: 0, tokenDefs: 0, files: 0 });

/** UI 소스 파일이 하나라도 있으면 집계, 없으면 null (해당 없음 판정용) */
export function scanDesign(dir) {
  if (!existsSync(dir)) return null;
  const files = walk(dir);
  if (!files.length) return null;
  const acc = newAcc();
  acc.files = files.length;
  for (const f of files) scanText(readFileSync(f, 'utf8'), f.slice(dir.length + 1).replaceAll('\\', '/'), acc);
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    acc.icons = Object.entries(ICONS)
      .filter(([, re]) => deps.some((d) => re.test(d)))
      .map(([k]) => k);
  } catch {
    acc.icons = [];
  }
  return acc;
}

const mk = (ruleId, category, title, evidence, hint) => ({
  ruleId,
  category,
  title,
  evidence,
  severity: ruleId === 'V-06' ? 'P4' : 'P3',
  verification: 'Suspected',
  source: 'pef-design',
  filePath: 'CSS/컴포넌트 전반',
  recommendedFix: hint,
});

/** 집계 → Finding 후보 (기준값은 초기 추정치) */
export function designFindings(acc) {
  const out = [];
  const hard = [...acc.colors.values()].reduce((s, m) => s + m.n, 0);
  if (acc.colors.size > 20)
    out.push(
      mk(
        'V-01',
        '4.3 시각 완성도',
        `색 값이 ${acc.colors.size}종 직접 쓰임`,
        `고유 ${acc.colors.size}종, 상위: ${top(acc.colors)}`,
        '자주 쓰는 색을 토큰(CSS 변수)으로 모으고 나머지는 가까운 토큰으로 합친다',
      ),
    );
  if (acc.fonts.size > 8) out.push(mk('V-02', '4.3 시각 완성도', `글자 크기가 ${acc.fonts.size}종`, `상위: ${top(acc.fonts)}`, '타이포 스케일(예: 12·14·16·20·24·32)로 정리한다'));
  const off = [...acc.spaces.keys()].filter((k) => parseFloat(k) % 4 !== 0);
  if (acc.spaces.size > 12 && off.length / acc.spaces.size > 0.3)
    out.push(mk('V-03', '4.3 시각 완성도', `여백 값 ${acc.spaces.size}종 중 4의 배수 아님 ${off.length}종`, `상위: ${top(acc.spaces)}`, '여백을 4/8 단위 스케일로 맞춘다'));
  if (acc.radii.size > 6) out.push(mk('V-04', '4.3 시각 완성도', `모서리 둥글기가 ${acc.radii.size}종`, `상위: ${top(acc.radii)}`, '작음/보통/큼 3~4단계로 줄인다'));
  if (hard > 20 && acc.varUses < hard / 3)
    out.push(
      mk(
        'V-05',
        '4.3 시각 완성도',
        acc.tokenDefs || acc.varUses ? '토큰이 있지만 직접 쓴 색이 더 많음' : '디자인 토큰 없음',
        `직접 쓴 색 ${hard}회, 토큰 사용(var(--)) ${acc.varUses}회, 토큰 정의 색 ${acc.tokenDefs}개`,
        '색을 토큰으로 정의하고 사용처를 토큰으로 바꾼다',
      ),
    );
  if (acc.icons.length > 1) out.push(mk('V-06', '4.3 시각 완성도', `아이콘 라이브러리 ${acc.icons.length}종 혼용`, acc.icons.join(', '), '한 세트로 통일한다'));
  return out;
}
