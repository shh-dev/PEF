# PEF — Product Excellence Framework
## 범용 애플리케이션 품질 감사·고도화·최적화 플랫폼
### Claude 개발용 마스터 명세서 v1.0

> 이 문서는 PEF의 정본(원문 명세)이다. 수정 시 버전을 올리고 변경 이유를 `CHANGELOG.md`에 남긴다.
> 다른 프로젝트에서 실제 작업을 할 때의 실행 절차는 `PLAYBOOK.md`를 따른다.

---

# 0. 프로젝트 정의

프로젝트명: PEF (Product Excellence Framework)

영문: Product Excellence Audit, Hardening & Optimization Platform

목적:
모든 종류의 애플리케이션을 대상으로 제품 완성도, UX/UI 품질, 코드 품질, 아키텍처, 성능, 경량화, 보안, 안정성, 테스트, 배포, 유지보수성, 외부 서비스 연동 상태를 종합적으로 점검하고 개선하는 범용 플랫폼을 구축한다.

PEF는 단순한 린터, 취약점 검사기, 코드 리팩토링 도구가 아니다.

핵심 프로세스:

프로젝트 연결 → 프로젝트 구조 및 기술 스택 자동 탐색 → 전체 품질 감사 → 문제점 분류 → 품질 점수 산출 → 개선 계획 수립 → AI 기반 개선안 및 패치 생성 → 테스트 및 검증 → 사용자 승인 → 변경 적용 → 재검수 → 품질 기준선 비교 → 최종 보고서 생성

최종 목표:
"어떤 앱을 연결하더라도 해당 앱의 구조와 특성을 파악하고, 기능을 훼손하지 않으면서 제품 수준의 완성도와 보안·성능·유지보수성을 향상시키는 범용 고도화 엔진"

---

# 1. 최상위 설계 원칙

1. 범용성
- 특정 프레임워크, 언어, 클라우드 서비스에 종속되지 않는다.
- 프런트엔드, 백엔드, 풀스택, API, CLI, 데스크톱 앱 등을 대상으로 한다.
- 기술 스택별 검사기는 Adapter/Plugin 방식으로 구현한다.
- 지원하지 않는 환경은 명확히 식별하고 지원 범위를 보고한다.

2. 안전성
- 최초 진단은 반드시 읽기 전용으로 진행한다.
- 사용자의 명시적 승인 없이 원본 코드를 수정하지 않는다.
- 진단 과정에서 애플리케이션의 데이터를 변경하지 않는다.
- 수정 작업은 격리된 브랜치 또는 Git Worktree에서 진행한다.
- 기존 동작을 보호하는 회귀 테스트를 확보한다.
- 변경 전후 상태를 비교한다.
- 롤백 방법을 제공한다.

3. 보안
- 모든 프로젝트와 연결 정보는 기본적으로 비공개다.
- 시크릿 원본값을 AI 모델에 전송하지 않는다.
- 로그·보고서·오류 메시지에 시크릿이 노출되지 않도록 한다.
- 외부 서비스 연결 시 최소 권한을 적용한다.
- 사용자 승인 없이 운영 환경에 변경을 가하지 않는다.

4. 경량화
- PEF 자체도 가볍고 빠르게 작동해야 한다.
- 모든 검사기를 항상 실행하지 않는다.
- 프로젝트 기술 스택에 필요한 검사기만 로딩한다.
- 증분 검사, 캐싱, 병렬 검사를 지원한다.
- 불필요한 상주 프로세스를 최소화한다.

5. 근거 기반 분석
- 검사 결과에는 확인 가능한 증거를 제공한다.
- 파일 경로, 코드 위치, 검사 규칙, 재현 방법을 기록한다.
- 자동으로 확인하지 못한 항목은 통과 처리하지 않는다.
- 추정 결과와 실제 검증 결과를 구분한다.
- 오탐 및 예외 처리를 지원한다.

6. 코드 품질
- 경량화를 단순한 코드 줄 수 감소로 판단하지 않는다.
- 가독성, 유지보수성, 성능, 안정성을 함께 고려한다.
- 필요한 추상화는 유지한다.
- 무분별한 의존성 추가를 피한다.
- 프로젝트의 기존 코드 스타일을 존중한다.

7. 확장성
- 신규 검사 규칙을 쉽게 추가할 수 있어야 한다.
- 신규 프레임워크와 외부 서비스 연결기를 추가할 수 있어야 한다.
- CLI를 기본으로 하되 API, 웹 대시보드, MCP와 연동할 수 있도록 한다.

---

# 2. 전체 시스템 아키텍처

PEF는 다음 구성으로 개발한다.

