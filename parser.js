// OCR 결과 텍스트에서 필드를 휴리스틱으로 분류
// 완벽하지 않으니 사용자가 화면에서 수정할 수 있게 합니다.
//
// v2 개선점:
// - 인접 라인 병합 브랜드 검색 (UNI + QLO → UNIQLO)
// - 가격 후보 여러 개 중 신뢰도 기반 최선 선택 (원/₩ 우선, 하이픈 있으면 제외)
// - 상품명 여러 줄 병합 (프리미엄리넨 + 셔츠 + (긴팔))
// - 노이즈 라인 필터링 (RFID, 제조년월, 호칭, 바코드, 원산지 등)

// ============================
// 브랜드 사전
// ============================
const BRAND_ALIASES = {
  // 스포츠 / 스트릿
  'NIKE': ['NIKE', 'nike', '나이키'],
  'ADIDAS': ['ADIDAS', 'adidas', '아디다스'],
  'PUMA': ['PUMA', 'puma', '푸마'],
  'REEBOK': ['REEBOK', 'reebok', '리복'],
  'NEW BALANCE': ['NEW BALANCE', 'NEWBALANCE', 'newbalance', '뉴발란스', 'NB'],
  'ASICS': ['ASICS', 'asics', '아식스'],
  'FILA': ['FILA', 'fila', '휠라'],
  'CONVERSE': ['CONVERSE', 'converse', '컨버스'],
  'VANS': ['VANS', 'vans', '반스'],
  'CHAMPION': ['CHAMPION', 'champion', '챔피언'],
  'DESCENTE': ['DESCENTE', 'descente', '데상트'],
  'MLB': ['MLB', '엠엘비'],
  'CARHARTT': ['CARHARTT', 'carhartt', '칼하트'],
  'STUSSY': ['STUSSY', 'stussy', '스투시'],
  'SUPREME': ['SUPREME', 'supreme', '슈프림'],
  'PALACE': ['PALACE', 'palace', '팰리스'],

  // SPA / 대중
  'ZARA': ['ZARA', 'zara', '자라'],
  'UNIQLO': ['UNIQLO', 'uniqlo', 'UNI QLO', '유니클로'],
  'H&M': ['H&M', 'H AND M', '에이치앤엠'],
  'MUJI': ['MUJI', 'muji', '무인양품', '무지'],
  'GAP': ['GAP', 'gap', '갭'],
  'GU': ['GU'],
  'SPAO': ['SPAO', 'spao', '스파오'],
  '8SECONDS': ['8SECONDS', '8SEC', '에잇세컨즈'],
  'MIXXO': ['MIXXO', 'mixxo', '믹소'],
  'TOPTEN': ['TOPTEN', 'topten', '탑텐'],

  // 데님
  "LEVI'S": ["LEVI'S", 'LEVIS', 'levi', '리바이스'],
  'LEE': ['LEE', '리'],
  'WRANGLER': ['WRANGLER', 'wrangler', '랭글러'],
  'TOMMY HILFIGER': ['TOMMY HILFIGER', 'TOMMY', 'tommy', '타미힐피거'],
  'CALVIN KLEIN': ['CALVIN KLEIN', 'CK', '캘빈클라인'],
  'RALPH LAUREN': ['RALPH LAUREN', 'POLO RALPH', '랄프로렌', '폴로'],
  'GUESS': ['GUESS', 'guess', '게스'],

  // 아웃도어
  'THE NORTH FACE': ['THE NORTH FACE', 'NORTH FACE', 'NORTHFACE', '노스페이스'],
  'COLUMBIA': ['COLUMBIA', 'columbia', '컬럼비아'],
  'PATAGONIA': ['PATAGONIA', 'patagonia', '파타고니아'],
  'ARCTERYX': ['ARCTERYX', "ARC'TERYX", 'ARC TERYX', '아크테릭스'],
  'K2': ['K2', '케이투'],
  'BLACK YAK': ['BLACK YAK', 'BLACKYAK', '블랙야크'],

  // 럭셔리
  'GUCCI': ['GUCCI', 'gucci', '구찌'],
  'PRADA': ['PRADA', 'prada', '프라다'],
  'BURBERRY': ['BURBERRY', 'burberry', '버버리'],
  'BALENCIAGA': ['BALENCIAGA', 'balenciaga', '발렌시아가'],
  'LOUIS VUITTON': ['LOUIS VUITTON', 'LV', '루이비통'],
  'CHANEL': ['CHANEL', 'chanel', '샤넬'],
  'DIOR': ['DIOR', 'dior', '디올'],
  'HERMES': ['HERMES', 'HERMÈS', 'hermes', '에르메스'],
  'FENDI': ['FENDI', 'fendi', '펜디'],
  'VERSACE': ['VERSACE', 'versace', '베르사체'],
  'ARMANI': ['ARMANI', 'armani', '아르마니'],
  'MAISON MARGIELA': ['MAISON MARGIELA', 'MMM', 'MM6', '마르지엘라'],
  'ACNE STUDIOS': ['ACNE STUDIOS', 'ACNE', '아크네스튜디오', '아크네'],
  'AMI': ['AMI PARIS', 'AMI', '아미'],
  'KENZO': ['KENZO', 'kenzo', '겐조'],
  'MAISON KITSUNE': ['MAISON KITSUNE', 'KITSUNE', '메종키츠네', '키츠네'],
  'MONCLER': ['MONCLER', 'moncler', '몽클레어'],
  'STONE ISLAND': ['STONE ISLAND', '스톤아일랜드'],
  'CP COMPANY': ['CP COMPANY', 'C.P. COMPANY', 'CP컴퍼니'],
  'A.P.C.': ['A.P.C.', 'APC', '아페쎄'],

  // 한국 브랜드
  'THISISNEVERTHAT': ['THISISNEVERTHAT', 'TNT', '디스이즈네버댓'],
  'COVERNAT': ['COVERNAT', 'covernat', '커버낫'],
  'ANDERSSON BELL': ['ANDERSSON BELL', 'andersson', '앤더슨벨'],
  'MISCHIEF': ['MISCHIEF', 'mischief', '미스치프'],
  'MUSINSA STANDARD': ['MUSINSA STANDARD', '무신사스탠다드'],
  'ADER ERROR': ['ADER ERROR', 'ADER', '아더에러'],
  'GENTLE MONSTER': ['GENTLE MONSTER', '젠틀몬스터'],
  'BOY LONDON': ['BOY LONDON', 'BOYLONDON', '보이런던'],
  'DISNEY': ['DISNEY', 'disney', '디즈니'],
};

