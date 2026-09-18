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

// ---- OCR (Google Cloud Vision) — TEXT + LOGO 동시 요청 ----
// 반환: { text: string, logos: [{description, score}, ...] }
async function runGoogleVisionOcr(imageData) {
  const settings = loadSettings();
  const key = settings.googleApiKey;
  if (!key) throw new Error('Google API 키가 설정되지 않았습니다');

  const progressText = $('progressText');
  const progressFill = $('progressFill');
  progressText.textContent = 'Google Vision API 호출 중... (텍스트 + 로고)';
  progressFill.style.width = '40%';

  // base64 데이터에서 데이터 URL 헤더 제거
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;
  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [
          { type: 'TEXT_DETECTION', maxResults: 1 },
          { type: 'LOGO_DETECTION', maxResults: 5 },
        ],
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
  const response = data.responses?.[0] || {};
  const text = response.fullTextAnnotation?.text || '';
  const logos = (response.logoAnnotations || []).map((l) => ({
    description: l.description,
    score: l.score || 0,
  }));
  return { text, logos };
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
// 반환: { text: string, logos: [] }  (Tesseract는 logos 항상 빈 배열)
async function runOcr({ rawData, processedData, engine, modeIndex = 0 }) {
  if (engine === 'google') {
    return await runGoogleVisionOcr(rawData);
  }
  const text = await runTesseractOcr(processedData, modeIndex);
  return { text, logos: [] };
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

    // 일반 모드는 택이 아니라 옷을 찍은 경우라 사진 종류를 옷으로 둔다
    const primaryKind = captureMode === 'normal' ? 'garment' : 'tag';

    // 일반 모드면 OCR 건너뛰고 빈 폼으로 진행
    if (captureMode === 'normal') {
      finishOcr({
        photoData,
        rawData,
        processedData,
        rawText: '',
        engine: 'none',
        primaryKind,
      });
      return;
    }

    const engine = pickEngine();
    ocrAttempts = 0;
    const ocrResult = await runOcr({ rawData, processedData, engine, modeIndex: ocrAttempts });
    finishOcr({
      photoData,
      rawData,
      processedData,
      rawText: ocrResult.text,
      logos: ocrResult.logos,
      engine,
      primaryKind,
    });
  } catch (e) {
    console.error(e);
    showToast('OCR 실패: ' + (e.message || e));
    showScreen('main');
  }
}

// ---- 소재·원단 표시 ----
// 파서가 사전에서 찾은 가공·조직 용어를 칩으로 보여 준다 (누르면 소재 칸에 추가)
function renderFabricTags(tags) {
  const box = $('fabricTags');
  if (!box) return;
  const list = tags || [];
  box.innerHTML = list
    .map((t) => `<button type="button" class="fabric-chip" data-term="${t}">${t}</button>`)
    .join('');
  box.hidden = list.length === 0;
  box.querySelectorAll('.fabric-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cur = $('material').value.trim();
      const term = btn.dataset.term;
      if (cur.includes(term)) return;
      $('material').value = cur ? `${cur} / ${term}` : term;
    });
  });
}

// ---- 세탁법 선택 버튼 ----
// 세탁법은 가격표 택보다 옷 안쪽 케어라벨에 적혀 있어 자동으로 못 읽는 경우가 많다.
// 자주 쓰는 표현을 버튼으로 두고 눌러서 넣고 빼게 한다.
const CARE_OPTIONS = ['손세탁', '드라이클리닝', '세탁기 가능', '물세탁 금지', '세탁기 금지', '표백 금지', '다림질 주의', '그늘 건조'];
const CARE_SEPARATOR = ' · ';

function splitCare(value) {
  return String(value || '').split(/\s*[·,/]\s*/).map((s) => s.trim()).filter(Boolean);
}

function renderCareChips() {
  document.querySelectorAll('.care-chips').forEach((box) => {
    const input = $(box.dataset.input);
    if (!input) return;
    const selected = splitCare(input.value);
    box.innerHTML = CARE_OPTIONS.map((opt) =>
      `<button type="button" class="care-chip ${selected.includes(opt) ? 'active' : ''}" data-care="${opt}">${opt}</button>`
    ).join('');
  });
}

function toggleCare(inputId, option) {
  const input = $(inputId);
  const items = splitCare(input.value);
  const next = items.includes(option) ? items.filter((x) => x !== option) : [...items, option];
  input.value = next.join(CARE_SEPARATOR);
  renderCareChips();
}

// ---- 브랜드 후보 제시 ----
// 브랜드를 확실히 못 잡았을 때 브랜드 기준 데이터(brands.js)에서 후보를 띄운다
function renderBrandSuggest(fields, lines) {
  const box = $('brandSuggest');
  if (!box) return;
  const uncertain = !fields.brand || fields.brandSource === 'fallback';
  const names = [];
  if (uncertain) {
    // 택 양식 지문 추정 (자동 입력 기준에는 못 미치는 경우) → 첫 후보로
    const byProfile = window.suggestBrandByProfile ? window.suggestBrandByProfile(lines) : null;
    if (byProfile) names.push(byProfile.brand);
    // 브랜드 기준 데이터와 글자가 비슷한 후보
    for (const s of window.suggestBrands ? window.suggestBrands(lines, 3) : []) {
      if (!names.includes(s.name)) names.push(s.name);
    }
  }
  const suggestions = names.slice(0, 3);
  box.innerHTML = suggestions.length
    ? '<span class="brand-suggest-label">이 브랜드인가요?</span>' +
      suggestions
        .map((name) => `<button type="button" class="brand-chip" data-name="${name}">${name}</button>`)
        .join('')
    : '';
  box.hidden = suggestions.length === 0;
  box.querySelectorAll('.brand-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('brand').value = btn.dataset.name;
      box.hidden = true;
    });
  });
}

// 브랜드 입력칸 자동완성 목록 (브랜드 기준 데이터 전체)
function initBrandOptions() {
  const dl = $('brandOptions');
  if (!dl || !window.BRAND_CATALOG) return;
  dl.innerHTML = window.BRAND_CATALOG.map(
    (b) => `<option value="${b.name}">${b.ko || ''}</option>`
  ).join('');
}

