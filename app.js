// TagScanner Web — 메인 앱 로직
//
// 흐름: 메인 -> (사진 선택) -> 리뷰/편집 -> 저장 -> 목록
// 저장: localStorage (이미지는 base64로 압축 후 저장)

const STORAGE_KEY = 'tagscanner.tags.v1';
const SETTINGS_KEY = 'tagscanner.settings.v1';

// 카테고리 상수
const CATEGORIES = ['아우터', '상의', '하의', '신발', '가방', '모자', '액세서리', '기타'];
const STORAGE_MAX_DIMENSION = 1280; // 저장용 사진 최대 가로/세로
const OCR_MAX_DIMENSION = 2048; // OCR용 사진 최대 가로/세로 (큰 게 인식 잘 됨)
const JPEG_QUALITY = 0.82;

// ---- 설정 ----
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { ocrEngine: 'auto', googleApiKey: '' };
  } catch (e) {
    return { ocrEngine: 'auto', googleApiKey: '' };
  }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function pickEngine() {
  const s = loadSettings();
  if (s.ocrEngine === 'google') return s.googleApiKey ? 'google' : 'tesseract';
  if (s.ocrEngine === 'tesseract') return 'tesseract';
  // auto
  return s.googleApiKey ? 'google' : 'tesseract';
}

// ---- 상태 ----
let currentReview = null;
let currentDetailId = null;
let lastOcrMode = 'auto';
let ocrAttempts = 0;
let captureMode = 'ocr'; // 'ocr' | 'normal' — normal은 OCR 건너뛰고 사진만 저장
let searchQuery = '';
let favoriteFilter = false; // true이면 찜한 항목만 표시

// ---- DOM ----
const $ = (id) => document.getElementById(id);

const screens = {
  main: $('mainScreen'),
  review: $('reviewScreen'),
  list: $('listScreen'),
  detail: $('detailScreen'),
  settings: $('settingsScreen'),
  compare: $('compareScreen'),
  compareResult: $('compareResultScreen'),
  myPage: $('myPageScreen'),
  filter: $('filterScreen'),
};

// ---- 필터 상태 ----
const defaultFilters = () => ({
  category: '', // '' = 전체, 그 외 CATEGORIES 중 하나
  brands: new Set(), // 빈 Set이면 모든 브랜드
  date: 'all', // 'all' | 'today' | 'week' | 'month'
  priceMin: 0,
  priceMax: 1000000, // 1000000 = unlimited (slider max)
  sort: 'newest', // 'newest' | 'priceAsc' | 'priceDesc'
  favoriteOnly: false,
});
let activeFilters = defaultFilters();
let brandShowAll = false; // "더보기" 토글 상태
let reviewSelectedCategory = ''; // 등록 화면에서 선택된 카테고리

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo(0, 0);
}

// ---- 이미지 로드 ----
async function loadImageFromFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });

  return img;
}

