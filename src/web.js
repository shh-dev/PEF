// 실행 중인 사이트 점검 (`pef web <url>`): Lighthouse(접근성·성능 측정) + 응답 헤더·쿠키 검사.
// 사용자가 준 주소에만 요청한다. 쿠키는 이름과 속성만 보고 값은 읽지 않는다.
import { available, finding, runTool } from './adapters.js';
import { kst } from './time.js';

const A11Y = [
  [/^(image-alt|input-image-alt|svg-img-alt|button-name|link-name|aria-.*name|role-img-alt)/, 'A-01'],
  [/^(label|form-field|select-name|autocomplete)/, 'A-02'],
  [/^(color-contrast|link-in-text-block)/, 'A-04'],
  [/^(tabindex|focus|accesskey|bypass|skip-link|focusable)/, 'A-05'],
  [/^(aria-|role)/, 'A-07'],
  [/^target-size/, 'A-09'],
];
const a11yRule = (id) => A11Y.find(([re]) => re.test(id))?.[1] ?? 'A-03';
const PERF = {
  'uses-optimized-images': 'P-03',
  'uses-responsive-images': 'P-03',
  'offscreen-images': 'P-03',
  'modern-image-formats': 'P-03',
  'unused-javascript': 'P-01',
  'total-byte-weight': 'P-01',
  'uses-long-cache-ttl': 'P-07',
};
export const WEB_ITEMS = ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-07', 'A-09', 'P-01', 'P-03', 'P-07', 'P-09', 'SE-04', 'SE-12', 'SE-17'];

/** lighthouse --output json → Finding (순수 함수) */
export function parseLighthouse(json) {
  const lh = JSON.parse(json);
  const env = `lighthouse ${lh.lighthouseVersion}, ${lh.configSettings?.formFactor ?? 'mobile'} 에뮬레이션, 한 번 측정`;
  const out = [];
  for (const [id, a] of Object.entries(lh.audits ?? {})) {
    const cat = lh.categories?.accessibility?.auditRefs?.some((r) => r.id === id && r.weight > 0) ? 'a11y' : PERF[id] ? 'perf' : null;
    if (!cat || a.score === null || a.score === undefined || a.score >= 0.9 || a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'manual') continue;
    out.push(
      finding({
        category: cat === 'a11y' ? '4.7 접근성' : '4.10 성능',
        ruleId: cat === 'a11y' ? a11yRule(id) : PERF[id],
        title: a.title,
        severity: cat === 'a11y' ? 'P2' : 'P3',
        evidence: `${env}; audit ${id}${a.displayValue ? ` (${a.displayValue})` : ''}; 대상 요소 ${a.details?.items?.length ?? 0}개`,
        filePath: lh.finalDisplayedUrl ?? lh.requestedUrl,
        source: 'lighthouse',
      }),
    );
  }
  const m = lh.audits ?? {};
  const bad = [];
  if (m['largest-contentful-paint']?.numericValue > 4000) bad.push(`LCP ${m['largest-contentful-paint'].displayValue}`);
  if (m['cumulative-layout-shift']?.numericValue > 0.25) bad.push(`CLS ${m['cumulative-layout-shift'].displayValue}`);
  if (m['total-blocking-time']?.numericValue > 600) bad.push(`TBT ${m['total-blocking-time'].displayValue}`);
  if (bad.length)
    out.push(
      finding({
        category: '4.10 성능',
        ruleId: 'P-09',
        title: `Core Web Vitals 기준 초과: ${bad.join(', ')}`,
        severity: 'P2',
        evidence: `${env}; 측정값이며 기기·네트워크에 따라 달라짐`,
        filePath: lh.finalDisplayedUrl ?? lh.requestedUrl,
        source: 'lighthouse',
      }),
    );
  return out;
}

