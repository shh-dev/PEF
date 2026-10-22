# 고도화에 쓰는 스킬 목록 (사용자 지정 10개)

고도화(완성도 점검·수정)를 할 때 에이전트가 함께 쓰는 GitHub 스킬 모음이다. 사용자가 2026-10-22 에 지정했다.
저장소 존재·최근 갱신은 `gh repo view` 로 확인했고, 쓰임은 저장소 설명과 사용자 설명 기준이다(저장소 안의 코드는 읽지 않았다).

## 등급과 설치 규칙

| 등급 | 대상 | 규칙 |
|---|---|---|
| **필수** | 1 ELI5, 2 Ponytail | 고도화 시작 전에 깔려 있는지 확인하고 없으면 설치한다 (사용자 지시, 승인 불필요). |
| **필요할 때** | 3~10 | 이미 깔려 있으면 그대로 쓴다. 없으면 **그 스킬이 필요한 순간에 사용자에게 설치 승인**을 받는다. |

- 스킬은 에이전트의 행동을 바꾸는 지시문이고 스크립트·훅을 포함할 수 있다. 설치 전에 README 와 훅·실행 파일 유무를 확인한다.
- 10개 모두 GitHub 에서 라이선스 표기가 조회되지 않았다(`licenseInfo` 없음). 설치는 사용자 개인 환경에서의 사용이고, 대상 프로젝트 저장소에 파일을 복사해 넣지 않는다.
- 설치 여부 확인: `~/.claude/plugins/installed_plugins.json` 의 키 목록.

## 목록

| # | 이름 | 한 줄 설명 | 고도화에서 쓰는 곳 | 이 PC(2026-10-22) |
|---|---|---|---|---|
| 1 | [ELI5](https://github.com/DreambigOu/ELI5) | 눈높이에 맞춘 설명 스킬 | 모든 사용자 보고 (PLAYBOOK §4) | 설치됨 (`eli5@claude-community`, 같은 저장소인지는 미확인) |
| 2 | [Ponytail](https://github.com/DietrichGebert/ponytail) | 코드를 짧고 최소로 쓰게 하는 스킬 | 수정 단계 (과잉 구현 방지, C-08) | 설치됨 |
| 3 | [Superpowers](https://github.com/obra/superpowers) | 개발 방법론 스킬 묶음 | 원인 분석(체계적 디버깅), 수정 전 계획, 완료 전 검증 | 설치됨 |
| 4 | [Matt Pocock Skills](https://github.com/mattpocock/skills) | 실무 엔지니어용 스킬 모음 | 코드·타입 품질 파트 | 미설치 |
| 5 | [Karpathy Skills](https://github.com/multica-ai/andrej-karpathy-skills) | Claude 의 나쁜 버릇을 고치는 CLAUDE.md 규칙 | 수정 단계 행동 규칙 참고 | 미설치 |
| 6 | [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | AI 디자인 스킬 | UI 파트(4.2~4.7) 개선안 | 미설치 |
| 7 | [Graphify](https://github.com/Graphify-Labs/graphify) | 코드·문서·스키마를 지식 그래프로 | 낯선 큰 프로젝트의 구조 파악(4.8), 영향 범위 | 미설치 |
| 8 | [Caveman](https://github.com/JuliusBrussee/caveman) | 토큰을 줄이는 스킬 | 내부 작업 로그·긴 점검 (아래 충돌 규칙 참고) | 설치됨 |
| 9 | [Addy Osmani Skills](https://github.com/addyosmani/agent-skills) | 실서비스 수준 엔지니어링 스킬 | 안정성·운영·보안 파트(4.12~4.19) | 미설치 |
| 10 | [Taste Skill](https://github.com/Leonxlnx/taste-skill) | 화면 감각(아트 디렉션) 스킬 | UI 시각 파트(4.3) 개선안 | 미설치 |

## 충돌·주의 규칙

- **사용자 보고는 글 구조 ELI5 + 문체 Caveman**(사용자 선호, 2026-10-22). 섹션은 결론/쉽게 설명/변경 사항/확인할 것/다음 단계를 쓰고, 안은 Caveman 식 짧은 항목으로 채운다. 스킬 간 충돌 시 PLAYBOOK §4 를 따른다.
- **Karpathy Skills(CLAUDE.md 형태)는 대상 프로젝트의 CLAUDE.md 를 덮어쓰지 않는다.** 규칙을 참고만 하고, 대상 프로젝트의 CLAUDE.md 가 있으면 그쪽이 우선이다.
- **UI 스킬(6, 10)의 결과는 취향 제안이지 근거가 아니다.** Finding 의 근거는 `docs/UI-REFERENCES.md` 의 원칙(실서비스에서 반복되는 패턴, 복제 금지, 검증 안 된 패턴 단정 금지)과 측정값(`pef touch`, `pef web`)이다. 스킬이 낸 디자인안은 `Suspected`/제안으로만 적는다.
- 스킬 간 지시가 충돌하면 **사용자 지시 > 대상 프로젝트 CLAUDE.md > PLAYBOOK > 스킬** 순으로 따른다.
- 스킬이 많을수록 지시문이 많아져 토큰과 혼선이 늘어난다. 한 작업에 필요한 스킬만 켠다(예: UI 파트만 6·10, 구조 파악만 7).
