// 휴대폰 손가락 점검 (`pef touch <주소>`): 아이폰·갤럭시 크기로 화면과 팝업을 열어
// ① 손가락으로 끝까지 내려가는지 ② 버튼이 화면 밖으로 잘리지 않는지 ③ 키보드가 올라와도 입력칸·버튼이 보이는지 확인한다.
// 실제 기기가 아니라 Chrome 의 휴대폰 에뮬레이션이다(터치 제스처·화면 크기·키보드 높이 흉내). iOS Safari 의 키보드 동작은 다를 수 있다.
// 사용자가 준 주소의 같은 사이트 안에서 이동만 한다. 폼 제출·삭제·결제 같은 버튼은 누르지 않는다.

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { finding } from './adapters.js';
import { kst } from './time.js';

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
export const DEVICES = [
  { name: 'iPhone 15', width: 390, height: 844, dpr: 3, ua: IOS_UA, keyboard: 336 },
  { name: 'Galaxy S23', width: 360, height: 780, dpr: 3, ua: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', keyboard: 300 },
  { name: 'iPhone SE', width: 375, height: 667, dpr: 2, ua: IOS_UA, keyboard: 291 },
];
export const TOUCH_ITEMS = ['R-02', 'R-05', 'R-06', 'TC-01', 'TC-02', 'TC-03'];

const DANGER = /(삭제|결제|구매|탈퇴|제출|전송|로그아웃|가입|신청 ?완료|delete|pay|buy|purchase|submit|remove|logout|sign ?out|send)/i;
const SKIP_LINK = /(logout|signout|sign-out|\/api\/|\.(pdf|zip|png|jpe?g|gif|webp|svg|mp4|mov|csv|xlsx?)$)/i;

// ── 브라우저 안에서 도는 측정 함수들 (문자열이 아니라 함수로 넘겨서 직렬화) ───────────────────

/** 화면 전체: 가로 넘침, 잘린 버튼, 작은 터치 대상, 스크롤 가능 영역 */
function measurePage(dev) {
  // 콘텐츠가 넓으면 모바일 브라우저는 화면을 줄여 맞추므로 innerWidth 가 아니라 기기 폭으로 비교한다
  const vw = dev.width;
  const vh = dev.height;
  const se = document.scrollingElement;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const inXScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const label = (el) => (el.innerText || el.getAttribute('aria-label') || el.value || el.name || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
  const clipped = [];
  const small = [];
  for (const el of document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],summary')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !inXScroller(el)) clipped.push({ label: label(el), tag: el.tagName, left: Math.round(r.left), right: Math.round(r.right) });
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    if (!inline && (r.width < 24 || r.height < 24) && el.type !== 'checkbox' && el.type !== 'radio') small.push({ label: label(el), w: Math.round(r.width), h: Math.round(r.height) });
  }
  // 문서가 아니라 안쪽 영역이 스크롤되는 앱 구조: 화면 대부분을 덮는 스크롤 영역을 찾아 표시해 둔다
  let scroller = null;
  let best = 0;
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
      const r = el.getBoundingClientRect();
      const area = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (area > best && area > vw * vh * 0.4) {
        best = area;
        scroller = el;
      }
    }
  }
  for (const e of document.querySelectorAll('[data-pef-scroller]')) e.removeAttribute('data-pef-scroller');
  if (scroller) scroller.setAttribute('data-pef-scroller', '1');
  return {
    vw,
    vh,
    innerW: innerWidth,
    scrollW: Math.max(se.scrollWidth, document.body.scrollWidth),
    docMax: Math.max(0, se.scrollHeight - vh),
    hasScroller: !!scroller,
    scrollerMax: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    hasViewportMeta: !!document.querySelector('meta[name=viewport]'),
    clipped: clipped.slice(0, 8),
    clippedCount: clipped.length,
    small: small.slice(0, 8),
    smallCount: small.length,
  };
}

/** 스크롤 위치 읽기(문서 또는 표시된 스크롤 영역) */
function readScroll() {
  const sc = document.querySelector('[data-pef-scroller]');
  return sc
    ? {
        y: sc.scrollTop,
        max: sc.scrollHeight - sc.clientHeight,
        cx: Math.round(sc.getBoundingClientRect().left + sc.clientWidth / 2),
        cy: Math.round(sc.getBoundingClientRect().top + Math.min(sc.clientHeight, innerHeight) * 0.7),
      }
    : { y: scrollY, max: document.scrollingElement.scrollHeight - innerHeight, cx: Math.round(innerWidth / 2), cy: Math.round(innerHeight * 0.7) };
}