/** 응답 헤더·쿠키 검사 (순수 함수). headers: 소문자 키 객체, cookies: Set-Cookie 문자열 배열 */
export function analyzeHeaders(url, headers, cookies = []) {
  const https = url.startsWith('https:');
  const out = [];
  const f = (o) => out.push(finding({ ...o, filePath: url, source: 'pef-web' }));
  const miss = [];
  if (!headers['content-security-policy']) miss.push('Content-Security-Policy');
  if (https && !headers['strict-transport-security']) miss.push('Strict-Transport-Security');
  if (!/nosniff/i.test(headers['x-content-type-options'] ?? '')) miss.push('X-Content-Type-Options');
  if (!headers['x-frame-options'] && !/frame-ancestors/i.test(headers['content-security-policy'] ?? '')) miss.push('X-Frame-Options 또는 CSP frame-ancestors');
  if (!headers['referrer-policy']) miss.push('Referrer-Policy');
  if (miss.length)
    f({
      category: '4.13 보안',
      ruleId: 'SE-12',
      title: `보안 헤더 없음: ${miss.join(', ')}`,
      severity: 'P3',
      evidence: `이 주소의 응답에서 확인 (다른 경로는 다를 수 있음)`,
      recommendedFix: '호스팅/서버 설정에서 헤더를 추가한다',
    });
  for (const c of cookies) {
    const name = c.split('=')[0].trim();
    const lacks = [!/;\s*httponly/i.test(c) && 'HttpOnly', https && !/;\s*secure/i.test(c) && 'Secure', !/;\s*samesite=/i.test(c) && 'SameSite'].filter(Boolean);
    if (lacks.length)
      f({
        category: '4.13 보안',
        ruleId: 'SE-04',
        title: `쿠키 ${name}: ${lacks.join(', ')} 속성 없음`,
        severity: 'P2',
        evidence: '쿠키 이름과 속성만 확인(값은 읽지 않음). 인증과 무관한 쿠키(통계·UI 설정)면 영향이 작음',
        verification: 'Suspected',
      });
  }
  if (headers['access-control-allow-origin'] === '*' && /true/i.test(headers['access-control-allow-credentials'] ?? ''))
    f({ category: '4.13 보안', ruleId: 'SE-17', title: 'CORS: 모든 출처 허용(*) + 자격증명 허용', severity: 'P2', evidence: 'access-control-allow-origin: *, access-control-allow-credentials: true' });
  return out;
}

const SAFE_URL = /^https?:\/\/[\w.:@/?=&%#~!,+-]+$/;

/** URL 하나를 점검해 result 형식 객체를 만든다. lighthouse 가 없거나 실패하면 그 항목은 NotTested. */
export async function auditWeb(url, now = new Date()) {
  if (!SAFE_URL.test(url)) throw new Error('http(s) 주소만 쓸 수 있고 따옴표·공백·셸 문자는 안 됩니다');
  const findings = [];
  const tools = [];
  const notes = {};
  const coverage = {};
  const mark = (ids, v, why) => {
    for (const i of ids) {
      coverage[i] = v;
      if (why) notes[i] = why;
    }
  };
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const headers = Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
    findings.push(...analyzeHeaders(url, headers, res.headers.getSetCookie?.() ?? []));
    tools.push('pef-web');
    for (const id of ['SE-04', 'SE-12', 'SE-17']) coverage[id] = findings.some((x) => x.ruleId === id) ? 'Confirmed' : 'Clean';
  } catch (e) {
    mark(['SE-04', 'SE-12', 'SE-17'], 'NotTested', `헤더 요청 실패: ${e.message}`);
  }
  const cmd = available('lighthouse');
  if (!cmd)
    mark(
      WEB_ITEMS.filter((i) => /^[AP]-/.test(i)),
      'NotTested',
      'lighthouse 미설치',
    );
  else {
    try {
      findings.push(
        ...parseLighthouse(runTool(cmd, [url, '--output=json', '--output-path=stdout', '--quiet', '--only-categories=performance,accessibility', '--chrome-flags=--headless=new'], process.cwd())),
      );
      tools.push('lighthouse');
      for (const id of WEB_ITEMS.filter((i) => /^[AP]-/.test(i))) coverage[id] = findings.some((x) => x.ruleId === id) ? 'Suspected' : 'Clean';
    } catch (e) {
      mark(
        WEB_ITEMS.filter((i) => /^[AP]-/.test(i)),
        'NotTested',
        `lighthouse 실행 실패: ${String(e.message).split('\n')[0]}`,
      );
    }
  }
  return {
    meta: { target: url, commit: '실행 중인 사이트', profile: '자동 점검 — 실행 중인 사이트(화면·헤더)', auditedAt: kst(now), scope: ['사이트 자동 점검'], toolsUsed: tools },
    findings: findings.map((x, i) => ({ id: `W-${String(i + 1).padStart(3, '0')}`, firstDetected: now.toISOString(), ...x })),
    coverage,
    coverageNotes: notes,
  };
}
