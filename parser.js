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
  // '무지'는 무늬 없음을 뜻하는 말로도 쓰여 별칭에서 제외
  'MUJI': ['MUJI', 'muji', 'muji.com', '무인양품'],
  'GAP': ['GAP', 'gap', '갭'],
  'GU': ['GU'],
  'SPAO': ['SPAO', 'spao', '스파오'],
  '8SECONDS': ['8SECONDS', '8SEC', '에잇세컨즈'],
  'MIXXO': ['MIXXO', 'mixxo', '믹소'],
  'TOPTEN': ['TOPTEN', 'topten', '탑텐'],

  // 데님
  "LEVI'S": ["LEVI'S", 'LEVIS', 'levi', '리바이스'],
  'LEE': ['LEE', 'lee.com'],
  'WRANGLER': ['WRANGLER', 'wrangler', '랭글러'],
  'TOMMY HILFIGER': ['TOMMY HILFIGER', 'TOMMY', 'tommy', '타미힐피거'],
  'CALVIN KLEIN': ['CALVIN KLEIN', 'CK', '캘빈클라인'],
  // '폴로'는 옷 종류(폴로셔츠)라 별칭에서 제외
  'RALPH LAUREN': ['RALPH LAUREN', 'POLO RALPH LAUREN', 'POLO RALPH', 'ralphlauren.com', '랄프로렌', '폴로랄프로렌'],
  'GUESS': ['GUESS', 'guess', '게스'],

  // 아웃도어
  'THE NORTH FACE': ['THE NORTH FACE', 'NORTH FACE', 'NORTHFACE', '노스페이스'],
  'COLUMBIA': ['COLUMBIA', 'columbia', '컬럼비아'],
  'PATAGONIA': ['PATAGONIA', 'patagonia', '파타고니아'],
  "ARC'TERYX": ['ARCTERYX', "ARC'TERYX", 'ARC TERYX', 'arcteryx.com', '아크테릭스'],
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
  // 'TNT'는 이 브랜드의 약칭이 아니라 오탐만 만들어 제외
  'THISISNEVERTHAT': ['THISISNEVERTHAT', 'thisisneverthat.com', '디스이즈네버댓'],
  'COVERNAT': ['COVERNAT', 'covernat', '커버낫'],
  'ANDERSSON BELL': ['ANDERSSON BELL', 'andersson', '앤더슨벨'],
  'MISCHIEF': ['MISCHIEF', 'mischief', '미스치프'],
  'MUSINSA STANDARD': ['MUSINSA STANDARD', '무신사스탠다드'],
  'ADER ERROR': ['ADER ERROR', 'ADER', '아더에러'],
  'GENTLE MONSTER': ['GENTLE MONSTER', '젠틀몬스터'],
  'BOY LONDON': ['BOY LONDON', 'BOYLONDON', '보이런던'],
  'DISNEY': ['DISNEY', 'disney', '디즈니'],
};

// v3 추가: 평가셋(택 사진 135장)에서 확인한 브랜드
Object.assign(BRAND_ALIASES, {
  'COS': ['COS', 'cos.com', '코스'],
  'ARKET': ['ARKET', 'arket', '아르켓'],
  '& OTHER STORIES': ['& OTHER STORIES', 'OTHER STORIES', '앤아더스토리즈'],
});
// v3 추가: 수집한 로고 100종(카드 021~100) 중 사전에 없던 브랜드
// 택에 브랜드명이 글자로 찍혀 있어도 사전에 없으면 못 잡으므로 함께 등록한다
Object.assign(BRAND_ALIASES, {
  // SPA / 데일리
  'MANGO': ['MANGO', 'mango.com', '망고'],
  'BERSHKA': ['BERSHKA', 'bershka.com', '베르쉬카'],
  'PULL&BEAR': ['PULL&BEAR', 'PULL AND BEAR', 'pullandbear.com', '풀앤베어'],
  'STRADIVARIUS': ['STRADIVARIUS', 'stradivarius.com', '스트라디바리우스'],
  'OLD NAVY': ['OLD NAVY', 'oldnavy.com', '올드네이비'],
  'ABERCROMBIE & FITCH': ['ABERCROMBIE & FITCH', 'ABERCROMBIE', 'A&F', 'abercrombie.com', '아베크롬비'],
  'AMERICAN EAGLE': ['AMERICAN EAGLE', 'AEO', 'ae.com', '아메리칸이글'],
  'ARITZIA': ['ARITZIA', 'aritzia.com', '아리치아'],
  'J.CREW': ['J.CREW', 'JCREW', 'jcrew.com', '제이크루'],
  'BANANA REPUBLIC': ['BANANA REPUBLIC', 'bananarepublic.com', '바나나리퍼블릭'],
  'URBAN OUTFITTERS': ['URBAN OUTFITTERS', 'urbanoutfitters.com', '어반아웃피터스'],
  'EVERLANE': ['EVERLANE', 'everlane.com', '에버레인'],

  // 스포츠 / 스니커즈 / 아웃도어
  'UNDER ARMOUR': ['UNDER ARMOUR', 'UNDERARMOUR', 'underarmour.com', '언더아머'],
  'LULULEMON': ['LULULEMON', 'lululemon.com', '룰루레몬'],
  'ON RUNNING': ['ON RUNNING', 'on-running.com', '온러닝'],
  'SALOMON': ['SALOMON', 'salomon.com', '살로몬'],
  'HOKA': ['HOKA', 'HOKA ONE ONE', 'hoka.com', '호카'],
  'SNOW PEAK': ['SNOW PEAK', 'SNOWPEAK', 'snowpeak.com', '스노우피크'],
  'MONTBELL': ['MONTBELL', 'MONT-BELL', 'montbell.com', '몽벨'],
  'HELLY HANSEN': ['HELLY HANSEN', 'hellyhansen.com', '헬리한센'],
  'FJALLRAVEN': ['FJALLRAVEN', 'FJÄLLRÄVEN', 'fjallraven.com', '피엘라벤'],
  'MAMMUT': ['MAMMUT', 'mammut.com', '마무트'],
  'MERRELL': ['MERRELL', 'merrell.com', '메렐'],
  'TIMBERLAND': ['TIMBERLAND', 'timberland.com', '팀버랜드'],
  'DR. MARTENS': ['DR. MARTENS', 'DR MARTENS', 'DRMARTENS', 'drmartens.com', '닥터마틴'],
  'CROCS': ['CROCS', 'crocs.com', '크록스'],
  'BIRKENSTOCK': ['BIRKENSTOCK', 'birkenstock.com', '버켄스탁'],
  'SKECHERS': ['SKECHERS', 'skechers.com', '스케쳐스'],

  // 캐주얼 / 데님 / 컨템포러리
  'DICKIES': ['DICKIES', 'dickies.com', '디키즈'],
  'LACOSTE': ['LACOSTE', 'lacoste.com', '라코스테'],
  'FRED PERRY': ['FRED PERRY', 'fredperry.com', '프레드페리'],
  'PAUL SMITH': ['PAUL SMITH', 'paulsmith.com', '폴스미스'],
  'DIESEL': ['DIESEL', 'diesel.com', '디젤'],
  'G-STAR RAW': ['G-STAR RAW', 'G-STAR', 'GSTAR', 'g-star.com', '지스타로우'],
  'SUPERDRY': ['SUPERDRY', 'superdry.com', '수퍼드라이'],
  'ALLSAINTS': ['ALLSAINTS', 'ALL SAINTS', 'allsaints.com', '올세인츠'],

  // 스트리트 / 디자이너
  'BAPE': ['BAPE', 'A BATHING APE', 'bape.com', '베이프'],
  'KITH': ['KITH', 'kith.com'],
  'FEAR OF GOD': ['FEAR OF GOD', 'fearofgod.com', '피어오브갓'],
  // '오프화이트'는 색상명으로 쓰여(택의 색상 줄) 별칭에서 제외
  'OFF-WHITE': ['OFF-WHITE', 'OFFWHITE', 'off---white.com'],
  'HUMAN MADE': ['HUMAN MADE', 'humanmade.jp', '휴먼메이드'],
  'MARNI': ['MARNI', 'marni.com', '마르니'],
});

