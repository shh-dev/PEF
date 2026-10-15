# 4.5 상태별 UI

적용: UI앱 ●
주요 화면(목록·상세·폼·대시보드)마다 아래 12상태를 표로 만들어 **구현됨 / 없음 / 해당없음**을 기록한다.

상태: Initial · Loading · Skeleton · Empty · Success · Error · Disabled · Offline · Unauthorized · Forbidden · Timeout · Partial Failure

| ID | 확인 방법 | 문제 기준 | 기본 심각도 |
|---|---|---|---|
| S-01 | 데이터 fetch 컴포넌트에서 loading/error/empty 분기 grep | 세 분기 중 하나라도 없음 | P2 |
| S-02 | 401/403 응답 처리(로그인 유도/접근 불가 안내) | 흰 화면 또는 무한 로딩 | P2 |
| S-03 | 타임아웃·오프라인 처리와 재시도 수단 | 실패 후 복구 방법 없음 | P2 |
| S-04 | 부분 실패 표시(일부 카드만 실패) | 전체가 실패로 보이거나 숨겨짐 | P3 |
| S-05 | 로딩→콘텐츠 시 레이아웃 점프(스켈레톤 유무) | 큰 레이아웃 이동 | P3 |
| S-06 | 에러 경계(Error Boundary 등) 존재 | 렌더 오류 시 앱 전체 흰 화면 | P2 |