// ---- 등록 화면 사진 목록 ----
// 처음 찍은 사진(택 또는 옷)은 빼지 않고, 추가한 옷·착용 사진만 뺄 수 있다
function renderReviewPhotos() {
  const strip = $('reviewPhotoStrip');
  if (!strip || !currentReview) return;
  const items = [
    { kind: currentReview.primaryKind, dataUrl: currentReview.photoData, fixed: true },
    ...currentReview.extraPhotos,
  ];
  strip.innerHTML = items.map((p, i) => `
    <div class="photo-thumb">
      <img src="${p.dataUrl}" alt="">
      <span class="photo-kind">${PHOTO_KIND_LABEL[p.kind]}</span>
      ${p.fixed ? '' : `<button type="button" class="photo-remove" data-index="${i - 1}" aria-label="사진 빼기">×</button>`}
    </div>
  `).join('');
  strip.querySelectorAll('.photo-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentReview.extraPhotos.splice(Number(btn.dataset.index), 1);
      renderReviewPhotos();
    });
  });
  $('reviewPhotoCount').textContent = `${items.length}/${MAX_PHOTOS}`;
  document.querySelectorAll('#reviewForm .photo-add-btn').forEach((b) => {
    b.disabled = items.length >= MAX_PHOTOS;
  });
}

async function addReviewPhotos(files, kind) {
  if (!currentReview || !files || files.length === 0) return;
  const room = MAX_PHOTOS - 1 - currentReview.extraPhotos.length;
  if (room <= 0) {
    showToast(`사진은 상품당 ${MAX_PHOTOS}장까지 넣을 수 있어요`);
    return;
  }
  try {
    const urls = await filesToPhotoDataUrls(files, room);
    currentReview.extraPhotos.push(...urls.map((dataUrl) => ({ kind, dataUrl })));
    renderReviewPhotos();
    if (files.length > room) showToast(`${room}장만 추가했어요 (상품당 최대 ${MAX_PHOTOS}장)`);
  } catch (e) {
    showToast('사진을 불러오지 못했어요: ' + (e.message || e));
  }
}