/** 키보드가 올라온 크기에서 포커스한 입력칸과 그 폼의 버튼이 보이는지 */
function measureFocus({ index, kb }) {
  const fields = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=file]),textarea')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.disabled && !e.readOnly;
  });
  const el = fields[index];
  if (!el) return null;
  el.focus();
  el.scrollIntoView({ block: 'center' }); // 브라우저가 키보드 위로 올려 주는 동작을 흉내
  const r = el.getBoundingClientRect();
  let inputFixed = false;
  for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
    const pos = getComputedStyle(p).position;
    if (pos === 'fixed' || pos === 'sticky') inputFixed = true;
  }
  const form = el.closest('form') || el.closest('[role=dialog],dialog,main') || document.body;
  const btn = [...form.querySelectorAll('button,[type=submit],[role=button]')].filter((b) => b.getBoundingClientRect().width > 0 && getComputedStyle(b).visibility !== 'hidden').pop();
  let button = null;
  if (btn) {
    const br = btn.getBoundingClientRect();
    let fixed = false;
    for (let p = btn; p && p !== document.documentElement; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'sticky') fixed = true;
    }
    button = { label: (btn.innerText || btn.getAttribute('aria-label') || '버튼').trim().slice(0, 20), top: Math.round(br.top), bottom: Math.round(br.bottom), fixed };
  }
  return {
    count: fields.length,
    name: el.name || el.id || el.type || el.tagName,
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    vh: innerHeight,
    zoneTop: innerHeight - kb,
    inputFixed,
    button,
    canScroll: document.scrollingElement.scrollHeight > innerHeight + 2 && getComputedStyle(document.body).overflowY !== 'hidden',
  };
}

/** 눌러도 안전해 보이는 팝업 여는 버튼 후보 (표시 문구 목록) */
function findOpeners(dangerSource) {
  const danger = new RegExp(dangerSource, 'i');
  const out = [];
  for (const el of document.querySelectorAll('[aria-haspopup],[data-modal],[data-dialog],[aria-controls][aria-expanded=false],button,[role=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!text || danger.test(text)) continue;
    if (el.form && el.type === 'submit') continue; // 폼 제출 버튼은 누르지 않는다(폼 밖 버튼은 기본 type 이 submit 이어도 제출이 아님)
    const explicit = el.matches('[aria-haspopup],[data-modal],[data-dialog],[aria-controls][aria-expanded=false]');
    const hint = /(열기|자세히|더보기|메뉴|문의|상담|안내|보기|open|detail|menu|more|info|help)/i.test(text);
    if (explicit || hint) out.push(text);
    if (out.length >= 8) break;
  }
  return [...new Set(out)];
}

/** 떠 있는 팝업(모달·다이얼로그)의 크기·스크롤·닫기 버튼 */
function measureDialog() {
  const vw = innerWidth;
  const vh = innerHeight;
  const d = [...document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open]')].find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  });
  if (!d) return null;
  const r = d.getBoundingClientRect();
  let scrollable = false;
  for (let p = d; p && p !== document.documentElement; p = p.parentElement) {
    const s = getComputedStyle(p);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) scrollable = true;
  }
  for (const c of d.querySelectorAll('*')) {
    const s = getComputedStyle(c);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && c.scrollHeight > c.clientHeight) scrollable = true;
  }
  const close = [...d.querySelectorAll('button,[role=button],a')].find(
    (b) => /(닫기|취소|close|cancel|×|✕|x)/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()) && b.getBoundingClientRect().width > 0,
  );
  let closeInView = null;
  if (close) {
    const cr = close.getBoundingClientRect();
    closeInView = cr.top >= 0 && cr.bottom <= vh && cr.left >= 0 && cr.right <= vw;
  }
  return {
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    left: Math.round(r.left),
    right: Math.round(r.right),
    vw,
    vh,
    tooTall: r.height > vh + 1,
    tooWide: r.width > vw + 1,
    scrollable,
    hasClose: !!close,
    closeInView,
    name: (d.getAttribute('aria-label') || d.innerText || '팝업').trim().replace(/\s+/g, ' ').slice(0, 30),
  };
}

