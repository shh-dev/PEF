# CHANGELOG

## 준비 단계
- 마스터 명세 v1.0, 플레이북(앱 성격별 프로파일 §1.5 포함), 로드맵, Finding 스키마, 보고서 템플릿 추가

## 실전 시험 보정 (4bc2d91)
- 판정 값·커버리지 계산, result 스키마, 항목 추가(SE-20~24, PV-09~11, AP-12~13), 병렬 감사 합치기 규칙

## V1 CLI 1차 (0.1.0)
- 의존성 0개 Node CLI: `discover` `audit` `validate` `report` `baseline` `compare`, 시크릿 마스커, SCORING.md 점수 계산, 분담 결과 합치기
- 외부 도구 어댑터(Knip·Semgrep·OSV-Scanner·Dependency Cruiser): 4종 모두 실제 실행으로 검증(PEF 자체 + 취약 의존성 샘플). 미설치·실패는 NotTested로 기록
- 미구현: 번들 크기, 환경변수·MCP 탐색(integrations), HTML 보고서, 앱 프로파일별 가중치
