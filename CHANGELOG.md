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
- `discover`: 루트에 패키지 파일이 없는 "앱 여러 개 모음" 저장소(또는 워크스페이스)면 하위 폴더(깊이 3까지)에서 앱을 찾아 `apps`로 알려준다. 전에는 이런 저장소를 통째로 Unsupported로 판정했다. 패키지 파일 없이 `.py`만 있는 앱도 파이썬으로 본다
- `audit`: Knip·Dependency Cruiser는 앱 폴더마다 따로 돌리고 Finding 경로에 앱 폴더를 붙인다. 일부 앱에서만 돌았으면 해당 항목을 Clean이 아니라 NotTested로 두고 이유를 남긴다