// ── 판정 (순수 함수: 측정값 → 문제 목록. 브라우저 없이 테스트 가능) ─────────────────────────

/** @returns {{ruleId:string, severity:string, title:string, evidence:string}[]} */
export function judgePage(m, scroll, dev) {
  const out = [];
  const where = `${dev.name} ${dev.width}×${dev.height}`;
  if (m.scrollW > m.vw + 1 || m.innerW > m.vw + 1)
    out.push({ ruleId: 'R-02', severity: 'P2', title: '콘텐츠가 화면보다 넓어 옆으로 밀리거나 화면이 줄어듦', evidence: `${where}: 콘텐츠 너비 ${Math.max(m.scrollW, m.innerW)}px > 화면 ${m.vw}px` });
  if (!m.hasViewportMeta) out.push({ ruleId: 'R-02', severity: 'P2', title: 'viewport 메타가 없어 휴대폰에서 축소 표시됨', evidence: `${where}: <meta name="viewport"> 없음` });
  const canMove = m.docMax > 0 || m.scrollerMax > 0;
  if (canMove && scroll && !scroll.reached)
    out.push({
      ruleId: 'TC-01',
      severity: 'P2',
      title: '손가락으로 밀어도 끝까지 내려가지 않음',
      evidence: `${where}: 내려갈 수 있는 길이 ${scroll.max}px 중 ${scroll.y}px 에서 멈춤 (body overflow-y: ${m.bodyOverflowY}, html: ${m.htmlOverflowY})`,
    });
  if (m.clippedCount)
    out.push({
      ruleId: 'TC-02',
      severity: 'P2',
      title: `버튼·링크 ${m.clippedCount}개가 화면 밖으로 잘림`,
      evidence: `${where}: ${m.clipped.map((c) => `${c.label || c.tag}(${c.left}~${c.right}px)`).join(', ')}`,
    });
  if (m.smallCount)
    out.push({
      ruleId: 'R-06',
      severity: 'P3',
      title: `손가락으로 누르기 작은 대상 ${m.smallCount}개 (24px 미만)`,
      evidence: `${where}: ${m.small.map((s) => `${s.label}(${s.w}×${s.h})`).join(', ')}`,
    });
  return out;
}

export function judgeFocus(f, dev, kb) {
  if (!f) return [];
  const out = [];
  const where = `${dev.name} 키보드 ${kb}px 올린 상태`;
  if (f.top < 0 || f.bottom > f.zoneTop)
    out.push({
      ruleId: 'TC-03',
      severity: 'P2',
      title: `입력칸(${f.name})이 키보드에 가려짐${f.inputFixed ? ' (화면에 고정된 영역)' : ''}`,
      evidence: `${where}: 입력칸 ${f.top}~${f.bottom}px, 키보드 시작 ${f.zoneTop}px (화면 높이 ${f.vh}px)`,
    });
  if (f.button) {
    const behind = f.button.bottom > f.zoneTop;
    if (behind && f.button.fixed)
      out.push({
        ruleId: 'TC-03',
        severity: 'P2',
        title: `고정된 버튼('${f.button.label}')이 키보드 뒤로 숨음`,
        evidence: `${where}: 버튼 ${f.button.top}~${f.button.bottom}px, 키보드 시작 ${f.zoneTop}px, 고정 위치`,
      });
    else if (behind && !f.canScroll)
      out.push({
        ruleId: 'TC-03',
        severity: 'P2',
        title: `버튼('${f.button.label}')이 키보드 아래로 밀리고 스크롤도 안 됨`,
        evidence: `${where}: 버튼 ${f.button.top}~${f.button.bottom}px > 키보드 시작 ${f.zoneTop}px, 스크롤 불가`,
      });
  }
  return out;
}

