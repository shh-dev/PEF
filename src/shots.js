// 시각적 검증 (`pef shots`, `pef shots-diff`): 디자인시스템 정리 5단계.
// 같은 사이트의 화면을 데스크톱·모바일 크기로 캡처해 두고(변경 전 before), 고친 뒤 다시 캡처(after)해서 어디가 바뀌었는지 픽셀로 비교한다.
// 애니메이션·커서 깜박임은 끄고 글꼴 로딩을 기다려 흔들림을 줄인다. 사용자가 준 주소의 같은 사이트 안에서 이동만 한다.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { kst } from './time.js';
import { discoverRoutes, loadChromium } from './touch.js';

export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];
const SAFE = /^https?:\/\/[\w.:@/?=&%#~!,+-]+$/;
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
export const slug = (route) =>
  route
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'home';

/** 화면 캡처 → outDir/label/<경로>__<기기>.png + manifest.json */
export async function captureShots(url, { routes, label, outDir, max = 12, viewports = VIEWPORTS } = {}) {
  if (!SAFE.test(url)) throw new Error('http(s) 주소만 쓸 수 있고 따옴표·공백·셸 문자는 안 됩니다');
  if (!label || !/^[\w.-]+$/.test(label)) throw new Error('--label 이 필요합니다 (영문·숫자·-·_·. 만, 예: before, after-1)');
  const chromium = loadChromium();
  if (!chromium) throw new Error('playwright-core 가 없습니다. npm i -g playwright-core (Chrome 이 설치돼 있어야 합니다)');
  const dir = join(outDir, label);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const files = [];
  const notes = [];
  try {
    const origin = new URL(url).origin;
    let list = routes?.length ? routes : null;
    if (!list) {
      const probe = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      list = await discoverRoutes(await probe.newPage(), url, max);
      await probe.close();
    }
    for (const vp of viewports) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile });
      for (const route of list) {
        const page = await ctx.newPage();
        try {
          await page.goto(origin + route, { waitUntil: 'load', timeout: 30000 });
          await page.addStyleTag({ content: FREEZE });
          await page.evaluate(() => document.fonts?.ready);
          await page.waitForTimeout(500);
          const file = `${slug(route)}__${vp.name}.png`;
          await page.screenshot({ path: join(dir, file), fullPage: true });
          files.push({ file, route, viewport: vp.name });
        } catch (e) {
          notes.push(`${vp.name} ${route}: ${String(e.message).split('\n')[0]}`);
        } finally {
          await page.close();
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ url, label, capturedAt: kst(), viewports: viewports.map((v) => `${v.name} ${v.width}×${v.height}`), files, notes }, null, 2));
  return { dir, files, notes };
}

/** 브라우저 안에서 두 PNG 를 픽셀 비교 (캔버스 사용 — 의존성 0) */
async function compareInBrowser(page, a, b, tol) {
  return page.evaluate(
    async ({ a, b, tol }) => {
      const load = (src) =>
        new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => rej(new Error('이미지를 읽지 못함'));
          i.src = src;
        });
      const [ia, ib] = await Promise.all([load(`data:image/png;base64,${a}`), load(`data:image/png;base64,${b}`)]);
      const sizeChanged = ia.width !== ib.width || ia.height !== ib.height;
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const draw = (img) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = '#fff';
        x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0);
        return { c, x, d: x.getImageData(0, 0, w, h) };
      };
      const A = draw(ia);
      const B = draw(ib);
      const out = B.x.createImageData(w, h);
      let diff = 0;
      for (let i = 0; i < A.d.data.length; i += 4) {
        const d = Math.max(Math.abs(A.d.data[i] - B.d.data[i]), Math.abs(A.d.data[i + 1] - B.d.data[i + 1]), Math.abs(A.d.data[i + 2] - B.d.data[i + 2]));
        if (d > tol) {
          diff++;
          out.data[i] = 255;
          out.data[i + 1] = 0;
          out.data[i + 2] = 60;
          out.data[i + 3] = 255;
        } else {
          const g = (B.d.data[i] + B.d.data[i + 1] + B.d.data[i + 2]) / 3;
          out.data[i] = out.data[i + 1] = out.data[i + 2] = 255 - (255 - g) * 0.25;
          out.data[i + 3] = 255;
        }
      }
      B.x.putImageData(out, 0, 0);
      return { sizeChanged, before: [ia.width, ia.height], after: [ib.width, ib.height], diff, total: w * h, png: diff ? B.c.toDataURL('image/png').split(',')[1] : null };
    },
    { a, b, tol },
  );
}