// 브랜드 별칭 → 정규명 lookup 테이블
const BRAND_LOOKUP = (() => {
  const map = new Map();
  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      map.set(normalize(alias), canonical);
    }
    map.set(normalize(canonical), canonical);
  }
  return map;
})();

// 문자열 정규화 (매칭용)
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\-_.'"]+/g, '')
    .replace(/&/g, 'and');
}

// 카테고리 자동 감지 키워드
const CATEGORY_KEYWORDS = {
  '아우터': [
    '자켓', '재킷', 'jacket', '코트', 'coat', '패딩', 'padding', '점퍼', 'jumper',
    '블레이저', 'blazer', '가디건', 'cardigan', '베스트', 'vest', '조끼',
    '트렌치', 'trench', '무스탕', '롱코트', '숏코트', '푸퍼', 'puffer',
    '아노락', 'anorak', '윈드브레이커', 'windbreaker', 'parka', '파카',
  ],
  '상의': [
    '티셔츠', 't-shirt', 'tshirt', 'tee', '셔츠', 'shirt', '니트', 'knit',
    '스웨터', 'sweater', '후드', 'hoodie', '맨투맨', '스웻', 'sweatshirt',
    '블라우스', 'blouse', '탱크', 'tank', '나시', '반팔', '긴팔',
    '카라티', '폴로', 'polo', '터틀넥', 'turtleneck', '리넨셔츠',
  ],
  '하의': [
    '바지', '팬츠', 'pants', 'pant', '청바지', '진', 'jeans', 'denim',
    '슬랙스', 'slacks', '치마', '스커트', 'skirt', '레깅스', 'leggings',
    '쇼츠', 'shorts', '반바지', '조거', 'jogger', '스웨트팬츠', 'sweatpants',
    '트라우저', 'trouser', '와이드', '스키니', '스트레이트',
  ],
  '신발': [
    '운동화', '스니커즈', 'sneakers', 'sneaker', '구두', 'shoes', 'shoe',
    '부츠', 'boots', 'boot', '샌들', 'sandals', 'sandal', '슬리퍼', 'slippers',
    '로퍼', 'loafer', '워커', 'walker', '힐', 'heel', '펌프스', 'pumps',
    '크록스', 'crocs',
  ],
  '가방': [
    '가방', 'bag', '백팩', 'backpack', '핸드백', 'handbag', '토트', 'tote',
    '숄더', 'shoulder', '크로스백', 'crossbody', '클러치', 'clutch',
    '에코백', '보스턴', 'boston', '더플', 'duffel', '파우치', 'pouch',
    '지갑', 'wallet', '카드지갑',
  ],
  '모자': [
    '모자', 'hat', '캡', 'cap', '비니', 'beanie', '버킷햇', 'bucket',
    '페도라', 'fedora', '베레모', 'beret', '헌팅캡', '볼캡',
  ],
  '액세서리': [
    '벨트', 'belt', '시계', 'watch', '귀걸이', 'earring', '목걸이', 'necklace',
    '반지', 'ring', '팔찌', 'bracelet', '안경', 'glasses', '선글라스', 'sunglasses',
    '스카프', 'scarf', '머플러', 'muffler', '넥타이', 'tie', '양말', 'socks',
    '장갑', 'gloves',
  ],
};

