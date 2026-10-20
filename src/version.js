// PEF 자신의 버전과 "점검 기준 지문". 기록에 남겨 두면 기준이 바뀐 뒤의 점수 변화를 앱 탓으로 오해하지 않는다.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadChecklists } from './checklist.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export const pefVersion = () => JSON.parse(readFileSync(`${root}package.json`, 'utf8')).version;

/** 체크리스트 항목 ID 전체의 짧은 지문. 항목이 늘거나 줄면 바뀐다. */
export function rulesHash() {
  const ids = [...loadChecklists().values()].flatMap((a) => a.ids).sort().join(',');
  return createHash('sha256').update(ids).digest('hex').slice(0, 8);
}

/** 기록 파일(current/history)의 형식 번호. 형식이 바뀌면 올리고, 더 높은 번호의 기록은 읽지 않는다. 번호가 없는 옛 기록은 0 으로 본다. */
export const FORMAT = 1;
export const checkFormat = (data, file) => {
  if ((data?.schemaVersion ?? 0) > FORMAT) throw new Error(`${file}: 더 새로운 PEF 가 만든 기록입니다(형식 ${data.schemaVersion}, 이 PEF 는 ${FORMAT}). pef update 로 갱신하세요`);
  return data;
};

export const stamp = () => ({ pef: pefVersion(), rules: rulesHash(), format: FORMAT });

/** 이전 기록과 지금의 PEF 기준이 다르면 안내 문장을, 같거나 기록이 없으면 null */
export function changedNote(prev) {
  if (!prev) return null;
  const now = stamp();
  if (!prev.pef) return `PEF 기준 확인: 이전 기록에는 버전이 없습니다. 지금은 ${now.pef}(기준 ${now.rules}) — 점수 변화에 기준 변경이 섞였을 수 있습니다`;
  if (prev.pef === now.pef && prev.rules === now.rules) return null;
  return `PEF 기준이 바뀌었습니다: ${prev.pef}(기준 ${prev.rules}) → ${now.pef}(기준 ${now.rules}) — 이번 점수 변화에는 앱 변화와 기준 변경이 섞여 있습니다`;
}

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', timeout: 60_000 }).trim();

/** PEF 설치 폴더를 원격 최신으로 맞춘다 (fast-forward만, 덮어쓰기 없음). 푸시는 하지 않는다. */
export function update() {
  const before = pefVersion();
  if (git('status', '--porcelain')) return { ok: false, msg: 'PEF 폴더에 커밋 안 된 변경이 있어 갱신하지 않았습니다 (개발 중인 복사본으로 보입니다)' };
  const ahead = Number(git('rev-list', '--count', '@{u}..HEAD'));
  git('fetch', '--quiet');
  const behind = Number(git('rev-list', '--count', 'HEAD..@{u}'));
  if (!behind) return { ok: true, msg: `이미 최신입니다 (${before})${ahead ? ` — 푸시 안 된 로컬 커밋 ${ahead}개` : ''}` };
  git('merge', '--ff-only', '@{u}');
  const after = pefVersion();
  return { ok: true, msg: `갱신했습니다: ${before} → ${after} (새 커밋 ${behind}개). 이어서 쓰던 프로젝트는 pef checkpoint --out .pef --note "PEF 갱신 반영" 으로 새 기준을 적용하세요` };
}
