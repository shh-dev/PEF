// 출력에 나가는 모든 문자열을 통과시키는 마스커 (PLAYBOOK 규칙 2). 값이 새는 것을 막는 마지막 방어선.
const RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[비공개키 마스킹]'],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g, '[JWT 마스킹]'],
  [/\b(?:sk|pk|rk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}\b/g, '[키 마스킹]'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/g, '[토큰 마스킹]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[AWS키 마스킹]'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[마스킹]'],
  [/(\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)["']?[^\s"',;]{6,}["']?/g, '$1[마스킹]'],
  [/\b([A-Za-z0-9._%+-]{3})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2'],
  [/\b0\d{1,2}-?\d{3,4}-?(\d{4})\b/g, '***-****-$1'],
];

export function mask(text) {
  return RULES.reduce((s, [re, to]) => s.replace(re, to), String(text ?? ''));
}
