import type { PaperDocument } from '../../types/document';

// -------------------------------------------------------------
// 精選網頁專文: A Mathematical Framework for Transformer Circuits (Anthropic)
// -------------------------------------------------------------
export const anthropicCircuitsWeb: PaperDocument = {
  id: 'web_anthropic_circuits',
  type: 'web',
  title: 'A Mathematical Framework for Transformer Circuits',
  sourceUrl: 'https://transformer-circuits.pub/2021/framework/index.html',
  authors: ['Chris Olah', 'Nelson Elhage', 'Neel Nanda', 'Catherine Olsson et al.'],
  venue: 'Anthropic Research',
  citations: 'Interpretability Milestone',
  readingSpeedWpm: 290,
  depthLevel: 'Mechanistic Interpretability',
  abstract: {
    english:
      'We describe a mathematical framework for understanding the behavior of small Transformer models. By analyzing transformers through the lens of circuits, we show that 1-layer and 2-layer transformers can be reverse-engineered into clear algorithms that explain in-context learning and induction heads.',
    chineseSummary:
      'Anthropic 機制可解釋性團隊發表之里程碑專文。作者將 Transformer 視為可逆向工程的計算電路，深入拆解 QK 矩陣與 OV 矩陣在特徵空間中的交互機制，並揭示了「歸納頭（Induction Heads）」如何賦予大語言模型強大的上下文學習（In-Context Learning）能力。'
  },
  sections: [
    {
      id: '1',
      title: '1. Overview and Core Philosophy',
      level: 1,
      progress: 100,
      isRead: true,
      paragraphs: [
        'Transformers have achieved remarkable success across machine learning, yet our understanding of why they work remains largely heuristic. In this work, we take a mechanistic approach: we seek to reverse-engineer trained Transformers into human-understandable algorithms.',
        'We view Transformer models as computational circuits comprised of attention heads and MLP layers that write to and read from a shared communication channel: the residual stream.'
      ]
    },
    {
      id: '2',
      title: '2. The Residual Stream as Communication Channel',
      level: 1,
      progress: 70,
      isRead: false,
      paragraphs: [
        'A fundamental conceptual shift in our framework is viewing the residual stream not merely as a feature representation, but as a linear communication bus. Every attention head reads from this bus and writes its outputs back to it via addition.',
        'Because writing is additive, different components can read and write independent subspaces of the residual stream without destroying information placed by preceding layers.'
      ],
      formulas: [
        {
          id: 'eq_circuits',
          number: '(1)',
          name: 'QK & OV Circuit Decomposition',
          latexText: 'W_{QK} = W_Q^T W_K, \\quad W_{OV} = W_O W_V',
          page: 'Web § 2.1',
          sectionId: '2',
          sectionTitle: '2. Residual Stream as a Communication Channel',
          sourceContextSnippet: 'A fundamental conceptual shift in our framework is viewing the residual stream not merely as a feature representation, but as a linear communication bus.',
          variables: [
            { symbol: 'W_{QK}', meaning: '決定「注意誰」的雙線性注意力矩陣', color: '#fe8019' },
            { symbol: 'W_{OV}', meaning: '決定「搬運什麼內容」的資訊傳遞矩陣', color: '#fabd2f' }
          ]
        }
      ]
    },
    {
      id: '3',
      title: '3. Induction Heads and In-Context Learning',
      level: 1,
      progress: 0,
      isRead: false,
      paragraphs: [
        'In two-layer attention-only models, we discover a striking emergence: Induction Heads. These circuits look for previous occurrences of the current token, find what token followed it, and predict that the same token will follow again.',
        'This simple mechanism appears to be the primary driver of few-shot prompting and general in-context learning in Transformer models.'
      ]
    }
  ],
  companionData: {
    '2': {
      intuition: {
        title: '為什麼將殘差流（Residual Stream）視為通訊匯流排？',
        tag: 'Circuits View',
        content: [
          '在傳統觀念中，每一層會替換上一層的表徵。但在 Transformer 中，由於存在跳躍連接，殘差流是「相加累計」的。',
          '各個 Attention Head 就像是掛載在同一條匯流排上的獨立晶片，利用高維正交空間寫入獨立通道，使深度模型具有極高的模組解耦性。'
        ]
      },
      terminology: [
        { term: 'Residual Stream', explanation: '殘差流 (共用通訊匯流排)', color: '#fabd2f' },
        { term: 'Induction Heads', explanation: '歸納頭 (在兩層模型中自動浮現)', color: '#8ec07c' }
      ],
      socraticQuestions: [
        {
          id: 'q_circuit1',
          icon: 'hub',
          color: 'text-[#fe8019]',
          text: 'QK 電路與 OV 電路的分工本質是什麼？',
          answerSummary: 'QK 電路純粹計算權重純量，決定「Token A 應該關注 Token B」；而 OV 電路則決定「將 Token B 的何種特徵搬運至 Token A 的輸出中」，兩者在代數上是完全正交解耦的。'
        }
      ]
    }
  }
};
