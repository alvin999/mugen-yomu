/**
 * @file apiEmbeddingService.ts
 * @description 雲端 BYOK API 向量嵌入服務
 * 支援 Google Gemini (text-embedding-004, 768 維) 與 OpenAI (text-embedding-3-small, 1536 維)
 */

export interface EmbeddingResult {
  embedding: number[];
  dimension: number;
}

/**
 * 透過 Google Gemini API 生成單句或查詢詞向量
 */
export async function fetchGeminiEmbedding(text: string, apiKey: string): Promise<EmbeddingResult> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('未配置 Gemini API Key');
  }

  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error('文字內容為空');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey.trim()}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: {
        parts: [{ text: cleanText }]
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Gemini Embedding API 錯誤 (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  const values = data.embedding?.values;
  if (!values || !Array.isArray(values)) {
    throw new Error('Gemini API 未返回有效的向量資料');
  }

  return {
    embedding: values,
    dimension: values.length
  };
}

/**
 * 透過 Google Gemini batchEmbedContents 批次生成段落向量
 */
export async function fetchGeminiBatchEmbeddings(
  texts: string[],
  apiKey: string,
  onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('未配置 Gemini API Key');
  }

  const BATCH_SIZE = 40; // Gemini batchEmbedContents 建議一次不超過 50 筆
  const results: number[][] = [];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey.trim()}`;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const requests = slice.map((t) => ({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: t.trim() || ' ' }] }
    }));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Batch Embedding 錯誤 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const batchEmbeddings = data.embeddings;
    if (!batchEmbeddings || !Array.isArray(batchEmbeddings)) {
      throw new Error('Gemini Batch API 未返回預期的向量陣列');
    }

    for (const item of batchEmbeddings) {
      results.push(item.values || []);
    }

    if (onProgress) {
      onProgress(Math.min(i + slice.length, texts.length), texts.length);
    }
  }

  return results;
}

/**
 * 透過 OpenAI API 生成單句或查詢詞向量
 */
export async function fetchOpenAIEmbedding(text: string, apiKey: string): Promise<EmbeddingResult> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('未配置 OpenAI API Key');
  }

  const endpoint = 'https://api.openai.com/v1/embeddings';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.trim()
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI Embedding API 錯誤 (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  const values = data.data?.[0]?.embedding;
  if (!values || !Array.isArray(values)) {
    throw new Error('OpenAI API 未返回有效的向量資料');
  }

  return {
    embedding: values,
    dimension: values.length
  };
}

/**
 * 透過 OpenAI API 批次生成段落向量
 */
export async function fetchOpenAIBatchEmbeddings(
  texts: string[],
  apiKey: string,
  onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('未配置 OpenAI API Key');
  }

  const BATCH_SIZE = 50;
  const results: number[][] = [];
  const endpoint = 'https://api.openai.com/v1/embeddings';

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: slice.map((t) => t.trim() || ' ')
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI Batch Embedding 錯誤 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const items = data.data;
    if (!items || !Array.isArray(items)) {
      throw new Error('OpenAI Batch API 未返回預期的向量陣列');
    }

    // 依 index 順序重排
    items.sort((a, b) => a.index - b.index);
    for (const item of items) {
      results.push(item.embedding || []);
    }

    if (onProgress) {
      onProgress(Math.min(i + slice.length, texts.length), texts.length);
    }
  }

  return results;
}