// 노이즈 라인 판별 (상품명/브랜드 후보에서 제외할 것들)
const NOISE_PATTERNS = [
  /^RFID$/i,
  /^제조[년월]/,
  /^\d{4}년\s?\d{1,2}월/,
  /^호칭$/,
  /^신체치수/,
  /^가슴둘레/,
  /^허리둘레/,
  /^길이/,
  /^사이즈$/i,
  /^size$/i,
  /^brand$/i,
  /^made\s?in/i,
  /^\d{6,}$/, // 바코드 등 순수 숫자 6자 이상
  /^100%$/,
  /^\d{1,3}%$/, // 소재 비율
  /^cm$/i,
  /^\d+\s?[-–~]\s?\d+\s?cm/i, // 치수 (112-120cm 등)
  /^(cotton|polyester|nylon|wool|silk|linen|acrylic|spandex|elastane|rayon|viscose)$/i,
  /^(면|폴리에스터|나일론|울|실크|린넨|아크릴|스판덱스|레이온|비스코스|마)$/,
  /^(korea|china|vietnam|japan|india|usa|italy|france|germany|bangladesh|indonesia)$/i,
  /^(한국|중국|베트남|일본|인도|미국|이탈리아|프랑스|독일|방글라데시|인도네시아)$/,
  /^\d{3,}-\d{3,}-\d{3,}/, // 시리얼 유사 코드 (긴 하이픈 숫자)
  /^\(\d+-\d+\)$/,
  /^\d+-\d+$/,
  // 반복 문자 (OCR 오인식 - 예: "금금", "ㅁㅁ")
  /^(.)\1{1,}$/,
  // 한자/일본어 단독 1~3자 (OCR 오인식 가능성)
  /^[一-鿿぀-ヿ]{1,3}$/,
  // 순수 특수문자만
  /^[^A-Za-z0-9가-힣]+$/,
];

function isNoiseLine(line) {
  const s = line.trim();
  if (!s) return true;
  for (const pat of NOISE_PATTERNS) {
    if (pat.test(s)) return true;
  }
  return false;
}

