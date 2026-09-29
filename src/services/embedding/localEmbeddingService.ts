/**
 * @file localEmbeddingService.ts
 * @description 本機端純離線 ONNX 向量嵌入服務 (Xenova/all-MiniLM-L6-v2)
 * 特性：
 * 1. 384 維度純離線推論
 * 2. 支援動態載入與單例模型管線保護
 * 3. 輸出經 L2 正規化之 Float32 向量，便於高速內積計算
 */

import type { EmbeddingResult } from './apiEmbeddingService';

let extractorPipeline: any = null;
let isLoadingModel = false;
let modelLoadPromise: Promise<any> | null = null;

/**
 * 動態載入 Transformers.js pipeline
 */
async function getPipelineInstance() {
  if (extractorPipeline) return extractorPipeline;
  if (modelLoadPromise) return modelLoadPromise;

  modelLoadPromise = (async () => {
    isLoadingModel = true;
    try {
      let pipelineFn: any;
      let env: any;

      try {
        const module = await import('@xenova/transformers');
        pipelineFn = module.pipeline;
        env = module.env;
      } catch (e) {
        console.info('[localEmbeddingService] 本地模組載入失敗，嘗試由 CDN 動態載入 Transformers.js:', e);
        // Fallback 至 CDN 載入純前端 ESM
        // @ts-ignore
        const module = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        pipelineFn = module.pipeline;
        env = module.env;
      }

      if (env) {
        // 設定瀏覽器快取與 WASM 路徑優化
        env.allowLocalModels = false;
        env.useBrowserCache = true;
      }

      // 載入輕量 384-dim 量化模型
      extractorPipeline = await pipelineFn('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true
      });

      return extractorPipeline;
    } finally {
      isLoadingModel = false;
    }
  })();

  return modelLoadPromise;
}

/**
 * 對向量進行 L2 正規化 (Euclidean norm = 1.0)
 */
export function normalizeVector(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/**
 * 計算兩向量之餘弦相似度 (Cosine Similarity)
 * 若向量已正規化，則等於點積 (Dot Product)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * 本機純離線單句向量推論 (384 維)
 */
export async function fetchLocalEmbedding(text: string): Promise<EmbeddingResult> {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error('文字內容為空');
  }

  const pipe = await getPipelineInstance();
  const output = await pipe(cleanText, { pooling: 'mean', normalize: true });
  const rawArray = Array.from(output.data as Float32Array) as number[];

  return {
    embedding: rawArray,
    dimension: rawArray.length
  };
}

/**
 * 本機純離線批次向量推論 (逐段非同步推論，並回報進度)
 */
export async function fetchLocalBatchEmbeddings(
  texts: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
  const pipe = await getPipelineInstance();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i].trim() || ' ';
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    const rawArray = Array.from(output.data as Float32Array) as number[];
    results.push(rawArray);

    if (onProgress) {
      onProgress(i + 1, texts.length);
    }
    // 釋放事件循環以避免卡頓主畫面
    if (i % 5 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return results;
}
