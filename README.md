# 🏷 TagScanner Web

> **옷 태그를 촬영하면 브랜드 · 상품명 · 가격 · 사이즈 · 시리얼을 자동으로 뽑아내고,
> 카테고리로 분류하고, 필터·검색·비교까지 되는 브라우저 기반 옷장 관리 앱**

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Tesseract.js](https://img.shields.io/badge/Tesseract.js-5.1-blue)
![Google Cloud Vision](https://img.shields.io/badge/Google_Cloud_Vision-Optional-4285F4?logo=google-cloud&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)

## 🌐 라이브 데모

**👉 [https://geonwoong-lee.github.io/TagScanner-Web/](https://geonwoong-lee.github.io/TagScanner-Web/)**

> 모바일 브라우저에서 열면 카메라로 바로 촬영 가능해요.

---

## ✨ 주요 기능

### 📸 OCR 태그 인식
- **Tesseract.js** (무료, 오프라인, 한국어+영어)
- **Google Cloud Vision API** (선택, 훨씬 정확)
- 인식 결과를 5개 필드로 자동 분류 (브랜드/상품명/가격/사이즈/시리얼)

### 📦 상품 관리
- 카테고리 8종 (아우터/상의/하의/신발/가방/모자/액세서리/기타)
- 매장명, 사용자 메모, 찜 기능
- 2열 카드 그리드 목록 (카테고리 배지 포함)

### 🔍 필터 & 검색
- **카테고리·브랜드·기간(오늘/이번주/이번달)·가격대·정렬** 다중 필터
- 브랜드는 **저장된 데이터에서 자동 추출** (사용 빈도순)
- 통합 검색 (브랜드/상품명/매장명/메모)

### 💗 비교 기능
- 찜한 상품끼리 **가로 카드 리스트**로 정리
- **한눈에 비교하기** → 표 형태로 최저가 자동 하이라이트 🏆

### 👤 마이페이지
- 총 저장 수 / 찜 비율 / 등록 브랜드 수 / 평균 가격 통계
- 최근 저장 상품 5개
- **JSON 백업 내보내기** / 전체 데이터 삭제

### 🛒 외부 연동
- 상품 상세에서 **온라인 최저가 검색** (Google Shopping)
- **브랜드 공식몰 이동**

---

## 🛠 기술 스택

| 영역 | 사용 기술 |
|---|---|
| **Frontend** | 순수 HTML/CSS/JavaScript (프레임워크 없음) |
| **OCR** | Tesseract.js 5.1 (기본) / Google Cloud Vision API (선택) |
| **저장소** | Browser `localStorage` (이미지 base64 압축) |
| **폰트** | Pretendard (한글) / Inter (영문) |
| **디자인** | Figma → 코드 이식 (Fuschia + Iris 팔레트) |
| **배포** | GitHub Pages |

---

## 🚀 로컬 실행

### 방법 ① `npx serve` (가장 간단)

```bash
cd TagScanner-Web
npx serve
```

브라우저에서 `http://localhost:3000` 접속.

### 방법 ② VS Code Live Server 확장

1. VS Code에서 폴더 열기
2. 확장 마켓 → **Live Server** 설치
3. `index.html` 우클릭 → **Open with Live Server**

### 방법 ③ Python

```bash
cd TagScanner-Web
python -m http.server 3000
```

> ⚠️ **`index.html` 파일을 그냥 더블클릭하면 동작 안 함.** Tesseract.js가 워커/언어 데이터를 CDN에서 불러오는데 `file://`에서는 CORS 차단됩니다. 반드시 HTTP 서버로 접속.

---

## 📱 모바일에서 사용 (같은 Wi-Fi)

1. PC에서 `npx serve` 실행 후 IP 확인
   ```bash
   ipconfig   # Windows
   ifconfig   # Mac/Linux
   ```
2. 폰 브라우저에서 `http://[PC_IP]:3000` 접속
3. 셔터 버튼 클릭 → **폰 카메라 바로 열림**

> 학교/카페 Wi-Fi는 클라이언트 격리(AP Isolation) 때문에 안 될 수 있음. 이 경우 배포된 GitHub Pages URL 사용.

---

## 🔑 Google Cloud Vision API 연동 (선택)

Tesseract보다 훨씬 정확한 인식을 원하면 API 키를 설정하세요.

1. [Google Cloud Console](https://console.cloud.google.com/) → 새 프로젝트
2. **API 및 서비스** → 라이브러리에서 `Cloud Vision API` 검색 → 사용 설정
3. **사용자 인증 정보** → API 키 생성
4. **결제 활성화** (월 1000회 무료, 초과분만 청구 ~$1.5/1000장)
5. **할당량 제한 권장** — API 페이지에서 하루 요청 수를 30~100으로 제한하면 실수로도 청구 불가
6. 앱에서 **⚙ 마이페이지 → OCR 엔진 / API 키 설정**에 붙여넣기

> 🔐 API 키는 브라우저 `localStorage`에만 저장되며 코드에 포함되지 않습니다. 각 사용자가 자기 키를 넣어야 함.

---

## 📁 프로젝트 구조

```
TagScanner-Web/
├── index.html      # UI 구조 (7개 화면)
├── styles.css      # 디자인 시스템 (Fuschia + Iris)
├── parser.js       # OCR 텍스트 → 5개 필드 자동 분류 로직
├── app.js          # 메인 애플리케이션 로직
└── README.md
```

### 화면 구성

| 화면 | 설명 |
|---|---|
| **메인 (카메라)** | 다크 테마 + OCR/일반 탭 + 하단 3버튼 네비 |
| **등록/편집** | 사진 + 카테고리 pill + 6개 필드 입력 |
| **내 상품 목록** | 2열 카드 그리드 + 검색/필터/찜 액션 |
| **상세** | 사진 캐러셀 + 정보 테이블 + 외부 검색 CTA |
| **필터** | 카테고리/브랜드/기간/가격/정렬 조합 |
| **상품 비교** | 찜 목록 가로 카드 + 한눈에 비교 결과 |
| **마이 페이지** | 통계 + 최근 저장 + 설정 메뉴 |

---

## 💾 데이터 저장

- 저장 위치: 브라우저 `localStorage` (키: `tagscanner.tags.v1`)
- 이미지: 1280px로 리사이즈 후 base64 JPEG (품질 0.82)
- 용량 한계: 브라우저당 보통 5~10MB (수십 장까지는 여유)
- 백업: **마이 페이지 → 데이터 내보내기** → JSON 다운로드

### 데이터 스키마

```javascript
{
  id: 1699999999999,           // 저장 시각 (unique)
  createdAt: 1699999999999,
  photoData: "data:image/jpeg;base64,...",
  category: "상의",              // 8종 중 하나
  brand: "NIKE",
  productName: "에어 트레이너 자켓",
  price: "₩129,000",
  size: "L",
  serial: "CW2288-111",
  store: "강남 브랜치",
  memo: "색감 예쁨, 따뜻함",
  favorite: true,
  rawText: "..."               // OCR 원문
}
```

---

## 🐛 트러블슈팅

| 문제 | 원인 / 해결 |
|---|---|
| OCR이 너무 오래 걸림 | 첫 실행은 한국어 모델 다운로드(~10MB)로 30초~1분. 이후 캐시됨 |
| `Tesseract is not defined` | 인터넷 연결 확인 (CDN 로드 실패) |
| PC에서 카메라 안 열림 | PC는 `<input capture>` 무시. 파일 선택 다이얼로그가 뜨는 게 정상 |
| Google Vision "billing required" | 결제 계정을 프로젝트에 연결해야 함. 무료 한도 안에선 청구 없음 |
| localStorage 저장 실패 | 용량 초과. 마이페이지에서 내보낸 뒤 삭제하거나, 브라우저 데이터 정리 |

---

## 🎨 디자인

**Fuschia + Iris** 팔레트 (Figma 원본 기반)

| 색상 | HEX | 용도 |
|---|---|---|
| Fuschia/100 | `#EF5DA8` | Primary 액센트 (하트, 프로필, FAB) |
| Fuschia/60 | `#FCDDEC` | 배경 강조 |
| Iris/100 | `#5D5FEF` | 서브 액센트 (비교, 통계) |
| Black | `#1A1A1A` | CTA 버튼 |

---

## 📄 라이선스

MIT License. 자유롭게 사용/수정/배포 가능.

---

## 🙋 만든 사람

- **Geonwoong Lee** — [@geonwoong-lee](https://github.com/geonwoong-lee)
- 아주대학교 캡스톤 디자인 프로젝트

Made with ☕ and lots of clothes tags.