1. PEF Core Engine
2. Project Discovery Engine
3. Universal Audit Engine
4. UI Inspector
5. Performance Profiler
6. Security Engine
7. AI Remediation Engine
8. Regression Guard
9. Quality Dashboard
10. Integration & Secrets Inspector

여기서 Core Engine은 공통 기반이며, 나머지 기능은 독립 모듈로 구성한다.

권장 구조:

```
PEF CLI
    |
    v
PEF Core
    |
    +-- Project Discovery
    |
    +-- Audit Orchestrator
    |       |
    |       +-- Frontend Adapter
    |       +-- Backend Adapter
    |       +-- Database Adapter
    |       +-- Security Adapter
    |       +-- UX Adapter
    |       +-- Performance Adapter
    |       +-- Integration Adapter
    |       +-- Custom Adapter
    |
    +-- Findings & Scoring Engine
    +-- AI Remediation Engine
    +-- Regression Guard
    +-- Integration & Secrets Inspector
    +-- Report Generator
    +-- Quality Baseline Manager
    +-- Optional Web Dashboard
    +-- Optional MCP Server
```

각 모듈의 역할을 명확히 분리하고 순환 의존성을 방지한다.

---

# 3. 프로젝트 연결 및 자동 탐색

지원 연결 방식:

- 로컬 프로젝트 디렉터리
- Git 저장소
- GitHub 저장소
- GitLab 저장소
- 모노레포
- 멀티패키지 프로젝트
- 향후 원격 CI/CD 환경

Project Discovery 기능:

- 언어 감지
- 프레임워크 감지
- 패키지 매니저 감지
- 모노레포 여부 판단
- 폴더 구조 분석
- 빌드 시스템 확인
- 테스트 시스템 확인
- 환경별 설정 확인
- 프런트엔드/백엔드 구분
- API 구조 분석
- DB 연동 방식 분석
- 배포 방식 분석
- MCP 설정 탐색
- 환경변수 사용 위치 확인
- 외부 API 및 서비스 연동 탐색

대상 기술 스택 예시:

- Frontend: React, Next.js, Vue, Nuxt, Svelte, Angular
- Backend: Node.js, Express, NestJS, Python, FastAPI, Django, Go
- Database: PostgreSQL, MySQL, SQLite, MongoDB, Redis, Supabase, Firebase
- Desktop: Electron, Tauri
- Build: Vite, Webpack, Turbopack, Rollup, esbuild

위 목록은 초기 지원 후보이며, 모든 기술 스택을 처음부터 완벽히 지원한다고 가정하지 않는다.

각 기술 스택에 대한 실제 지원 수준을 구분한다.

- Full Support
- Partial Support
- Detection Only
- Unsupported

---

# 4. Universal Audit — 통합 품질 감사

총 20개 품질 영역을 검사한다. (체크리스트 형태는 `checklists/` 참조)

## 4.1 기능 완결성
미구현 기능 / 작동하지 않는 버튼 / 잘못된 사용자 흐름 / CRUD 동작 누락 / 저장 실패 처리 / 삭제 확인 및 복구 / 중복 생성 / 권한별 기능 동작 / 잘못된 상태 전환 / 입력값 검증 / 예상하지 못한 사용자 행동 / 비정상적인 데이터 상태 / 네트워크 단절 대응 / 세션 만료 대응 / 새로고침 시 상태 보존 / 브라우저 뒤로 가기 / 부분 실패 처리 / 기능 간 연결 누락

## 4.2 UX 사용성
주요 작업 완료까지 필요한 단계 / 불필요한 클릭 / 탐색 구조 / 사용자 동선 / 기능 발견성 / 용어의 직관성 / 인지 부담 / 잘못된 조작 방지 / 실행 취소 / 사용자 피드백 / 빈 화면 안내 / 오류 상황 안내 / 입력 중 데이터 보존 / 작업 완료 상태 인식 / 반복 작업 효율

## 4.3 시각적 완성도
Typography / Spacing / Alignment / Color System / Contrast / Visual Hierarchy / Design Tokens / Border Radius / Shadows / Icon Consistency / Component Consistency / Layout Density / Responsive Layout / Design System Integrity

## 4.4 인터랙션 품질
Hover / Focus / Active / Disabled / Loading / Success / Error / Transition / Animation / Modal / Dropdown / Tooltip / Toast / Keyboard Interaction / ESC 처리 / Enter 처리 / Tab 이동 / 중복 클릭 방지

## 4.5 상태별 UI
모든 주요 화면에서 다음 상태를 고려한다: Initial / Loading / Skeleton / Empty / Success / Error / Disabled / Offline / Unauthorized / Forbidden / Timeout / Partial Failure