function finishOcr({ photoData, rawData, processedData, rawText, logos, engine, primaryKind = 'tag', extraPhotos = [] }) {
  const lines = window.splitLines(rawText);
  const fields = window.parseFields(lines, { logos: logos || [] });

  currentReview = {
    photoData, rawData, processedData, rawText, logos: logos || [], fields, engine,
    primaryKind, // 처음 찍은 사진의 종류 ('tag' | 'garment')
    extraPhotos, // 저장 전에 추가한 옷·착용 사진 [{ kind, dataUrl }]
  };
  renderReviewPhotos();

  $('brand').value = fields.brand;
  $('productName').value = fields.productName;
  $('price').value = fields.price;
  $('size').value = fields.size;
  $('serial').value = fields.serial;
  $('material').value = fields.material || '';
  $('care').value = fields.care || '';
  renderCareChips();
  renderFabricTags(fields.fabric);
  renderBrandSuggest(fields, lines);
  if (!$('memo').value) $('memo').value = '';
  $('rawText').textContent = rawText || '(인식된 텍스트 없음)';

  // 브랜드 감지 소스 표시 (logo/dictionary/fallback)
  const brandLabel = document.querySelector('label[for="brand"]');
  if (brandLabel) {
    let badge = '';
    if (fields.brandSource === 'logo') {
      badge = ' <span class="brand-source-badge logo">🎯 로고 자동인식</span>';
    } else if (fields.brandSource === 'dictionary') {
      badge = ' <span class="brand-source-badge dict">📖 사전 매칭</span>';
    } else if (fields.brandSource === 'fallback') {
      badge = ' <span class="brand-source-badge fallback">💭 추정</span>';
    }
    brandLabel.innerHTML = '브랜드' + badge;
  }

  // 카테고리 pills 렌더 (파서가 감지한 카테고리 있으면 자동 선택)
  reviewSelectedCategory = fields.category || '';
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
    const ocrResult = await runOcr({
      rawData: currentReview.rawData,
      processedData: currentReview.processedData,
      engine,
      modeIndex: ocrAttempts,
    });
    finishOcr({
      photoData: currentReview.photoData,
      rawData: currentReview.rawData,
      processedData: currentReview.processedData,
      rawText: ocrResult.text,
      logos: ocrResult.logos,
      engine,
      primaryKind: currentReview.primaryKind,
      extraPhotos: currentReview.extraPhotos,
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
    return { ok: true };
  } catch (e) {
    const isQuota =
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      /quota/i.test(e.message || '');
    return {
      ok: false,
      error: e,
      isQuota,
    };
  }
}

function addTag(data) {
  const tags = loadTags();
  const tag = {
    id: Date.now(),
    createdAt: Date.now(),
    ...data,
  };
  tags.unshift(tag);
  const r = saveTags(tags);
  if (!r.ok) {
    if (r.isQuota) {
      alert(
        '⚠️ 저장 공간이 가득 찼습니다!\n\n' +
        '해결 방법:\n' +
        '1. 마이페이지에서 데이터를 JSON으로 내보내기\n' +
        '2. 오래된 상품 삭제\n' +
        '3. 그 후 다시 저장 시도\n\n' +
        '※ 브라우저 localStorage 한계 (보통 5~10MB)'
      );
    } else {
      alert('저장 실패: ' + (r.error?.message || '알 수 없는 오류'));
    }
    return null;
  }
  return tag;
}

function updateTag(id, data) {
  const tags = loadTags();
  const idx = tags.findIndex((t) => t.id === id);
  if (idx < 0) return;
  tags[idx] = { ...tags[idx], ...data };
  const r = saveTags(tags);
  if (!r.ok) {
    if (r.isQuota) {
      alert('⚠️ 저장 공간이 가득 찼습니다. 오래된 항목을 삭제하거나 데이터를 내보내세요.');
    } else {
      alert('수정 저장 실패: ' + (r.error?.message || '알 수 없는 오류'));
    }
  }
}

function deleteTagById(id) {
  const tags = loadTags();
  const deletedTag = tags.find((t) => t.id === id);
  const remaining = tags.filter((t) => t.id !== id);
  saveTags(remaining);
  return deletedTag;
}

// ---- 상품 사진 ----
// 상품 하나에 사진 여러 장: photos = [{ id, kind: 'tag' | 'garment' | 'wearing', createdAt }]
// 사진 파일은 PhotoStore(IndexedDB)에 있고 상품 정보에는 id만 저장한다.
const MAX_PHOTOS = 6;
const PHOTO_KIND_LABEL = { tag: '택', garment: '옷', wearing: '착용' };

function tagPhotos(t) {
  return Array.isArray(t && t.photos) ? t.photos : [];
}

// 목록·비교에 보여줄 대표 사진: 직접 지정한 사진 → 옷 사진 → 첫 사진
function coverPhotoId(t) {
  const photos = tagPhotos(t);
  if (t.coverPhotoId && photos.some((p) => p.id === t.coverPhotoId)) return t.coverPhotoId;
  const garment = photos.find((p) => p.kind === 'garment');
  return (garment || photos[0] || {}).id || '';
}

// 비슷한 옷 찾기에 쓰는 사진: 옷 사진만 (택이나 착용샷끼리는 옷 비교가 안 된다)
function garmentPhotoId(t) {
  const photos = tagPhotos(t);
  const cover = photos.find((p) => p.id === t.coverPhotoId && p.kind === 'garment');
  return (cover || photos.find((p) => p.kind === 'garment') || {}).id || '';
}

// 저장된 embedding이 지금의 옷 사진으로 만든 것인지
function hasValidEmbedding(t) {
  return Boolean(t.embedding && t.embeddingPhotoId && t.embeddingPhotoId === garmentPhotoId(t));
}

// 대표 사진 태그. 실제 이미지는 렌더 후 PhotoStore.hydrate()가 채운다.
function coverImg(t, className = '') {
  // 이전 형식이 아직 옮겨지지 않은 상품
  if (!Array.isArray(t.photos) && t.photoData) {
    return `<img class="${className}" src="${t.photoData}" alt="">`;
  }
  const id = coverPhotoId(t);
  return id
    ? `<img class="${className}" data-photo-id="${id}" alt="">`
    : `<div class="${className} photo-placeholder">사진 없음</div>`;
}

// 파일 여러 장을 저장용 크기로 줄여 data URL로 바꾼다
async function filesToPhotoDataUrls(files, room) {
  const out = [];
  for (const file of Array.from(files).slice(0, Math.max(0, room))) {
    const img = await loadImageFromFile(file);
    out.push(imageToCanvas(img, STORAGE_MAX_DIMENSION).toDataURL('image/jpeg', JPEG_QUALITY));
  }
  return out;
}

// data URL 사진들을 사진 저장소에 넣고 photos 항목을 돌려준다
async function storePhotos(items) {
  const now = Date.now();
  const stored = [];
  try {
    for (const p of items) {
      const id = PhotoStore.newId();
      await PhotoStore.put(id, await PhotoStore.dataUrlToBlob(p.dataUrl));
      stored.push({ id, kind: p.kind, createdAt: p.createdAt || now });
    }
  } catch (e) {
    await PhotoStore.remove(stored.map((p) => p.id)).catch(() => {});
    throw e;
  }
  return stored;
}

// 예전 형식(상품마다 photoData 한 장)을 사진 저장소로 옮긴다.
// 옮기기에 성공한 상품만 photoData를 지우므로 도중에 실패해도 원본 사진은 남는다.
async function migrateLegacyPhotos() {
  const tags = loadTags();
  let moved = 0;
  for (const t of tags) {
    if (!t.photoData || Array.isArray(t.photos)) continue;
    try {
      const [photo] = await storePhotos([{ kind: 'tag', dataUrl: t.photoData, createdAt: t.createdAt }]);
      t.photos = [photo];
      delete t.photoData;
      // 기존 embedding은 택 사진으로 만든 것이라 옷끼리 비교하는 데 쓸 수 없다
      delete t.embedding;
      delete t.embeddingPhotoId;
      moved++;
    } catch (e) {
      console.warn('사진 이전 실패 (원본 유지):', t.id, e);
    }
  }
  if (moved > 0) saveTags(tags);
  return moved;
}

// 어느 상품에도 연결되지 않은 사진 정리 (삭제 후 되돌리기 시간이 지난 사진 등)
async function cleanupOrphanPhotos() {
  const used = new Set(loadTags().flatMap((t) => tagPhotos(t).map((p) => p.id)));
  // 저장 중인 사진(사진을 먼저 넣고 상품을 나중에 저장)을 지우지 않도록 최근 10분 사진은 남긴다
  const createdAt = (id) => parseInt(String(id).slice(1, -6), 36) || 0;
  const orphans = (await PhotoStore.listIds())
    .filter((id) => !used.has(id) && Date.now() - createdAt(id) > 10 * 60 * 1000);
  if (orphans.length > 0) await PhotoStore.remove(orphans);
  return orphans.length;
}

// 삭제된 항목을 다시 목록에 복구 (같은 id/데이터 그대로)
function restoreTag(tag) {
  if (!tag) return;
  const tags = loadTags();
  // 이미 같은 id가 있으면 무시 (중복 방지)
  if (tags.some((t) => t.id === tag.id)) return;
  tags.unshift(tag);
  tags.sort((a, b) => b.createdAt - a.createdAt);
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
        ${coverImg(t, 'tag-card-image')}
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
          const deleted = deleteTagById(t.id);
          renderList();
          showToast('삭제되었습니다', {
            duration: 5000,
            actionLabel: '실행 취소',
            onAction: () => {
              restoreTag(deleted);
              renderList();
              showToast('복구되었습니다');
            },
          });
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
  PhotoStore.hydrate(listEl);
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
      ${coverImg(t, 'compare-card-image')}
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
          showToast('비교 목록에서 제거했습니다', {
            duration: 4000,
            actionLabel: '실행 취소',
            onAction: () => {
              toggleFavorite(t.id);
              renderCompare();
            },
          });
        }
        return;
      }
      openDetail(t.id);
    });

    listEl.appendChild(card);
  }
  PhotoStore.hydrate(listEl);
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

// ============================================================
// CLIP 통합 (이미지 embedding + 유사도 검색)
// ============================================================

// 외부 상품 DB (crawler에서 미리 계산한 embedding 로드)
let productsDB = null;
let productsDBLoading = null;

