# 파일럿 테스트 준비 (직접 하셔야 하는 설정)

로그인, 기기 간 동기화, 사용 로그 수집을 켜려면 아래 여섯 가지가 필요합니다.
전부 무료 범위 안에서 됩니다. 10분 정도 걸립니다.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 GitHub 계정으로 가입
2. New project 생성 (이름은 `tagscanner-pilot` 정도, 지역은 Northeast Asia (Seoul))
3. 데이터베이스 비밀번호는 아무거나 정하고 따로 보관 (앱에서는 쓰지 않습니다)

## 2. 데이터베이스 만들기

1. 왼쪽 메뉴 SQL Editor 열기
2. 이 폴더의 `schema.sql` 내용을 전부 붙여넣고 Run
3. 표 네 개(profiles, items, item_photos, usage_events)와 photos 저장소가 만들어집니다

## 3. 이메일 확인 끄기

무료 요금제는 확인 메일 발송이 시간당 몇 건으로 제한됩니다. 참가자 10명이 동시에 가입하면 막힙니다.

1. Authentication > Sign In / Providers > Email
2. **Confirm email**을 끄고 저장

## 4. 앱에 넣을 값 두 개 복사

1. Project Settings > API
2. **Project URL** (예: `https://abcdefgh.supabase.co`)
3. **anon public** 키 (`eyJ...`로 시작하는 긴 문자열)

이 둘은 브라우저에 공개되는 값이라 코드에 넣어도 괜찮습니다.
반대로 같은 화면의 **service_role 키는 절대 앱이나 저장소에 넣으면 안 됩니다.**

## 5. Google Analytics 4 측정 ID

1. https://analytics.google.com 에서 속성 만들기 (웹)
2. 데이터 스트림 주소는 `https://geonwoong-lee.github.io`
3. **측정 ID**(`G-`로 시작) 복사

## 6. OCR 키를 서버로 옮기기

참가자가 각자 구글 API 키를 넣지 않아도 되게, 서버가 대신 호출합니다.

1. Supabase 대시보드 > Edge Functions > Create function, 이름 `vision`
2. 이 폴더의 `vision-proxy.ts` 내용을 붙여넣고 Deploy
3. Edge Functions > vision > Secrets 에서 `GOOGLE_VISION_API_KEY` 추가하고, 구글 API 키 값을 직접 붙여넣기
   (키는 이 화면에서만 다루고, 코드나 깃에는 넣지 않습니다)

키가 이미 노출된 적이 있으면 이 기회에 구글 클라우드에서 **키를 새로 발급**하고,
Cloud Vision API만 쓰도록 제한 + 일일 할당량 상한을 걸어 두시길 권합니다.

---

## 다 하신 뒤 알려주실 것

- Project URL
- anon public 키
- GA4 측정 ID

세 가지를 알려주시면 앱에 연결하고 동작을 확인하겠습니다.
(API 키는 알려주지 않으셔도 됩니다. 6번에서 직접 넣으신 값을 서버가 씁니다.)

## 참가자에게 안내할 내용 (동의 화면에 들어갈 문구)

- 수집 항목: 저장한 상품 정보(브랜드, 가격, 사이즈, 소재, 매장, 메모), 상품 사진, 앱 사용 기록(저장·비교·찜 시각)
- 목적: 캡스톤디자인 과제의 사용성 분석
- 보관 기간: 과제 종료 시점까지, 이후 삭제
- 참가자는 언제든 계정과 데이터 삭제를 요청할 수 있음
