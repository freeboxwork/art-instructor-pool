# Design QA — 관리자 등록자 삭제

- source visual truth path: `C:\Users\adept\AppData\Local\Temp\codex-clipboard-5711e27b-1e9f-4c4c-aec7-5432cfddb680.png`
- implementation screenshot path: `C:\Users\adept\AppData\Local\Temp\admin-user-delete-detail.png`
- mobile interaction screenshot path: `C:\Users\adept\AppData\Local\Temp\admin-user-delete-mobile-dialog.png`
- viewport: desktop CSS `2048 × 1021`, mobile CSS `390 × 844`
- source pixels: `2588 × 1250`
- implementation pixels: desktop `1892 × 1014`, mobile `375 × 811`
- density normalization: device scale factor 1. Codex Browser가 외곽 앱 영역을 제외해 저장한 래스터 크기가 CSS viewport와 달라, 외곽 캔버스가 아닌 등록자 상세 패널과 헤더를 기준으로 원본 비율 상태에서 비교했다.
- state: 등록자 선택 완료, 활성 배지와 삭제 버튼 노출. 모바일은 삭제 확인 dialog open.

## Full-view comparison evidence

참조 이미지와 브라우저 구현 캡처를 하나의 비교 입력에서 함께 확인했다. 기존의 사각 카드, 얇은 경계선, Paperlogy 제목, 갈색 강조색과 상세 패널의 정보 구조를 유지했다. 활성 배지 오른쪽에 동일한 헤더 정렬축을 사용한 32px 사각 휴지통 버튼이 추가됐다. 테스트 데이터 수와 외곽 캔버스 폭은 구현 검증을 위한 의도된 차이다.

## Focused region comparison evidence

별도 확대 이미지는 필요하지 않았다. 원본 픽셀 비교에서 참조 이미지의 활성 배지 오른쪽 표시 위치와 구현의 휴지통 아이콘, 8px 간격, 3px 모서리, 헤더 수직 정렬을 명확하게 판독했다.

## Required fidelity surfaces

- Fonts and typography: 기존 Paperlogy 제목과 Pretendard 본문 체계를 유지했다. 확인창 제목도 Paperlogy 700을 사용한다.
- Spacing and layout rhythm: 기존 `panel-heading` 높이와 여백을 유지하고 배지·아이콘을 한 그룹으로 정렬했다. 모바일 dialog는 좌우 19px 이상 여백을 확보한다.
- Colors and visual tokens: 기존 `--danger`, `--surface-raised`, `--boundary` 토큰을 재사용했다. 삭제만 위험 색상으로 구분된다.
- Image quality and asset fidelity: 신규 래스터 자산은 없다. 휴지통은 Bootstrap Icons의 실제 아이콘 글리프를 사용하며 브라우저에서 로드됨을 확인했다.
- Copy and content: “등록자를 삭제하시겠습니까?”, 영구 삭제·복구 불가 안내, 선택 이메일, 취소/삭제 버튼이 모두 노출된다.

## Findings

- P0/P1/P2 없음.
- P3 없음.

## Interaction and browser checks

- 취소: dialog 닫힘, 목록 2명 유지, 상세 선택 유지.
- 삭제: 테스트 등록자 제거, 목록 1명·전체 등록자 1명으로 갱신, 상세 및 삭제 액션 초기화, 성공 메시지 노출.
- 모바일: dialog 폭 337.43px, viewport 좌우 안쪽에 위치, 가로 overflow 없음.
- 접근성: dialog에 제목·설명 연결, 아이콘 버튼에 접근 가능한 이름, Esc 취소, 완료 중 중복 클릭 방지.
- console errors: 없음.
- error overlay: 없음.

## Comparison history

- 첫 비교에서 actionable P0/P1/P2 차이가 발견되지 않아 수정 반복은 필요하지 않았다.

## Implementation checklist

- [x] 상세 헤더 삭제 아이콘
- [x] 확인 dialog 및 취소 동작
- [x] 물리 삭제 API와 동일 출처 보호
- [x] 삭제 후 목록·요약·상세 갱신
- [x] 데스크톱·모바일·콘솔 오류 검증

final result: passed