async function loadProductsDB() {
  if (productsDB !== null) return productsDB;
  if (productsDBLoading) return productsDBLoading;

  productsDBLoading = (async () => {
    try {
      const res = await fetch('products_db.json');
      if (!res.ok) {
        console.warn('products_db.json 없음 (외부 상품 검색 비활성화)');
        productsDB = { products: [] };
        return productsDB;
      }
      const data = await res.json();
      console.log(`[Products DB] ${data.count}개 상품 로드 완료 (${data.brands.length}개 브랜드)`);
      productsDB = data;
      return data;
    } catch (e) {
      console.warn('products_db.json 로드 실패:', e);
      productsDB = { products: [] };
      return productsDB;
    }
  })();

  return productsDBLoading;
}

// 외부 상품 DB에서 유사 상품 검색
async function findSimilarProducts(targetEmbedding, topK = 5) {
  const db = await loadProductsDB();
  if (!db.products || db.products.length === 0) return [];

  const scored = db.products
    .map((p) => ({
      product: p,
      similarity: window.CLIP.cosineSimilarity(targetEmbedding, p.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

// 옷 사진으로 embedding을 만들어 상품에 저장한다 (어떤 사진으로 만들었는지도 함께 기록)
async function generateEmbeddingForTag(tagId, photoId) {
  try {
    const embedding = await window.CLIP.computeImageEmbedding(await PhotoStore.url(photoId));
    const tags = loadTags();
    const idx = tags.findIndex((t) => t.id === tagId);
    // 계산하는 사이 옷 사진이 바뀌었으면 저장하지 않는다
    if (idx >= 0 && garmentPhotoId(tags[idx]) === photoId) {
      tags[idx].embedding = embedding;
      tags[idx].embeddingPhotoId = photoId;
      saveTags(tags);
    }
    return embedding;
  } catch (e) {
    console.warn('embedding 생성 실패:', e);
    return null;
  }
}

// 옷 사진은 있는데 embedding이 없거나 예전 사진 기준인 상품들을 채운다
async function fillMissingEmbeddings(tags, onProgress) {
  const pending = tags.filter((t) => garmentPhotoId(t) && !hasValidEmbedding(t));
  for (let i = 0; i < pending.length; i++) {
    if (onProgress) onProgress(i + 1, pending.length);
    await generateEmbeddingForTag(pending[i].id, garmentPhotoId(pending[i]));
  }
  return pending.length;
}

function showSimilarLoading(container, message) {
  container.innerHTML = `
    <div class="similar-loading">
      <div>🎨 이미지 분석 중...</div>
      <div class="similar-loading-bar"><div id="similarProgressFill" class="similar-loading-fill"></div></div>
      <div id="similarProgressText" style="font-size: 11px;">${message}</div>
    </div>
  `;
}

// 상세 화면에서 유사한 옷 표시 (옷 사진끼리 비교)
async function renderSimilarClothes(currentTag) {
  const container = $('similarContent');
  if (!container) return;

  if (!garmentPhotoId(currentTag)) {
    container.innerHTML = `<p class="similar-hint">옷 사진을 추가하면 내 옷장에서 비슷한 옷을 찾아 드려요.</p>`;
    return;
  }

  const candidates = loadTags().filter((t) => t.id !== currentTag.id && garmentPhotoId(t));
  if (candidates.length === 0) {
    container.innerHTML = `<p class="similar-hint">옷 사진이 있는 상품이 하나 더 있어야 비교할 수 있어요.</p>`;
    return;
  }

  const needsWork = !hasValidEmbedding(currentTag) || candidates.some((t) => !hasValidEmbedding(t));
  if (needsWork) {
    showSimilarLoading(container, 'CLIP 모델 로딩 중 (첫 실행 시 40MB 다운로드)');
    window.CLIP.setProgressCallback((msg, pct) => {
      const fill = $('similarProgressFill');
      const text = $('similarProgressText');
      if (fill) fill.style.width = pct + '%';
      if (text) text.textContent = msg;
    });
    try {
      await fillMissingEmbeddings([currentTag, ...candidates], (i, n) => {
        const text = $('similarProgressText');
        if (text) text.textContent = `옷 사진 분석 중 (${i}/${n})`;
      });
    } catch (e) {
      container.innerHTML = `<p class="similar-hint">❌ 분석 실패: ${escapeHtml(e.message || String(e))}</p>`;
      return;
    } finally {
      window.CLIP.setProgressCallback(null);
    }
  }

  // 분석 중 다른 상품으로 이동했으면 결과를 그리지 않는다
  if (currentDetailId !== currentTag.id) return;

  const fresh = loadTags();
  const target = fresh.find((t) => t.id === currentTag.id);
  const targetEmb = target && hasValidEmbedding(target) ? target.embedding : null;
  const tagsWithEmb = fresh.filter((t) => t.id !== currentTag.id && hasValidEmbedding(t));
  if (!targetEmb || tagsWithEmb.length === 0) {
    container.innerHTML = `<p class="similar-hint">❌ 옷 사진을 분석하지 못했어요.</p>`;
    return;
  }

  // 유사한 옷 찾기 (자기 자신 제외)
  const similar = window.CLIP.findSimilar(targetEmb, tagsWithEmb, currentTag.id, 3);

  if (similar.length === 0) {
    container.innerHTML = `<p class="similar-hint">유사한 옷을 찾지 못했어요.</p>`;
    return;
  }

  // 내 옷장 결과
  let html = `
    <h4 class="similar-subtitle">🎨 내 옷장에서 (${similar.length}개)</h4>
    <div class="similar-list">
      ${similar.map(({ tag, similarity }) => `
        <div class="similar-card" data-id="${tag.id}">
          ${coverImg(tag)}
          <div class="similar-card-info">
            <div class="similar-card-brand">${escapeHtml(tag.brand) || '(브랜드 없음)'}</div>
            <div class="similar-card-score">유사도 ${Math.round(similarity * 100)}%</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  container.innerHTML = html;
  PhotoStore.hydrate(container);

  // 클릭 시 해당 상세로 이동
  container.querySelectorAll('.similar-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id, 10);
      openDetail(id);
    });
  });

  // 외부 상품 DB 검색 (비동기, 백그라운드)
  findSimilarProducts(targetEmb, 5).then((products) => {
    if (products.length === 0) return;
    const externalHtml = `
      <h4 class="similar-subtitle" style="margin-top: 20px;">🛍 시장에서 비슷한 상품 (${products.length}개)</h4>
      <div class="similar-list similar-list-external">
        ${products.map(({ product, similarity }) => `
          <div class="similar-card">
            <img src="${product.image}" alt="" onerror="this.style.opacity=0.3;">
            <div class="similar-card-info">
              <div class="similar-card-brand">${escapeHtml(product.brand)}</div>
              <div class="similar-card-score">유사도 ${Math.round(similarity * 100)}%</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    container.insertAdjacentHTML('beforeend', externalHtml);
  }).catch((e) => console.warn('외부 상품 검색 실패:', e));
}

// 마이페이지에서 스타일 분석
async function renderStyleAnalysis() {
  const container = $('styleAnalysis');
  if (!container) return;

  // 스타일은 옷 사진이 있는 상품만 분석한다
  const withGarment = loadTags().filter((t) => garmentPhotoId(t));

  if (withGarment.length === 0) {
    container.innerHTML = `
      <p class="style-hint">아직 분석할 옷 사진이 없어요.<br>상품에 옷 사진을 추가하면 스타일을 분석해 드려요.</p>
    `;
    return;
  }

  container.innerHTML = `
    <p class="style-hint">옷 사진이 있는 상품 ${withGarment.length}개를 분석할 수 있어요</p>
    <button class="style-load-btn" id="runStyleAnalysis">📊 스타일 분석 실행</button>
  `;

  $('runStyleAnalysis').addEventListener('click', async () => {
    const btn = $('runStyleAnalysis');
    btn.disabled = true;
    btn.textContent = '분석 중...';

    try {
      await fillMissingEmbeddings(withGarment, (i, n) => {
        btn.textContent = `옷 사진 분석 중... (${i}/${n})`;
      });
      const tagsWithEmb = loadTags().filter((t) => hasValidEmbedding(t));
      if (tagsWithEmb.length === 0) throw new Error('옷 사진을 분석하지 못했어요');

      // 각 태그마다 스타일 분류
      const styleCounts = {};
      window.CLIP.STYLE_LABELS_EN.forEach((s) => (styleCounts[s] = 0));

      for (let i = 0; i < tagsWithEmb.length; i++) {
        const tag = tagsWithEmb[i];
        btn.textContent = `분석 중... (${i + 1}/${tagsWithEmb.length})`;

        const scores = await window.CLIP.classifyStyle(
          tag.embedding,
          window.CLIP.STYLE_LABELS_EN
        );
        // 최고 점수 스타일에 +1
        if (scores.length > 0) {
          styleCounts[scores[0].label] += 1;
        }
      }

      const total = tagsWithEmb.length;
      const sorted = Object.entries(styleCounts)
        .map(([label, count]) => ({
          label,
          labelKo: window.CLIP.STYLE_LABEL_KO[label] || label,
          count,
          pct: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      const topStyle = sorted[0];
      container.innerHTML = `
        ${sorted.filter((s) => s.count > 0).map((s) => `
          <div class="style-bar-row">
            <div class="style-bar-label">
              <span>${s.labelKo}</span>
              <span>${s.pct}% (${s.count}개)</span>
            </div>
            <div class="style-bar-track">
              <div class="style-bar-fill" style="width: ${s.pct}%"></div>
            </div>
          </div>
        `).join('')}
        <div class="style-summary">
          🏆 당신의 대표 스타일: <b>${topStyle.labelKo}</b>
          <br>총 <b>${total}개</b> 상품 분석 완료
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p class="style-hint">❌ 분석 실패: ${escapeHtml(e.message || String(e))}</p>`;
    }
  });
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
        ${coverImg(t)}
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
    PhotoStore.hydrate(recentEl);
  }
}

// ---- 데이터 내보내기 ----
// version 2: 사진은 photos[].dataUrl로 담는다 (사진 제외를 고르면 dataUrl 없음)
async function buildExportPayload(includePhotos) {
  const tags = [];
  for (const t of loadTags()) {
    const copy = { ...t };
    // embedding은 사진으로 다시 계산할 수 있고 파일만 커진다
    delete copy.embedding;
    delete copy.embeddingPhotoId;
    if (includePhotos) {
      copy.photos = [];
      for (const p of tagPhotos(t)) {
        const blob = await PhotoStore.get(p.id);
        if (blob) copy.photos.push({ ...p, dataUrl: await PhotoStore.blobToDataUrl(blob) });
      }
    }
    tags.push(copy);
  }
  return { exportedAt: new Date().toISOString(), version: 2, includesPhotos: includePhotos, tags };
}

async function exportData() {
  const includePhotos = confirm(
    '사진도 함께 내보낼까요?\n\n' +
    '[확인] 사진 포함 (파일이 커집니다)\n' +
    '[취소] 상품 정보만'
  );
  const data = await buildExportPayload(includePhotos);
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

// ---- 데이터 가져오기 (JSON 파일에서) ----
function importDataFromFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      // 스키마 검증
      if (!parsed || !Array.isArray(parsed.tags)) {
        alert('❌ 유효한 TagScanner 백업 파일이 아닙니다.\n(tags 배열이 없음)');
        return;
      }
      const importedTags = parsed.tags;
      const existing = loadTags();

      const mergeChoice = confirm(
        `📥 ${importedTags.length}개 항목을 가져옵니다.\n\n` +
        `현재 저장된 항목: ${existing.length}개\n\n` +
        `[확인] = 기존 데이터에 추가 (병합)\n` +
        `[취소] = 가져오지 않음\n\n` +
        `※ 전체 교체하려면 먼저 "전체 데이터 삭제" 후 가져오기`
      );
      if (!mergeChoice) return;

      // 중복 제거: 기존 id와 겹치면 새 id 부여
      const existingIds = new Set(existing.map((t) => t.id));
      let now = Date.now();
      const cleaned = [];
      const storedIds = [];
      for (const t of importedTags) {
        const newT = { ...t };
        if (!newT.id || existingIds.has(newT.id)) {
          newT.id = now++;
        }
        if (!newT.createdAt) newT.createdAt = newT.id;
        // 사진은 새 id로 사진 저장소에 넣는다 (예전 형식은 photoData 한 장)
        const source = Array.isArray(t.photos)
          ? t.photos
          : t.photoData ? [{ kind: 'tag', dataUrl: t.photoData, createdAt: t.createdAt }] : [];
        const withData = source.filter((p) => p.dataUrl);
        const stored = await storePhotos(withData);
        storedIds.push(...stored.map((p) => p.id));
        const coverIndex = withData.findIndex((p) => p.id && p.id === t.coverPhotoId);
        newT.photos = stored;
        newT.coverPhotoId = coverIndex >= 0 ? stored[coverIndex].id : undefined;
        delete newT.photoData;
        delete newT.embedding;
        delete newT.embeddingPhotoId;
        cleaned.push(newT);
      }

      // 병합 후 저장
      const merged = [...cleaned, ...existing].sort((a, b) => b.createdAt - a.createdAt);
      const r = saveTags(merged);
      if (!r.ok) {
        await PhotoStore.remove(storedIds).catch(() => {});
        if (r.isQuota) {
          alert('⚠️ 저장 공간 부족으로 일부만 가져올 수 있습니다. 기존 데이터를 정리한 후 다시 시도하세요.');
        } else {
          alert('가져오기 실패: ' + (r.error?.message || '알 수 없는 오류'));
        }
        return;
      }
      showToast(`✅ ${cleaned.length}개 항목을 가져왔습니다`);
      renderMyPage();
    } catch (err) {
      alert('❌ JSON 파싱 실패: ' + err.message);
    }
  };
  reader.onerror = () => alert('❌ 파일을 읽을 수 없습니다.');
  reader.readAsText(file);
}

// ---- 전체 데이터 삭제 ----
function clearAllData() {
  if (!confirm('정말 전체 태그 데이터를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.')) return;
  if (!confirm('한 번 더 확인합니다. 모든 사진과 정보가 삭제됩니다. 계속할까요?')) return;
  localStorage.removeItem(STORAGE_KEY);
  PhotoStore.clear().catch((e) => console.warn('사진 삭제 실패:', e));
  showToast('전체 데이터를 삭제했습니다');
  renderMyPage();
}

// ---- 비교 결과 (한눈에 보기) 렌더링 ----
// 찜한 상품을 나란히 놓고 항목별로 비교하는 대시보드.
// 휴대폰에서는 상품 2개가 한 화면에 온전히 보이고 나머지는 옆으로 넘긴다. 넓은 화면에서는 모두 나란히 보인다.
let comparePhotoKind = 'garment'; // 사진 줄에 보여줄 종류: 'garment' | 'wearing' | 'tag'
const COMPARE_PHOTO_KINDS = [
  { kind: 'garment', label: '옷' },
  { kind: 'wearing', label: '착용샷' },
  { kind: 'tag', label: '택' },
];

// 비교 화면 사진: 옷은 대표로 고른 옷 사진 우선, 나머지는 해당 종류 첫 장
function comparePhotoOf(t, kind) {
  if (kind === 'garment') return garmentPhotoId(t);
  const photos = tagPhotos(t);
  const cover = photos.find((p) => p.id === t.coverPhotoId && p.kind === kind);
  return (cover || photos.find((p) => p.kind === kind) || {}).id || '';
}

function formatWon(n) {
  return '₩' + Number(n).toLocaleString('ko-KR');
}

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

  // 최저가와 차액
  const prices = favs.map((t) => parsePriceNumber(t.price));
  const validPrices = prices.filter((p) => p !== null);
  const minPrice = validPrices.length ? Math.min(...validPrices) : null;

  const empty = (text = '정보 없음') => `<span class="cmp-empty">${text}</span>`;
  const chips = (values, cls) =>
    values.length ? values.map((v) => `<span class="cmp-chip ${cls}">${escapeHtml(v)}</span>`).join('') : empty();

  // 항목 한 줄: 항목 이름은 줄 위에 가로로 두고(옆으로 넘겨도 왼쪽에 고정), 값은 상품마다 한 칸
  const section = (label, cellFn, cls = '') => `
    <div class="cmp-label"><span>${label}</span></div>
    ${favs.map((t, i) => `<div class="cmp-cell ${cls}">${cellFn(t, i)}</div>`).join('')}
  `;

  const photoCell = (t) => {
    const id = comparePhotoOf(t, comparePhotoKind);
    const kindLabel = COMPARE_PHOTO_KINDS.find((k) => k.kind === comparePhotoKind).label;
    const count = tagPhotos(t).filter((p) => p.kind === comparePhotoKind).length;
    return id
      ? `<div class="cmp-photo">
           <img data-photo-id="${id}" alt="">
           ${count > 1 ? `<span class="cmp-photo-count">${count}장</span>` : ''}
         </div>`
      : `<div class="cmp-photo cmp-photo-none">${kindLabel} 사진 없음</div>`;
  };

  const heads = favs.map((t) => `
    <button type="button" class="cmp-head" data-id="${t.id}">
      ${photoCell(t)}
      <span class="cmp-brand">${escapeHtml(t.brand) || '브랜드 없음'}</span>
      <span class="cmp-name">${escapeHtml(t.productName) || '상품명 없음'}</span>
    </button>
  `).join('');

  const priceCell = (t, i) => {
    if (prices[i] === null) return empty();
    const diff = prices[i] - minPrice;
    return `
      <span class="cmp-price">${formatWon(prices[i])}</span>
      ${diff === 0 && validPrices.length > 1
        ? '<span class="cmp-badge best">최저가</span>'
        : diff > 0 ? `<span class="cmp-diff">최저가보다 +${formatWon(diff)}</span>` : ''}
    `;
  };

  const text = (v) => (v ? `<span class="cmp-text">${escapeHtml(v)}</span>` : empty());

  body.innerHTML = `
    <div class="cmp-toolbar">
      <div class="cmp-kind-toggle" role="tablist" aria-label="비교할 사진 종류">
        ${COMPARE_PHOTO_KINDS.map(({ kind, label }) =>
          `<button type="button" class="${kind === comparePhotoKind ? 'active' : ''}" data-kind="${kind}">${label}</button>`
        ).join('')}
      </div>
      <span class="cmp-count">상품 ${favs.length}개</span>
    </div>
    <p class="cmp-swipe-hint" hidden>옆으로 넘기면 나머지 상품도 볼 수 있어요</p>
    <div class="cmp-scroll">
      <div class="cmp-grid" style="--cols: ${favs.length};">
        ${heads}
        ${section('가격', priceCell, 'cmp-cell-price')}
        ${section('사이즈', (t) => text(t.size))}
        ${section('소재', (t) => chips(String(t.material || '').split(/\s*\/\s*/).filter(Boolean), 'material'))}
        ${section('세탁법', (t) => chips(splitCare(t.care), 'care'))}
        ${section('매장', (t) => text(t.store))}
        ${section('메모', (t) => text(t.memo), 'cmp-cell-memo')}
      </div>
    </div>
  `;

  body.querySelectorAll('.cmp-kind-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      comparePhotoKind = btn.dataset.kind;
      renderCompareResult();
    });
  });
  body.querySelectorAll('.cmp-head').forEach((el) => {
    el.addEventListener('click', () => openDetail(Number(el.dataset.id)));
  });
  PhotoStore.hydrate(body);
  updateCompareSwipeHint();
}