// ============================
// 브랜드 검색 (단일 + 인접 라인 병합 + 떨어진 라인 병합)
// ============================
function findBrandInLines(lines) {
  // 1) 단일 라인 검사
  for (let i = 0; i < lines.length; i++) {
    const found = matchBrand(lines[i]);
    if (found) return { canonical: found, indices: [i] };
  }
  // 2) 인접 2~3 라인 병합 검사 (UNI + QLO 붙어있으면)
  for (let win = 2; win <= 3; win++) {
    for (let i = 0; i <= lines.length - win; i++) {
      const joined = lines.slice(i, i + win).join('');
      const found = matchBrand(joined);
      if (found) {
        return {
          canonical: found,
          indices: Array.from({ length: win }, (_, k) => i + k),
        };
      }
    }
  }
  // 3) 떨어진 라인 병합 (UNI + [프리미엄리넨] + QLO 같은 케이스)
  // 짧은 영문/숫자 라인들만 후보로 뽑아서 조합 시도
  const brandCandidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 짧고(10자 이하), 영문/숫자/특수문자로만 구성
    if (line.length >= 1 && line.length <= 10 && /^[A-Za-z0-9&'.\-\s]+$/.test(line)) {
      brandCandidates.push({ text: line, index: i });
    }
  }
  // 2개 조합 (순서 유지)
  for (let a = 0; a < brandCandidates.length; a++) {
    for (let b = a + 1; b < brandCandidates.length; b++) {
      const joined = brandCandidates[a].text + brandCandidates[b].text;
      const found = matchBrand(joined);
      if (found) {
        return {
          canonical: found,
          indices: [brandCandidates[a].index, brandCandidates[b].index],
        };
      }
    }
  }
  // 3개 조합
  for (let a = 0; a < brandCandidates.length; a++) {
    for (let b = a + 1; b < brandCandidates.length; b++) {
      for (let c = b + 1; c < brandCandidates.length; c++) {
        const joined = brandCandidates[a].text + brandCandidates[b].text + brandCandidates[c].text;
        const found = matchBrand(joined);
        if (found) {
          return {
            canonical: found,
            indices: [brandCandidates[a].index, brandCandidates[b].index, brandCandidates[c].index],
          };
        }
      }
    }
  }
  return null;
}

function matchBrand(line) {
  const norm = normalize(line);
  if (!norm) return null;
  if (BRAND_LOOKUP.has(norm)) return BRAND_LOOKUP.get(norm);
  // 부분 일치 (긴 별칭부터)
  const sortedAliases = Array.from(BRAND_LOOKUP.keys()).sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    if (alias.length >= 3 && norm.includes(alias)) {
      return BRAND_LOOKUP.get(alias);
    }
  }
  return null;
}

// ============================
// 카테고리 감지
// ============================
function detectCategory(text) {
  const norm = String(text || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (norm.includes(kw.toLowerCase())) return cat;
    }
  }
  return '';
}

