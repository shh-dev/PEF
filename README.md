# PEF — Product Excellence Framework

어떤 앱이든 연결해서 구조를 파악하고, 품질(기능·UX·코드·성능·보안·운영)을 감사한 뒤, 기능을 깨뜨리지 않으며 단계적으로 고도화하는 범용 플랫폼.

**현재 상태: 명세 + 플레이북 + V1 CLI(`pef`, 의존성 0개). 링크와 "고도화해줘"만 주면 에이전트가 `PLAYBOOK.md`를 읽고 알아서 진행한다.** 로드맵은 `docs/ROADMAP.md`.

## 다른 프로젝트에서 바로 쓰기

대상 프로젝트 폴더에서 Claude Code에 이렇게 말한다:

```
이 PEF 저장소 기준으로 이 프로젝트 고도화해줘: <이 저장소 URL>
```

Codex·Claude 등 어떤 에이전트든 `AGENTS.md`(또는 `CLAUDE.md`)를 진입점으로 같은 절차를 따른다. 에이전트가 `PLAYBOOK.md` 절차(탐색 → 앱 성격 확인 → 기준선 → 감사 → 점수 → 계획 승인 → 수정 → 검증 → 보고)를 수행한다.

## 구성

| 파일 | 설명 |
|---|---|
| `PLAYBOOK.md` | 실행 절차 (여기부터) |
| `docs/SPEC.md` | 마스터 명세 정본 |
| `docs/SCORING.md` | 점수 계산 방식 |
| `docs/ROADMAP.md` | V1~V4 로드맵 |
| `checklists/` | 영역별 점검표 |
| `templates/` | Finding 스키마, 보고서 템플릿 |
