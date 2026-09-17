# TagScanner 인식률 평가

실제 매장에서 촬영한 택 사진으로 앱의 OCR 파서(`../parser.js`)가 브랜드·가격·사이즈·품번·상품명·소재를
얼마나 정확히 뽑는지 측정하고, 앱이 쓰는 택 양식 지문(`../tag_profiles.js`)을 생성한다.

## 데이터

- 택 사진 135장: SPA 9개 브랜드 × 15장 (SPAO, ARKET, H&M, COS, MUJI, 무신사 스탠다드, 8seconds, ZARA, UNIQLO)
- `ground_truth.json`: 사진을 보고 만든 정답 라벨. `brand_in_text`는 택에 브랜드명이 글자로 인쇄됐는지 여부
- `ocr_cache/`: 사진 135장에 대한 Google Vision 응답(TEXT_DETECTION + LOGO_DETECTION). **평가는 이것만 있으면 된다**
- `images/`: 원본 사진. 공개 저장소라 커밋하지 않는다. OCR을 다시 돌릴 때만 필요하며 팀 드라이브에서 받는다

## 실행

모든 스크립트는 Node.js로 저장소 어디서나 실행할 수 있다.

```bash
# 현재 파서 채점 (API 비용 없음)
node eval/evaluate.js parser.js v3

# 개선 전 파서와 비교
node eval/evaluate.js eval/results/parser_v2_original.js baseline

# 택 양식 지문 학습 + leave-one-out 측정 (--write를 붙이면 ../tag_profiles.js 갱신)
node eval/build_profiles.js

# 학습에 없는 브랜드를 단정하지 않는지 (leave-one-brand-out, 임계값 비교)
node eval/lobo.js

# 평가셋에 없는 일반 택에서 개선 전후 출력이 달라지지 않았는지
node eval/sanity.js
```

OCR을 다시 돌리려면 `images/`에 사진을 두고, Vision API 키를 사용자 환경변수 `GOOGLE_VISION_API_KEY`에 등록한 뒤
(Windows는 `set_key.bat` 실행) `python eval/run_ocr.py`를 실행한다. 이미 캐시된 사진은 다시 호출하지 않는다.

## 측정 결과 (2026-09-16, 택 135장)

| 항목 | 개선 전 | 개선 후 |
|---|---|---|
| 브랜드 | 51% (69/135) | 100% |
| 가격 | 37% | 100% |
| 사이즈 | 62% | 98% |
| 품번 | 29% | 99% |
| 상품명 | 12% | 93% (상품명이 있는 60장) |
| 소재(혼용률) | 미지원 | 23/24장 |

브랜드 인식 경로: Vision 로고 30장 · 텍스트 사전 57장 · 고유 코드 규칙 48장

택 사진 이미지 비교(CLIP) 실험 결과는 `results/clip_experiment.md` 참고.

## 해석할 때 주의할 점

- 파서 규칙을 **이 135장을 보며 만들었다.** 처음 보는 택에서는 정확도가 더 낮을 수 있으므로 새로 찍은 사진으로 다시 측정해야 한다.
- 품번은 OCR이 혼동하는 O와 0을 같은 글자로 채점한다.
- 택 양식 지문은 학습에 없는 브랜드를 단정하면 잘못된 브랜드가 조용히 저장되므로 임계값을 높게 둔다
  (`lobo.js` 결과: 느슨한 기준에서는 처음 보는 브랜드 택의 94%를 다른 브랜드로 단정).
