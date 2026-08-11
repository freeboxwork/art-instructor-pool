# 예비 미술 강사 인력풀

모바일 3단계 등록 화면, Neon PostgreSQL 저장 API, 익명 방문·전환 분석, 관리자 목록·상세 화면으로 구성된 Vercel 프로젝트입니다.

한글 페이지 타이틀은 프로젝트에 자체 호스팅한 Paperlogy Bold를 사용하고, 본문과 입력 UI는 Pretendard를 사용합니다.

## 운영 주소

- 사용자 화면: https://art-instructor-pool.vercel.app
- 관리자 대시보드: https://art-instructor-pool.vercel.app/admin.html

## 데이터 흐름

1. 사용자가 필수 정보를 입력하고 이메일 안내에 동의합니다.
2. `POST /api/registrations`가 서버에서 입력값을 다시 검증합니다.
3. 이메일을 소문자로 정규화해 신규 등록하거나 기존 정보를 갱신합니다.
4. 관리자는 로그인 후 사이트 분석, UTM 링크 생성, 사용자 목록을 사이드바에서 구분해 이용합니다.
5. UTM 링크 화면에서 공유 채널 프리셋과 캠페인 이름을 조합해 추적 링크를 생성하고 복사합니다.
6. 사용자 목록은 15개 단위 게시판 형식이며, 선택한 등록자의 상세 정보를 표시합니다.
7. 승인된 사용자는 읽기 전용 MCP 서버를 통해 같은 등록자·분석 데이터를 자연어로 조회할 수 있습니다.

## 익명 사이트 분석

사용자 화면은 소개 방문, 등록 CTA 클릭, 폼 입력 시작, 검증 오류, 제출, 등록 성공과 완료 화면 방문을 익명 세션 단위로 기록합니다. 분석 이벤트에는 이메일, 전공, 지역, 등록자 ID 등 개인정보와 폼 입력값을 저장하지 않습니다.

관리자 대시보드의 `사이트 분석` 메뉴에서는 최근 7일·30일·90일 기준으로 방문 세션, 페이지 조회, CTA 클릭, 등록 완료, 전환 퍼널, 일별 추이와 유입 경로를 확인할 수 있습니다. `캠페인별 유입`에서는 `utm_campaign`별 플랫폼, 공유 방식과 세션 수를 함께 표시합니다.

`UTM 링크` 메뉴에서는 카카오톡 단체방, 네이버 카페, 인스타그램, 이메일 프리셋을 선택하고 캠페인 또는 모임명을 입력해 분석용 URL을 만들 수 있습니다. 공백은 `_`로 변환하고 `*`, 중괄호, 역슬래시 등 허용되지 않는 문자는 제거합니다. 현재 유입 경로 목록에는 `utm_source`가 표시되며 `utm_medium`과 `utm_campaign`도 분석 이벤트에 함께 저장됩니다.

관리자 API는 서명된 HttpOnly 쿠키가 있어야 접근할 수 있습니다. 관리자 비밀번호와 세션 서명 키는 Vercel 환경변수에만 저장합니다.

## 환경변수

`.env.example`을 참고해 아래 값을 설정합니다.

- `DATABASE_URL`: Neon PostgreSQL pooled connection string
- `ADMIN_PASSWORD`: 12자 이상의 관리자 비밀번호
- `ADMIN_SESSION_SECRET`: 32자 이상의 임의 문자열
- `MCP_DATABASE_URL`: 선택 사항. MCP 전용 최소 권한 DB 연결 문자열이며 없으면 `DATABASE_URL`을 사용합니다. 등록자·분석 테이블에는 `SELECT`, `mcp_access_tokens`에는 `SELECT`·`UPDATE`, `mcp_access_logs`에는 `INSERT` 권한이 필요합니다.

## 주요 API

- `POST /api/registrations`: 등록 또는 이메일 기준 갱신
- `POST /api/admin/login`: 관리자 로그인
- `POST /api/admin/logout`: 관리자 로그아웃
- `GET /api/admin/session`: 관리자 세션 유효성 확인
- `GET /api/admin/dashboard`: 핵심 지표와 지역·경력 분포 집계
- `POST /api/analytics/events`: 허용 목록 기반 익명 방문·전환 이벤트 저장
- `GET /api/admin/analytics`: 관리자용 기간별 방문·전환 분석
- `GET /api/admin/registrations`: 이메일 게시판 목록 및 페이지 정보(기본 15개)
- `GET /api/admin/registrations/:id`: 등록자 상세 정보
- `POST /api/mcp`: Bearer 토큰으로 보호되는 Streamable HTTP MCP 엔드포인트

## Codex MCP 플러그인

`plugins/art-instructor-data`는 사이트 분석, 등록자 조회·집계와 스프레드시트 정리를 돕는 Codex 플러그인입니다. MCP 도구는 모두 읽기 전용이며 임의 SQL, 등록자 수정·삭제, 분석 초기화 기능을 노출하지 않습니다.

운영자가 최초 한 번 MCP 테이블을 만든 뒤 사용자별 토큰을 발급합니다.

```powershell
npm run mcp:migrate
npm run mcp:token:create -- --name "홍길동" --expires-days 180
npm run mcp:token:list
```

토큰 원문은 생성 시 한 번만 출력되고 DB에는 SHA-256 해시만 저장됩니다. 토큰을 폐기할 때는 목록에 표시되는 접두사를 사용합니다.

```powershell
npm run mcp:token:revoke -- --prefix "aip_mcp_12ab34cd"
```

사용자는 전달받은 토큰을 소스 파일에 넣지 않고 사용자 환경변수로 저장합니다.

```powershell
[Environment]::SetEnvironmentVariable(
  "ART_INSTRUCTOR_MCP_TOKEN",
  "운영자에게_전달받은_토큰",
  "User"
)
```

그다음 공개 GitHub 저장소를 Codex 마켓플레이스로 추가하고 플러그인을 설치합니다.

```powershell
codex plugin marketplace add freeboxwork/art-instructor-pool
codex plugin add art-instructor-data@art-instructor-pool
```

설치 후 Codex를 재시작하고 새 작업에서 사용합니다. macOS·Linux에서는 Codex를 실행하기 전에 `ART_INSTRUCTOR_MCP_TOKEN`을 셸 환경변수로 내보내면 됩니다.

토큰을 사용자별로 나누는 것은 프로토콜상 필수는 아닙니다. 최대 5명이 하나의 공유 토큰을 사용할 수도 있지만 호출자를 구분할 수 없고 한 명만 제외하거나 토큰을 폐기하기 어렵습니다. 등록자 이메일을 다루는 서비스이므로 사용자별 토큰을 권장합니다. `팀 공용` 같은 이름으로 토큰 하나를 발급하면 공유 토큰 방식도 그대로 지원됩니다.

## 검색 기능 준비

검색 UI와 검색 조건은 아직 구현하지 않았습니다. 추후 이메일 부분 검색을 붙일 수 있도록 `email_normalized` 컬럼과 `pg_trgm` GIN 인덱스가 스키마에 포함되어 있습니다.

## 로컬 확인

```powershell
npm install
npm run check
npm run dev
```

재현 가능한 DB 스키마는 `database/schema.sql`에 있습니다.
