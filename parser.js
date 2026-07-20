// OCR 결과 텍스트에서 5개 필드를 휴리스틱으로 분류
// 완벽하지 않으니 사용자가 화면에서 수정할 수 있게 합니다.
//
// 규칙
// - price: 원/₩/$/￦ 기호 + 숫자, 또는 "PRICE/가격" 키워드 다음
// - size: 사이즈 키워드 또는 S/M/L/XL/XXL/FREE 또는 숫자(85/90/95, 27/28...)
// - serial: 영문+숫자 혼합 7자 이상, 또는 STYLE/SERIAL/품번 키워드 뒤
// - brand: 위에서 안 잡힌 첫 의미있는 라인
// - productName: 남은 라인 중 가장 긴 것

window.parseFields = function (lines) {
  const result = {
    productName: '',
    brand: '',
    price: '',
    size: '',
    serial: '',
  };

  if (!lines || lines.length === 0) return result;

  const used = new Set();

  // 1. 가격
  const pricePatterns = [
    /([₩￦]\s?[\d,]+)/,
    /([\d,]+\s?원)/,
    /(\$\s?[\d,]+(?:\.\d+)?)/,
    /(KRW\s?[\d,]+)/i,
    /(USD\s?[\d,]+(?:\.\d+)?)/i,
  ];
  const priceKeywordRe =
    /(가격|정가|판매가|소비자가|price)\s*:?\s*([\d,]+\s?(?:원|₩|￦)?)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kw = line.match(priceKeywordRe);
    if (kw && !result.price) {
      result.price = kw[2].trim();
      used.add(i);
      break;
    }
    for (const re of pricePatterns) {
      const m = line.match(re);
      if (m) {
        result.price = m[1].trim();
        used.add(i);
        break;
      }
    }
    if (result.price) break;
  }

  // 2. 사이즈
  const sizeKeywordRe = /(size|사이즈)\s*:?\s*([A-Za-z0-9./\-]+)/i;
  const sizeStandalone =
    /^\s*(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|FREE|F|ONE\s?SIZE)\s*$/i;
  const numericSize = /^\s*(\d{2,3})\s*$/;
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i];
    const kw = line.match(sizeKeywordRe);
    if (kw && !result.size) {
      result.size = kw[2].trim();
      used.add(i);
      break;
    }
    if (sizeStandalone.test(line) && !result.size) {
      result.size = line.trim();
      used.add(i);
      break;
    }
    if (numericSize.test(line) && !result.size) {
      const n = parseInt(line.trim(), 10);
      if ((n >= 25 && n <= 50) || (n >= 80 && n <= 130)) {
        result.size = line.trim();
        used.add(i);
        break;
      }
    }
  }

  // 3. 시리얼
  const serialKeywordRe =
    /(serial|style|model|item|품번|모델명|스타일|s\/?n|art\.?\s?no)\s*:?\s*([A-Za-z0-9\-\/]+)/i;
  const serialPattern = /^[A-Z0-9][A-Z0-9\-\/]{6,}$/i;
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i];
    const kw = line.match(serialKeywordRe);
    if (kw && !result.serial) {
      result.serial = kw[2].trim();
      used.add(i);
      break;
    }
    const tokens = line.split(/\s+/);
    for (const t of tokens) {
      if (
        serialPattern.test(t) &&
        /[A-Za-z]/.test(t) &&
        /\d/.test(t) &&
        !result.serial
      ) {
        result.serial = t;
        used.add(i);
        break;
      }
    }
    if (result.serial) break;
  }

  // 4. 브랜드: 사용 안 된 것 중 첫 의미있는 라인
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i];
    if (line.length >= 2 && line.length <= 30) {
      result.brand = line;
      used.add(i);
      break;
    }
  }

  // 5. 상품명: 남은 라인 중 가장 긴 것
  let longest = '';
  let longestIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (lines[i].length > longest.length) {
      longest = lines[i];
      longestIdx = i;
    }
  }
  if (longestIdx >= 0) {
    result.productName = longest;
    used.add(longestIdx);
  }

  return result;
};

window.splitLines = function (rawText) {
  return (rawText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
};