/** before/after 두 폴더의 같은 이름 PNG 를 비교. 바뀐 화면은 diff 폴더에 빨간 표시 이미지를 저장 */
export async function diffShots(beforeDir, afterDir, { outDir, tol = 24, minPercent = 0.05 } = {}) {
  const chromium = loadChromium();
  if (!chromium) throw new Error('playwright-core 가 없습니다. npm i -g playwright-core (Chrome 이 설치돼 있어야 합니다)');
  const list = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.png')) : []);
  const before = list(beforeDir);
  const after = new Set(list(afterDir));
  if (!before.length) throw new Error(`${beforeDir} 에 캡처가 없습니다 (pef shots 를 먼저)`);
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const rows = [];
  try {
    const page = await browser.newPage();
    for (const f of before) {
      if (!after.has(f)) {
        rows.push({ file: f, status: 'only-before' });
        continue;
      }
      const a = readFileSync(join(beforeDir, f));
      const b = readFileSync(join(afterDir, f));
      if (a.equals(b)) {
        rows.push({ file: f, status: 'same', percent: 0 });
        continue;
      }
      try {
        const r = await compareInBrowser(page, a.toString('base64'), b.toString('base64'), tol);
        const percent = Math.round((r.diff / r.total) * 10000) / 100;
        const status = r.sizeChanged ? 'size' : percent > minPercent ? 'changed' : 'same';
        if (r.png && status !== 'same') writeFileSync(join(outDir, f.replace('.png', '__diff.png')), Buffer.from(r.png, 'base64'));
        rows.push({ file: f, status, percent, diffPixels: r.diff, ...(r.sizeChanged ? { before: r.before, after: r.after } : {}) });
      } catch (e) {
        rows.push({ file: f, status: 'changed', percent: null, note: `픽셀 비교 못 함(${String(e.message).split('\n')[0]}) — 파일이 다름` });
      }
    }
  } finally {
    await browser.close();
  }
  for (const f of after) if (!before.includes(f)) rows.push({ file: f, status: 'only-after' });
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const summary = { comparedAt: kst(), beforeDir, afterDir, tolerance: tol, minPercent, counts, rows };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

const LABEL = { same: '같음', changed: '바뀜', size: '크기 바뀜(화면 길이·폭)', 'only-before': '사라짐', 'only-after': '새로 생김' };
export function renderDiffMd(s) {
  const L = [
    `# 변경 전후 비교 (${s.comparedAt})`,
    '',
    `- 전: ${s.beforeDir}`,
    `- 후: ${s.afterDir}`,
    `- 기준: 채널 차이 ${s.tolerance} 초과 픽셀이 화면의 ${s.minPercent}% 넘으면 "바뀜"`,
    `- 결과: ${Object.entries(s.counts)
      .map(([k, v]) => `${LABEL[k]} ${v}`)
      .join(' · ')}`,
    '',
    '| 화면 | 결과 | 바뀐 면적 |',
    '|---|---|---|',
  ];
  for (const r of s.rows)
    L.push(
      `| ${r.file} | ${LABEL[r.status]}${r.status === 'size' ? ` (${r.before.join('×')} → ${r.after.join('×')})` : ''} | ${r.percent === undefined ? '-' : r.percent === null ? '미측정' : `${r.percent}%`} |`,
    );
  return `${L.join('\n')}\n`;
}
