# PEF 로드맵

상태: ⏳ 대기 / 👉 진행 / ✅ 완료. (현재 전부 ⏳, 준비 단계만 ✅)

## P0 — 준비 ✅
- 명세 정본, 플레이북, 점검표, Finding 스키마, 보고서 템플릿

## V1 — Universal Audit MVP 👉 (1차: 의존성 0개 JS CLI. 2~7·9~11 완료(어댑터 4종 실제 실행 검증, HTML 보고서, integrations), 번들 크기·프로파일 가중치(8) 미구현)
권장 스택(제안, 착수 전 확정): TypeScript + Node 20+, 의존성 최소(CLI 파서·스키마 검증 정도), 테스트는 `node:test` 또는 vitest.

작업 분해(의존 순서):
1. 모노레포 골격: `packages/core`, `packages/cli`, `packages/adapters/*`
2. Finding/Score 모델 + JSON Schema 검증 (`templates/finding.schema.json` 기준)
3. Secret-safe 로거/마스커 (가장 먼저, 이후 모든 출력이 통과)
4. Project Discovery (언어·프레임워크·패키지매니저·모노레포·지원수준)
5. Adapter 인터페이스 + Audit Orchestrator (격리 실행, 타임아웃, 도구 미설치 = Not Tested)
6. 기본 검사기: 코드 품질(Knip), 보안 정적(Semgrep), 의존성(OSV-Scanner), 순환참조(Dependency Cruiser), 번들 크기
7. ✅ Integration & Secrets Inspector: MCP 설정 탐색, env 이름·참조 위치, 외부 서비스 후보 (값 읽기 없음) — `pef integrations`
8. Scoring (앱 프로파일별 가중치, PLAYBOOK §1.5)
9. Baseline 저장/비교
10. 리포트 JSON/HTML/Markdown
11. CLI: `init discover audit integrations report baseline`
12. 샘플 프로젝트 검증 + CI 종료 코드

완료 조건: SPEC §18 V1 완료 조건 전부.

## V1.5 (선택) — 스킬/플러그인 패키징 ⏳
링크만 주는 방식 대신, 에이전트에 한 번 설치해 두면 어느 프로젝트에서든 바로 호출되게 한다. 참고: `morluto/rea`의 `npx ... setup` 방식(에이전트 선택 → 변경 내용 검토 → 승인 → 기존 설정 백업 후 적용).
- Claude Code 스킬/플러그인, Codex용 지침(`AGENTS.md` 기반) 형태로 `PLAYBOOK.md` 절차를 패키징
- 설치 시 사용자 승인 필수, 기존 설정 백업, 제거 방법 제공
- 에이전트별 지침은 `PLAYBOOK.md` 하나를 정본으로 두고 복제하지 않는다(어긋남 방지)
- 착수 조건: 실제 프로젝트 시험(문서 보정)이 끝난 뒤

## V2 — AI Remediation ⏳
Provider Adapter, Finding별 계획, 격리 worktree 패치, diff·테스트·승인·롤백

## V3 — UI & Runtime Inspection ⏳
Playwright, axe-core, Lighthouse CI, 시각 회귀

## V4 — Dashboard & Integration Platform ⏳
다중 프로젝트 대시보드, MCP 서버 모드, 연결 상태 검증, Secret Manager 연동