function imageToCanvas(img, maxSide) {
  let { width, height } = img;
  const max = Math.max(width, height);
  if (max > maxSide) {
    const scale = maxSide / max;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

// ---- 이미지 전처리 (그레이스케일 + 대비 강화 + 약한 이진화) ----
// 옷 태그는 보통 흰 배경에 어두운 글씨라 이런 전처리가 효과적입니다.
function preprocessForOcr(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // 1) 평균 밝기 계산 (적응형 임계값용)
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const mean = sum / (data.length / 4);

  // 2) 그레이스케일 + 대비 강화
  // 어두운 부분은 더 어둡게, 밝은 부분은 더 밝게 (mean 기준)
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let v;
    if (gray < mean - 25) {
      v = Math.max(0, (gray - (mean - 25)) * 2 + 30); // 글자(어두운 부분) 더 진하게
    } else if (gray > mean + 25) {
      v = Math.min(255, (gray - (mean + 25)) * 2 + 220); // 배경(밝은 부분) 더 깨끗하게
    } else {
      v = gray; // 중간 영역은 그대로
    }
    data[i] = data[i + 1] = data[i + 2] = v;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ---- OCR (Google Cloud Vision) ----
async function runGoogleVisionOcr(imageData) {
  const settings = loadSettings();
  const key = settings.googleApiKey;
  if (!key) throw new Error('Google API 키가 설정되지 않았습니다');

  const progressText = $('progressText');
  const progressFill = $('progressFill');
  progressText.textContent = 'Google Vision API 호출 중...';
  progressFill.style.width = '40%';

  // base64 데이터에서 데이터 URL 헤더 제거
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;
  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        imageContext: { languageHints: ['ko', 'en'] },
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  progressFill.style.width = '90%';

  if (!res.ok) {
    const errText = await res.text();
    let msg = `Vision API 오류 (${res.status})`;
    try {
      const j = JSON.parse(errText);
      msg = j.error?.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await res.json();
  progressFill.style.width = '100%';
  const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
  return text;
}

// ---- OCR (Tesseract.js) ----
// modeIndex: 0(기본), 1(재시도), 2(재시도 2)
async function runTesseractOcr(imageData, modeIndex = 0) {
  const progressFill = $('progressFill');
  const progressText = $('progressText');

  // PSM = Page Segmentation Mode
  // 6: Single uniform block (정렬된 텍스트)
  // 11: Sparse text (흩어진 텍스트)
  // 4: Single column of text
  const modes = [
    { lang: 'kor+eng', psm: 6, label: '기본 (한+영, 정렬된 블록)' },
    { lang: 'kor+eng', psm: 11, label: '재시도 (흩어진 텍스트)' },
    { lang: 'eng', psm: 6, label: '재시도 (영어만)' },
  ];
  const mode = modes[modeIndex % modes.length];

  progressText.textContent = `OCR 준비 중... [${mode.label}]`;

  const result = await Tesseract.recognize(imageData, mode.lang, {
    logger: (m) => {
      if (m.status === 'loading tesseract core') {
        progressText.textContent = `OCR 엔진 로딩... [${mode.label}]`;
      } else if (m.status === 'loading language traineddata') {
        progressText.textContent = `언어 데이터 로딩... [${mode.label}]`;
      } else if (m.status === 'initializing api') {
        progressText.textContent = `초기화... [${mode.label}]`;
      } else if (m.status === 'recognizing text') {
        progressText.textContent = `텍스트 인식 중... [${mode.label}]`;
      }
      if (typeof m.progress === 'number') {
        progressFill.style.width = `${Math.round(m.progress * 100)}%`;
      }
    },
    tessedit_pageseg_mode: mode.psm,
  });

  return result.data.text || '';
}

// ---- 통합 OCR 디스패처 ----
// engine: 'google' | 'tesseract'
// rawData: 전처리 안 된 OCR 이미지 (Google Vision용)
// processedData: 전처리된 OCR 이미지 (Tesseract용)
async function runOcr({ rawData, processedData, engine, modeIndex = 0 }) {
  if (engine === 'google') {
    return await runGoogleVisionOcr(rawData);
  }
  return await runTesseractOcr(processedData, modeIndex);
}

// ---- 사진 처리 (카메라/갤러리 공통) ----
async function handleImageSelected(file) {
  if (!file) return;

  showScreen('review');
  $('reviewForm').hidden = true;
  $('ocrProgress').style.display = 'block';
  $('progressFill').style.width = '0%';

  try {
    const img = await loadImageFromFile(file);

    // 저장용 (작은 버전)
    const storageCanvas = imageToCanvas(img, STORAGE_MAX_DIMENSION);
    const photoData = storageCanvas.toDataURL('image/jpeg', JPEG_QUALITY);

    // OCR용 원본 (Google Vision은 전처리 없이 보내는 게 더 정확)
    const rawCanvas = imageToCanvas(img, OCR_MAX_DIMENSION);
    const rawData = rawCanvas.toDataURL('image/jpeg', 0.92);

    // OCR용 전처리된 버전 (Tesseract용)
    const processedCanvas = imageToCanvas(img, OCR_MAX_DIMENSION);
    preprocessForOcr(processedCanvas);
    const processedData = processedCanvas.toDataURL('image/jpeg', 0.92);

    $('reviewPhoto').src = photoData;

    // 일반 모드면 OCR 건너뛰고 빈 폼으로 진행
    if (captureMode === 'normal') {
      finishOcr({
        photoData,
        rawData,
        processedData,
        rawText: '',
        engine: 'none',
      });
      return;
    }

    const engine = pickEngine();
    ocrAttempts = 0;
    const rawText = await runOcr({ rawData, processedData, engine, modeIndex: ocrAttempts });
    finishOcr({ photoData, rawData, processedData, rawText, engine });
  } catch (e) {
    console.error(e);
    showToast('OCR 실패: ' + (e.message || e));
    showScreen('main');
  }
}

function finishOcr({ photoData, rawData, processedData, rawText, engine }) {
  const lines = window.splitLines(rawText);
  const fields = window.parseFields(lines);

  currentReview = { photoData, rawData, processedData, rawText, fields, engine };

  $('brand').value = fields.brand;
  $('productName').value = fields.productName;
  $('price').value = fields.price;
  $('size').value = fields.size;
  $('serial').value = fields.serial;
  if (!$('memo').value) $('memo').value = '';
  $('rawText').textContent = rawText || '(인식된 텍스트 없음)';

  // 카테고리 pills 렌더 (선택 초기화)
  reviewSelectedCategory = '';
  renderReviewCategoryPills();

  // 엔진 표시 배지
  const badge = engine === 'google' ? 'Google Vision' : 'Tesseract.js';
  const badgeClass = engine === 'google' ? '' : 'tesseract';
  const retryBtn = $('retryOcr');
  if (retryBtn) {
    if (engine === 'google') {
      retryBtn.innerHTML = `🔄 OCR 다시 시도 <span class="engine-badge">${badge}</span>`;
    } else {
      retryBtn.innerHTML = `🔄 OCR 다른 모드로 다시 시도 <span class="engine-badge ${badgeClass}">${badge}</span>`;
    }
  }

  $('ocrProgress').style.display = 'none';
  $('reviewForm').hidden = false;
}

// ---- OCR 재시도 ----
async function retryOcr() {
  if (!currentReview) return;
  ocrAttempts++;

  $('reviewForm').hidden = true;
  $('ocrProgress').style.display = 'block';
  $('progressFill').style.width = '0%';

  try {
    const engine = currentReview.engine; // 동일 엔진으로 재시도
    const rawText = await runOcr({
      rawData: currentReview.rawData,
      processedData: currentReview.processedData,
      engine,
      modeIndex: ocrAttempts,
    });
    finishOcr({
      photoData: currentReview.photoData,
      rawData: currentReview.rawData,
      processedData: currentReview.processedData,
      rawText,
      engine,
    });
    showToast('재시도 완료');
  } catch (e) {
    console.error(e);
    showToast('재시도 실패: ' + (e.message || e));
    $('ocrProgress').style.display = 'none';
    $('reviewForm').hidden = false;
  }
}

// ---- 저장소 ----
function loadTags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('태그 로드 실패', e);
    return [];
  }
}

function saveTags(tags) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

function addTag(data) {
  const tags = loadTags();
  const tag = {
    id: Date.now(),
    createdAt: Date.now(),
    ...data,
  };
  tags.unshift(tag);
  saveTags(tags);
  return tag;
}

function updateTag(id, data) {
  const tags = loadTags();
  const idx = tags.findIndex((t) => t.id === id);
  if (idx < 0) return;
  tags[idx] = { ...tags[idx], ...data };
  saveTags(tags);
}

function deleteTagById(id) {
  const tags = loadTags().filter((t) => t.id !== id);
  saveTags(tags);
}

// ---- 목록 렌더링 (2-column 카드 그리드) ----
function renderList() {
  const allTags = loadTags();
  const listEl = $('tagList');
  const emptyEl = $('emptyState');

  // 필터 적용 (찜 모드 + 검색 + activeFilters)
  let tags = allTags;
  if (favoriteFilter || activeFilters.favoriteOnly) {
    tags = tags.filter((t) => t.favorite);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    tags = tags.filter((t) =>
      [t.brand, t.productName, t.store, t.size, t.serial, t.memo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }
  // 카테고리 필터
  if (activeFilters.category) {
    tags = tags.filter((t) => t.category === activeFilters.category);
  }
  // 브랜드 필터
  if (activeFilters.brands.size > 0) {
    tags = tags.filter((t) =>
      activeFilters.brands.has((t.brand || '').trim().toLowerCase())
    );
  }
  // 등록 기간 필터
  if (activeFilters.date !== 'all') {
    const now = new Date();
    let cutoff;
    if (activeFilters.date === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      cutoff = start.getTime();
    } else if (activeFilters.date === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      cutoff = start.getTime();
    } else if (activeFilters.date === 'month') {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      cutoff = start.getTime();
    }
    if (cutoff !== undefined) {
      tags = tags.filter((t) => t.createdAt >= cutoff);
    }
  }
  // 가격대 필터 (priceMax 1000000은 무제한 의미)
  const minP = activeFilters.priceMin;
  const maxP = activeFilters.priceMax;
  const priceCapped = maxP < 1000000;
  if (minP > 0 || priceCapped) {
    tags = tags.filter((t) => {
      const m = (t.price || '').match(/([\d,]+)/);
      const v = m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
      if (v === null) return minP === 0 && !priceCapped; // 가격 없는 항목은 가격 필터 켜져 있으면 제외
      if (v < minP) return false;
      if (priceCapped && v > maxP) return false;
      return true;
    });
  }
  // 정렬
  if (activeFilters.sort === 'priceAsc' || activeFilters.sort === 'priceDesc') {
    const dir = activeFilters.sort === 'priceAsc' ? 1 : -1;
    tags = [...tags].sort((a, b) => {
      const av = parsePriceNumber(a.price);
      const bv = parsePriceNumber(b.price);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }
  // 최신순은 이미 createdAt DESC로 저장됨 (loadTags가 unshift로 추가)

  // 타이틀 표시
  const titleEl = $('listTitle');
  if (titleEl) {
    titleEl.textContent = favoriteFilter ? '찜 목록' : '내 상품 목록';
  }

  // 필터 활성화 표시 (깔대기 아이콘에 점)
  const filterBtn = $('btnFilterOpen');
  if (filterBtn) {
    const hasActiveFilter =
      !!activeFilters.category ||
      activeFilters.brands.size > 0 ||
      activeFilters.date !== 'all' ||
      activeFilters.priceMin > 0 ||
      activeFilters.priceMax < 1000000 ||
      activeFilters.sort !== 'newest' ||
      activeFilters.favoriteOnly;
    filterBtn.classList.toggle('has-filter', hasActiveFilter);
  }

  if (tags.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    if (favoriteFilter) {
      emptyEl.querySelector('p').textContent = '찜한 태그가 없습니다.';
    } else if (searchQuery.trim()) {
      emptyEl.querySelector('p').textContent = `"${searchQuery}" 검색 결과가 없습니다.`;
    } else {
      emptyEl.querySelector('p').textContent = '아직 저장된 태그가 없습니다.';
    }
    return;
  }
  emptyEl.style.display = 'none';
  listEl.innerHTML = '';

  for (const t of tags) {
    const card = document.createElement('div');
    card.className = 'tag-card';
    card.dataset.id = t.id;

    card.innerHTML = `
      <div class="tag-card-image-wrap">
        <img class="tag-card-image" src="${t.photoData}" alt="">
        ${t.category ? `<span class="tag-card-category">${escapeHtml(t.category)}</span>` : ''}
      </div>
      <div class="tag-card-icons">
        <button class="tag-card-heart" data-action="favorite" aria-label="찜">${t.favorite ? '♥' : '♡'}</button>
        <button class="tag-card-close" data-action="delete" aria-label="삭제">×</button>
      </div>
      <div class="tag-card-info">
        <div class="tag-card-brand">브랜드: ${escapeHtml(t.brand) || '-'}</div>
        ${t.price ? `<div class="tag-card-price">가격: ${escapeHtml(t.price)}</div>` : ''}
        ${t.productName ? `<div class="tag-card-name">${escapeHtml(t.productName)}</div>` : ''}
      </div>
    `;

    // 카드 본체 클릭 → 상세 (단, 액션 버튼은 제외)
    card.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (action) {
        e.stopPropagation();
        if (action.dataset.action === 'delete') {
          if (confirm('이 태그를 삭제할까요?')) {
            deleteTagById(t.id);
            renderList();
            showToast('삭제되었습니다');
          }
        } else if (action.dataset.action === 'favorite') {
          toggleFavorite(t.id);
          renderList();
        }
        return;
      }
      openDetail(t.id);
    });

    listEl.appendChild(card);
  }
}

function toggleFavorite(id) {
  const tags = loadTags();
  const idx = tags.findIndex((t) => t.id === id);
  if (idx < 0) return;
  tags[idx].favorite = !tags[idx].favorite;
  saveTags(tags);
}

// ---- 비교 화면 렌더링 ----
function renderCompare() {
  const all = loadTags();
  const favs = all.filter((t) => t.favorite);
  const listEl = $('compareList');
  const countEl = $('compareCount');
  const labelEl = $('compareNowLabel');

  if (countEl) countEl.textContent = `${favs.length}개`;
  if (labelEl) {
    labelEl.textContent =
      favs.length >= 2 ? `${favs.length}개 상품 한눈에 비교하기` : '상품 한눈에 비교하기';
  }

  if (favs.length === 0) {
    listEl.innerHTML = `
      <div class="compare-empty">
        <p>찜한 상품이 없습니다.</p>
        <p style="font-size: 13px;">목록 화면에서 ♡ 아이콘을 눌러 추가하세요.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  for (const t of favs) {
    const card = document.createElement('div');
    card.className = 'compare-card';
    card.dataset.id = t.id;

    const memoText = t.memo ? `<div class="compare-card-memo">💬 ${escapeHtml(t.memo)}</div>` : '';
    const sizeText = t.size ? `사이즈: ${escapeHtml(t.size)}` : '';

    card.innerHTML = `
      <img class="compare-card-image" src="${t.photoData}" alt="">
      <div class="compare-card-info">
        <div class="compare-card-brand">${escapeHtml(t.brand) || '-'}</div>
        <div class="compare-card-name">${escapeHtml(t.productName) || '(상품명 없음)'}</div>
        ${sizeText ? `<div class="compare-card-meta">${sizeText}</div>` : ''}
        ${t.price ? `<div class="compare-card-price">${escapeHtml(t.price)}</div>` : ''}
        ${memoText}
      </div>
      <button class="compare-card-close" data-action="unfavorite" aria-label="비교에서 제거">×</button>
    `;

    card.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (action) {
        e.stopPropagation();
        if (action.dataset.action === 'unfavorite') {
          toggleFavorite(t.id);
          renderCompare();
          showToast('비교 목록에서 제거했습니다');
        }
        return;
      }
      openDetail(t.id);
    });

    listEl.appendChild(card);
  }
}

// ---- 카테고리 Pills 렌더링 ----
function renderReviewCategoryPills() {
  const container = $('reviewCategoryPills');
  if (!container) return;
  container.innerHTML = '';
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-pill';
    if (reviewSelectedCategory === cat) btn.classList.add('active');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      // 같은 거 다시 클릭하면 해제
      if (reviewSelectedCategory === cat) {
        reviewSelectedCategory = '';
      } else {
        reviewSelectedCategory = cat;
      }
      renderReviewCategoryPills();
    });
    container.appendChild(btn);
  }
}

function renderFilterCategoryPills() {
  const container = $('categoryPills');
  if (!container) return;
  container.innerHTML = '';
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-pill';
    if (activeFilters.category === cat) btn.classList.add('active');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      // 토글: 같은 거 다시 누르면 해제
      activeFilters.category = activeFilters.category === cat ? '' : cat;
      renderFilterCategoryPills();
      updateFilterApplyLabel();
    });
    container.appendChild(btn);
  }
}

// ---- 가격 파싱 헬퍼 ----
function parsePriceNumber(str) {
  if (!str) return null;
  const m = String(str).match(/([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

function formatKRW(n) {
  if (n >= 1000000) return '₩1,000,000+';
  return '₩' + n.toLocaleString('ko-KR');
}

// ---- 필터 화면 렌더링 ----
function renderFilterScreen() {
  // 카테고리 pills
  renderFilterCategoryPills();

  // 브랜드 풀 만들기 (저장된 데이터에서 추출)
  const tags = loadTags();
  const brandCounts = new Map();
  for (const t of tags) {
    const b = (t.brand || '').trim();
    if (!b) continue;
    const key = b.toLowerCase();
    if (!brandCounts.has(key)) brandCounts.set(key, { name: b, count: 0 });
    brandCounts.get(key).count += 1;
  }
  // 빈도순으로 정렬
  const allBrands = Array.from(brandCounts.entries())
    .sort((a, b) => b[1].count - a[1].count);

  const visibleCount = brandShowAll ? allBrands.length : 6;
  const visible = allBrands.slice(0, visibleCount);

  const brandEl = $('brandPills');
  brandEl.innerHTML = '';
  if (allBrands.length === 0) {
    brandEl.innerHTML = '<span class="filter-empty">저장된 브랜드가 없습니다</span>';
  } else {
    for (const [key, b] of visible) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill';
      if (activeFilters.brands.has(key)) btn.classList.add('muted-active');
      btn.textContent = b.name;
      btn.dataset.brand = key;
      btn.addEventListener('click', () => {
        if (activeFilters.brands.has(key)) {
          activeFilters.brands.delete(key);
          btn.classList.remove('muted-active');
        } else {
          activeFilters.brands.add(key);
          btn.classList.add('muted-active');
        }
        updateFilterApplyLabel();
      });
      brandEl.appendChild(btn);
    }
  }
  const moreBtn = $('brandMoreToggle');
  if (moreBtn) {
    if (allBrands.length > 6) {
      moreBtn.style.display = '';
      moreBtn.textContent = brandShowAll ? '접기 ↑' : '더보기 →';
    } else {
      moreBtn.style.display = 'none';
    }
  }

  // 등록 기간 활성 표시
  document.querySelectorAll('#datePills .filter-pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.date === activeFilters.date);
  });

  // 정렬 활성 표시
  document.querySelectorAll('#sortPills .filter-pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.sort === activeFilters.sort);
  });

  // 가격 슬라이더 값
  $('priceMin').value = activeFilters.priceMin;
  $('priceMax').value = activeFilters.priceMax;
  updatePriceLabels();

  // 찜 토글
  $('favoriteOnlyToggle').checked = activeFilters.favoriteOnly;

  updateFilterApplyLabel();
}

function updatePriceLabels() {
  const minV = parseInt($('priceMin').value, 10);
  const maxV = parseInt($('priceMax').value, 10);
  $('priceMinLabel').textContent = formatKRW(minV);
  $('priceMaxLabel').textContent = formatKRW(maxV);

  // fill bar
  const range = 1000000;
  const left = (minV / range) * 100;
  const right = (maxV / range) * 100;
  const fill = $('priceRangeFill');
  if (fill) {
    fill.style.left = left + '%';
    fill.style.right = (100 - right) + '%';
  }
}

// "필터 적용 (N개 상품)" 라벨 갱신
function updateFilterApplyLabel() {
  // 임시로 activeFilters를 기준으로 결과 카운트
  const tags = loadTags();
  let count = tags.length;

  // 임시 카피로 카운트 (현재 컨트롤 값 반영)
  const temp = {
    category: activeFilters.category, // pill 클릭 시 즉시 반영됨
    brands: new Set(activeFilters.brands),
    date: document.querySelector('#datePills .filter-pill.active')?.dataset.date || 'all',
    priceMin: parseInt($('priceMin').value, 10),
    priceMax: parseInt($('priceMax').value, 10),
    favoriteOnly: $('favoriteOnlyToggle').checked,
  };

  let filtered = tags;
  if (temp.favoriteOnly) filtered = filtered.filter((t) => t.favorite);
  if (temp.category) {
    filtered = filtered.filter((t) => t.category === temp.category);
  }
  if (temp.brands.size > 0) {
    filtered = filtered.filter((t) =>
      temp.brands.has((t.brand || '').trim().toLowerCase())
    );
  }
  if (temp.date !== 'all') {
    const now = new Date();
    let cutoff;
    if (temp.date === 'today') {
      const start = new Date(now); start.setHours(0,0,0,0); cutoff = start.getTime();
    } else if (temp.date === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 7); cutoff = start.getTime();
    } else if (temp.date === 'month') {
      const start = new Date(now); start.setMonth(now.getMonth() - 1); cutoff = start.getTime();
    }
    if (cutoff !== undefined) filtered = filtered.filter((t) => t.createdAt >= cutoff);
  }
  const priceCapped = temp.priceMax < 1000000;
  if (temp.priceMin > 0 || priceCapped) {
    filtered = filtered.filter((t) => {
      const v = parsePriceNumber(t.price);
      if (v === null) return temp.priceMin === 0 && !priceCapped;
      if (v < temp.priceMin) return false;
      if (priceCapped && v > temp.priceMax) return false;
      return true;
    });
  }
  count = filtered.length;
  const lbl = $('filterApplyLabel');
  if (lbl) lbl.textContent = `필터 적용 (${count}개 상품)`;
}

// ---- 마이페이지 통계/렌더링 ----
function renderMyPage() {
  const tags = loadTags();
  const total = tags.length;
  const favCount = tags.filter((t) => t.favorite).length;

  // 브랜드 종류 (대소문자 무시, 빈 값 제외)
  const brandSet = new Set(
    tags
      .map((t) => (t.brand || '').trim().toLowerCase())
      .filter((b) => b.length > 0)
  );

  // 가격 평균 (숫자 파싱)
  const prices = tags
    .map((t) => {
      const m = (t.price || '').match(/([\d,]+)/);
      return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
    })
    .filter((p) => p !== null && p > 0);
  const avgPrice = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null;

  $('statTotal').textContent = `${total}개`;
  $('statFavorites').textContent =
    total > 0 ? `${Math.round((favCount / total) * 100)}% (${favCount}개)` : '0%';
  $('statBrands').textContent = `${brandSet.size}개`;
  $('statAvgPrice').textContent = avgPrice
    ? `₩${avgPrice.toLocaleString('ko-KR')}`
    : '-';

  // 최근 5개
  const recent = tags.slice(0, 5);
  const recentEl = $('recentList');
  if (recent.length === 0) {
    recentEl.innerHTML = `<div class="mypage-recent-empty">아직 저장된 상품이 없습니다.</div>`;
  } else {
    recentEl.innerHTML = '';
    for (const t of recent) {
      const item = document.createElement('div');
      item.className = 'mypage-recent-item';
      item.innerHTML = `
        <img src="${t.photoData}" alt="">
        <div class="mypage-recent-info">
          <div class="mypage-recent-name">${escapeHtml(t.productName) || escapeHtml(t.brand) || '(이름 없음)'}</div>
          <div class="mypage-recent-meta">
            ${new Date(t.createdAt).toLocaleDateString('ko-KR')}
            ${t.price ? `<span class="price">${escapeHtml(t.price)}</span>` : ''}
          </div>
        </div>
      `;
      item.addEventListener('click', () => openDetail(t.id));
      recentEl.appendChild(item);
    }
  }
}

// ---- 데이터 내보내기 ----
function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 1,
    tags: loadTags(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tagscanner_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('데이터를 다운로드했습니다');
}

// ---- 전체 데이터 삭제 ----
function clearAllData() {
  if (!confirm('정말 전체 태그 데이터를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.')) return;
  if (!confirm('한 번 더 확인합니다. 모든 사진과 정보가 삭제됩니다. 계속할까요?')) return;
  localStorage.removeItem(STORAGE_KEY);
  showToast('전체 데이터를 삭제했습니다');
  renderMyPage();
}

// ---- 비교 결과 (한눈에 보기) 렌더링 ----
function renderCompareResult() {
  const favs = loadTags().filter((t) => t.favorite);
  const body = $('compareResultBody');
  if (!body) return;

  if (favs.length < 2) {
    body.innerHTML = `
      <div class="compare-empty">
        <p>비교하려면 2개 이상 찜이 필요합니다.</p>
      </div>
    `;
    return;
  }

  // 가격(₩숫자)에서 정수 추출해 최저가 표시
  const priceNumbers = favs.map((t) => {
    const m = (t.price || '').match(/([\d,]+)/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  });
  const validPrices = priceNumbers.filter((p) => p !== null);
  const minPrice = validPrices.length ? Math.min(...validPrices) : null;

  const cols = `repeat(${favs.length + 1}, minmax(120px, 1fr))`;
  const headerCells = `
    <div class="compare-cell label">항목</div>
    ${favs.map(() => `<div class="compare-cell"></div>`).join('')}
  `;

  const row = (label, valueFn, extraClass = '') => `
    <div class="compare-row" style="grid-template-columns: ${cols};">
      <div class="compare-cell label">${label}</div>
      ${favs.map((t, i) => `<div class="compare-cell ${extraClass}">${valueFn(t, i) || '-'}</div>`).join('')}
    </div>
  `;

  body.innerHTML = `
    <div class="compare-table">
      <div class="compare-row" style="grid-template-columns: ${cols};">
        <div class="compare-cell label">사진</div>
        ${favs.map((t) => `<div class="compare-cell"><img src="${t.photoData}" alt=""></div>`).join('')}
      </div>
      ${row('브랜드', (t) => escapeHtml(t.brand), 'brand')}
      ${row('상품명', (t) => escapeHtml(t.productName))}
      ${row('사이즈', (t) => escapeHtml(t.size))}
      <div class="compare-row" style="grid-template-columns: ${cols};">
        <div class="compare-cell label">가격</div>
        ${favs.map((t, i) => {
          const isMin = priceNumbers[i] !== null && priceNumbers[i] === minPrice;
          return `<div class="compare-cell price ${isMin ? 'cheapest' : ''}">${escapeHtml(t.price) || '-'}${isMin ? ' 🏆' : ''}</div>`;
        }).join('')}
      </div>
      ${row('매장명', (t) => escapeHtml(t.store))}
      ${row('메모', (t) => escapeHtml(t.memo))}
    </div>
  `;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- 상세 화면 ----
function openDetail(id) {
  const tags = loadTags();
  const t = tags.find((x) => x.id === id);
  if (!t) return;
  currentDetailId = id;

  $('detailPhoto').src = t.photoData;
  $('d_category').value = t.category || '';
  $('d_brand').value = t.brand || '';
  $('d_productName').value = t.productName || '';
  $('d_price').value = t.price || '';
  $('d_size').value = t.size || '';
  $('d_serial').value = t.serial || '';
  $('d_store').value = t.store || '';
  $('d_memo').value = t.memo || '';
  $('d_createdAt').textContent = new Date(t.createdAt).toLocaleString('ko-KR');

  showScreen('detail');
}

// ---- 토스트 ----
let toastEl = null;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ---- 이벤트 바인딩 ----
function bindEvents() {
  $('cameraInput').addEventListener('change', (e) => {
    handleImageSelected(e.target.files[0]);
    e.target.value = '';
  });
  $('fileInput').addEventListener('change', (e) => {
    handleImageSelected(e.target.files[0]);
    e.target.value = '';
  });

  $('reviewForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentReview) return;
    addTag({
      photoData: currentReview.photoData,
      rawText: currentReview.rawText,
      category: reviewSelectedCategory,
      brand: $('brand').value.trim(),
      productName: $('productName').value.trim(),
      price: $('price').value.trim(),
      size: $('size').value.trim(),
      serial: $('serial').value.trim(),
      store: $('store').value.trim(),
      memo: $('memo').value.trim(),
    });
    currentReview = null;
    // 폼 리셋
    ['brand', 'productName', 'price', 'size', 'serial', 'store', 'memo'].forEach((id) => {
      const el = $(id);
      if (el) el.value = '';
    });
    reviewSelectedCategory = '';
    showToast('저장되었습니다');
    renderList();
    showScreen('list');
  });

  $('cancelReview').addEventListener('click', () => {
    currentReview = null;
    showScreen('main');
  });

  // OCR 재시도 버튼
  const retryBtn = $('retryOcr');
  if (retryBtn) retryBtn.addEventListener('click', retryOcr);

  $('navList').addEventListener('click', () => {
    renderList();
    showScreen('list');
  });

  // 카메라 화면의 찜 목록 버튼 → 비교 화면
  const navFav = $('navFavorites');
  if (navFav) {
    navFav.addEventListener('click', () => {
      renderCompare();
      showScreen('compare');
    });
  }

  // 비교 화면 뒤로가기
  const compareBack = $('compareBack');
  if (compareBack) {
    compareBack.addEventListener('click', () => showScreen('main'));
  }

  // 비교 상품 추가 → 목록으로 가서 ♡ 추가
  const addCompareItem = $('addCompareItem');
  if (addCompareItem) {
    addCompareItem.addEventListener('click', () => {
      renderList();
      showScreen('list');
      showToast('♡ 아이콘을 눌러 비교 목록에 추가하세요');
    });
  }

  // 한눈에 비교하기
  const compareNow = $('compareNow');
  if (compareNow) {
    compareNow.addEventListener('click', () => {
      const favs = loadTags().filter((t) => t.favorite);
      if (favs.length < 2) {
        showToast('비교하려면 2개 이상 찜이 필요합니다');
        return;
      }
      renderCompareResult();
      showScreen('compareResult');
    });
  }

  // 비교 결과 뒤로
  const compareResultBack = $('compareResultBack');
  if (compareResultBack) {
    compareResultBack.addEventListener('click', () => {
      renderCompare();
      showScreen('compare');
    });
  }

  // FAB
  const fab = $('fabCapture');
  if (fab) {
    fab.addEventListener('click', () => showScreen('main'));
  }

  // 상세/설정 뒤로가기
  const detailBack = $('detailBack');
  if (detailBack) {
    detailBack.addEventListener('click', () => {
      renderList();
      showScreen('list');
    });
  }
  const settingsBack = $('settingsBack');
  if (settingsBack) {
    settingsBack.addEventListener('click', () => {
      renderMyPage();
      showScreen('myPage');
    });
  }

  // 카메라 모드 탭 (OCR/일반)
  document.querySelectorAll('.camera-mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.camera-mode-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      captureMode = tab.dataset.mode || 'ocr';
      const guideText = document.querySelector('.guide-text');
      if (guideText) {
        guideText.textContent =
          captureMode === 'normal'
            ? '사진을 자유롭게 촬영하세요 (OCR 건너뜀)'
            : '상품 태그를 가이드 안에 맞춰주세요';
      }
    });
  });

  // 검색 토글 + 입력
  const btnSearchToggle = $('btnSearchToggle');
  if (btnSearchToggle) {
    btnSearchToggle.addEventListener('click', () => {
      const bar = $('listSearchBar');
      const isHidden = bar.hidden;
      bar.hidden = !isHidden;
      btnSearchToggle.classList.toggle('active', isHidden);
      if (isHidden) $('searchInput').focus();
      else {
        // 검색 닫을 때 쿼리 초기화
        searchQuery = '';
        $('searchInput').value = '';
        renderList();
      }
    });
  }
  const searchInput = $('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderList();
    });
  }

  // 목록 화면 우상단 ♡ 버튼 → 비교 화면으로 이동
  const btnGoCompare = $('btnGoCompare');
  if (btnGoCompare) {
    btnGoCompare.addEventListener('click', () => {
      renderCompare();
      showScreen('compare');
    });
  }

  // 필터 열기
  const btnFilterOpen = $('btnFilterOpen');
  if (btnFilterOpen) {
    btnFilterOpen.addEventListener('click', () => {
      renderFilterScreen();
      showScreen('filter');
    });
  }

  // 필터 닫기 (변경사항 미적용 - 단순 닫기)
  const filterClose = $('filterClose');
  if (filterClose) {
    filterClose.addEventListener('click', () => {
      renderList();
      showScreen('list');
    });
  }

  // 등록 기간 pill 클릭
  document.querySelectorAll('#datePills .filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#datePills .filter-pill').forEach((b) =>
        b.classList.remove('active')
      );
      btn.classList.add('active');
      updateFilterApplyLabel();
    });
  });

  // 정렬 pill 클릭
  document.querySelectorAll('#sortPills .filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sortPills .filter-pill').forEach((b) =>
        b.classList.remove('active')
      );
      btn.classList.add('active');
      updateFilterApplyLabel();
    });
  });

  // 브랜드 더보기 토글
  const brandMoreToggle = $('brandMoreToggle');
  if (brandMoreToggle) {
    brandMoreToggle.addEventListener('click', () => {
      brandShowAll = !brandShowAll;
      renderFilterScreen();
    });
  }

  // 가격 슬라이더 (이중 슬라이더, 교차 방지)
  const priceMinEl = $('priceMin');
  const priceMaxEl = $('priceMax');
  if (priceMinEl && priceMaxEl) {
    priceMinEl.addEventListener('input', () => {
      const minV = parseInt(priceMinEl.value, 10);
      const maxV = parseInt(priceMaxEl.value, 10);
      if (minV > maxV - 10000) {
        priceMinEl.value = maxV - 10000;
      }
      updatePriceLabels();
      updateFilterApplyLabel();
    });
    priceMaxEl.addEventListener('input', () => {
      const minV = parseInt(priceMinEl.value, 10);
      const maxV = parseInt(priceMaxEl.value, 10);
      if (maxV < minV + 10000) {
        priceMaxEl.value = minV + 10000;
      }
      updatePriceLabels();
      updateFilterApplyLabel();
    });
  }

  // 찜 토글
  const favOnlyToggle = $('favoriteOnlyToggle');
  if (favOnlyToggle) {
    favOnlyToggle.addEventListener('change', () => {
      updateFilterApplyLabel();
    });
  }

  // 필터 초기화
  const filterReset = $('filterReset');
  if (filterReset) {
    filterReset.addEventListener('click', () => {
      activeFilters = defaultFilters();
      brandShowAll = false;
      renderFilterScreen();
      showToast('필터가 초기화되었습니다');
    });
  }

  // 필터 적용
  const filterApply = $('filterApply');
  if (filterApply) {
    filterApply.addEventListener('click', () => {
      // 현재 컨트롤 값을 activeFilters에 커밋
      activeFilters.date =
        document.querySelector('#datePills .filter-pill.active')?.dataset.date || 'all';
      activeFilters.sort =
        document.querySelector('#sortPills .filter-pill.active')?.dataset.sort || 'newest';
      activeFilters.priceMin = parseInt($('priceMin').value, 10);
      activeFilters.priceMax = parseInt($('priceMax').value, 10);
      activeFilters.favoriteOnly = $('favoriteOnlyToggle').checked;
      // 브랜드는 pill 클릭 시 즉시 activeFilters에 반영됨

      renderList();
      showScreen('list');
      showToast('필터를 적용했습니다');
    });
  }

  // 외부 검색 CTAs (상세 화면)
  const btnSearchPrice = $('btnSearchPrice');
  if (btnSearchPrice) {
    btnSearchPrice.addEventListener('click', () => {
      const tags = loadTags();
      const t = tags.find((x) => x.id === currentDetailId);
      if (!t) return;
      const q = [t.brand, t.productName, t.size].filter(Boolean).join(' ');
      if (!q) {
        showToast('검색어가 부족합니다');
        return;
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(q + ' 최저가')}&tbm=shop`;
      window.open(url, '_blank');
    });
  }
  const btnVisitOfficial = $('btnVisitOfficial');
  if (btnVisitOfficial) {
    btnVisitOfficial.addEventListener('click', () => {
      const tags = loadTags();
      const t = tags.find((x) => x.id === currentDetailId);
      if (!t || !t.brand) {
        showToast('브랜드 정보가 없습니다');
        return;
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(t.brand + ' 공식몰')}&btnI=1`;
      window.open(url, '_blank');
    });
  }

  // M 버튼 → 마이페이지
  $('navSettings').addEventListener('click', () => {
    renderMyPage();
    showScreen('myPage');
  });

  // 마이페이지 뒤로
  const myPageBack = $('myPageBack');
  if (myPageBack) {
    myPageBack.addEventListener('click', () => showScreen('main'));
  }

  // 마이페이지 메뉴: API 설정
  const menuApiSettings = $('menuApiSettings');
  if (menuApiSettings) {
    menuApiSettings.addEventListener('click', () => {
      const s = loadSettings();
      $('ocrEngine').value = s.ocrEngine || 'auto';
      $('googleApiKey').value = s.googleApiKey || '';
      showScreen('settings');
    });
  }

  // 마이페이지 메뉴: 데이터 내보내기
  const menuExport = $('menuExport');
  if (menuExport) {
    menuExport.addEventListener('click', exportData);
  }

  // 마이페이지 메뉴: 전체 삭제
  const menuClearAll = $('menuClearAll');
  if (menuClearAll) {
    menuClearAll.addEventListener('click', clearAllData);
  }

  // 설정 저장
  $('saveSettings').addEventListener('click', () => {
    const s = {
      ocrEngine: $('ocrEngine').value,
      googleApiKey: $('googleApiKey').value.trim(),
    };
    saveSettings(s);
    showToast('설정이 저장되었습니다');
    showScreen('main');
  });

  // API 키 테스트
  $('testApiKey').addEventListener('click', async () => {
    const key = $('googleApiKey').value.trim();
    if (!key) {
      showToast('API 키를 입력하세요');
      return;
    }
    showToast('테스트 중...');
    try {
      // 1x1 흰색 픽셀 base64 (테스트용 최소 이미지)
      const testB64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
      const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            { image: { content: testB64 }, features: [{ type: 'TEXT_DETECTION' }] },
          ],
        }),
      });
      if (res.ok) {
        showToast('✅ API 키가 정상 작동합니다');
      } else {
        const errText = await res.text();
        let msg = `❌ 오류 (${res.status})`;
        try {
          const j = JSON.parse(errText);
          msg = '❌ ' + (j.error?.message || msg);
        } catch (_) {}
        showToast(msg);
      }
    } catch (e) {
      showToast('❌ ' + (e.message || e));
    }
  });

  $('emptyCapture').addEventListener('click', () => {
    showScreen('main');
  });

  document.querySelector('.topbar h1').addEventListener('click', () => {
    showScreen('main');
  });
  document.querySelector('.topbar h1').style.cursor = 'pointer';

  $('detailForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentDetailId) return;
    updateTag(currentDetailId, {
      category: $('d_category').value,
      brand: $('d_brand').value.trim(),
      productName: $('d_productName').value.trim(),
      price: $('d_price').value.trim(),
      size: $('d_size').value.trim(),
      serial: $('d_serial').value.trim(),
      store: $('d_store').value.trim(),
      memo: $('d_memo').value.trim(),
    });
    showToast('수정되었습니다');
    renderList();
    showScreen('list');
  });

  $('deleteDetail').addEventListener('click', () => {
    if (!currentDetailId) return;
    if (!confirm('이 태그를 삭제할까요?')) return;
    deleteTagById(currentDetailId);
    currentDetailId = null;
    showToast('삭제되었습니다');
    renderList();
    showScreen('list');
  });
}

// ---- 시작 ----
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  showScreen('main');
});