// 상품이 화면에 다 들어오지 않을 때만 "옆으로 넘기기" 안내를 보여준다
function updateCompareSwipeHint() {
  const sc = document.querySelector('#compareResultBody .cmp-scroll');
  const hint = document.querySelector('#compareResultBody .cmp-swipe-hint');
  if (sc && hint) hint.hidden = sc.scrollWidth <= sc.clientWidth + 2;
}
window.addEventListener('resize', updateCompareSwipeHint);

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- 상세 화면 사진 ----
let detailSelectedPhotoId = null;

function renderDetailPhotos() {
  const t = loadTags().find((x) => x.id === currentDetailId);
  const strip = $('detailPhotoStrip');
  if (!t || !strip) return;
  const photos = tagPhotos(t);
  const cover = coverPhotoId(t);
  if (!photos.some((p) => p.id === detailSelectedPhotoId)) detailSelectedPhotoId = null;

  strip.innerHTML = photos.length
    ? photos.map((p) => `
        <div class="detail-photo-item ${p.id === detailSelectedPhotoId ? 'selected' : ''}" data-photo="${p.id}">
          <img data-photo-id="${p.id}" alt="">
          ${p.id === cover ? '<span class="photo-cover-mark">대표</span>' : ''}
          <span class="photo-kind">${PHOTO_KIND_LABEL[p.kind] || ''}</span>
        </div>
      `).join('')
    : `<div class="photo-placeholder detail-photo-empty">사진 없음</div>`;

  strip.querySelectorAll('.detail-photo-item').forEach((el) => {
    el.addEventListener('click', () => {
      detailSelectedPhotoId = detailSelectedPhotoId === el.dataset.photo ? null : el.dataset.photo;
      renderDetailPhotos();
    });
  });
  PhotoStore.hydrate(strip);

  const actions = $('detailPhotoActions');
  actions.hidden = !detailSelectedPhotoId;
  $('detailSetCover').disabled = detailSelectedPhotoId === cover;
  $('detailPhotoCount').textContent = `사진 ${photos.length}/${MAX_PHOTOS}`;
  document.querySelectorAll('#detailScreen .photo-add-btn').forEach((b) => {
    b.disabled = photos.length >= MAX_PHOTOS;
  });
}