## 4.6 반응형 및 호환성
모바일·태블릿·데스크톱 레이아웃 / 다양한 화면 폭 / 긴 텍스트 / 많은 데이터 / 브라우저 확대 및 축소 / 주요 브라우저 호환 / 터치 사용성 / 가로 스크롤 문제 / 모달 화면 이탈

## 4.7 접근성
키보드 접근성 / 스크린리더 호환 / 의미론적 HTML / ARIA 사용 / 색상 대비 / 포커스 표시 / 입력 필드 레이블 / 오류 메시지 접근성 / 터치 타깃 / WCAG 기준 / 자동화 접근성 검사 / 수동 접근성 검사

## 4.8 아키텍처
계층 분리 / 모듈 경계 / 관심사 분리 / 단일 책임 / 의존성 방향 / 순환 참조 / 과도한 결합도 / 불필요한 추상화 / 확장성 / 데이터 흐름 / 상태 관리 구조 / API 경계 / 기술부채

## 4.9 코드 품질
중복 코드 / 사용하지 않는 코드 / 미사용 export / 미사용 패키지 / 지나치게 복잡한 함수 / 과도하게 큰 컴포넌트 / 타입 안정성 / 예외 처리 / 명명 규칙 / 매직 넘버 / 하드코딩 / 코드 컨벤션 / 테스트 가능성 / 유지보수성

## 4.10 성능 및 경량화
초기 번들 크기 / JavaScript 로딩 / Code Splitting / Lazy Loading / 렌더링 비용 / 불필요한 리렌더링 / 메모리 누수 / 이벤트 리스너 누수 / 이미지 최적화 / 폰트 최적화 / 캐시 전략 / 네트워크 요청 수 / Core Web Vitals / 초기 실행 속도 / 사용자 입력 반응성 / 장시간 실행 안정성

## 4.11 API 효율
중복 API 요청 / 불필요한 데이터 전송 / 응답 크기 / Pagination / Timeout / Retry / Rate Limiting / API 인증 / 오류 응답 일관성 / API 버전 관리 / 멱등성 / 비동기 요청 경합 / 캐시 활용

## 4.12 DB 및 데이터 품질
인덱스 / N+1 쿼리 / 쿼리 성능 / 데이터 정합성 / 트랜잭션 / 마이그레이션 / Foreign Key / 동시 수정 충돌 / 데이터 덮어쓰기 / 중복 데이터 / 데이터 삭제 정책 / 백업 / 복원 검증 / 개인정보 저장 범위

## 4.13 보안
인증 / 인가 / RBAC / IDOR/BOLA / 세션 관리 / XSS / CSRF / SQL Injection / Command Injection / SSRF / Secret Exposure / Dependency Vulnerabilities / 보안 헤더 / 파일 업로드 검증 / 로그 민감정보 노출 / 운영 환경 설정 / 최소 권한

## 4.14 개인정보 보호
개인정보 수집 최소화 / 민감정보 보호 / 데이터 접근 제한 / 보관 기간 / 삭제 정책 / 로그 마스킹 / 백업 내 개인정보 / 외부 서비스 전송 범위 / 사용자 데이터 격리

## 4.15 신뢰성 및 복구
장애 처리 / 오류 복구 / 데이터 유실 방지 / 재시도 안전성 / 동시성 / 멱등성 / 트랜잭션 안정성 / 네트워크 장애 대응 / 서비스 재시작 / 부분 장애 격리 / 백업 복원 / 롤백

## 4.16 테스트 체계
Unit / Integration / E2E / Visual Regression / Accessibility / Security / Performance / API Contract / Regression 테스트 / 테스트 안정성 / 테스트 실행 시간 / 핵심 기능 커버리지

## 4.17 운영 및 관측성
구조화된 로그 / 오류 추적 / 요청 추적 / 성능 메트릭 / 경고 및 알림 / 장애 분석 / 서비스 상태 / 로그 보존 / 운영 진단 가능성

## 4.18 배포 품질
CI/CD / 환경 분리 / 빌드 재현성 / 배포 전 검사 / 배포 후 검증 / 설정 관리 / Secret 관리 / 롤백 / 데이터 마이그레이션 / 릴리스 이력

## 4.19 유지보수성
문서화 / 코드 컨벤션 / 의존성 업데이트 / 기술부채 관리 / 변경 영향 분석 / 코드 리뷰 용이성 / 신규 개발자 이해도 / 불필요한 복잡성 / 장기적인 확장성

## 4.20 제품 일관성
동일 기능의 동일 동작 / 동일 컴포넌트의 동일 형태 / 버튼 크기 및 간격 통일 / 상태 표시 통일 / 오류 메시지 형식 / 데이터 표시 규칙 / 화면 간 용어 통일 / 모바일·데스크톱 경험 일관성 / 디자인 토큰 일관성

---

# 5. 오픈소스 검수 기준 및 도구 통합

