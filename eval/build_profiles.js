// 라벨이 붙은 택 135장에서 브랜드별 "택 양식 지문"을 학습한다.
// 특징 추출은 앱과 같은 코드(parser.js의 window.tagShapeFeatures)를 쓴다.
//
// 평가: leave-one-out (한 장을 빼고 나머지로 학습해 그 한 장을 맞히기)
// 산출물: ../tag_profiles.js (앱 루트)
//
// 사용: node build_profiles.js [--write]
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WEB = path.join(ROOT, '..');
global.window = globalThis;
require(path.join(WEB, 'fabric_dict.js'));
require(path.join(WEB, 'brands.js'));
require(path.join(WEB, 'parser.js'));

const MIN_DF = 3; // 3장 이상에서 나타난 특징만 사용 (상품별 값 배제)
const MIN_SCORE = 60; // 최소 점수 (학습에 없는 브랜드를 단정하지 않는 지점: leave-one-brand-out 오답 0건)
const MIN_MARGIN = 1.5; // 1등과 2등 점수 차이
const MIN_RATIO = 4; // 1등이 2등의 몇 배 이상이어야 하는지
// 자동 입력 기준에는 못 미쳐도 화면에 후보로 제시할 기준
const SUGGEST_SCORE = 25;
const SUGGEST_RATIO = 2;

const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'ground_truth.json'), 'utf8'))
  .filter((t) => !t.exclude);

const samples = truth.map((t) => {
  const resp = JSON.parse(fs.readFileSync(path.join(ROOT, 'ocr_cache', t.id + '.json'), 'utf8'));
  const lines = window.splitLines(resp.fullTextAnnotation?.text || '');
  return { id: t.id, brand: t.brand, brandInText: t.brand_in_text, feats: window.tagShapeFeatures(lines) };
});

// 이진 나이브베이즈 로그오즈 가중치
function train(set) {
  const brands = [...new Set(set.map((s) => s.brand))];
  const df = new Map();
  for (const s of set) for (const f of s.feats) df.set(f, (df.get(f) || 0) + 1);
  const kept = [...df.keys()].filter((f) => df.get(f) >= MIN_DF);

  const perBrand = {};
  for (const b of brands) {
    const mine = set.filter((s) => s.brand === b);
    const others = set.filter((s) => s.brand !== b);
    const weights = {};
    for (const f of kept) {
      const inMine = mine.filter((s) => s.feats.has(f)).length;
      const inOthers = others.filter((s) => s.feats.has(f)).length;
      const pMine = (inMine + 0.5) / (mine.length + 1);
      const pOther = (inOthers + 0.5) / (others.length + 1);
      const w = Math.log(pMine / pOther);
      if (w > 0.5) weights[f] = Math.round(w * 100) / 100; // 그 브랜드에 유리한 특징만
    }
    perBrand[b] = weights;
  }
  return perBrand;
}

function predict(model, feats) {
  const scored = Object.entries(model).map(([brand, weights]) => {
    let score = 0;
    for (const f of feats) if (weights[f]) score += weights[f];
    return { brand, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  if (!top || top.score < MIN_SCORE) return null;
  if (second && top.score - second.score < MIN_MARGIN) return null;
  if (second && second.score > 0 && top.score / second.score < MIN_RATIO) return null;
  return top.brand;
}

// ---- leave-one-out 평가 ----
let hit = 0, abstain = 0, wrong = 0;
const wrongList = [];
let hitNoText = 0, totalNoText = 0;
for (let i = 0; i < samples.length; i++) {
  const test = samples[i];
  const model = train(samples.filter((_, k) => k !== i));
  const pred = predict(model, test.feats);
  if (pred === test.brand) hit++;
  else if (pred === null) { abstain++; wrongList.push(`${test.id}(판정보류)`); }
  else { wrong++; wrongList.push(`${test.id}→${pred}≠${test.brand}`); }
  if (!test.brandInText) {
    totalNoText++;
    if (pred === test.brand) hitNoText++;
  }
}
console.log(`leave-one-out: 정답 ${hit}/${samples.length} (${(100 * hit / samples.length).toFixed(1)}%), 판정보류 ${abstain}, 오답 ${wrong}`);
console.log(`  브랜드명이 택에 없는 ${totalNoText}장 중 정답 ${hitNoText}장`);
if (wrongList.length) console.log('  실패:', wrongList.join(', '));

// ---- 전체 데이터로 최종 학습 후 저장 ----
const full = train(samples);
const stats = Object.entries(full).map(([b, w]) => `${b}:${Object.keys(w).length}`);
console.log('브랜드별 지문 특징 수:', stats.join(', '));

if (process.argv.includes('--write')) {
  const payload = { minScore: MIN_SCORE, minMargin: MIN_MARGIN, minRatio: MIN_RATIO,
    suggestScore: SUGGEST_SCORE, suggestRatio: SUGGEST_RATIO, brands: full };
  const out =
    '// 택 양식 지문 — build_profiles.js가 라벨 택 135장에서 자동 생성 (직접 편집하지 말 것)\n' +
    `// 학습 시각: ${new Date().toISOString()}\n` +
    `// 특징: 고정 문구(w:) + 코드 형태(p:) + 줄 형태(l:), ${MIN_DF}장 이상 등장한 것만\n` +
    'window.TAG_PROFILES = ' + JSON.stringify(payload, null, 1) + ';\n';
  fs.writeFileSync(path.join(WEB, 'tag_profiles.js'), out);
  console.log('tag_profiles.js 저장:', (out.length / 1024).toFixed(1) + 'KB');
}