export function judgeDialog(d, dev, opener) {
  if (!d) return [];
  const out = [];
  const where = `${dev.name}, '${opener}' 눌러 연 팝업`;
  if (d.tooWide || d.left < -1 || d.right > d.vw + 1) out.push({ ruleId: 'R-05', severity: 'P2', title: '팝업이 화면 폭을 벗어남', evidence: `${where}: 팝업 ${d.left}~${d.right}px, 화면 ${d.vw}px` });
  if (d.tooTall && !d.scrollable)
    out.push({ ruleId: 'R-05', severity: 'P2', title: '팝업이 화면보다 길고 안쪽 스크롤이 안 됨', evidence: `${where}: 팝업 ${d.top}~${d.bottom}px, 화면 높이 ${d.vh}px, 스크롤 영역 없음` });
  if (d.hasClose && d.closeInView === false) out.push({ ruleId: 'R-05', severity: 'P2', title: '팝업 닫기 버튼이 화면 밖', evidence: `${where}: 닫기 버튼이 보이는 범위(${d.vw}×${d.vh}) 밖` });
  return out;
}

// ── 실행 ──────────────────────────────────────────────────────────────────────

function loadChromium() {
  const tryReq = (base) => {
    try {
      return createRequire(join(base, 'x.js'))('playwright-core').chromium;
    } catch {
      return null;
    }
  };
  const here = tryReq(process.cwd());
  if (here) return here;
  try {
    return tryReq(join(execSync('npm root -g', { encoding: 'utf8', timeout: 15000 }).trim(), 'x'));
  } catch {
    return null;
  }
}