PEF는 기존 오픈소스를 활용하되 이를 하나의 플랫폼으로 통합한다.

참고 프로젝트:

1. Production Readiness Checklist — https://github.com/MarinJursic/production-readiness-checklist
2. Gorrion Production Readiness Checklist — https://github.com/gorrion-io/production-readiness-checklist
3. OWASP ASVS — https://github.com/OWASP/ASVS
4. Front-End Checklist — https://github.com/thedaviddias/Front-End-Checklist

자동화 도구 후보:

- Knip — https://github.com/webpro-nl/knip
- Lighthouse CI — https://github.com/GoogleChrome/lighthouse-ci
- Playwright — https://github.com/microsoft/playwright
- axe-core — https://github.com/dequelabs/axe-core
- Semgrep — https://github.com/semgrep/semgrep
- OSV-Scanner — https://github.com/google/osv-scanner
- Dependency Cruiser — https://github.com/sverweij/dependency-cruiser

통합 정책:

- 각 프로젝트의 라이선스와 재배포 조건을 확인한다.
- 공식 규칙과 PEF 자체 규칙을 구분한다.
- 도구 버전을 고정하고 업데이트를 관리한다.
- 동일한 문제를 여러 검사기가 탐지하면 중복 제거한다.
- 검출 결과를 공통 데이터 모델로 변환한다.
- 도구가 설치되지 않았거나 검사를 수행하지 못한 경우 명시한다.
- 검사 실패를 검사 통과로 처리하지 않는다.
- 외부 도구 실행은 격리하고 타임아웃과 자원 제한을 적용한다.

---

# 6. Findings & Scoring Engine

모든 검수 결과를 표준화한다. (스키마: `templates/finding.schema.json`)

Finding 필드:
Finding ID / Project ID / Category / Subcategory / Rule ID / Title / Description / Severity / Confidence / Verification Status / File Path / Line Number / Evidence / Reproduction Steps / Impact / Recommended Fix / Estimated Risk / Fix Status / Verification Result / First Detected / Last Detected

Severity: P0 Critical / P1 High / P2 Medium / P3 Low / P4 Informational

검증 상태: Confirmed / Suspected / Requires Manual Review / False Positive / Not Applicable

작업 상태: Open / Planned / In Progress / Fixed / Verified / Accepted Risk / Reopened

품질 점수 체계 (총 100점):

| 영역 | 가중치 |
|---|---|
| 기능 완결성 | 20% |
| UX/UI 완성도 | 20% |
| 코드 및 아키텍처 | 15% |
| 성능 및 경량화 | 15% |
| 보안 및 개인정보 | 15% |
| 안정성 및 테스트 | 10% |
| 운영 및 유지보수 | 5% |

개별 검수 항목은 가중치를 반영해 계산한다.

주의:

- 이 점수 체계는 PEF 자체 제안 기준이다.
- 검사하지 않은 항목은 자동으로 만점을 주지 않는다.
- 지원 범위와 검사 신뢰도를 별도로 표시한다.
- P0 취약점 또는 데이터 유실 결함이 존재하면 총점과 무관하게 출시 차단 상태로 처리한다.
- 심각한 미검증 위험이 있으면 별도 경고한다.

---

# 7. UI Inspector

실제 앱을 브라우저에서 실행하고 검수한다.

주요 기능: 화면 탐색 / 버튼 동작 검증 / 폼 동작 검증 / 주요 사용자 흐름 테스트 / 모바일 검수 / 데스크톱 검수 / 접근성 검사 / 레이아웃 깨짐 탐지 / 스크린샷 비교 / 콘솔 오류 수집 / 실패한 네트워크 요청 수집 / 시각적 회귀 검증

사용 도구: Playwright, axe-core, Lighthouse CI

유의사항:

- 실행 중인 앱에 접근할 수 없는 경우 코드 기반 정적 분석만 수행한다.
- 실제 사용자 데이터를 변경하는 테스트는 승인된 테스트 환경에서만 실행한다.
- 운영 환경에서는 안전한 읽기 전용 테스트만 수행한다.
- 로그인 및 권한별 테스트는 명시적으로 허용된 테스트 계정으로 진행한다.
- AI의 시각적 평가와 자동화 검사를 구분한다.

---

# 8. Performance Profiler

성능을 측정하고 개선 효과를 비교한다.

측정 대상: 초기 로딩 / 번들 크기 / 화면 전환 / 렌더링 / API 응답 / DB 쿼리 / 메모리 / 장시간 실행 / 사용자 입력 반응성 / CPU 사용량 / 네트워크 사용량

성능 분석 결과: 측정 환경 / 기준선 / 실제 측정값 / 병목 위치 / 개선 제안 / 개선 위험 / 예상 효과 / 개선 후 측정값

