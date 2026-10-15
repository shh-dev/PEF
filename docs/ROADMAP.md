# PEF 로드맵

상태: ⏳ 대기 / 👉 진행 / ✅ 완료. (현재 전부 ⏳, 준비 단계만 ✅)

## P0 — 준비 ✅
- 명세 정본, 플레이북, 점검표, Finding 스키마, 보고서 템플릿

## V1 — Universal Audit MVP ⏳
권장 스택(제안, 착수 전 확정): TypeScript + Node 20+, 의존성 최소(CLI 파서·스키마 검증 정도), 테스트는 `node:test` 또는 vitest.

작업 분해(의존 순서):
1. 모노레포 골격: `packages/core`, `packages/cli`, `packages/adapters/*`
2. Finding/Score 모델 + JSON Schema 검증 (`templates/finding.schema.json` 기준)
3. Secret-safe 로거/마스커 (가장 먼저, 이후 모든 출력이 통과)
4. Project Discovery (언어·프레임워크·패키지매니저·모노레포·지원수준)
5. Adapter 인터페이스 + Audit Orchestrator (격리 실행, 타임아웃, 도구 미설치 = Not Tested)
6. 기본 검사기: 코드 품질(Knip), 보안 정적(Semgrep), 의존성(OSV-Scanner), 순환참조(Dependency Cruiser), 번들 크기
7. Integration & Secrets Inspector: MCP 설정 탐색, env 이름·참조 위치, 외부 서비스 후보 (값 읽기 없음)
8. Scoring (앱 프로파일별 가중치, PLAYBOOK §1.5)
9. Baseline 저장/비교
10. 리포트 JSON/HTML/Markdown
11. CLI: `init discover audit integrations report baseline`
12. 샘플 프로젝트 검증 + CI 종료 코드

완료 조건: SPEC §18 V1 완료 조건 전부.

## V1.5 (선택, 보류) — 판정 백엔드 교체 ⏳
V1은 도구+규칙+에이전트 판단으로만 만든다. 오탐 거르기·앱 유형 분류·과잉 구현 판정 같은 "판정" 단계를 `Judge` 인터페이스로 분리해 두고, 나중에 빠른 판정 모델(예: Jev)을 선택 옵션으로 붙일 수 있게 한다. 기본 OFF, 코드 외부 전송이므로 마스킹+승인 후에만, 정확도·비용은 실데이터로 측정 후 결정.

## V2 — AI Remediation ⏳
Provider Adapter, Finding별 계획, 격리 worktree 패치, diff·테스트·승인·롤백

## V3 — UI & Runtime Inspection ⏳
Playwright, axe-core, Lighthouse CI, 시각 회귀

## V4 — Dashboard & Integration Platform ⏳
다중 프로젝트 대시보드, MCP 서버 모드, 연결 상태 검증, Secret Manager 연동