// 사진 구성이 바뀐 뒤 옷 사진 기준이 달라졌으면 비슷한 옷을 다시 계산한다
function afterDetailPhotosChanged(prevGarmentId) {
  renderDetailPhotos();
  renderList();
  const t = loadTags().find((x) => x.id === currentDetailId);
  if (t && garmentPhotoId(t) !== prevGarmentId) {
    renderSimilarClothes(t).catch((e) => console.warn('유사 옷 렌더 실패:', e));
  }
}

async function addDetailPhotos(files, kind) {
  const t = loadTags().find((x) => x.id === currentDetailId);
  if (!t || !files || files.length === 0) return;
  const room = MAX_PHOTOS - tagPhotos(t).length;
  if (room <= 0) {
    showToast(`사진은 상품당 ${MAX_PHOTOS}장까지 넣을 수 있어요`);
    return;
  }
  const prevGarment = garmentPhotoId(t);
  try {
    const urls = await filesToPhotoDataUrls(files, room);
    const stored = await storePhotos(urls.map((dataUrl) => ({ kind, dataUrl })));
    const latest = loadTags().find((x) => x.id === currentDetailId);
    updateTag(currentDetailId, { photos: [...tagPhotos(latest), ...stored] });
    showToast(files.length > room ? `${room}장만 추가했어요 (최대 ${MAX_PHOTOS}장)` : `사진 ${stored.length}장을 추가했어요`);
    afterDetailPhotosChanged(prevGarment);
  } catch (e) {
    showToast('사진 추가 실패: ' + (e.message || e));
  }
}

