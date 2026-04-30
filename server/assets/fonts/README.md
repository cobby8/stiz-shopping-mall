# 견적서 PDF 한글 폰트

견적서 PDF 자동 생성에 사용되는 한글 폰트 폴더입니다.

## 빠른 설치 (Pretendard, 권장)

1. https://github.com/orioncactus/pretendard/releases 에서 최신 릴리스 다운로드
2. `Pretendard-1.x.x-web.zip` (또는 `Pretendard-1.x.x.zip`) 압축 해제
3. 다음 파일 중 **하나**를 이 폴더(`server/assets/fonts/`)에 복사:
   - **권장**: `PretendardVariable.ttf` (가변 폰트, 1개 파일로 굵기 모두 처리)
   - 또는 `Pretendard-Regular.ttf` + `Pretendard-Bold.ttf` (분리 파일)

라이선스: SIL Open Font License 1.1 (상업 사용 가능, 재배포 가능)

## 폰트 인식 우선순위

`server/routes/admin/quote.js`의 `registerFonts()`가 다음 순서로 시도합니다:

1. `PretendardVariable.ttf` 단일 파일 (1순위)
2. `Pretendard-Regular.ttf` + `Pretendard-Bold.ttf` 분리 파일 (2순위)
3. `Pretendard-Regular.ttf`만 있으면 Bold도 같은 파일로 사용 (3순위)
4. 모두 없으면 영문 기본 폰트(Helvetica)로 폴백 + 콘솔 경고

## 폰트 미설치 시 동작

- 견적서 라우트는 죽지 않고 **PDF는 정상 생성**됩니다.
- 다만 **한글 글자가 깨져 보입니다** (Helvetica는 한글 미지원).
- 서버 콘솔에 `[quote] ⚠️ 한글 폰트 미발견...` 경고 출력
- PDF 하단에 작은 빨간 경고 문구 표시

## 다른 한글 폰트 사용 시

`PretendardVariable.ttf` 파일명에 맞춰 그 자리에 두면 자동 인식됩니다.
즉, NanumGothic을 쓰고 싶으면 파일명을 `PretendardVariable.ttf`로 바꾸거나,
`server/routes/admin/quote.js`의 `FONT_VARIABLE` 상수 경로를 수정하세요.

권장 한글 오픈 폰트:
- Pretendard (모던, SIL OFL) — **추천**
- Noto Sans KR (구글, SIL OFL)
- 나눔고딕 (네이버, SIL OFL)

## Git 추적 정책

`.ttf` 파일 자체는 Git에 포함하지 않는 것을 권장합니다 (저장소 비대화 방지).
운영 서버 배포 시 폰트 파일을 별도로 복사해 주세요.