// ============================
// 가격 후보 수집 + 신뢰도 랭킹
// ============================
function extractPrice(lines, used) {
  const candidates = [];

  const priceKeywordRe =
    /(가격|정가|판매가|소비자가|price|msrp|retail)\s*:?\s*([₩￦W$]?\s?[\d,]+\s?(?:원|₩|￦|krw|won)?)/i;
  const pricePatterns = [
    { re: /([₩￦]\s?[\d,]+)/, score: 100, needsKrwHint: false },
    { re: /([\d,]+\s?원)/, score: 100, needsKrwHint: false },
    { re: /(KRW\s?[\d,]+)/i, score: 95, needsKrwHint: false },
    { re: /(W\s?[\d,]{3,})/, score: 60, needsKrwHint: false },
    { re: /(\$\s?[\d,]+(?:\.\d+)?)/, score: 40, needsKrwHint: false },
    { re: /(USD\s?[\d,]+(?:\.\d+)?)/i, score: 40, needsKrwHint: false },
  ];

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i];

    // 하이픈이 포함된 라인은 시리얼 가능성 → 가격에서 제외
    const hasHyphen = /-/.test(line);

    // 키워드 매칭 (최우선)
    const kw = line.match(priceKeywordRe);
    if (kw) {
      const val = kw[2].trim();
      const num = parseInt(val.replace(/[^\d]/g, ''), 10);
      if (isValidPriceNumber(num)) {
        candidates.push({ value: val, num, score: 200, lineIdx: i });
      }
    }

    // 패턴 매칭
    for (const { re, score } of pricePatterns) {
      const m = line.match(re);
      if (!m) continue;
      const val = m[1].trim();
      const num = parseInt(val.replace(/[^\d]/g, ''), 10);
      if (!isValidPriceNumber(num)) continue;

      let s = score;
      // 하이픈 있으면 시리얼 유사 코드 감점
      if (hasHyphen && !/[₩￦원]/.test(val) && !/^KRW/i.test(val)) {
        s -= 50;
      }
      // 라인 위치가 뒤일수록 실제 가격일 확률 (태그 하단에 붙음)
      s += (i / lines.length) * 20;
      // 라인 자체가 이 매칭이 대부분이면 신뢰도 up
      if (line.length <= val.length + 5) s += 15;

      candidates.push({ value: val, num, score: s, lineIdx: i });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function isValidPriceNumber(num) {
  return !isNaN(num) && num >= 100 && num <= 100000000;
}

// ============================
// 사이즈 추출
// ============================
function extractSize(lines, used) {
  const sizeKeywordRe = /(size|사이즈|호칭)\s*:?\s*([A-Za-z0-9./\-\s]+)/i;
  const jeansRe = /^\s*(\d{2}\s*[Ww]?\s*[\/xX]\s*\d{2}\s*[Ll]?)\s*$/;
  const braRe = /^\s*(\d{2,3}[ABCDE])\s*$/i;
  const standardRe = /^\s*(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|FREE|F|ONE\s?SIZE|프리)\s*$/i;
  const numericRe = /^\s*(\d{2,3})\s*$/;

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i];

    const kw = line.match(sizeKeywordRe);
    if (kw) {
      const val = kw[2].trim().split(/\s+/)[0];
      if (val && val.length <= 15) return { value: val, lineIdx: i };
    }
    if (jeansRe.test(line)) return { value: line.trim(), lineIdx: i };
    if (braRe.test(line)) return { value: line.trim().toUpperCase(), lineIdx: i };
    if (standardRe.test(line)) return { value: line.trim().toUpperCase(), lineIdx: i };
    if (numericRe.test(line)) {
      const n = parseInt(line.trim(), 10);
      if ((n >= 24 && n <= 50) || (n >= 80 && n <= 130) || (n >= 220 && n <= 330)) {
        return { value: line.trim(), lineIdx: i };
      }
    }
  }
  return null;
}

// ============================
// 시리얼 추출
// ============================
function extractSerial(lines, used) {
  const serialKeywordRe =
    /(serial|style|model|item|품번|모델명|스타일|s\/?n|art\.?\s?no|no\.|reference|ref\.?)\s*:?\s*([A-Za-z0-9\-\/_]+)/i;
  const serialPattern = /^[A-Z0-9][A-Z0-9\-\/_]{5,}$/i;

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i];

    const kw = line.match(serialKeywordRe);
    if (kw) return { value: kw[2].trim(), lineIdx: i };

    // 라인이 시리얼 하나로만 구성된 경우 (권장)
    if (serialPattern.test(line.trim()) && /[A-Za-z]/.test(line) && /\d/.test(line) && !isCommonWord(line.trim())) {
      return { value: line.trim(), lineIdx: i };
    }

    // 라인 안의 토큰
    const tokens = line.split(/\s+/);
    for (const t of tokens) {
      if (
        serialPattern.test(t) &&
        /[A-Za-z]/.test(t) &&
        /\d/.test(t) &&
        !isCommonWord(t)
      ) {
        return { value: t, lineIdx: i };
      }
    }
  }
  return null;
}

function isCommonWord(token) {
  const common = ['MADE', 'IN', 'KOREA', 'CHINA', 'VIETNAM', 'JAPAN', 'INDIA',
                  'USA', 'ITALY', 'FRANCE', 'GERMANY', 'BANGLADESH', 'INDONESIA',
                  'COTTON', 'POLYESTER', 'NYLON', 'WOOL', 'SILK', 'LEATHER',
                  'MACHINE', 'WASH', 'HAND', 'DRY', 'BLEACH', 'IRON'];
  return common.includes(token.toUpperCase());
}