function setDetailCover() {
  const t = loadTags().find((x) => x.id === currentDetailId);
  if (!t || !detailSelectedPhotoId) return;
  const prevGarment = garmentPhotoId(t);
  updateTag(currentDetailId, { coverPhotoId: detailSelectedPhotoId });
  showToast('대표 사진으로 정했어요');
  afterDetailPhotosChanged(prevGarment);
}

async function deleteDetailPhoto() {
  const t = loadTags().find((x) => x.id === currentDetailId);
  if (!t || !detailSelectedPhotoId) return;
  const photos = tagPhotos(t);
  if (photos.length <= 1) {
    showToast('사진은 최소 1장이 있어야 해요');
    return;
  }
  if (!confirm('이 사진을 삭제할까요?')) return;
  const prevGarment = garmentPhotoId(t);
  const removeId = detailSelectedPhotoId;
  const patch = { photos: photos.filter((p) => p.id !== removeId) };
  if (t.coverPhotoId === removeId) patch.coverPhotoId = undefined;
  if (t.embeddingPhotoId === removeId) {
    patch.embedding = undefined;
    patch.embeddingPhotoId = undefined;
  }
  updateTag(currentDetailId, patch);
  detailSelectedPhotoId = null;
  await PhotoStore.remove(removeId).catch((e) => console.warn('사진 파일 삭제 실패:', e));
  showToast('사진을 삭제했어요');
  afterDetailPhotosChanged(prevGarment);
}

