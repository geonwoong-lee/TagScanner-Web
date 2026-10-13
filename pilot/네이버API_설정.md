# 네이버 쇼핑 검색 API 연결 (가격 조회용)

온라인 최저가를 앱 안에서 보여 주기 위해 필요합니다. 무료이고 하루 25,000건까지 됩니다.
크롤링이 아니라 네이버가 공개한 검색 API라 약관 안에서 동작합니다.

## 1. 네이버 개발자센터에서 키 발급

1. https://developers.naver.com 접속, 네이버 계정으로 로그인
2. 위쪽 **Application > 애플리케이션 등록**
3. 애플리케이션 이름: `TagScanner`
4. 사용 API: **검색** 선택
5. 비로그인 오픈 API 서비스 환경: **WEB 설정** 선택
   - 웹 서비스 URL: `https://geonwoong-lee.github.io`
6. 등록하면 **Client ID**와 **Client Secret**이 나옵니다

## 2. Supabase에 키 등록

1. Supabase 대시보드 > Edge Functions > **Secrets**
2. Add new secret 두 개
   - `NAVER_CLIENT_ID` : 발급받은 Client ID
   - `NAVER_CLIENT_SECRET` : 발급받은 Client Secret

## 3. 함수 배포

1. Edge Functions > Deploy a new function > Via Editor
2. 함수 이름 `price`
3. 이 폴더의 `price-proxy.ts` 내용을 붙여넣고 Deploy

## 확인

앱에서 상품 상세 화면 > "온라인 최저가 검색"을 누르면
화면 안에 최저가와 매장가 차액이 나옵니다.

## 참고

- 참가자 1명당 하루 60회로 제한해 두었습니다. 바꾸려면 `price-proxy.ts`의 DAILY_LIMIT을 고치고 다시 배포하세요
- 키를 등록하지 않으면 예전처럼 네이버 쇼핑 검색 결과를 새 창으로 엽니다. 앱이 멈추지는 않습니다
- 상품명으로 찾는 방식이라 다른 상품이 걸릴 수 있습니다. 화면에 참고용이라고 적어 두었습니다
