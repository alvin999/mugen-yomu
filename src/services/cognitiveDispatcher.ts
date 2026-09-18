/**
 * @file cognitiveDispatcher.ts
 * @description 認知伴讀非同步推論調度器
 * 封裝科研直覺、長難句拆解與術語對齊的 API 請求與章節伴讀資料更新
 */

import type { ChapterSection, PaperDocument } from '../stores/documentStore';
import {
  generateScientificIntuition,
  generateSentenceDeconstruction,
  generateTerminologyAlignment
} from './aiService';

export interface AiClientConfig {
  provider: string;
  apiKey: string;
  model: string;
  ollamaUrl: string;
}

export function getStoredAiConfig(): AiClientConfig {
  if (typeof window === 'undefined') {
    return { provider: 'groq', apiKey: '', model: 'llama-3.3-70b-versatile', ollamaUrl: 'http://localhost:11434' };
  }
  const provider = localStorage.getItem('mugen_provider') || 'groq';
  const apiKey = localStorage.getItem(`mugen_key_${provider}`) || localStorage.getItem('mugen_key_groq') || '';
  const model = localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile';
  const ollamaUrl = localStorage.getItem('mugen_ollama_url') || 'http://localhost:11434';
  return { provider, apiKey, model, ollamaUrl };
}

/**
 * 執行章節白話科學直覺推論並更新 paper.companionData
 */
export async function dispatchGenerateIntuition(
  paper: PaperDocument,
  sec: ChapterSection,
  config: AiClientConfig
): Promise<void> {
  const res = await generateScientificIntuition(
    sec.title,
    sec.paragraphs || [],
    config.provider,
    config.apiKey,
    config.model,
    config.ollamaUrl
  );

  if (!paper.companionData) paper.companionData = {};
  const prev = paper.companionData[sec.id] || {
    intuition: res,
    terminology: [],
    socraticQuestions: []
  };

  paper.companionData[sec.id] = {
    ...prev,
    intuition: {
      title: res.title,
      tag: res.tag,
      content: res.content
    }
  };
}

/**
 * 執行章節長難句 SVO 拆解推論並更新 paper.companionData 與 sec.svoSentence
 */
export async function dispatchGenerateSyntax(
  paper: PaperDocument,
  sec: ChapterSection,
  selectedText: string | undefined,
  config: AiClientConfig
): Promise<void> {
  const textToAnalyze = (selectedText && selectedText.trim().length > 10)
    ? selectedText.trim()
    : (sec.paragraphs ? sec.paragraphs.join(' ') : sec.title);

  const res = await generateSentenceDeconstruction(
    textToAnalyze,
    sec.title,
    config.provider,
    config.apiKey,
    config.model,
    config.ollamaUrl
  );

  if (!paper.companionData) paper.companionData = {};
  const prev = paper.companionData[sec.id] || {
    intuition: { title: `關於「${sec.title}」的核心探討`, tag: 'Insight', content: [] },
    terminology: [],
    socraticQuestions: []
  };

  paper.companionData[sec.id] = {
    ...prev,
    syntaxTree: {
      line: res.line,
      snippet: res.snippet,
      svo: res.svo
    }
  };

  // 同步更新章節原型的 svoSentence，讓雙語閱讀器內文也直接呈現彩色結構標籤
  const svoItem = res.svo.find(item => item.role.includes('主幹') || item.role.includes('S-V-O')) || res.svo[0];
  const modItem = res.svo.find(item => item.role.includes('方式') || item.role.includes('條件') || item.role.includes('修飾') || item.role.includes('平行')) || res.svo[1];
  const purItem = res.svo.find(item => item.role.includes('目的') || item.role.includes('結果')) || res.svo[2];

  sec.svoSentence = {
    sentence: res.snippet,
    svoBadge: 'S-V-O 認知拆解',
    subjectVerbObject: {
      title: svoItem ? svoItem.role : '[主幹 S-V-O]',
      en: svoItem ? svoItem.text : res.snippet,
      zh: svoItem ? svoItem.zh : '核心論述主幹'
    },
    modifier: {
      title: modItem ? modItem.role : '[方式與條件]',
      en: modItem ? modItem.text : '',
      zh: modItem ? modItem.zh : '前提條件與限定修飾'
    },
    purpose: {
      title: purItem ? purItem.role : '[目的與結果]',
      en: purItem ? purItem.text : '',
      zh: purItem ? purItem.zh : '預期達致之效應與推論'
    }
  };
}

/**
 * 執行章節關鍵學術術語對齊推論並更新 paper.companionData
 */
export async function dispatchGenerateTerminology(
  paper: PaperDocument,
  sec: ChapterSection,
  config: AiClientConfig
): Promise<void> {
  const res = await generateTerminologyAlignment(
    sec.title,
    sec.paragraphs || [],
    config.provider,
    config.apiKey,
    config.model,
    config.ollamaUrl
  );

  if (!paper.companionData) paper.companionData = {};
  const prev = paper.companionData[sec.id] || {
    intuition: { title: `關於「${sec.title}」的核心探討`, tag: 'Insight', content: [] },
    terminology: [],
    socraticQuestions: []
  };

  paper.companionData[sec.id] = {
    ...prev,
    terminology: res.terms
  };
}
