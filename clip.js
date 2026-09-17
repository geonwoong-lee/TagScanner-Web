// ============================================================
// CLIP 통합 모듈 — 브라우저에서 이미지 embedding + 유사도 검색
// Hugging Face Transformers.js 사용, WebGPU/WASM 실행
// ============================================================

// 상태: 로딩 완료된 파이프라인 캐시
let imagePipeline = null;
let textPipeline = null;
let loadingPromise = null;

// 진행 상황 콜백 (UI 업데이트용)
let progressCallback = null;

/**
 * CLIP 모델 로드 (최초 1회, 이후 캐시)
 * 첫 로드는 40~60MB 다운로드 → 1분 정도 걸림
 */
async function loadCLIP() {
  if (imagePipeline && textPipeline) {
    return { imagePipeline, textPipeline };
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      updateProgress('CLIP 라이브러리 로딩 중...', 5);

      // Transformers.js 동적 import (ESM)
      const { pipeline, env } = await import(
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js'
      );

      // 원격 모델 사용, 로컬 모델 무시
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      updateProgress('CLIP 이미지 모델 다운로드 중... (첫 실행 시 40MB)', 15);

      // 이미지 특징 추출 파이프라인 (양자화 모델 사용, 더 작고 빠름)
      const imageP = await pipeline(
        'image-feature-extraction',
        'Xenova/clip-vit-base-patch32',
        {
          quantized: true,
          progress_callback: (data) => {
            if (data.status === 'downloading' && data.progress) {
              updateProgress(
                `이미지 모델 다운로드: ${Math.round(data.progress)}%`,
                15 + data.progress * 0.4
              );
            }
          },
        }
      );

      updateProgress('CLIP 텍스트 모델 다운로드 중...', 60);

      // 텍스트 특징 추출 (zero-shot 분류용)
      const textP = await pipeline(
        'feature-extraction',
        'Xenova/clip-vit-base-patch32',
        {
          quantized: true,
          progress_callback: (data) => {
            if (data.status === 'downloading' && data.progress) {
              updateProgress(
                `텍스트 모델 다운로드: ${Math.round(data.progress)}%`,
                60 + data.progress * 0.35
              );
            }
          },
        }
      );

      updateProgress('로딩 완료', 100);

      imagePipeline = imageP;
      textPipeline = textP;
      return { imagePipeline, textPipeline };
    } catch (e) {
      loadingPromise = null;
      console.error('CLIP 로드 실패:', e);
      throw new Error('CLIP 모델 로드 실패: ' + (e.message || e));
    }
  })();

  return loadingPromise;
}

function updateProgress(message, percent) {
  console.log(`[CLIP] ${message} (${Math.round(percent)}%)`);
  if (progressCallback) progressCallback(message, percent);
}

/**
 * 이미지 데이터 URL → 512차원 embedding 벡터
 */
async function computeImageEmbedding(imageDataUrl) {
  const { imagePipeline } = await loadCLIP();
  const output = await imagePipeline(imageDataUrl);
  // output.data는 Float32Array (512차원)
  return Array.from(output.data);
}

/**
 * 텍스트 → 512차원 embedding 벡터 (zero-shot 분류용)
 */
async function computeTextEmbedding(text) {
  const { textPipeline } = await loadCLIP();
  const output = await textPipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * 두 벡터의 코사인 유사도 (0~1, 클수록 유사)
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 타겟 embedding과 저장된 태그들 중에서 유사한 것 topK 개 반환
 */
function findSimilar(targetEmbedding, allTags, excludeId = null, topK = 3) {
  if (!targetEmbedding) return [];
  const scored = allTags
    .filter((t) => t.embedding && t.id !== excludeId)
    .map((t) => ({
      tag: t,
      similarity: cosineSimilarity(targetEmbedding, t.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

/**
 * 스타일 카테고리 zero-shot 분류
 * @param {number[]} imageEmbedding - 이미지 embedding
 * @param {string[]} textLabels - 라벨 후보 (영어 권장)
 * @returns {Array<{label, score}>} 점수 순 정렬
 */
async function classifyStyle(imageEmbedding, textLabels) {
  const scored = [];
  for (const label of textLabels) {
    const prompt = `a photo of ${label} clothing`;
    const textEmb = await computeTextEmbedding(prompt);
    const score = cosineSimilarity(imageEmbedding, textEmb);
    scored.push({ label, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ============================================================
// 스타일 카테고리 정의
// ============================================================
const STYLE_LABELS_EN = [
  'casual',
  'formal',
  'streetwear',
  'sportswear',
  'business',
  'vintage',
  'minimalist',
  'punk',
];

// 한글 표시명 매핑
const STYLE_LABEL_KO = {
  casual: '캐주얼',
  formal: '포멀',
  streetwear: '스트릿',
  sportswear: '스포츠',
  business: '비즈니스',
  vintage: '빈티지',
  minimalist: '미니멀',
  punk: '펑크',
};

// ============================================================
// 진행 상황 콜백 등록
// ============================================================
function setProgressCallback(cb) {
  progressCallback = cb;
}

// 전역 노출
window.CLIP = {
  loadCLIP,
  computeImageEmbedding,
  computeTextEmbedding,
  cosineSimilarity,
  findSimilar,
  classifyStyle,
  setProgressCallback,
  STYLE_LABELS_EN,
  STYLE_LABEL_KO,
};