성능 개선은 실제 측정 결과를 기준으로 판정한다. 코드가 줄어들었다는 이유만으로 성능이 향상되었다고 판단하지 않는다.

---

# 9. Security Engine

OWASP ASVS를 주요 검수 기준으로 사용한다.

기능: 정적 코드 보안 분석 / 의존성 취약점 분석 / 인증 및 세션 점검 / 접근 제어 검사 / API 권한 검사 / 입력값 검증 / 데이터 노출 위험 확인 / 시크릿 유출 탐지 / 설정 오류 탐지 / 최소 권한 검사

중요 원칙:

- 운영 환경에 대한 침투 테스트를 기본적으로 실행하지 않는다.
- 공격성 테스트는 범위와 권한이 명시된 환경에서만 실행한다.
- 원본 시크릿은 AI에 노출하지 않는다.
- 보안 취약점의 자동 수정은 영향 분석과 승인 절차를 거친다.

---

# 10. Integration & Secrets Inspector

PEF의 핵심 확장 모듈이다.

목적: 프로젝트가 어떤 MCP, API, 데이터베이스, 클라우드, 외부 서비스를 사용하는지 파악하고 연결 상태와 보안 위험을 관리한다.

## 10.1 MCP Discovery

탐색 항목: MCP 서버 이름 / 등록 위치 / 연결 방식 / STDIO·HTTP 등 전송 방식 / 실행 명령 또는 엔드포인트 / 제공 도구 목록 / 제공 리소스 / 연결 상태 / 인증 방식 / 접근 권한 / 사용 위치 / 관련 환경변수 / 잠재적인 보안 위험

지원 대상: 프로젝트별 MCP 설정 / 사용자별 MCP 설정 / Claude 계열 / Codex 계열 / VS Code 관련 / 기타 명시적으로 지원하는 MCP 클라이언트

중요:

- 설정 파일 탐색은 실제 접근 권한이 있는 경로에서만 수행한다.
- 사용자가 승인하지 않은 홈 디렉터리나 다른 프로젝트의 설정을 무단 탐색하지 않는다.
- MCP 서버의 실제 도구 목록은 안전한 연결이 가능할 때에만 확인한다.
- MCP 도구 호출은 기본적으로 수행하지 않는다.

## 10.2 외부 서비스 탐색

서비스 예시: GitHub, GitLab, Supabase, Firebase, Vercel, AWS, Google Cloud, Azure, Cloudflare, OpenAI, Anthropic, Slack, Stripe, Redis, PostgreSQL, 기타 API 서비스

탐색 기준: SDK 의존성 / 코드 import / API 호출 / 환경변수 이름 / 설정 파일 / 배포 구성 / 서비스별 클라이언트 초기화 / MCP 서버 설정

탐지된 연동에는 근거를 함께 기록한다. 단순히 패키지가 설치되어 있다고 실제 서비스에 연결된 것으로 판단하지 않는다.

## 10.3 Secrets Inventory

탐색 항목: .env / .env.local / .env.production / 기타 환경별 설정 / 운영 환경변수 / CI/CD Secrets / API Key / Access Token / OAuth Client / DB Credential / Service Account / Signing Key / 기타 자격증명

기록 항목: Secret Name / Provider / Purpose / Storage Location / Reference Location / Environment / Sensitivity / Access Scope / Configuration Status / Verification Status / Rotation Status / Security Risk

원본값 보호:

- 시크릿 원본값은 화면에 출력하지 않는다.
- 로그에 출력하지 않는다.
- 리포트에 포함하지 않는다.
- AI 모델에 전달하지 않는다.
- 분석용 원격 서버에 업로드하지 않는다.
- 필요 시 로컬 격리 프로세스에서만 취급한다.

기본적으로 이름, 사용 위치, 존재 여부, 노출 위험 등의 메타데이터만 표시한다.
시크릿 검증 시에도 최소한의 읽기 전용 권한과 명시적인 사용자 승인을 요구한다.

## 10.4 연결 상태 검증

상태: Configured / Connected / Authentication Failed / Permission Denied / Unreachable / Not Tested / Deprecated / Unknown

단순 설정 발견과 실제 연결 성공을 구분한다.

서비스 검증 시: 적절한 연결 권한 확인 / 읽기 전용 엔드포인트 우선 사용 / 요청 타임아웃 / 재시도 제한 / Rate Limit 준수 / 네트워크 대상 검증 / 외부 요청 목적 기록

연결 테스트 과정에서 서비스 데이터를 변경하지 않는다.

## 10.5 권한 분석

