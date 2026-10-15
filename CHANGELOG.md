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
- 지속 고도화: `pef checkpoint`(이전 상태에 이어 붙이기·점수 변화 기록·report.html 갱신), `pef status`(이어서 시작). 재검사에서 사라진 도구 Finding은 자동 Verified. PLAYBOOK §0.6
