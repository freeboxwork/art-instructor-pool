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

## 검색 기능 준비

검색 UI와 검색 조건은 아직 구현하지 않았습니다. 추후 이메일 부분 검색을 붙일 수 있도록 `email_normalized` 컬럼과 `pg_trgm` GIN 인덱스가 스키마에 포함되어 있습니다.

## 로컬 확인

```powershell
npm install
npm run check
npm run dev
```

재현 가능한 DB 스키마는 `database/schema.sql`에 있습니다.