// ============================
// 상품명 추출 (여러 줄 병합)
// ============================
function extractProductName(lines, used) {
  // 남은 라인 중 노이즈 아닌 것들의 인덱스만 수집
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (isNoiseLine(lines[i])) continue;
    // 한글이 있거나 길이 3자 이상인 것만 후보
    const hasKorean = /[가-힣]/.test(lines[i]);
    const isMeaningful = hasKorean || lines[i].length >= 3;
    if (!isMeaningful) continue;
    candidates.push(i);
  }

  if (candidates.length === 0) return null;

  // 연속된 인덱스 그룹으로 묶기
  const groups = [];
  let current = [candidates[0]];
  for (let k = 1; k < candidates.length; k++) {
    if (candidates[k] === current[current.length - 1] + 1) {
      current.push(candidates[k]);
    } else {
      groups.push(current);
      current = [candidates[k]];
    }
  }
  groups.push(current);

  // 각 그룹의 텍스트 병합 후 점수 계산
  let best = { text: '', score: -1, indices: [] };
  for (const g of groups) {
    const joined = g.map((i) => lines[i]).join(' ').trim();
    // 점수: 길이 + 한글 라인 수 * 3 + 그룹 크기 * 2
    const koreanLines = g.filter((i) => /[가-힣]/.test(lines[i])).length;
    const score = joined.length + koreanLines * 3 + g.length * 2;
    if (score > best.score) {
      best = { text: joined, score, indices: g };
    }
  }

  return best.indices.length > 0 ? best : null;
}

// ============================
// 메인 파서
// ============================
window.parseFields = function (lines) {
  const result = {
    productName: '',
    brand: '',
    price: '',
    size: '',
    serial: '',
    category: '',
  };

  if (!lines || lines.length === 0) return result;

  const used = new Set();

  // 1) 브랜드 (사전 매칭 우선, 인접 라인 병합 지원)
  const brandMatch = findBrandInLines(lines);
  if (brandMatch) {
    result.brand = brandMatch.canonical;
    brandMatch.indices.forEach((i) => used.add(i));
  }

  // 2) 사이즈
  const sizeMatch = extractSize(lines, used);
  if (sizeMatch) {
    result.size = sizeMatch.value;
    used.add(sizeMatch.lineIdx);
  }

  // 3) 시리얼
  const serialMatch = extractSerial(lines, used);
  if (serialMatch) {
    result.serial = serialMatch.value;
    used.add(serialMatch.lineIdx);
  }

  // 4) 가격 (여러 후보 중 최선 선택)
  const priceMatch = extractPrice(lines, used);
  if (priceMatch) {
    result.price = priceMatch.value;
    used.add(priceMatch.lineIdx);
  }

  // 5) 브랜드 폴백 (사전에 없으면 의미있는 첫 라인)
  if (!result.brand) {
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i) || isNoiseLine(lines[i])) continue;
      const line = lines[i];
      // 길이 조건 + 순수 숫자 아님 + 최소 2자 이상 알파벳/한글 포함
      if (
        line.length >= 2 &&
        line.length <= 30 &&
        !/^\d+$/.test(line) &&
        /[A-Za-z가-힣]{2,}/.test(line)
      ) {
        result.brand = line;
        used.add(i);
        break;
      }
    }
  }

  // 6) 상품명 (연속된 한글 라인 병합)
  const nameMatch = extractProductName(lines, used);
  if (nameMatch) {
    result.productName = nameMatch.text;
    nameMatch.indices.forEach((i) => used.add(i));
  }

  // 7) 카테고리 자동 감지 (상품명 + 브랜드 + 전체 텍스트)
  const searchText = [result.productName, result.brand, ...lines].join(' ');
  result.category = detectCategory(searchText);

  return result;
};

window.splitLines = function (rawText) {
  return (rawText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
};
