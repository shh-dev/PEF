// 디자인 값 재고 (`pef design <앱 폴더>`): 디자인시스템 정리 1단계(감사)와 2단계(토큰 고정)의 출발점.
// 소스에서 직접 쓰인 색·글자 크기·여백·모서리 값을 종류별로 세고, 가까운 표준값을 제안한다. 대상 폴더는 읽기만 한다.
import { scanDesign } from './design.js';

// 제안용 표준 눈금(초기 추정치 — 프로젝트에 맞게 사용자가 조정)
export const SCALES = {
  fonts: [11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48],
  spaces: [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96],
  radii: [0, 2, 4, 6, 8, 12, 16, 24, 9999],
};

const num = (v) => Number.parseFloat(v);
const nearest = (n, scale) => scale.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), scale[0]);

function section(map, scale, k) {
  const rows = [...map]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, k)
    .map(([value, m]) => {
      const n = num(value);
      const near = Number.isFinite(n) && scale ? nearest(n, scale) : null;
      return { value, count: m.n, file: m.file, suggest: near === null ? null : `${near}px`, onScale: near !== null && near === n };
    });
  return { unique: map.size, uses: [...map.values()].reduce((s, m) => s + m.n, 0), top: rows };
}

/** @returns {object|null} UI 소스가 없으면 null */
export function designInventory(dir, topK = 15) {
  const acc = scanDesign(dir);
  if (!acc) return null;
  const colors = section(acc.colors, null, topK);
  return {
    target: dir,
    files: acc.files,
    colors,
    fonts: section(acc.fonts, SCALES.fonts, topK),
    spaces: section(acc.spaces, SCALES.spaces, topK),
    radii: section(acc.radii, SCALES.radii, topK),
    tokens: { defs: acc.tokenDefs, varUses: acc.varUses, hardColorUses: colors.uses, tokenShare: colors.uses + acc.varUses ? Math.round((acc.varUses / (colors.uses + acc.varUses)) * 100) : 0 },
    icons: acc.icons,
  };
}

const table = (title, sec, unit = '') => {
  const L = [`## ${title} — 고유 ${sec.unique}종, 사용 ${sec.uses}회`, '', `| 값 | 횟수 | 가까운 표준값(제안) | 눈금 안 | 처음 나온 파일 |`, '|---|---|---|---|---|'];
  for (const r of sec.top) L.push(`| ${r.value}${unit} | ${r.count} | ${r.suggest ?? '-'} | ${r.suggest === null ? '-' : r.onScale ? '예' : '아니오'} | ${r.file} |`);
  return L.join('\n');
};

export function renderInventoryMd(inv) {
  const L = [
    '# 디자인 값 재고',
    '',
    `대상: ${inv.target} · UI 소스 ${inv.files}개`,
    '',
    '직접 쓴 값만 센다(토큰 정의 줄은 제외). 눈금은 초기 추정치이며 사용자가 조정한다. 개수가 많다는 것은 정리 후보일 뿐 결함의 증명이 아니다.',
    '',
    `## 토큰 사용`,
    '',
    `- 토큰(CSS 변수) 정의 색: ${inv.tokens.defs}개`,
    `- 토큰 사용 \`var(--…)\`: ${inv.tokens.varUses}회, 직접 쓴 색: ${inv.tokens.hardColorUses}회 → 토큰 비율 ${inv.tokens.tokenShare}%`,
    `- 아이콘 라이브러리: ${inv.icons?.length ? inv.icons.join(', ') : '없음/단일'}`,
    '',
    table('색', inv.colors),
    '',
    table('글자 크기', inv.fonts),
    '',
    table('여백(margin·padding·gap)', inv.spaces),
    '',
    table('모서리 둥글기(border-radius)', inv.radii),
  ];
  return `${L.join('\n')}\n`;
}