const SAFE = /^https?:\/\/[\w.:@/?=&%#~!,+-]+$/;
const fixRoute = (r) => r.replace(/^[A-Za-z]:\/Program Files\/Git/, '').replace(/^(?!\/)/, '/');

/** 손가락 한 번 밀기: 터치 시작 → 조금씩 이동 → 뗌 (실제 터치 이벤트를 브라우저에 보낸다) */
async function swipe(cdp, page, x, y0, y1) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function swipeToEnd(page, cdp, dev) {
  let last = -1;
  let s = await page.evaluate(readScroll);
  for (let i = 0; i < 40; i++) {
    if (s.y >= s.max - 2) return { reached: true, y: s.y, max: s.max };
    await swipe(cdp, page, s.cx, s.cy, Math.max(20, s.cy - Math.round(dev.height * 0.6)));
    await page.waitForTimeout(300);
    s = await page.evaluate(readScroll);
    if (s.y === last) return { reached: s.y >= s.max - 2, y: s.y, max: s.max };
    last = s.y;
  }
  return { reached: s.y >= s.max - 2, y: s.y, max: s.max };
}

/** 같은 사이트 안의 화면 주소 모으기 (너비 우선, 최대 max 개) */
async function discoverRoutes(page, base, max) {
  const origin = new URL(base).origin;
  const seen = new Set([new URL(base).pathname || '/']);
  const queue = [...seen];
  for (let i = 0; i < queue.length && seen.size < max; i++) {
    await page.goto(origin + queue[i], { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(400);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
    for (const h of hrefs) {
      let u;
      try {
        u = new URL(h);
      } catch {
        continue;
      }
      if (u.origin !== origin || SKIP_LINK.test(u.pathname)) continue;
      if (!seen.has(u.pathname) && seen.size < max) {
        seen.add(u.pathname);
        queue.push(u.pathname);
      }
    }
  }
  return [...seen];
}

/** 점검 실행 → result 형식 객체 */
export async function auditTouch(url, { routes, max = 12, outDir, devices = DEVICES } = {}, now = new Date()) {
  if (!SAFE.test(url)) throw new Error('http(s) 주소만 쓸 수 있고 따옴표·공백·셸 문자는 안 됩니다');
  const chromium = loadChromium();
  if (!chromium) throw new Error('playwright-core 가 없습니다. npm i -g playwright-core (Chrome 이 설치돼 있어야 합니다)');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const raw = []; // {route, device, ruleId, severity, title, evidence, shot?}
  const stats = { pages: 0, popups: 0, fields: 0 };
  const notes = [];
  try {
    const origin = new URL(url).origin;
    let list = routes?.map(fixRoute);
    if (!list?.length) {
      const probe = await browser.newContext({ viewport: { width: 390, height: 844 } });
      list = await discoverRoutes(await probe.newPage(), url, max);
      await probe.close();
    }
    if (outDir) mkdirSync(join(outDir, 'touch-shots'), { recursive: true });
    for (const dev of devices) {
      const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dpr, userAgent: dev.ua, isMobile: true, hasTouch: true });
      for (const route of list) {
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        const target = origin + route;
        const add = (items, extra = '') => {
          for (const i of items) raw.push({ route, device: dev.name, ...i, evidence: i.evidence + extra });
        };
        try {
          await page.goto(target, { waitUntil: 'load', timeout: 30000 });
          await page.waitForTimeout(600);
          stats.pages++;
          const m = await page.evaluate(measurePage, { width: dev.width, height: dev.height });
          const sc = m.docMax > 0 || m.scrollerMax > 0 ? await swipeToEnd(page, cdp, dev) : null;
          const problems = judgePage(m, sc, dev);
          if (problems.length && outDir) {
            const shot = join(outDir, 'touch-shots', `${route.replace(/[^\w-]+/g, '_') || 'home'}_${dev.name.replace(/\s+/g, '')}.png`);
            await page.screenshot({ path: shot, fullPage: false }).catch(() => null);
            add(problems, ` [화면 캡처: ${shot}]`);
          } else add(problems);
          // 키보드: 입력칸마다 키보드 높이만큼 화면을 줄이고 포커스
          await page.evaluate(() => scrollTo(0, 0));
          for (let i = 0; i < 4; i++) {
            const f = await page.evaluate(measureFocus, { index: i, kb: dev.keyboard }).catch(() => null);
            if (!f) break;
            stats.fields++;
            add(judgeFocus(f, dev, dev.keyboard));
            if (i + 1 >= f.count) break;
          }
          // 팝업: 안전해 보이는 여는 버튼을 눌러 보고 매번 새로 불러와 초기화
          const openers = await page.evaluate(findOpeners, DANGER.source);
          for (const text of openers) {
            await page.goto(target, { waitUntil: 'load', timeout: 30000 });
            await page.waitForTimeout(400);
            const clicked = await page
              .getByText(text, { exact: true })
              .first()
              .click({ timeout: 2500 })
              .then(
                () => true,
                () => false,
              );
            if (!clicked) continue;
            await page.waitForTimeout(400);
            const d = await page.evaluate(measureDialog);
            if (d) {
              stats.popups++;
              add(judgeDialog(d, dev, text));
            }
          }
        } catch (e) {
          notes.push(`${dev.name} ${route}: ${String(e.message).split('\n')[0]}`);
        } finally {
          await page.close();
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  // 같은 문제는 화면·기기를 묶어서 한 건으로 낸다
  const groups = new Map();
  for (const r of raw) {
    const key = `${r.ruleId}|${r.route}|${r.title.replace(/\d+/g, '#')}`;
    const g = groups.get(key) ?? { ...r, devices: new Set(), evid: [] };
    g.devices.add(r.device);
    g.evid.push(r.evidence);
    groups.set(key, g);
  }
  const findings = [...groups.values()].map((g, i) => ({
    id: `T-${String(i + 1).padStart(3, '0')}`,
    firstDetected: now.toISOString(),
    ...finding({
      category: '4.6 반응형',
      ruleId: g.ruleId,
      title: g.title,
      severity: g.severity,
      verification: 'Suspected',
      evidence: `${g.evid.slice(0, 3).join(' / ')}${g.evid.length > 3 ? ` 외 ${g.evid.length - 3}건` : ''}; Chrome 에뮬레이션(실제 기기와 다를 수 있음); 기기 ${[...g.devices].join(', ')}`,
      filePath: g.route,
      source: 'pef-touch',
    }),
  }));
  const coverage = {};
  const coverageNotes = {};
  for (const id of TOUCH_ITEMS) {
    coverage[id] = stats.pages ? (findings.some((f) => f.ruleId === id) ? 'Suspected' : 'Clean') : 'NotTested';
    coverageNotes[id] =
      `Chrome 휴대폰 에뮬레이션 ${devices.map((d) => d.name).join('·')}, 화면 ${stats.pages}회·입력칸 ${stats.fields}개·팝업 ${stats.popups}개 확인. 로그인 필요 화면과 눌러 보지 않은 팝업은 확인 못 함`;
  }
  if (notes.length) coverageNotes['TC-01'] += `; 열지 못한 화면: ${notes.slice(0, 3).join(' | ')}`;
  return {
    meta: { target: url, commit: '실행 중인 사이트', profile: '자동 점검 — 휴대폰 손가락 점검', auditedAt: kst(now), scope: ['휴대폰 손가락 점검'], toolsUsed: ['pef-touch'] },
    findings,
    coverage,
    coverageNotes,
  };
}
