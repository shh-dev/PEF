// checklists/NN-*.md 표에서 항목 ID를 읽는다. 파일 번호 N = 영역 4.N.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../checklists/', import.meta.url));

/** @returns {Map<string, {area: string, name: string, ids: string[]}>} 키: '4.13' */
export function loadChecklists() {
  const areas = new Map();
  for (const f of readdirSync(dir).filter((n) => /^\d\d-.*\.md$/.test(n))) {
    const text = readFileSync(dir + f, 'utf8');
    const area = `4.${Number(f.slice(0, 2))}`;
    const name = text.match(/^# 4\.\d+ (.+)$/m)?.[1] ?? f;
    const ids = [...text.matchAll(/^\|\s*([A-Z]+-\d+)\s*\|/gm)].map((m) => m[1]);
    areas.set(area, { area, name, ids });
  }
  return areas;
}

// 유형 전용 항목: DK-* 는 데스크톱, MB-* 는 모바일일 때만 점검 대상이다. 나머지 유형(웹 등)에서는 해당 없음으로 센다.
const ONLY = { DK: 'desktop', MB: 'mobile' };
export const appliesTo = (id, type) => {
  const only = ONLY[id.split('-')[0]];
  return !only || only === type;
};
