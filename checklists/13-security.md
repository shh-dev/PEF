# 4.13 보안

적용: 전 유형 ●
기준: OWASP ASVS. 도구: Semgrep(정적), OSV-Scanner(의존성). **운영 대상 침투 테스트 금지**, 공격성 테스트는 범위·권한이 명시된 환경에서만.
Finding의 `evidence`에 **시크릿 원본값 금지**(마스킹).

| ID | 확인 방법 | 문제 기준 | 기본 심각도 |
|---|---|---|---|
| SE-01 | 모든 엔드포인트의 인증·인가 적용 대조표 | 인증 누락 민감 API | P0 |
| SE-02 | 객체 접근 시 소유자 검사 (IDOR/BOLA): `/items/:id`에서 id만으로 조회 | 남의 데이터 접근 가능 | P0 |
| SE-03 | 역할(RBAC) 검사가 서버에 있는가 | UI 숨김만으로 권한 통제 | P1 |
| SE-04 | 세션/토큰: 만료·갱신·폐기, 쿠키 HttpOnly/Secure/SameSite | 만료 없음, 쿠키 플래그 누락 | P1 |
| SE-05 | 비밀번호 변경/탈퇴 시 세션 무효화 | 기존 세션 유지 | P2 |
| SE-06 | XSS: `innerHTML`/`dangerouslySetInnerHTML`/템플릿 이스케이프 | 사용자 입력이 이스케이프 없이 출력 | P1 |
| SE-07 | CSRF 방어(토큰/SameSite) — 쿠키 인증일 때 | 상태 변경 요청 무방어 | P1 |
| SE-08 | SQL/NoSQL/명령 주입: 문자열 연결 쿼리, `exec` 입력 삽입 | 입력이 쿼리/명령에 직접 삽입 | P0 |
| SE-09 | SSRF: 사용자 URL을 서버가 요청 | 내부망 접근 가능 | P1 |
| SE-10 | 시크릿 노출: 코드·git 이력·클라이언트 번들·로그 | 키가 저장소/번들에 있음 | P0 |
| SE-11 | 의존성 취약점 (OSV 등), 오래된 핵심 패키지 | 알려진 High 이상 취약점 | P1 |
| SE-12 | 보안 헤더(CSP·HSTS·X-Content-Type-Options 등) | 주요 헤더 없음 | P3 |
| SE-13 | 파일 업로드: MIME+확장자+크기 3중 검증, 저장 위치 | 검증 없음/실행 가능 위치 | P1 |
| SE-14 | 로그에 민감정보(토큰·비번·개인정보) | 평문 기록 | P1 |
| SE-15 | 운영 설정: 디버그 모드, dev bypass, 기본 계정 | 운영에서 우회 로직 실행 가능 | P0 |
| SE-16 | 리다이렉트 URL 화이트리스트 | 오픈 리다이렉트 | P2 |
| SE-17 | CORS 설정 `*` + 자격증명 | 과도한 허용 | P2 |
| SE-18 | 최소 권한: DB 계정·API 키·서비스 계정 권한 범위 | 관리자 권한을 앱이 상시 사용 | P2 |
| SE-19 | 결제 로직(있다면): 서버 재계산·멱등·웹훅 서명 | 클라이언트 금액 신뢰 | P0 |
| SE-20 | 서버 액션/RPC/내부 함수도 *엔드포인트*로 간주해 인증·인가 대조표에 포함 (Next.js `"use server"`, Supabase RPC 등). SE-01과 같은 표에 합쳐서 작성 | 대조표에서 빠진 서버 액션 | P1 |
| SE-21 | DB 권한이 *실제로 효과 있는지* 확인: 컬럼 단위 REVOKE가 테이블 단위 GRANT에 무효가 되는 구조, RLS 정책 누락, anon/authenticated에 부여된 권한 (Supabase/Postgres 계열). 정적 판정이 어려우면 `needsLiveCheck` | "숨겼다"는 컬럼이 실제로 읽힘 | P1 |
| SE-22 | **돈·권한을 계산하는 근거 데이터**(환불 금액, 쿠폰 지급, 등급 등)를 사용자가 쓸 수 있는가 | 사용자가 고칠 수 있는 기록으로 금액/혜택 계산 | P1 (재현 시 P0) |
| SE-23 | 사용자가 넣은 URL을 서버가 가져오는 기능의 허용 대상 제한 (SE-09의 구체 사례) | 내부 주소·메타데이터 주소 접근 가능 | P1 |
| SE-24 | 로그인 후 `next`/`redirect` 파라미터 검증 (SE-16 확인) | 외부 주소로 이동 가능 | P2 |
| DK-07 | (데스크톱/Electron) nodeIntegration·contextIsolation·IPC 입력 검증·원격 URL 로딩 | nodeIntegration 켜짐 + 외부 콘텐츠 로딩 | P0 |
| DK-08 | (데스크톱) 토큰·키를 OS 보안 저장소(Credential Manager/Keychain) 대신 평문 파일·설정에 저장 | 평문 저장 | P1 |
| MB-02 | (모바일) 매니페스트/Info.plist: debuggable, allowBackup, 불필요한 exported 컴포넌트, ATS 예외 | release 빌드에 디버그·백업 허용 | P1 |
| MB-03 | (모바일) 로컬 비밀을 Keychain/Keystore 대신 평문(SharedPreferences·UserDefaults)에 저장 | 평문 저장 | P1 |
| MB-07 | (모바일) 딥링크·푸시 토큰 처리: 입력 검증, 토큰 갱신, 권한 거부 시 동작 | 검증 없는 딥링크로 화면/동작 진입 | P2 |

> SE-01과 11-api의 AP-06은 같은 대조표를 쓴다. 한 번만 작성하고 양쪽 판정에 같은 Finding을 연결한다 (`ruleIds`).

P0·데이터 유실급 Finding이 1건이라도 있으면 점수와 무관하게 **출시 차단**.