OAuth Scope 분석 / API Token Scope 분석 / 관리자 권한 필요 여부 / 서비스 계정 권한 / 최소 권한 원칙 / 장기 유효 토큰 / 과도한 접근 권한 / 공개 저장소 노출 위험 / 서버 전용 시크릿의 클라이언트 노출 위험

## 10.6 연동 관계 분석

```
Application
    |
    +-- Database
    +-- Authentication Provider
    +-- Hosting
    +-- External API
    +-- Storage
    +-- MCP Servers
    +-- CI/CD
```

기능: 서비스 연결 관계도 / 사용 위치 추적 / 장애 영향 범위 / 미사용 연동 후보 탐지 / 중복 연동 탐지 / 서비스 종속성 파악

## 10.7 환경별 설정 비교

비교 환경: Local / Development / Staging / Production

검사항목: 환경변수 누락 / 환경별 값의 존재 여부 / 잘못된 환경 참조 / 개발용 서비스의 운영 사용 / 운영용 자격증명의 개발 환경 노출 / 환경별 권한 차이 / 설정 드리프트

원본 시크릿 값은 비교 보고서에 노출하지 않는다.

## 10.8 Vault 및 Secret Manager

향후 연동 후보: HashiCorp Vault / AWS Secrets Manager / Google Secret Manager / Azure Key Vault / 기타 Secret Manager

기능: Secret 존재 여부 확인 / 메타데이터 조회 / 정책 확인 / 만료 및 교체 필요 여부 / 사용 환경 확인 / Secret Rotation 이력

시크릿 값의 읽기, 교체, 삭제는 기본적으로 금지하고 별도의 명시적 승인과 권한 체계를 둔다.

---

# 11. AI Remediation Engine

AI는 검수 결과를 근거로 개선안을 생성한다.

주요 기능: 문제 원인 분석 / 수정 대상 파일 선정 / 수정 방향 제안 / 변경 영향 분석 / 코드 패치 생성 / 필요한 테스트 생성 / 검증 결과 분석 / 실패 시 수정안 재검토

지원 방식: Claude Code / Codex / 기타 AI 에이전트 / 향후 모델 제공자 교체 가능

AI Provider Adapter를 사용해 특정 모델에 종속되지 않도록 한다.

작업 단계:

1. Finding 선택
2. 관련 코드 탐색
3. 수정 전 기준선 확보
4. 수정 계획 생성
5. 영향 범위 확인
6. 별도 작업 공간에서 패치 생성
7. 정적 검사
8. 테스트 실행
9. 성능 및 보안 재검사
10. Diff 보고서
11. 사용자 승인
12. 변경 적용
13. 최종 검증

자동 수정 정책:

- Low Risk: 단순한 포맷 및 확실한 불필요 코드 정리 등 제한적인 자동 수정 후보.
- Medium Risk: 리팩토링, 의존성 교체, 성능 개선 등 검토 필요.
- High Risk: 인증, 권한, DB, API 계약, 데이터 구조 등 반드시 개별 승인 필요.
- Critical Risk: 데이터 삭제, 운영 인프라 변경, 자격증명 교체 등 별도의 강화된 승인 절차 필요.

기본값은 자동 적용 OFF.

---

# 12. Regression Guard

핵심 목표: "개선하면서 기존 기능을 망가뜨리지 않는다."

검증 항목: 기존 테스트 통과 / 신규 테스트 통과 / 핵심 사용자 흐름 / API 호환성 / 데이터 호환성 / 타입 검사 / 보안 검사 / 성능 비교 / UI 시각적 비교 / 번들 크기 비교

결과: Improved / Unchanged / Regressed / Inconclusive

회귀가 감지되면 자동 적용을 차단한다. 테스트가 충분하지 않다면 안전하다고 판단하지 않는다.

---

# 13. Quality Baseline

프로젝트별 품질 기준선을 저장한다.

저장 항목: 프로젝트 버전 / Git Commit / 검사 도구 버전 / 검사 설정 / 품질 점수 / 검출 문제 / 주요 성능 메트릭 / 테스트 결과 / 번들 크기 / 보안 상태 / 검사 커버리지 / 측정 환경 / 측정 시각

목적: 최초 상태 기록 / 고도화 전후 비교 / 품질 퇴보 탐지 / 반복적으로 발생하는 결함 탐지 / 기술부채 변화 추적

품질 게이트: P0 결함 존재 시 차단 / 데이터 유실 위험 존재 시 차단 / 필수 테스트 실패 시 차단 / 중요한 보안 회귀 발생 시 차단 / 합의된 성능 허용 범위 초과 시 차단

측정값의 변동성과 환경 차이를 고려해 판정한다.

---

# 14. Quality Dashboard

목적: 여러 프로젝트를 한곳에서 관리하는 웹 대시보드.

