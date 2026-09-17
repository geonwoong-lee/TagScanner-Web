// 캐시된 Vision 응답에 parser.js를 돌려 정답과 항목별로 비교한다.
// 사용: node evaluate.js [parser.js 경로] [결과 저장 이름]
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const parserPath = path.resolve(process.argv[2] || path.join(ROOT, '..', 'parser.js'));
const outName = process.argv[3] || 'baseline';

global.window = globalThis;
// 앱과 같은 순서로 데이터 파일을 먼저 읽는다 (없으면 건너뜀)
for (const dep of ['fabric_dict.js', 'brands.js', 'tag_profiles.js']) {
  const p = path.join(path.dirname(parserPath), dep);
  if (fs.existsSync(p)) require(p);
}
require(parserPath);

const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'ground_truth.json'), 'utf8'));

// ---- 정규화 ----
const BRAND_CANON = {
  '8seconds': ['8seconds', '8 seconds', '에잇세컨즈'],
  'spao': ['spao', '스파오'],
  'musinsastandard': ['musinsa standard', 'musinsastandard', '무신사스탠다드', '무신사 스탠다드'],
  'uniqlo': ['uniqlo', '유니클로'],
  'zara': ['zara', '자라'],
  'cos': ['cos', '코스'],
  'muji': ['muji', '무인양품'],
  'h&m': ['h&m', 'hm', 'h & m', '에이치앤엠'],
  'arket': ['arket', '아르켓'],
};
const squash = (s) => String(s || '').toLowerCase().replace(/[\s\-_.·]/g, '');
function canonBrand(s) {
  const q = squash(s);
  if (!q) return '';
  for (const [canon, aliases] of Object.entries(BRAND_CANON)) {
    if (aliases.some((a) => squash(a) === q)) return canon;
  }
  return q;
}
const digits = (s) => String(s ?? '').replace(/[^0-9]/g, '');
const normSize = (s) => String(s || '').toUpperCase().replace(/\s/g, '');
// OCR이 흔히 헷갈리는 O/0은 같은 글자로 본다
const normSerial = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0');
const normName = (s) => String(s || '').replace(/[\s\[\]()]/g, '').toLowerCase();

function similarity(a, b) {
  if (!a && !b) return 1;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[m][n] / Math.max(m, n);
}

const judge = {
  brand: (p, g) => canonBrand(p) === canonBrand(g),
  price: (p, g) => digits(p) !== '' && Number(digits(p)) === g,
  // "XL(86-88)" 정답에 "XL" 예측, "79cm"에 "79"는 맞은 것으로 본다
  size: (p, g) => {
    const a = normSize(p), b = normSize(g);
    if (!a) return false;
    return a === b || b.startsWith(a + '(') || b === a + 'CM' || a.startsWith(b + '(');
  },
  // 공백/하이픈/슬래시 차이는 무시, 한쪽이 다른 쪽을 포함하면(6자 이상) 인정
  serial: (p, g) => {
    const a = normSerial(p), b = normSerial(g);
    if (a.length < 6) return false;
    return a === b || a.includes(b) || b.includes(a);
  },
  // [고객감사] 같은 앞머리 태그는 라벨마다 포함 여부가 달라 있는/없는 경우 중 높은 쪽으로 본다
  name: (p, g) => {
    const variants = (s) => [s, String(s || '').replace(/^\s*\[[^\]]*\]\s*/, '')];
    return variants(p).some((a) => variants(g).some((b) => similarity(normName(a), normName(b)) >= 0.8));
  },
};

const rows = [];
for (const t of truth) {
  if (t.exclude) continue;
  const resp = JSON.parse(fs.readFileSync(path.join(ROOT, 'ocr_cache', t.id + '.json'), 'utf8'));
  const text = resp.fullTextAnnotation?.text || '';
  const logos = (resp.logoAnnotations || []).map((l) => ({ description: l.description, score: l.score || 0 }));
  const pred = window.parseFields(window.splitLines(text), { logos });
  const r = { id: t.id, truth: t, pred, ok: {} };
  if (t.brand !== 'UNKNOWN_ROTATED') r.ok.brand = judge.brand(pred.brand, t.brand);
  if (t.price != null) r.ok.price = judge.price(pred.price, t.price);
  r.ok.size = judge.size(pred.size, t.size);
  r.ok.serial = judge.serial(pred.serial, t.serial);
  if (t.name) r.ok.name = judge.name(pred.productName, t.name);
  rows.push(r);
}

// ---- 집계 ----
const FIELDS = ['brand', 'price', 'size', 'serial', 'name'];
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : '-');
const summary = {};
console.log(`\n== ${outName} (${path.relative(ROOT, parserPath)}) ==`);
for (const f of FIELDS) {
  const scored = rows.filter((r) => f in r.ok);
  const hit = scored.filter((r) => r.ok[f]).length;
  summary[f] = { hit, n: scored.length };
  console.log(`${f.padEnd(7)} ${String(hit).padStart(3)}/${String(scored.length).padEnd(3)} ${pct(hit, scored.length)}%`);
}

const brands = [...new Set(rows.map((r) => r.truth.brand))];
console.log('\n브랜드별 (brand / price / size / serial / name)');
for (const b of brands) {
  const rs = rows.filter((r) => r.truth.brand === b);
  const cells = FIELDS.map((f) => {
    const s = rs.filter((r) => f in r.ok);
    return s.length ? `${s.filter((r) => r.ok[f]).length}/${s.length}` : '  -  ';
  });
  console.log(`${b.padEnd(17)} ${cells.map((c) => c.padStart(5)).join('  ')}`);
}

fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'results', outName + '.json'),
  JSON.stringify({ parser: parserPath, summary, rows }, null, 1));
