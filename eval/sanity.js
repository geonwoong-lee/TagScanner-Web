// 평가셋에 없는 가상 택 OCR 텍스트로 이전/신규 파서 출력 비교 (회귀 확인용)
const path = require('path');
global.window = globalThis;
const APP = path.join(__dirname, '..');
const cases = {
  '나이키 영수증형': 'NIKE\nDRI-FIT 반팔 티셔츠\nFQ3867-010\nSIZE: L\n₩45,000',
  '탑텐 일반택': 'TOPTEN\n쿨에어 반팔 티셔츠\nMSD2TS1101\n사이즈 M\n판매가 19,900원',
  '노스페이스': 'THE NORTH FACE\n눕시 재킷\nNJ1DP85A\n호칭\n100\n소비자가격 ₩399,000',
  '해외 달러택': 'LEVI\'S\n501 ORIGINAL\nPC9-00501-0101\n32/32\n$98.00',
  '커버낫 한글택': '커버낫\n어센틱 로고 후드\nC2303HD01BK\nXL\n89,000원',
  'APC 오탐 확인': 'A.P.C.\nPETIT NEW STANDARD\nCOZZI-M09047\n28\n₩290,000',
};
for (const [label, file] of [
  ['v2', path.join(__dirname, 'results', 'parser_v2_original.js')],
  ['v3', path.join(APP, 'parser.js')],
]) {
  // v3는 앱과 같은 순서로 데이터 파일을 먼저 읽는다
  if (label === 'v3') for (const dep of ['fabric_dict', 'brands', 'tag_profiles']) require(path.join(APP, dep + '.js'));
  delete require.cache[require.resolve(file)];
  require(file);
  console.log(`\n=== ${label} ===`);
  for (const [name, text] of Object.entries(cases)) {
    const r = window.parseFields(window.splitLines(text), {});
    console.log(name.padEnd(12), JSON.stringify({ b: r.brand, n: r.productName, p: r.price, s: r.size, sn: r.serial }));
  }
}