BRAND_ALIASES['8SECONDS'].push('8 seconds', '8seconds.com');
BRAND_ALIASES['MUSINSA STANDARD'].push('musinsa standard', '무신사 스탠다드');
BRAND_ALIASES['SPAO'].push('spao.com');
BRAND_ALIASES['ZARA'].push('zara.com');
BRAND_ALIASES['MUJI'].push('무지루시');

// 브랜드 기준 데이터(brands.js)를 사전에 자동 병합
// 로고 100종에서 정리한 표기명·한글명·공식몰 주소를 별칭으로 등록한다
if (typeof window !== 'undefined' && Array.isArray(window.BRAND_CATALOG)) {
  const findCanonical = (name) => {
    const n = normalize(name);
    for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
      if (normalize(canonical) === n || aliases.some((a) => normalize(a) === n)) return canonical;
    }
    return null;
  };
  // 색상·옷 종류 등 일반 명사와 겹치는 한글명은 별칭으로 쓰지 않는다 (택의 색상 줄을 브랜드로 오인)
  const KO_ALIAS_BLOCKLIST = ['오프화이트', '무지', '폴로', '리', '키스', '갭', '온'];
  for (const b of window.BRAND_CATALOG) {
    const key = findCanonical(b.name) || b.name.toUpperCase();
    const list = (BRAND_ALIASES[key] = BRAND_ALIASES[key] || []);
    const ko = b.ko && b.ko.length >= 2 && !KO_ALIAS_BLOCKLIST.includes(b.ko) ? b.ko : null;
    for (const alias of [b.name, ko, b.domain]) {
      if (alias && !list.some((a) => normalize(a) === normalize(alias))) list.push(alias);
    }
  }
}

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
// Stüssy/Fjällräven/Maison Kitsuné처럼 악센트가 붙은 표기를 같은 값으로 취급한다
function normalize(s) {
  return String(s || '')
    // 악센트만 떼고 다시 결합한다. NFD 상태로 두면 한글이 자모로 쪼개져
    // "목부분" 안에 "모"(울)가 있는 것처럼 잡힌다.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
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
  // 병합 문자열은 부분 일치를 허용하면 PAP+CARTA → "apc" 같은 오탐이 나서 완전 일치만 본다
  for (let win = 2; win <= 3; win++) {
    for (let i = 0; i <= lines.length - win; i++) {
      const joined = lines.slice(i, i + win).join('');
      const found = matchBrand(joined, { exact: true });
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
      const found = matchBrand(joined, { exact: true });
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
        const found = matchBrand(joined, { exact: true });
        if (found) {
          return {
            canonical: found,
            indices: [brandCandidates[a].index, brandCandidates[b].index, brandCandidates[c].index],
          };
        }
      }
    }
  }

  // 4) OCR 오타 보정 (한 글자 차이): 단일 라인 → 인접 2~3 라인 병합
  //    "UNl + QLO"처럼 로고를 나눠 읽으면서 글자까지 틀린 경우
  for (let i = 0; i < lines.length; i++) {
    const found = fuzzyMatchBrand(lines[i]);
    if (found) return { canonical: found, indices: [i] };
  }
  for (let win = 2; win <= 3; win++) {
    for (let i = 0; i <= lines.length - win; i++) {
      const found = fuzzyMatchBrand(lines.slice(i, i + win).join(''));
      if (found) {
        return { canonical: found, indices: Array.from({ length: win }, (_, k) => i + k) };
      }
    }
  }
  return null;
}

const SORTED_ALIASES = Array.from(BRAND_LOOKUP.keys()).sort((a, b) => b.length - a.length);