// ---- 상세 화면 ----
function openDetail(id) {
  const tags = loadTags();
  const t = tags.find((x) => x.id === id);
  if (!t) return;
  currentDetailId = id;
  detailSelectedPhotoId = null;

  renderDetailPhotos();
  $('d_category').value = t.category || '';
  $('d_brand').value = t.brand || '';
  $('d_productName').value = t.productName || '';
  $('d_price').value = t.price || '';
  $('d_size').value = t.size || '';
  $('d_serial').value = t.serial || '';
  $('d_material').value = t.material || '';
  $('d_care').value = t.care || '';
  renderCareChips();
  $('d_store').value = t.store || '';
  $('d_memo').value = t.memo || '';
  $('d_createdAt').textContent = new Date(t.createdAt).toLocaleString('ko-KR');

  showScreen('detail');

  // CLIP 기반 유사 옷 표시 (백그라운드, 실패해도 앱 진행 OK)
  renderSimilarClothes(t).catch((e) => console.warn('유사 옷 렌더 실패:', e));
}

// ---- 토스트 (undo 버튼 옵션 지원) ----
let toastEl = null;
function showToast(msg, opts = {}) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = '';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = msg;
  toastEl.appendChild(msgSpan);

  const duration = opts.duration ?? 2200;

  if (opts.actionLabel && typeof opts.onAction === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(toastEl._t);
      toastEl.classList.remove('show');
      opts.onAction();
    });
    toastEl.appendChild(btn);
  }

  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), duration);
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

  // 사진 추가 버튼 (등록 화면·상세 화면 공용): 누른 버튼의 종류를 기억했다가 파일 선택 후 반영
  let pendingPhotoKind = 'garment';
  document.querySelectorAll('.photo-add-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingPhotoKind = btn.dataset.kind;
      $(btn.dataset.target === 'detail' ? 'detailPhotoInput' : 'reviewPhotoInput').click();
    });
  });
  $('reviewPhotoInput').addEventListener('change', async (e) => {
    await addReviewPhotos(e.target.files, pendingPhotoKind);
    e.target.value = '';
  });
  $('detailPhotoInput').addEventListener('change', async (e) => {
    await addDetailPhotos(e.target.files, pendingPhotoKind);
    e.target.value = '';
  });
  $('detailSetCover').addEventListener('click', setDetailCover);

  // 세탁법 버튼 (등록·상세 공용). 직접 입력한 내용에 맞춰 버튼 선택 상태도 갱신한다.
  document.querySelectorAll('.care-chips').forEach((box) => {
    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.care-chip');
      if (chip) toggleCare(box.dataset.input, chip.dataset.care);
    });
    const input = $(box.dataset.input);
    if (input) input.addEventListener('input', renderCareChips);
  });
  $('detailDeletePhoto').addEventListener('click', deleteDetailPhoto);

  let reviewSaving = false;
  $('reviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentReview || reviewSaving) return;
    reviewSaving = true;
    const review = currentReview;

    let photos;
    try {
      photos = await storePhotos([
        { kind: review.primaryKind, dataUrl: review.photoData },
        ...review.extraPhotos,
      ]);
    } catch (err) {
      reviewSaving = false;
      showToast('사진 저장 실패: ' + (err.message || err));
      return;
    }

    const saved = addTag({
      photos,
      rawText: review.rawText,
      category: reviewSelectedCategory,
      brand: $('brand').value.trim(),
      productName: $('productName').value.trim(),
      price: $('price').value.trim(),
      size: $('size').value.trim(),
      serial: $('serial').value.trim(),
      material: $('material').value.trim(),
      care: $('care').value.trim(),
      store: $('store').value.trim(),
      memo: $('memo').value.trim(),
    });
    reviewSaving = false;
    if (!saved) {
      // 상품 저장에 실패하면 방금 넣은 사진도 지운다 (화면은 유지)
      await PhotoStore.remove(photos.map((p) => p.id)).catch(() => {});
      return;
    }

    // 옷 사진이 있으면 백그라운드에서 CLIP embedding 생성 (실패해도 앱 진행에 영향 없음)
    const garmentId = garmentPhotoId(saved);
    if (garmentId) {
      generateEmbeddingForTag(saved.id, garmentId).catch((err) =>
        console.warn('embedding 생성 실패:', err)
      );
    }
    currentReview = null;
    // 폼 리셋
    ['brand', 'productName', 'price', 'size', 'serial', 'material', 'care', 'store', 'memo'].forEach((id) => {
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
      window.open(url, '_blank', 'noopener,noreferrer');
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
      // 브랜드 기준 데이터에 공식몰 주소가 있으면 바로 이동, 없으면 검색으로 대체
      const domain = window.brandDomain ? window.brandDomain(t.brand) : '';
      const url = domain
        ? `https://${domain}`
        : `https://www.google.com/search?q=${encodeURIComponent(t.brand + ' 공식몰')}&btnI=1`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  // M 버튼 → 마이페이지
  $('navSettings').addEventListener('click', () => {
    renderMyPage();
    renderStyleAnalysis().catch((e) => console.warn('스타일 분석 초기화 실패:', e));
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

  // 마이페이지 메뉴: 데이터 가져오기
  const importFileInput = $('importFileInput');
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importDataFromFile(file);
      e.target.value = ''; // 같은 파일 다시 고를 수 있게 초기화
    });
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
      material: $('d_material').value.trim(),
      care: $('d_care').value.trim(),
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
    const deleted = deleteTagById(currentDetailId);
    currentDetailId = null;
    renderList();
    showScreen('list');
    showToast('삭제되었습니다', {
      duration: 5000,
      actionLabel: '실행 취소',
      onAction: () => {
        restoreTag(deleted);
        renderList();
        showToast('복구되었습니다');
      },
    });
  });
}

// ---- 시작 ----
document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  initBrandOptions();
  showScreen('main');
  try {
    const moved = await migrateLegacyPhotos();
    if (moved > 0) console.info(`사진 ${moved}장을 새 저장소로 옮겼습니다`);
    await cleanupOrphanPhotos();
  } catch (e) {
    console.warn('사진 저장소 준비 실패:', e);
  }
});
