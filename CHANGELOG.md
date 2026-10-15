# CHANGELOG

## 준비 단계
- 마스터 명세 v1.0, 플레이북(앱 성격별 프로파일 §1.5 포함), 로드맵, Finding 스키마, 보고서 템플릿 추가

## 실전 시험 보정 (4bc2d91)
- 판정 값·커버리지 계산, result 스키마, 항목 추가(SE-20~24, PV-09~11, AP-12~13), 병렬 감사 합치기 규칙

## V1 CLI 1차 (0.1.0)
- 의존성 0개 Node CLI: `discover` `audit` `validate` `report` `baseline` `compare`, 시크릿 마스커, SCORING.md 점수 계산, 분담 결과 합치기
- 외부 도구 어댑터(Knip·Semgrep·OSV-Scanner·Dependency Cruiser): 4종 모두 실제 실행으로 검증(PEF 자체 + 취약 의존성 샘플). 미설치·실패는 NotTested로 기록
- 미구현: 번들 크기, 환경변수·MCP 탐색(integrations), HTML 보고서, 앱 프로파일별 가중치

## 처분·완결성 (0.2.0)
- Finding `disposition`(ActNow/Plan/NoActionNow/NeedsCheck) 추가. NoActionNow는 이유·확인한 근거·다시 볼 조건 필수(없으면 validate 실패)
- 보고서에 완결성(비어 있는 항목·Finding 목록)과 "당장 신경 안 써도 되는 것" 섹션 추가. 미완결이면 "차단 없음"을 말하지 않음
- OSV 취약점은 Suspected+NeedsCheck로 변경(설치 사실만 알 뿐 사용 여부는 모름)

## 0.3.0
- `pef triage`(규칙 단위 일괄 처분), `report --html`(사람이 보기 쉬운 단일 HTML 보고서)

## 0.4.0
- `pef integrations`(SPEC §10.1~10.3, ROADMAP V1-7): 코드 속 환경변수 이름·참조 위치, CI 시크릿 이름, `.env*` 파일의 git 추적·ignore 여부(내용은 열지 않음), 프로젝트 MCP 설정(Claude Code·Cursor·VS Code·Gemini·Codex), 외부 서비스 후보(의존성만 = Candidate, 설정·환경변수 근거 = Configured, 연결은 전부 NotTested)
- 위험은 SE-10 Suspected Finding으로 기록: 공개 접두사(`NEXT_PUBLIC_` 등)에 비밀 이름, git에 올라간 `.env`(P0), ignore 안 된 `.env`, MCP 설정에 박힌 키. `--out`이면 report에 합칠 수 있는 result 파일도 저장
- 이름만 보고 판단하므로 문제가 없어도 SE-10을 Clean으로 만들지 않음