// OCR 오타 보정 대상 별칭: 6자 이상 영문·숫자만
// (짧은 별칭이나 한글은 한 글자만 달라도 다른 단어가 되어 오탐이 크다)
const FUZZY_BRAND_ALIASES = SORTED_ALIASES.filter((a) => a.length >= 6 && /^[a-z0-9&]+$/.test(a));

// "UNIOLO" → UNIQLO 처럼 한 글자가 깨진 브랜드명을 보정한다
function fuzzyMatchBrand(text) {
  const n = normalize(text);
  if (n.length < 6 || !/^[a-z0-9&]+$/.test(n)) return null;
  for (const alias of FUZZY_BRAND_ALIASES) {
    if (Math.abs(alias.length - n.length) > 1) continue;
    if (editDistance(alias, n) <= 1) return BRAND_LOOKUP.get(alias);
  }
  return null;
}

function matchBrand(line, { exact = false } = {}) {
  const norm = normalize(line);
  if (!norm) return null;
  if (BRAND_LOOKUP.has(norm)) return BRAND_LOOKUP.get(norm);
  if (exact) return null;
  // 부분 일치 (긴 별칭부터): 별칭이 라인 안의 단어 단위로 등장해야 인정
  // ("PAPCARTA" 안의 "apc", "Stockholm" 안의 "cos" 같은 오탐 방지)
  const words = String(line).toLowerCase().split(/[^0-9a-z가-힣&.']+/).filter(Boolean);
  for (const alias of SORTED_ALIASES) {
    if (alias.length < 3) continue;
    if (/[가-힣]/.test(alias)) {
      if (alias.length >= 3 && norm.includes(alias)) return BRAND_LOOKUP.get(alias);
      continue;
    }
    // 여러 단어 별칭(musinsastandard)은 인접 단어를 이어 붙여 비교
    for (let i = 0; i < words.length; i++) {
      let joined = '';
      for (let j = i; j < Math.min(words.length, i + 3); j++) {
        joined += normalize(words[j]);
        if (joined === alias) return BRAND_LOOKUP.get(alias);
        if (joined.length >= alias.length) break;
      }
    }
  }
  return null;
}

// ============================
// 택 양식 시그니처 (브랜드명이 인쇄되지 않은 택용)
// 품번·바코드·고정 문구의 형식으로 브랜드를 추정한다
// ============================
const TAG_SIGNATURES = [
  // 무인양품: JAN 바코드 4550/4548/4547 + KR, "판매가" 표기
  { brand: 'MUJI', test: (t) => /\b45(50|48|47)\d{9}\s*KR\b/.test(t) },
  // H&M: "KR 11 xxxxxx" 코드 + DUAL 라벨
  { brand: 'H&M', test: (t) => /\bKR\s?11\s?\d{6}\b/.test(t) },
  // ARKET: "BP 1 10xx" 코드 (브랜드명이 인쇄되지 않고 스티커만 붙는 택)
  { brand: 'ARKET', test: (t) => /\bBP\s?1\s?1\d{3}\b/.test(t) },
  // COS: "KX 11 xxxxxx" 코드 또는 스톡홀름 주소
  { brand: 'COS', test: (t) => /\b[KX]{2}\s?11\s?\d{6}\b/.test(t) || /COS\s+106\s?38/.test(t) },
  // ZARA: ART.: 0000/000/000 + TALLA/SIZE/TAILLE
  { brand: 'ZARA', test: (t) => /TALLA\s*\/\s*SIZE/i.test(t) || /ART\.?\s*:?\s*\d{4}\s?\/\s?\d{3}\s?\/\s?\d{3}/.test(t) },
  // 유니클로: 품번 3xx-xxxxxx + 호칭
  { brand: 'UNIQLO', test: (t) => /\b3\d{2}-\d{6}\b/.test(t) && /호칭/.test(t) },
  // SPAO: SPxxxxxxxx-00
  { brand: 'SPAO', test: (t) => /\bSP[A-Z0-9]{8}-[0-9O]{2}\b/.test(t) },
  // 무신사 스탠다드: MMxxxxxxx-XX-00X
  { brand: 'MUSINSA STANDARD', test: (t) => /\bMM[A-Z0-9]{6,7}[-\/][A-Z]{2}\b/.test(t) },
];

// 택에 흔한 인증/재활용 마크 로고 (브랜드 아님)
const LOGO_BLOCKLIST = /forest stewardship|fsc|recycl|rfid|oeko|bluesign/i;

// ============================
// 택 양식 지문 (라벨 데이터에서 자동 추출)
// 상품마다 달라지는 값(상품명·가격)이 아니라, 브랜드 택 서식에 반복되는
// 고정 문구와 코드 "형태"를 특징으로 쓴다. 학습은 build_profiles.js가 오프라인으로 하고
// 결과 가중치는 tag_profiles.js로 들어온다.
// ============================

// 문자 종류를 압축해 코드 형태로 바꾼다: "341-486116" → "D3-D6", "456821MMGA" → "D6A4"
function shapeOf(token) {
  const cls = (ch) => {
    if (/[0-9]/.test(ch)) return 'D';
    if (/[A-Za-z]/.test(ch)) return 'A';
    if (/[가-힣]/.test(ch)) return 'K';
    return ch;
  };
  let out = '';
  let prev = '';
  let run = 0;
  for (const ch of token) {
    const c = cls(ch);
    if (c === prev && 'DAK'.includes(c)) {
      run++;
    } else {
      if (prev) out += 'DAK'.includes(prev) ? prev + run : prev;
      prev = c;
      run = 1;
    }
  }
  if (prev) out += 'DAK'.includes(prev) ? prev + run : prev;
  return out;
}

// 한 택의 양식 특징 집합
window.tagShapeFeatures = function (lines) {
  const feats = new Set();
  for (const raw of lines || []) {
    const line = String(raw).trim();
    if (!line) continue;
    if (line.length <= 24) feats.add('l:' + shapeOf(line));
    for (const token of line.split(/\s+/)) {
      if (!token) continue;
      // 글자만으로 된 짧은 토큰은 고정 문구 후보 (제조년월, SIZE, EUR, 호칭 …)
      if (/^[A-Za-z가-힣./&]{2,14}$/.test(token)) feats.add('w:' + normalize(token));
      // 숫자가 섞인 토큰은 코드 형태로
      if (/\d/.test(token) && token.length >= 3) feats.add('p:' + shapeOf(token));
    }
  }
  return feats;
};

// 학습된 지문으로 브랜드를 추정한다.
// 신뢰도를 두 단계로 나눈다:
//   confident — 자동 입력 (학습에 없는 브랜드를 단정하지 않는 지점)
//   likely    — 자동 입력하지 않고 화면에 후보로만 제시
function scoreBrandProfiles(lines) {
  const model = (typeof window !== 'undefined' && window.TAG_PROFILES) || null;
  if (!model || !model.brands) return null;
  const feats = window.tagShapeFeatures(lines);
  const scored = Object.entries(model.brands).map(([brand, weights]) => {
    let score = 0;
    for (const f of feats) if (weights[f]) score += weights[f];
    return { brand, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  if (!top) return null;
  const ratio = second && second.score > 0 ? top.score / second.score : 99;
  const margin = second ? top.score - second.score : top.score;
  const pass = (minScore, minRatio) =>
    top.score >= minScore && margin >= model.minMargin && ratio >= minRatio;
  return {
    brand: top.brand,
    score: Math.round(top.score * 10) / 10,
    confident: pass(model.minScore, model.minRatio || 4),
    likely: pass(model.suggestScore || 25, model.suggestRatio || 2),
  };
}

function detectBrandByProfile(lines) {
  const r = scoreBrandProfiles(lines);
  return r && r.confident ? r.brand : null;
}

// 앱이 후보 버튼을 띄울 때 쓴다 (자동 입력 기준에는 못 미치는 추정)
window.suggestBrandByProfile = function (lines) {
  const r = scoreBrandProfiles(lines);
  return r && r.likely && !r.confident ? r : null;
};

function detectBrandBySignature(text) {
  for (const sig of TAG_SIGNATURES) {
    if (sig.test(text)) return sig.brand;
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

  // 택 어딘가에 원화 표시(₩, W, 원, 판매가)가 따로 떨어져 있으면
  // 쉼표 숫자만 있는 라인("39,900")도 가격일 확률이 높다
  const hasWonMarker = lines.some((l) => /^[₩￦W\\]$/.test(l.trim()) || /[₩￦원]|판매가/.test(l));

  const priceKeywordRe =
    /(가격|정가|판매가|소비자가|price|msrp|retail)\s*:?\s*([₩￦W$]?\s?[\d,]+\s?(?:원|₩|￦|krw|won)?)/i;
  const pricePatterns = [
    { re: /([₩￦]\s?[\d,]+)/, score: 100 },
    { re: /([\d,]+\s?원)/, score: 100 },
    { re: /(KRW\s?[\d,]+)/i, score: 95 },
    // "W 64,900", "\ 89,900" (₩ 오인식)
    { re: /^([W\\]\s?\d{1,3}(?:,\d{3})+)$/, score: 95 },
    // 쉼표 천단위 숫자만 있는 라인
    { re: /^(\d{1,3}(?:,\d{3})+)$/, score: 75, markerBonus: 20 },
    // 쉼표 없는 가격 ("169000"): 끝자리가 000/900일 때만
    { re: /^(\d{1,4}[09]00)$/, score: 45, markerBonus: 25 },
    { re: /(W\s?[\d,]{3,})/, score: 60 },
    { re: /(\$\s?[\d,]+(?:\.\d+)?)/, score: 40 },
    { re: /(USD\s?[\d,]+(?:\.\d+)?)/i, score: 40 },
  ];

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i].trim();
    // 소재 비율, 치수, 품번(슬래시) 라인은 가격 아님
    if (/%|cm\b|\//i.test(line)) continue;

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
    for (const { re, score, markerBonus = 0 } of pricePatterns) {
      const m = line.match(re);
      if (!m) continue;
      const val = m[1].trim();
      const num = parseInt(val.replace(/[^\d]/g, ''), 10);
      if (!isValidPriceNumber(num)) continue;

      let s = score + (hasWonMarker ? markerBonus : 0);
      // 하이픈 있으면 시리얼 유사 코드 감점
      if (hasHyphen && !/[₩￦원]/.test(val) && !/^KRW/i.test(val)) {
        s -= 50;
      }
      // 라인 위치가 뒤일수록 실제 가격일 확률 (태그 하단에 붙음)
      s += (i / lines.length) * 20;
      // 라인 자체가 이 매칭이 대부분이면 신뢰도 up
      if (line.length <= val.length + 5) s += 15;

      candidates.push({ value: val, num, score: s, lineIdx: i });
      break;
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
// 사이즈 추출 (후보 점수제)
// ============================
const LETTER_SIZE = '(?:XXXL|XXL|XL|XS|S|M|L|2XL|3XL|4XL|FREE)';

function extractSize(lines, used) {
  const candidates = [];
  const hasZaraSizeTable = lines.some((l) => /TALLA\s*\/\s*SIZE/i.test(l));
  // "EUR"/"SIZE" 표기 뒤에 나오는 후보는 실제 사이즈일 확률이 높다
  const sizeLabelIdx = lines.findIndex((l) => /^(EUR|SIZE)$/i.test(l.trim()));
  const add = (value, score, lineIdx) => candidates.push({
    value,
    score: score + (sizeLabelIdx >= 0 && lineIdx > sizeLabelIdx ? 15 : 0),
    lineIdx,
  });

  const rules = [
    // SPAO: 070(S), 105(XL) → 괄호 안
    { re: new RegExp(`^\\d{3}\\((${LETTER_SIZE})\\)$`, 'i'), score: 100 },
    // 8seconds: XL(86-88), 95/M, 64/XS
    { re: new RegExp(`^(${LETTER_SIZE}\\(\\d{2,3}-\\d{2,3}\\))$`, 'i'), score: 100 },
    { re: new RegExp(`^(\\d{2,3}\\/${LETTER_SIZE})$`, 'i'), score: 100 },
    // ZARA 키즈: 6-7 AÑOS/YEARS
    { re: /^(\d{1,2}-\d{1,2})\s*A[ÑN]OS/i, score: 100 },
    // ZARA: "44 34 34 34 50 44", "MM 40 M M M", "SS 38 SS P" → 첫 값 (OCR이 붙여 쓴 중복 제거)
    { re: new RegExp(`^(${LETTER_SIZE}|\\d{2})\\s?\\1?\\s+\\d{2}(?:\\s|$)`, 'i'), score: 95, zara: true },
    // H&M/COS: EUR S, EUR 28
    { re: new RegExp(`^EUR\\s+(${LETTER_SIZE}|\\d{2}(?:\\/\\d{2})?)$`, 'i'), score: 95 },
    // 청바지 30/30, 29/32
    { re: /^(\d{2}\s*[Ww]?\s*[\/xX]\s*\d{2}\s*[Ll]?)$/, score: 90 },
    { re: /^(\d{2,3}[ABCDE])$/i, score: 70 },
    // 국가별 신발 사이즈 표기 (UK 7, US 9.5, EU 42)
    { re: /^((?:UK|US|EU|JP)\s?\d{1,2}(?:\.\d)?)$/i, score: 85 },
    { re: new RegExp(`^(${LETTER_SIZE}|ONE\\s?SIZE|프리)$`, 'i'), score: 60 },
  ];

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i].trim();

    // 키워드와 같은 줄: "사이즈 29", "SIZE: M"
    const kw = line.match(/^(?:size|사\s*이\s*즈|호칭)\s*:?\s*(\S+)$/i);
    if (kw && isSizeLike(kw[1])) add(kw[1].toUpperCase(), 95, i);

    // "호칭" 다음 줄 (유니클로)
    if (/^호칭$/.test(line)) {
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const v = lines[j].trim();
        if (isSizeLike(v)) { add(v.toUpperCase(), 90, j); break; }
      }
    }

    for (const { re, score, zara } of rules) {
      const m = line.match(re);
      if (!m) continue;
      if (zara && !hasZaraSizeTable) continue;
      add(m[1].replace(/\s/g, '').toUpperCase(), score, i);
      break;
    }

    // 숫자 사이즈: 허리(24~50), 상의(80~130), 신발(220~330)
    if (/^\d{2,3}$/.test(line)) {
      const n = parseInt(line, 10);
      if (n >= 24 && n <= 50) add(line, 55, i);
      else if ((n >= 80 && n <= 130) || (n >= 220 && n <= 330)) add(line, 45, i);
    }
    // 허리둘레 표기 사이즈 (무인양품 79cm)
    if (/^\d{2,3}\s?cm$/i.test(line)) add(line.replace(/\s/g, ''), 50, i);
  }

  if (candidates.length === 0) return null;
  // 점수 동률이면 먼저 나온 후보
  candidates.sort((a, b) => b.score - a.score || a.lineIdx - b.lineIdx);
  return candidates[0];
}

function isSizeLike(v) {
  return new RegExp(`^(${LETTER_SIZE}|\\d{2,3}(\\/${LETTER_SIZE})?|\\d{2}\\/\\d{2}|\\d{2,3}cm)$`, 'i').test(String(v).trim());
}

// ============================
// 시리얼 추출 (브랜드별 품번 형식 우선)
// ============================
const SERIAL_PATTERNS = [
  // 무신사 스탠다드: MMDTJ0Z01-CG-00L, MMCPC503-BE
  { re: /\b(MM[A-Z0-9]{6,7}-[A-Z]{2}(?:-[0-9A-Z]{3})?)\b/ },
  // SPAO: SPFZE4TC02-00 (바코드용 17자리 붙은 코드는 제외)
  { re: /\b(SP[A-Z0-9]{8}-[0-9O]{2})\b/ },
  // 유니클로: 341-486116
  { re: /(?<![\d-])(\d{3}-\d{6})(?![\d-])/ },
  // ZARA: ART.: 6045/350/400
  { re: /ART\.?\s*:?\s*(\d{4}\s?\/\s?\d{3}\s?\/\s?\d{3})/i },
  // 무인양품: AD0YWA6A-011 (OCR이 0을 O로 읽는 경우 포함)
  { re: /\b(A[A-Z0-9]{7}-[0-9O]{3})\b/ },
  // 8seconds: 456821MMGA
  { re: /\b(\d{6}[A-Z][A-Z0-9]{3}|\d{6}[A-Z0-9]{3}[A-Z])\b/ },
  // H&M 그룹(H&M, COS 등): 줄 맨 앞 7자리+3자리 "1357829 001 09 4 5674"
  // OCR이 뒤 숫자와 붙여 읽기도 한다: "1358972 00276", "126017301108"
  { re: /^(\d{7})\s(\d{3})/, join: true },
  // 공백 없이 10~12자리 (13자리 EAN 바코드는 제외)
  { re: /^(\d{7})(\d{3})\d{0,2}(?:\s|$)/, join: true },
];

function extractSerial(lines, used) {
  for (const { re, join } of SERIAL_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      const m = lines[i].trim().match(re);
      if (m) return { value: join ? `${m[1]} ${m[2]}` : m[1].replace(/\s+/g, ' '), lineIdx: i };
    }
  }
  return extractSerialGeneric(lines, used);
}

function extractSerialGeneric(lines, used) {
  const serialKeywordRe =
    /(serial|style|model|item|품\s*번|모델명|스타일|s\/?n|art\.?\s?no|reference|ref\.?)\s*:?\s*([A-Za-z0-9\-\/_]+)/i;
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
// 상품명 추출
// ============================
// 상품명 후보에서 빼야 하는 라인 (색상 코드, 설명 문장, 성별 등)
function isNameNoise(line) {
  const s = line.trim();
  return (
    isNoiseLine(s) ||
    /^\(?\d{2}\)?\s?[A-Z][A-Za-z ]+$/.test(s) || // (19) Black, 09 Black
    /다\.$/.test(s) || // 설명 문장
    /^(Men|Women|Kid|Unisex)'?s?\b/i.test(s) ||
    /^(남성|여성|남녀공용|키즈)$/.test(s) ||
    /^(UNI|QLO|RFID|\+RFID|DUAL|판매가|제조연월|섬유의 조성.*)$/i.test(s) ||
    // 재활용·인증 마크 문구와 국가 등록번호 (브랜드명 없는 택에서 상품명으로 들어감)
    /^(PAP|RACCOLTA|CARTA|Al\s?Azul|EUR|FSC|RECYCLED|Paper|Exclu\w*|ALARM\w*|TALLA.*)$/i.test(s) ||
    /^(RN|CA|TE-)\d{4,}/i.test(s) ||
    /^[a-z]+$/.test(s) || // 소문자 영단어 조각(OCR 잡음)
    /^(?=.*\d)[A-Z0-9]{4,}(-[A-Z0-9]+)*$/.test(s) || // 품번/코드 (PUFFTECH 같은 영문 상품명은 유지)
    /^\d{1,4}$/.test(s) ||
    /^(KR|KX|XK|BP)\s?1\s?1?\s?\d{3,}/.test(s) || // H&M 그룹 물류코드 KR 11650801
    /[$]\d{2}$/.test(s) ||
    /^[A-Z0-9]{2,4}-P\d/.test(s) // 유니클로 관리코드 IMP-P1-2
  );
}

// 다음 줄에 포함되는 짧은 줄은 배지/로고 중복이라 버린다 (발수 + 투습발수, AIRism + AIRism코튼)
function dropContainedBadges(parts) {
  return parts.filter((p, k) => !(k + 1 < parts.length && parts[k + 1].includes(p) && parts[k + 1] !== p));
}

function cleanName(text) {
  return text
    .replace(/\((?:[A-Z0-9]{8,12})\s?RE\)/g, '') // SPAO 리오더 코드 (SPYWE25C41 RE)
    .replace(/\s+/g, ' ')
    .trim();
}

const NAME_EXTRACTORS = {
  // 무인양품: "Men's jacket" 바로 위의 한글 줄들
  MUJI(lines) {
    // "Men's jacket" (OCR이 "Bion's jacket"처럼 앞 단어를 틀려도 인정)
    const idx = lines.findIndex((l) => /^\S{2,6}'s\s+[a-z]+$/i.test(l.trim()));
    if (idx <= 0) return null;
    const parts = [];
    for (let i = idx - 1; i >= 0 && parts.length < 4; i--) {
      const l = lines[i].trim();
      if (!/[가-힣]/.test(l) || isNameNoise(l)) break;
      parts.unshift(l);
    }
    return parts.length ? dropContainedBadges(parts).join(' ') : null;
  },
  // 유니클로: 색상 줄("09 Black") 앞의 줄들
  UNIQLO(lines) {
    const colorIdx = lines.findIndex((l) => /^\d{2}\s+[A-Z][a-z]+(\s[A-Z][a-z]+)?$/.test(l.trim()));
    if (colorIdx <= 0) return null;
    const parts = lines.slice(0, colorIdx).map((l) => l.trim())
      .filter((l) => !isNameNoise(l) && !/^\d{4}\s?년/.test(l) && !/^HT\d/i.test(l) && !/^\d{2}-P\d/.test(l));
    return parts.length ? dropContainedBadges(parts).join(' ') : null;
  },
  // SPAO: 색상 줄 "(19) Black" 다음부터 사이즈 줄 전까지
  SPAO(lines) {
    const colorIdx = lines.findIndex((l) => /^\(\d{2}\)\s?[A-Za-z ]+$/.test(l.trim()));
    if (colorIdx < 0) return null;
    const parts = [];
    for (let i = colorIdx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (isSizeLike(l) || /^\d{3}\(/.test(l) || /^[W₩\\]$/.test(l)) break;
      if (/[가-힣]/.test(l)) parts.push(l);
    }
    return parts.length ? parts.join(' ') : null;
  },
  // 무신사 스탠다드: "상품명 ..." 키워드형, 또는 [상품명 줄들] [색상] [사이즈] 순서
  'MUSINSA STANDARD'(lines) {
    for (const l of lines) {
      const m = l.match(/^상\s*품\s*명\s*:?\s*(.+)$/);
      if (m) return m[1].trim();
    }
    const sizeIdx = lines.findIndex((l) => isSizeLike(l.trim()));
    if (sizeIdx <= 0) return null;
    const before = [];
    for (let i = 0; i < sizeIdx; i++) {
      const l = lines[i].trim();
      if (/[가-힣]/.test(l) && !isNameNoise(l)) before.push(l);
    }
    // 마지막 한글 줄은 색상명
    before.pop();
    return before.length ? before.join(' ') : null;
  },
};

function extractProductName(lines, used) {
  // 키워드형 "상품명: ..."
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^상\s*품\s*명\s*:?\s*(.+)$/);
    if (m) return { text: m[1].trim(), indices: [i] };
  }

  // 남은 라인 중 노이즈 아닌 것들의 인덱스만 수집
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (isNameNoise(lines[i])) continue;
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
// 소재·원단 추출 (fabric_dict.js 사전 기반)
// ============================
const FABRIC_LOOKUP = (() => {
  const map = new Map(); // 정규화 별칭 → { term, category }
  const dict = (typeof window !== 'undefined' && window.FABRIC_DICT) || null;
  if (!dict || !dict.categories) return map;
  for (const [category, items] of Object.entries(dict.categories)) {
    for (const item of items) {
      for (const alias of [item.term, ...(item.aliases || [])]) {
        const key = normalize(alias);
        if (key && !map.has(key)) map.set(key, { term: item.term, category });
      }
    }
  }
  return map;
})();

const FABRIC_ALIASES_SORTED = Array.from(FABRIC_LOOKUP.keys()).sort((a, b) => b.length - a.length);
const FIBER_CATEGORIES = ['fiber_material', 'leather_fur'];
const TEXTURE_CATEGORIES = ['fabric_texture', 'knit_weave', 'leather_fur'];

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// 단어 하나를 사전과 대조 (완전 일치 → 세 글자 이상이면 한 글자 오차까지 보정)
function matchFabricTerm(word, categories) {
  const n = normalize(word);
  if (!n) return null;
  const hit = FABRIC_LOOKUP.get(n);
  if (hit && categories.includes(hit.category)) return hit.term;
  // 오타 보정은 숫자가 없는 순수 용어끼리만 한다.
  // ("면 100%" 같은 사전 항목과 비교하면 "100%"가 코튼으로 보정돼 버린다)
  if (n.length >= 3 && !/[0-9%]/.test(n)) {
    for (const [alias, info] of FABRIC_LOOKUP) {
      if (!categories.includes(info.category) || /[0-9%]/.test(alias)) continue;
      if (Math.abs(alias.length - n.length) <= 1 && editDistance(alias, n) <= 1) return info.term;
    }
  }
  return null;
}

function findFabricInText(text, categories) {
  const n = normalize(text);
  if (!n) return null;
  // 두 글자 이상 별칭은 문장 안에 포함되어 있어도 인정 (긴 별칭 우선)
  for (const alias of FABRIC_ALIASES_SORTED) {
    if (alias.length < 2) continue;
    const info = FABRIC_LOOKUP.get(alias);
    if (!categories.includes(info.category)) continue;
    if (n.includes(alias)) return info.term;
  }
  // '면', '마'처럼 한 글자 별칭은 단어 단위로만 인정
  for (const word of String(text).split(/[\s,\/()[\]]+/)) {
    const t = matchFabricTerm(word, categories);
    if (t) return t;
  }
  return null;
}

// 혼용률: "100% 면", "72% 면", 퍼센트와 소재명이 다른 줄로 나뉜 경우까지
function extractMaterial(lines) {
  const parts = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of String(line).matchAll(/(\d{1,3})\s*%/g)) {
      const pct = parseInt(m[1], 10);
      if (pct < 1 || pct > 100) continue;
      // 같은 줄 → 다음 줄 → 앞 줄 순서로 소재명을 찾는다
      const near = [String(line).replace(/\d{1,3}\s*%/g, ' '), lines[i + 1] || '', lines[i - 1] || ''];
      let term = null;
      for (const t of near) {
        term = findFabricInText(t, FIBER_CATEGORIES);
        if (term) break;
      }
      // 같은 소재가 겉감·안감에 반복되면 비율이 다른 경우만 남긴다
      const key = `${term} ${pct}`;
      if (term && !seen.has(key)) {
        seen.add(key);
        parts.push(`${term} ${pct}%`);
      }
    }
  }
  return parts.join(' / ');
}

// 가공·조직 용어 (기모, 와플, 코듀로이, 플리스 등)
function extractFabricTags(lines) {
  const found = [];
  for (const line of lines) {
    for (const word of String(line).split(/[\s,\/()[\]]+/)) {
      const term = matchFabricTerm(word, TEXTURE_CATEGORIES);
      if (term && !found.includes(term)) found.push(term);
    }
  }
  return found.slice(0, 6);
}

// ============================
// 세탁법 (소재 사전의 care_label 용어 + 자주 쓰는 한글 금지 표현)
// ============================
// 사전 표준 용어 → 화면에 보여줄 이름. 원산지·제조연월은 세탁법이 아니라 뺀다.
const CARE_LABELS = {
  '손세탁': '손세탁',
  '드라이클리닝': '드라이클리닝',
  '세탁기사용가능': '세탁기 가능',
  '표백제사용금지': '표백 금지',
  '다림질주의': '다림질 주의',
  '그늘건조': '그늘 건조',
};
// 사전에 없는 금지 표현. "세탁기"가 들어가도 금지면 '세탁기 가능'으로 잡히지 않게 먼저 본다.
const CARE_PATTERNS = [
  { re: /물\s*세탁\s*(불가|금지|하지)/, label: '물세탁 금지' },
  { re: /세탁기\s*(사용\s*)?(불가|금지)/, label: '세탁기 금지' },
];

function extractCare(lines) {
  const found = [];
  const add = (label) => { if (label && !found.includes(label)) found.push(label); };
  for (const line of lines) {
    const text = String(line);
    let negated = false;
    for (const { re, label } of CARE_PATTERNS) {
      if (re.test(text)) { add(label); negated = true; }
    }
    if (negated) continue;
    const n = normalize(text);
    for (const alias of FABRIC_ALIASES_SORTED) {
      const info = FABRIC_LOOKUP.get(alias);
      if (info.category !== 'care_label' || !CARE_LABELS[info.term] || alias.length < 3) continue;
      if (n.includes(alias)) add(CARE_LABELS[info.term]);
    }
  }
  return found.join(' · ');
}

// ============================
// 브랜드 후보 제시 (브랜드 기준 데이터 대조)
// 브랜드를 자동으로 못 잡았을 때 앱이 후보 버튼을 띄우는 데 쓴다
// ============================
window.suggestBrands = function (lines, limit = 3) {
  const catalog = (typeof window !== 'undefined' && window.BRAND_CATALOG) || [];
  if (!catalog.length) return [];

  const words = [];
  for (const line of lines || []) {
    const t = String(line).trim();
    if (t.length >= 3 && t.length <= 25) words.push(t);
    for (const w of t.split(/[\s,\/|()[\]]+/)) if (w.length >= 3) words.push(w);
  }

  const scored = [];
  for (const b of catalog) {
    let best = 99;
    for (const cand of [b.name, b.ko].filter(Boolean)) {
      const c = normalize(cand);
      if (c.length < 3) continue;
      for (const w of words) {
        const n = normalize(w);
        if (!n || Math.abs(n.length - c.length) > 2) continue;
        const d = editDistance(c, n);
        if (d < best) best = d;
      }
    }
    if (best <= 2) scored.push({ ...b, distance: best });
  }
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, limit);
};

// 브랜드 공식몰 도메인 조회
window.brandDomain = function (brand) {
  const catalog = (typeof window !== 'undefined' && window.BRAND_CATALOG) || [];
  const n = normalize(brand);
  if (!n) return '';
  const hit = catalog.find((b) => normalize(b.name) === n || normalize(b.ko || '') === n);
  return hit ? hit.domain : '';
};

// ============================
// 메인 파서
// options.logos: Google Vision LOGO_DETECTION 결과 [{description, score}, ...]
// ============================
window.parseFields = function (lines, options = {}) {
  const result = {
    productName: '',
    brand: '',
    price: '',
    size: '',
    serial: '',
    material: '', // 혼용률 (예: 코튼 72% / 폴리에스터 28%)
    fabric: [], // 가공·조직 용어 (예: ['기모', '와플'])
    care: '', // 세탁법 (예: 손세탁 · 표백 금지)
    category: '',
    brandSource: '', // 'logo' | 'dictionary' | 'profile' | 'signature' | 'fallback'
  };

  if (!lines || lines.length === 0) return result;

  const used = new Set();
  const fullText = lines.join('\n');

  // 1) 브랜드 감지: 우선순위
  //    A. Logo Detection 결과 (신뢰도 0.5 이상)
  //    B. 텍스트 사전 매칭 (인접/떨어진 라인 병합)
  //    C. 택 양식 시그니처 (브랜드명 없는 택: 품번/바코드 형식)
  //    D. 폴백 (첫 의미있는 라인)

  // A. Logo Detection 결과 우선 확인
  // 사전에 있는 브랜드로 매핑되는 로고만 우선 적용한다.
  // (택의 FSC 인증 마크가 "Forest Stewardship Council"로 잡히는 등 오탐이 많음)
  const logos = (options.logos || []).filter((l) => !LOGO_BLOCKLIST.test(l.description));
  const strongLogo = logos.find((l) => l.score >= 0.5 && matchBrand(l.description));
  if (strongLogo) {
    result.brand = matchBrand(strongLogo.description);
    result.brandSource = 'logo';
  }

  // B. 텍스트 사전 매칭 (로고에서 못 잡았거나, 텍스트가 더 확실한 경우 병행)
  if (!result.brand) {
    const brandMatch = findBrandInLines(lines);
    if (brandMatch) {
      result.brand = brandMatch.canonical;
      result.brandSource = 'dictionary';
      brandMatch.indices.forEach((i) => used.add(i));
    }
  } else {
    // 로고로 잡았어도 텍스트에서 같은 브랜드 라인 찾아서 used 마킹 (상품명 오염 방지)
    const brandMatch = findBrandInLines(lines);
    if (brandMatch && brandMatch.canonical === result.brand) {
      brandMatch.indices.forEach((i) => used.add(i));
    }
  }

  // C-1. 택 양식 시그니처: 브랜드 고유 코드(KX 11/KR 11/BP 1 10xx 등)로 정확히 구분
  if (!result.brand) {
    const sigBrand = detectBrandBySignature(fullText);
    if (sigBrand) {
      result.brand = sigBrand;
      result.brandSource = 'signature';
    }
  }

  // C-2. 택 양식 지문: 고유 코드가 안 보이는 택을 학습된 서식으로 추정.
  //      학습에 없는 브랜드를 단정하면 잘못된 브랜드가 조용히 저장되므로,
  //      확신이 높을 때만 쓰고 아니면 빈칸으로 두어 사용자가 고르게 한다.
  if (!result.brand) {
    const profileBrand = detectBrandByProfile(lines);
    if (profileBrand) {
      result.brand = profileBrand;
      result.brandSource = 'profile';
    }
  }

  // D. 사전에 없는 로고라도 신뢰도가 높으면 사용
  if (!result.brand) {
    const unknownLogo = logos.find((l) => l.score >= 0.8);
    if (unknownLogo) {
      result.brand = unknownLogo.description;
      result.brandSource = 'logo';
    }
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

  // 5) 브랜드 폴백 (사전에도 없고 로고에도 없으면 첫 의미있는 라인)
  if (!result.brand) {
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i) || isNameNoise(lines[i])) continue;
      const line = lines[i];
      if (
        line.length >= 2 &&
        line.length <= 30 &&
        !/^\d+$/.test(line) &&
        !/^(EUR|SIZE|NO\.?|PAP|RACCOLTA|CARTA)$/i.test(line) &&
        /[A-Za-z가-힣]{2,}/.test(line)
      ) {
        result.brand = line;
        result.brandSource = 'fallback';
        used.add(i);
        break;
      }
    }
  }

  // 6) 상품명: 브랜드별 양식이 있으면 우선, 없으면 연속된 한글 라인 병합
  const byBrand = NAME_EXTRACTORS[result.brand];
  const brandName = byBrand ? byBrand(lines) : null;
  if (brandName) {
    result.productName = cleanName(brandName);
  } else {
    const nameMatch = extractProductName(lines, used);
    if (nameMatch) {
      result.productName = cleanName(nameMatch.text);
      nameMatch.indices.forEach((i) => used.add(i));
    }
  }

  // 7) 소재 (혼용률 + 가공·조직 용어)
  result.material = extractMaterial(lines);
  result.fabric = extractFabricTags(lines);
  result.care = extractCare(lines);

  // 8) 카테고리 자동 감지 (상품명 + 브랜드 + 전체 텍스트)
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