필수 화면: Projects / Project Overview / Audit Results / Findings / Improvement Plan / AI Remediation / Regression Results / Performance / Security / Integrations & Secrets / Baselines / Reports / Settings

Project Overview: 프로젝트 이름 / 기술 스택 / 마지막 검사 / 품질 총점 / 영역별 점수 / 위험 수준 / 미해결 문제 / 최근 개선 이력 / 개선 전후 변화 / 검사 지원 범위

Findings: 심각도·영역·상태 필터 / 파일 위치 / 검출 근거 / 개선 방법 / 관련 테스트 / 수정 이력

Integrations & Secrets: 연결 서비스 목록 / MCP 서버 목록 / 외부 API 목록 / 시크릿 이름 및 메타데이터 / 연결 상태 / 보안 위험 / 권한 범위 / 서비스 연결 관계도

UI 원칙: 고급스럽고 정돈된 인터페이스 / 정보 밀도가 높되 가독성 유지 / 공통 디자인 토큰 / 반복 컴포넌트 재사용 / 일관된 상태 표시 / 직관적인 탐색 / 반응형 / 접근성 고려 / 불필요한 애니메이션 최소화 / 빠른 초기 로딩

웹 대시보드는 선택적 구성 요소다. CLI만으로도 핵심 기능을 사용할 수 있어야 한다.

---

# 15. CLI 설계

예상 명령어:

```
pef init
pef discover
pef audit
pef audit --changed
pef audit --category security
pef audit --category performance
pef audit --category ux
pef integrations
pef integrations --mcp
pef integrations --secrets
pef report
pef plan
pef fix
pef fix --safe
pef verify
pef baseline create
pef baseline compare
pef dashboard
```

명령어 설계 원칙: 명확한 도움말 / 일관된 옵션 / JSON 출력 지원 / 사람이 읽기 좋은 출력 / CI에서 사용할 종료 코드 / 명확한 오류 메시지 / 검사 타임아웃 / 읽기 전용 기본 모드

`--safe` 옵션이 있더라도 승인되지 않은 원본 코드 변경은 허용하지 않는다.

---

# 16. MCP 연동

PEF 자체를 MCP 서버로 제공할 수 있도록 설계한다.

목적: Claude Code, Codex 등의 MCP 클라이언트가 PEF의 검수 및 보고 기능을 사용할 수 있게 한다.

읽기 전용 MCP 도구 예시: pef_discover_project / pef_audit_project / pef_get_findings / pef_get_quality_score / pef_get_integrations / pef_get_mcp_servers / pef_get_secret_metadata / pef_get_security_report / pef_get_performance_report / pef_compare_baselines

변경 작업은 별도 승인 정책과 격리 실행 환경을 적용한다.

MCP 보안 요구사항: 허가된 프로젝트만 접근 / 허가된 경로만 탐색 / 시크릿 출력 금지 / 명령 실행 범위 제한 / 경로 순회 방지 / 프롬프트 인젝션 방어 / 도구 호출 기록 / 사용자 승인 / 최소 권한

외부 프로젝트에서 발견된 README, 설정, 코드 주석 등은 신뢰할 수 없는 입력으로 취급한다. 이러한 콘텐츠가 PEF나 AI 에이전트의 권한을 변경하도록 허용하지 않는다.

---

# 17. 보고서

출력 형식: Terminal / JSON / HTML / Markdown / 향후 PDF

보고서 구성: 1.Executive Summary 2.Project Profile 3.Audit Coverage 4.Overall Quality Score 5.Category Scores 6.Critical Findings 7.Security Assessment 8.Performance Assessment 9.UX/UI Assessment 10.Code Quality Assessment 11.Integrations & Secrets 12.Improvement Plan 13.Remediation History 14.Regression Results 15.Baseline Comparison 16.Remaining Risks 17.Release Readiness

검수 실패, 검사 불가, 미지원, 수동 확인 필요 항목을 각각 명확하게 구분한다.

---

# 18. 개발 단계

## V1 — Universal Audit MVP
목표: 실제로 사용할 수 있는 범용 검수 도구 완성.

구현 범위: CLI / 프로젝트 자동 탐색 / 기술 스택 식별 / 검사기 플러그인 구조 / 공통 Finding 모델 / 코드 품질 검사 / 보안 정적 분석 / 의존성 취약점 검사 / 미사용 코드 탐지 / 기본 성능 분석 / 설정 기반 MCP 탐색 / 환경변수 이름 및 참조 위치 탐색 / 외부 서비스 연동 후보 탐색 / JSON·HTML 보고서 / Quality Baseline / 검사 지원 범위 표시

완료 조건: 실제 프로젝트에서 실행 가능 / 원본 코드 무변경 / 중대한 시크릿 노출 없음 / 검사 결과 재현 가능 / 검사 실패와 통과를 구분 / CI에서 사용 가능

