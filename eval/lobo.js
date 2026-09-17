// leave-one-BRAND-out: 한 브랜드를 통째로 빼고 학습해, 그 브랜드 택 15장을 넣어본다.
// 학습에 없는 브랜드이므로 "판정 보류"가 정답이고, 다른 브랜드로 단정하면 오답이다.
const fs = require('fs');
const path = require('path');
global.window = globalThis;
for (const f of ['fabric_dict', 'brands', 'parser']) require(path.join(__dirname, '..', f + '.js'));

const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'ground_truth.json'), 'utf8')).filter((t) => !t.exclude);
const samples = truth.map((t) => ({
  id: t.id, brand: t.brand,
  feats: window.tagShapeFeatures(window.splitLines(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'ocr_cache', t.id + '.json'), 'utf8')).fullTextAnnotation.text)),
}));

function train(set) {
  const brands = [...new Set(set.map((s) => s.brand))];
  const df = new Map();
  for (const s of set) for (const f of s.feats) df.set(f, (df.get(f) || 0) + 1);
  const kept = [...df.keys()].filter((f) => df.get(f) >= 3);
  const per = {};
  for (const b of brands) {
    const mine = set.filter((s) => s.brand === b), oth = set.filter((s) => s.brand !== b);
    const w = {};
    for (const f of kept) {
      const a = mine.filter((s) => s.feats.has(f)).length, o = oth.filter((s) => s.feats.has(f)).length;
      const v = Math.log(((a + 0.5) / (mine.length + 1)) / ((o + 0.5) / (oth.length + 1)));
      if (v > 0.5) w[f] = v;
    }
    per[b] = w;
  }
  return per;
}

function predict(model, feats, th) {
  const s = Object.entries(model).map(([b, w]) => {
    let x = 0; for (const f of feats) if (w[f]) x += w[f]; return { b, x };
  }).sort((a, b) => b.x - a.x);
  if (s[0].x < th.score) return null;
  if (s[1] && s[0].x - s[1].x < th.margin) return null;
  if (s[1] && s[1].x > 0 && s[0].x / s[1].x < th.ratio) return null;
  return s[0].b;
}

const SETTINGS = {
  '느슨(점수 3)': { score: 3, margin: 1.5, ratio: 0 },
  '현재(25·배수2)': { score: 25, margin: 1.5, ratio: 2 },
  '강화A(40·배수3)': { score: 40, margin: 1.5, ratio: 3 },
  '강화B(60·배수4)': { score: 60, margin: 1.5, ratio: 4 },
};
const brands = [...new Set(samples.map((s) => s.brand))];
for (const [label, th] of Object.entries(SETTINGS)) {
  let abstain = 0, wrong = 0;
  const detail = [];
  for (const b of brands) {
    const model = train(samples.filter((s) => s.brand !== b));
    const tests = samples.filter((s) => s.brand === b);
    let bw = 0;
    for (const t of tests) {
      const p = predict(model, t.feats, th);
      if (p === null) abstain++; else { wrong++; bw++; }
    }
    detail.push(`${b} ${bw}/${tests.length}`);
  }
  console.log(`\n== ${label} ==`);
  console.log(`판정 보류(정상) ${abstain}/135, 엉뚱한 브랜드로 단정(오답) ${wrong}/135`);
  console.log('  브랜드별 오답:', detail.join(', '));
}