## V2 — AI Remediation
AI Provider Adapter / Finding별 개선 계획 / 패치 생성 / 격리된 작업 공간 / Diff 검토 / 테스트 자동 실행 / 승인 절차 / 롤백

## V3 — UI & Runtime Inspection
Playwright 통합 / 주요 사용자 흐름 / 반응형 테스트 / 접근성 검사 / Lighthouse CI / 시각적 회귀 / 실행 성능 분석

## V4 — Dashboard & Integration Platform
다중 프로젝트 관리 / 통합 품질 대시보드 / MCP 서버 모드 / 외부 서비스 연결 상태 검증 / Vault·Secret Manager 연결 / 변경 이력 / 정기 검사 / CI/CD 통합 / 프로젝트 간 품질 비교

---

# 19. 개발 품질 기준

PEF 자체에도 PEF의 품질 원칙을 적용한다.

필수 요구사항: 모듈형 아키텍처 / Type Safety / 테스트 자동화 / 안정적인 오류 처리 / 최소 의존성 / 빠른 실행 / 증분 분석 / 캐시 / 검사 프로세스 격리 / 시크릿 마스킹 / 최소 권한 / 명확한 로그 / 재현 가능한 빌드 / 버전 관리 / 문서화

특히 PEF는 외부 저장소의 코드를 검사하므로 프로젝트 내용을 기본적으로 신뢰할 수 없는 입력으로 취급해야 한다.

외부 코드, 패키지 스크립트, MCP 설정 및 기타 실행 명령은 별도 승인 없이 실행하지 않는다.

검사 과정에서 외부 의존성을 설치하거나 임의의 셸 명령을 실행하는 동작은 기본적으로 금지한다.

---

# 20. Claude 실행 지시

이 문서는 PEF의 전체 제품 및 엔지니어링 명세서다.

당신은 시니어 소프트웨어 아키텍트, 보안 엔지니어, 성능 엔지니어, UX 엔지니어, 오픈소스 유지보수자의 역할을 수행한다.

다음 순서로 진행하라.

1. 현재 작업 디렉터리와 프로젝트 상태를 파악한다.
2. 기존 코드가 존재하면 먼저 구조와 기능을 분석한다.
3. 본 명세서의 전체 요구사항을 기능 단위로 분해한다.
4. 우선순위, 기술적 의존성, 위험도를 분석한다.
5. 적합한 기술 스택 및 아키텍처를 제안한다.
6. 재사용 가능한 Core와 Adapter 인터페이스를 정의한다.
7. 공통 Finding 데이터 모델을 정의한다.
8. 검사기 실행·격리·결과 수집 방식을 설계한다.
9. 시크릿 비노출 및 권한 경계를 우선 설계한다.
10. V1 MVP 구현을 시작한다.
11. 각 기능에 필요한 테스트를 함께 작성한다.
12. 실제 샘플 프로젝트로 검증한다.
13. 검사 결과와 테스트 결과를 보고한다.
14. 미완성 기능과 지원되지 않는 항목을 명확히 기록한다.
15. 이후 V2~V4를 확장 가능한 구조로 유지한다.

구현 시 반드시 지킬 사항:

- 기존 기능을 무단으로 삭제하거나 변경하지 않는다.
- 확인되지 않은 결과를 성공으로 보고하지 않는다.
- 외부 서비스에 임의로 연결하거나 데이터를 변경하지 않는다.
- 시크릿 원본값을 출력하지 않는다.
- 불필요한 패키지를 추가하지 않는다.
- 검수의 정확도를 위해 성능과 경량화를 희생하지 않되, 모든 변경의 비용을 측정한다.
- 과도한 추상화와 복잡한 프레임워크 도입을 피한다.
- 설계 문서만 작성하고 종료하지 않는다.
- 구현 환경과 권한이 허용하는 범위에서 실제 동작하는 V1을 완성한다.
- 구현하지 못한 기능은 완료된 것처럼 표시하지 않는다.

최종 결과물:

1. 실행 가능한 PEF CLI
2. 프로젝트 탐색 엔진
3. 확장형 Audit Engine
4. 공통 Finding/Scoring 시스템
5. Integration & Secrets Inspector 기본 기능
6. 기본 검사기 연동
7. 품질 기준선 시스템
8. JSON/HTML 보고서
9. 자동화 테스트
10. 설치 및 사용 설명서
11. 향후 확장 가능한 모듈 구조
12. V2~V4 개발 로드맵

최종적으로 PEF는 단순한 진단 보고 도구가 아니라, 실제 앱의 제품 완성도를 지속적으로 높이는 범용 소프트웨어 품질 고도화 플랫폼이 되어야 한다.
