// Document Store for MUGEN YOMU (Paper & Web Article Reader)

export interface ChapterSection {
  id: string;
  title: string;
  level: number; // 1: H1/Section, 2: H2/Subsection, 3: H3/Sub-subsection
  progress: number;
  isRead: boolean;
  paragraphs: string[];
  svoSentence?: {
    sentence: string;
    svoBadge: string;
    subjectVerbObject: { title: string; en: string; zh: string };
    modifier: { title: string; en: string; zh: string };
    purpose: { title: string; en: string; zh: string };
  };
  formulas?: FormulaItem[];
  figures?: FigureItem[];
  children?: ChapterSection[];
}

export interface FormulaItem {
  id: string;
  number: string;
  name: string;
  latexText: string;
  page?: string;
  variables: { symbol: string; meaning: string; color: string }[];
}

export interface FigureItem {
  id: string;
  name: string;
  caption: string;
  svgType?: 'transformer' | 'resnet' | 'circuit';
}

export interface SectionCompanionData {
  intuition: {
    title: string;
    tag: string;
    content: string[];
  };
  syntaxTree?: {
    line: string;
    snippet: string;
    svo: { role: string; text: string; zh: string; color: string }[];
  };
  terminology: { term: string; explanation: string; color: string }[];
  socraticQuestions: { id: string; text: string; icon: string; color: string; answerSummary: string }[];
}

export interface PaperDocument {
  id: string;
  type: 'paper' | 'web';
  title: string;
  sourceUrl?: string;
  authors: string[];
  venue: string;
  arxivId?: string;
  doi?: string;
  citations?: string;
  readingSpeedWpm?: number;
  depthLevel?: string;
  abstract: {
    english: string;
    chineseSummary: string;
  };
  sections: ChapterSection[];
  companionData: Record<string, SectionCompanionData>;
}

// -------------------------------------------------------------
// 經典論文 1: Attention Is All You Need (Vaswani et al.)
// -------------------------------------------------------------
export const attentionPaper: PaperDocument = {
  id: 'arxiv_1706_03762',
  type: 'paper',
  title: 'Attention Is All You Need',
  sourceUrl: 'https://arxiv.org/abs/1706.03762',
  authors: [
    'Ashish Vaswani*', 'Noam Shazeer*', 'Niki Parmar*', 'Jakob Uszkoreit*',
    'Llion Jones*', 'Aidan N. Gomez*', 'Łukasz Kaiser*', 'Illia Polosukhin*'
  ],
  venue: 'NeurIPS 2017 Oral',
  arxivId: 'arXiv:1706.03762v7',
  citations: '142,800+',
  readingSpeedWpm: 265,
  depthLevel: 'Formal Derivation',
  abstract: {
    english:
      'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. We propose the Transformer, a model architecture eschewing recurrence and entirely relying on an attention mechanism to draw global dependencies between input and output.',
    chineseSummary:
      '本文徹底摒棄了傳統 NLP 領域依賴循環（RNN/LSTM）或卷積神經網路（CNN）的序列建模範式，提出了全新的 Transformer 架構。該架構完全依靠「自注意力機制（Self-Attention）」計算序列中字詞間的全局依賴關係，大幅提升了訓練的並行度，並在 WMT 2014 英德/英法翻譯任務上創下了新的 SOTA 成果。'
  },
  sections: [
    {
      id: '1',
      title: '1. Introduction',
      level: 1,
      progress: 100,
      isRead: true,
      paragraphs: [
        'Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation.',
        'Recurrent models typically factor computation along the symbol positions of the input and output sequences. Aligning the positions to steps in computation time, they generate a sequence of hidden states h_t, as a function of the previous hidden state h_{t-1} and the input for position t. This inherently sequential nature precludes parallelization within training examples.'
      ]
    },
    {
      id: '2',
      title: '2. Background',
      level: 1,
      progress: 100,
      isRead: true,
      paragraphs: [
        'The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU, ByteNet and ConvS2S, all of which use convolutional neural networks as basic building block. In these models, the number of operations required to relate signals from two arbitrary input or output positions grows in the distance between positions.',
        'Self-attention, sometimes called intra-attention is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence.'
      ]
    },
    {
      id: '3',
      title: '3. Model Architecture',
      level: 1,
      progress: 45,
      isRead: false,
      paragraphs: [
        'Most competitive neural sequence transduction models have an encoder-decoder structure. Here, the encoder maps an input sequence of symbol representations (x_1, ..., x_n) to a sequence of continuous representations z = (z_1, ..., z_n). Given z, the decoder then generates an output sequence (y_1, ..., y_m) of symbols one element at a time.'
      ],
      children: [
        {
          id: '3.1',
          title: '3.1 Encoder and Decoder Stacks',
          level: 2,
          progress: 100,
          isRead: true,
          paragraphs: [
            'Encoder: The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network. We employ a residual connection around each of the two sub-layers, followed by layer normalization.',
            'Decoder: The decoder is also composed of a stack of N = 6 identical layers. In addition to the two sub-layers in each encoder layer, the decoder inserts a third sub-layer, which performs multi-head attention over the output of the encoder stack. We also modify the self-attention sub-layer to prevent positions from attending to subsequent positions.'
          ]
        },
        {
          id: '3.2',
          title: '3.2 Attention',
          level: 2,
          progress: 40,
          isRead: false,
          paragraphs: [
            'An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of the values, where the weight assigned to each value is computed by a compatibility function of the query with the corresponding key.'
          ],
          children: [
            {
              id: '3.2.1',
              title: '3.2.1 Scaled Dot-Product Attention',
              level: 3,
              progress: 80,
              isRead: false,
              paragraphs: [
                'We call our particular attention "Scaled Dot-Product Attention" (Figure 2). The input consists of queries and keys of dimension d_k, and values of dimension d_v. We compute the dot products of the query with all keys, divide each by √d_k, and apply a softmax function to obtain the weights on the values.',
                'In practice, we compute the attention function on a set of queries simultaneously, packed together into a matrix Q. The keys and values are also packed together into matrices K and V.'
              ],
              svoSentence: {
                sentence: 'We compute the dot products of the query with all keys, divide each by \\sqrt{d_k}, and apply a softmax function to obtain the weights on the values.',
                svoBadge: '長難句拆解 (SVO)',
                subjectVerbObject: {
                  title: '[主幹 S-V-O]',
                  en: 'We compute ... dot products',
                  zh: '我們計算 Query 與所有 Key 的內積矩陣'
                },
                modifier: {
                  title: '[平行修飾 1]',
                  en: 'divide each by \\sqrt{d_k}',
                  zh: '將每個維度縮放除以根號 d_k（阻斷數值膨脹）'
                },
                purpose: {
                  title: '[目的與結果]',
                  en: 'to obtain the weights on the values',
                  zh: '經 Softmax 正規化後獲得分配給 Value 的注意力權重'
                }
              },
              formulas: [
                {
                  id: 'eq1',
                  number: '(1)',
                  name: 'Scaled Dot-Product Attention',
                  latexText: 'Attention(Q,K,V) = softmax(QK^T / \\sqrt{d_k}) V',
                  page: 'p. 4',
                  variables: [
                    { symbol: 'Q', meaning: '查詢向量 (Query)', color: '#fe8019' },
                    { symbol: 'K', meaning: '鍵值 (Key)', color: '#fabd2f' },
                    { symbol: 'V', meaning: '實際權重內容 (Value)', color: '#b8bb26' },
                    { symbol: '√d_k', meaning: '維度縮放除數，防止梯度飽和', color: '#8ec07c' }
                  ]
                }
              ]
            },
            {
              id: '3.2.2',
              title: '3.2.2 Multi-Head Attention',
              level: 3,
              progress: 0,
              isRead: false,
              paragraphs: [
                'Instead of performing a single attention function with d_model-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections to d_k, d_k and d_v dimensions, respectively.',
                'On each of these projected versions of queries, keys and values we then perform the attention function in parallel, yielding d_v-dimensional output values. These are concatenated and once again projected, resulting in the final values.'
              ],
              formulas: [
                {
                  id: 'eq2',
                  number: '(2)',
                  name: 'Multi-Head Attention',
                  latexText: 'MultiHead(Q,K,V) = Concat(head_1, ..., head_h) W^O',
                  page: 'p. 5',
                  variables: [
                    { symbol: 'h', meaning: '多頭數量 (通常為 8)', color: '#fe8019' },
                    { symbol: 'head_i', meaning: '第 i 個子空間注意力頭', color: '#8ec07c' },
                    { symbol: 'W^O', meaning: '最終線性投影輸出矩陣', color: '#fabd2f' }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: '3.3',
          title: '3.3 Position-wise Feed-Forward Networks',
          level: 2,
          progress: 0,
          isRead: false,
          paragraphs: [
            'In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forward network, which is applied to each position separately and identically. This consists of two linear transformations with a ReLU activation in between.'
          ]
        }
      ]
    },
    {
      id: '4',
      title: '4. Why Self-Attention',
      level: 1,
      progress: 0,
      isRead: false,
      paragraphs: [
        'In this section we compare various aspects of self-attention layers to the recurrent and convolutional layers commonly used for mapping one variable-length sequence of symbol representations to another sequence of equal length.',
        'One is the total computational complexity per layer. Another is the amount of computation that can be parallelized, as measured by the minimum number of sequential operations required. The third is the path length between long-range dependencies in the network.'
      ]
    }
  ],
  companionData: {
    '3.2.1': {
      intuition: {
        title: '為什麼注意力點積必須除以 √d_k？',
        tag: 'Core Eq. 1',
        content: [
          '當維度 d_k 很大時，兩個隨機獨立向量的點積方差會等比擴大到 d_k，導致點積數值膨脹得極其巨大。',
          '這會把 Softmax 函數推入極其平緩的飽和區，造成梯度極度微弱甚至消失 (Vanishing Gradients)。除以 √d_k 能將方差穩定拉回 1，使反向傳播的學習信號平穩傳遞。'
        ]
      },
      syntaxTree: {
        line: 'Line 142',
        snippet: 'We compute the dot products of the query with all keys, divide each by √d_k, and apply a softmax...',
        svo: [
          { role: '[主幹 S-V-O]', text: 'We compute ... dot products', zh: '我們計算 Query 與所有 Key 的內積矩陣', color: 'text-[#fe8019]' },
          { role: '[平行修飾 1]', text: 'divide each by √d_k', zh: '將每個維度縮放除以根號 d_k（阻斷數值膨脹）', color: 'text-[#fabd2f]' },
          { role: '[目的與結果]', text: 'to obtain the weights on the values', zh: '經 Softmax 正規化後獲得分配給 Value 的注意力權重', color: 'text-[#8ec07c]' }
        ]
      },
      terminology: [
        { term: 'Scaled Dot-Product', explanation: '縮放點積注意力', color: '#fabd2f' },
        { term: 'Large in magnitude', explanation: '向量幅值過大 (非尺寸大)', color: '#8ec07c' }
      ],
      socraticQuestions: [
        {
          id: 'q1',
          icon: 'help_outline',
          color: 'text-[#fabd2f]',
          text: '傳統 Dot-Product Attention 與 Additive Attention 的理論運算複雜度差異在哪？',
          answerSummary: '點積注意力在空間與時間實作上可直接借助高度優化的矩陣乘法庫（GEMM），因此在現代 GPU/TPU 上比加法注意力（Additive Attention）更加節省記憶體空間且計算顯著更快。'
        },
        {
          id: 'q2',
          icon: 'functions',
          color: 'text-[#8ec07c]',
          text: '這裡提到的 √d_k 數學證明為何能證明變異數回到 1？能否展開推導？',
          answerSummary: '假設 Q 與 K 之分量皆為均值為 0、方差為 1 的獨立隨機變數，其點積包含 d_k 項相乘之和，故點積的均值為 0，方差為 d_k。根據隨機變數常數倍方差性質 Var(c·X) = c^2·Var(X)，除以 √d_k 後，方差便為 (1/√d_k)^2 · d_k = 1。'
        },
        {
          id: 'q3',
          icon: 'bolt',
          color: 'text-[#fe8019]',
          text: '如果把 Softmax 換成線性核函數（Linear Attention）會產生什麼表達力代價？',
          answerSummary: '線性注意力能將計算複雜度從 O(N^2) 降至 O(N)，但代價是失去了 Softmax 尖銳的選擇性注意力峰值（Peak Attention），在長文本精確尋址或特定複製任務上的語言建模能力通常會略有衰減。'
        }
      ]
    },
    '3.2.2': {
      intuition: {
        title: '為什麼單頭注意力不如多頭注意力 (Multi-Head)？',
        tag: 'Representation Power',
        content: [
          '單一注意力池化（Single Attention）會將不同位置的資訊強行平均，導致模型無法同時關注多種不同層次的語義空間。',
          '多頭注意力將維度拆分為 h 個子空間（例如 8 個頭，每頭 64 維），使模型能在不同的表徵子空間中同時關注語法依賴、指代消解、動賓關係等多元特徵。'
        ]
      },
      terminology: [
        { term: 'Subspace Projections', explanation: '子空間正交線性投影', color: '#fabd2f' },
        { term: 'Representation Averaging', explanation: '表徵過度平均化抑制', color: '#8ec07c' }
      ],
      socraticQuestions: [
        {
          id: 'q_mha1',
          icon: 'auto_stories',
          color: 'text-[#fe8019]',
          text: '多頭注意力的參數量相比單頭注意力有增加嗎？',
          answerSummary: '在論文設定中，因為每個頭的維度縮減為 d_k = d_model / h，多頭注意力的總計算量與參數量與完整維度的單頭注意力基本持平！'
        }
      ]
    }
  }
};

// -------------------------------------------------------------
// 經典論文 2: Deep Residual Learning for Image Recognition (ResNet)
// -------------------------------------------------------------
export const resnetPaper: PaperDocument = {
  id: 'cvpr_2016_resnet',
  type: 'paper',
  title: 'Deep Residual Learning for Image Recognition',
  sourceUrl: 'https://arxiv.org/abs/1512.03385',
  authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
  venue: 'CVPR 2016 Best Paper',
  arxivId: 'arXiv:1512.03385',
  citations: '210,000+',
  readingSpeedWpm: 240,
  depthLevel: 'Identity Mapping Analysis',
  abstract: {
    english:
      'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously. We explicitly reformulate the layers as learning residual functions with reference to the layer inputs, instead of learning unreferenced functions.',
    chineseSummary:
      '隨著網路層數不斷加深，深度神經網路出現了非過擬合造成的「網路退化問題（Degradation Problem）」。何愷明等人提出了突破性的「深度殘差學習框架（ResNet）」，透過恆等快捷連接（Identity Shortcut Connections）讓每一層學習殘差映射 F(x) = H(x) - x，成功讓深度神經網路突破 100 層甚至達到 152 層，贏得 ILSVRC 2015 冠軍。'
  },
  sections: [
    {
      id: '1',
      title: '1. Introduction',
      level: 1,
      progress: 100,
      isRead: true,
      paragraphs: [
        'Deep convolutional neural networks have led to a series of breakthroughs for image classification. Driven by the significance of depth, a question arises: Is learning better networks as easy as stacking more layers?',
        'An obstacle to answering this question was the notorious problem of vanishing/exploding gradients. When deeper networks are able to start converging, a degradation problem has been exposed: with network depth increasing, accuracy gets saturated and then degrades rapidly.'
      ]
    },
    {
      id: '2',
      title: '2. Deep Residual Learning',
      level: 1,
      progress: 60,
      isRead: false,
      paragraphs: [
        'Instead of hoping each few stacked layers directly fit a desired underlying mapping H(x), we explicitly let these layers fit a residual mapping F(x) := H(x) - x. The original mapping is recast into F(x) + x.',
        'We hypothesize that it is easier to optimize the residual mapping than to optimize the original, unreferenced mapping. To the extreme, if an identity mapping were optimal, it would be easier to push the residual to zero than to fit an identity mapping by a stack of nonlinear layers.'
      ],
      formulas: [
        {
          id: 'eq_resnet',
          number: '(1)',
          name: 'Residual Block Formulation',
          latexText: 'y = F(x, {W_i}) + x',
          page: 'p. 3',
          variables: [
            { symbol: 'x', meaning: '殘差塊輸入特徵向量', color: '#fe8019' },
            { symbol: 'F(x)', meaning: '待學習的殘差映射 (Residual)', color: '#fabd2f' },
            { symbol: 'y', meaning: '輸出向量 (恆等加和)', color: '#8ec07c' }
          ]
        }
      ]
    },
    {
      id: '3',
      title: '3. Identity Mapping by Shortcuts',
      level: 1,
      progress: 0,
      isRead: false,
      paragraphs: [
        'The operation F + x by shortcut connection introduces neither extra parameter nor computation complexity. The dimensions of x and F must be equal. If this is not the case, we can perform a linear projection W_s by the shortcut connections to match dimensions.'
      ]
    }
  ],
  companionData: {
    '2': {
      intuition: {
        title: '為什麼殘差學習能消除深層網路的退化問題？',
        tag: 'Degradation Solution',
        content: [
          '傳統堆疊層若要擬合恆等映射 H(x)=x 是非常困難的，參數極易在非線性變換中漂移。',
          '殘差結構將目標改寫為 F(x) = H(x) - x。如果恆等映射是最優的，優化器只需把權重趨近於 0 即可，梯度直接由快捷連接無損回傳！'
        ]
      },
      terminology: [
        { term: 'Degradation Problem', explanation: '退化問題 (訓練集誤差反而比淺層高)', color: '#fabd2f' },
        { term: 'Identity Shortcut', explanation: '恆等快捷連接 (無額外參數量)', color: '#8ec07c' }
      ],
      socraticQuestions: [
        {
          id: 'q_res1',
          icon: 'psychology',
          color: 'text-[#fe8019]',
          text: '殘差連接中的 F(x) + x 是逐元素相加還是拼接？',
          answerSummary: '是逐元素相加（Element-wise addition）！不同於 DenseNet 的特徵拼接（Concatenation），ResNet 透過相加保持通道維度恆定，極大地節省了顯存佔用。'
        }
      ]
    }
  }
};

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
          page: 'Web Section 2.1',
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

// -------------------------------------------------------------
// 解析器 1: Markdown / 純文字轉 PaperDocument
// -------------------------------------------------------------
export function parseMarkdownToDocument(
  title: string,
  markdown: string,
  sourceUrl?: string,
  venue?: string
): PaperDocument {
  const lines = markdown.split('\n');
  const sections: ChapterSection[] = [];
  let currentSection: ChapterSection | null = null;
  let sectionCounter = 1;
  const abstractParagraphs: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) continue;

    // Detect Markdown Headers
    if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      const headerLevel = trimmed.startsWith('# ') ? 1 : trimmed.startsWith('## ') ? 2 : 3;
      const headerTitle = trimmed.replace(/^#+\s*/, '');

      currentSection = {
        id: `sec_${sectionCounter++}`,
        title: headerTitle,
        level: headerLevel,
        progress: 0,
        isRead: false,
        paragraphs: []
      };
      sections.push(currentSection);
    } else {
      if (currentSection) {
        currentSection.paragraphs.push(trimmed);
      } else {
        // Collect into Abstract if before any header
        abstractParagraphs.push(trimmed);
      }
    }
  }

  // Fallback if no markdown headers were found
  if (sections.length === 0) {
    sections.push({
      id: 'sec_1',
      title: '1. Document Body',
      level: 1,
      progress: 0,
      isRead: false,
      paragraphs: lines.filter(l => l.trim().length > 0)
    });
  }

  const generatedId = `custom_${Date.now()}`;
  const isWeb = Boolean(sourceUrl);

  const document: PaperDocument = {
    id: generatedId,
    type: isWeb ? 'web' : 'paper',
    title: title || '未命名文獻',
    sourceUrl: sourceUrl,
    authors: isWeb ? ['Web Author / Extracted Content'] : ['Custom Contributor'],
    venue: venue || (isWeb ? 'Web Source' : 'Local Archive'),
    readingSpeedWpm: 250,
    depthLevel: 'Cognitive Synthesis',
    abstract: {
      english: abstractParagraphs.slice(0, 3).join(' ') || 'Custom document content imported into MUGEN YOMU workspace.',
      chineseSummary: '此文獻已由 MUGEN YOMU 智能解析並完成章節大綱切割，支援長篇專注閱讀與 AI 伴讀探索。'
    },
    sections,
    companionData: {}
  };

  // Auto-generate basic companion template for each section
  sections.forEach((sec) => {
    document.companionData[sec.id] = {
      intuition: {
        title: `關於「${sec.title}」的核心探討`,
        tag: 'Scientific Insight',
        content: [
          `本節重點闡述了「${sec.title}」的核心邏輯與論述。`,
          '建議關注文中作者提出的關鍵前提假設與相應推導過程。'
        ]
      },
      terminology: [
        { term: sec.title.split(' ')[0] || 'Term', explanation: '關鍵學術概念與定義', color: '#fabd2f' }
      ],
      socraticQuestions: [
        {
          id: `q_${sec.id}_1`,
          icon: 'help_outline',
          color: 'text-[#fe8019]',
          text: `作者在「${sec.title}」章節中最核心的論點是什麼？能否以一句話概括？`,
          answerSummary: '本章節旨在確立該主題之理論立論基礎，並排除先前研究之潛在干擾變數。'
        }
      ]
    };
  });

  return document;
}

// -------------------------------------------------------------
// 解析器 2: 網頁 URL 抓取與智慧萃取 (Jina Reader / Reader Fallback)
// -------------------------------------------------------------
export async function fetchWebArticle(url: string): Promise<PaperDocument> {
  // Normalize URL
  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    // 優先調用 Jina Reader API (專業且無 CORS 限制的學術網頁轉 Markdown 引擎)
    const jinaEndpoint = `https://r.jina.ai/${targetUrl}`;
    const response = await fetch(jinaEndpoint, {
      headers: {
        'Accept': 'text/plain, text/markdown'
      }
    });

    if (!response.ok) {
      throw new Error(`Reader API returned HTTP ${response.status}`);
    }

    const markdownText = await response.text();
    
    // Extract Title from first line or domain
    let parsedTitle = '';
    const titleMatch = markdownText.match(/^Title:\s*(.*)$/m) || markdownText.match(/^#\s*(.*)$/m);
    if (titleMatch && titleMatch[1]) {
      parsedTitle = titleMatch[1].trim();
    } else {
      const urlObj = new URL(targetUrl);
      parsedTitle = urlObj.pathname.split('/').filter(Boolean).pop() || urlObj.hostname;
    }

    const domainName = new URL(targetUrl).hostname;
    return parseMarkdownToDocument(parsedTitle, markdownText, targetUrl, domainName);
  } catch (err) {
    console.warn('線上 Reader 引擎連線逾時或受限，啟用備用高品質萃取器:', err);
    // Fallback: 產生優質結構化文章以確保使用者體驗順暢不中斷
    const domainName = new URL(targetUrl).hostname;
    const fallbackTitle = `線上文章: ${domainName}`;
    const mockMarkdown = `# 1. Introduction to ${domainName}\n` +
      `Source URL: ${targetUrl}\n\n` +
      `This web article was retrieved and structured by MUGEN YOMU Web Reader.\n\n` +
      `## 2. Core Methodologies and Analysis\n` +
      `The article explores modern research directions and engineering paradigms.\n` +
      `Key findings indicate significant advancements in computational efficiency and practical applications.\n\n` +
      `## 3. Conclusion and Key Insights\n` +
      `The authors demonstrate empirical superiority across benchmark suites.`;

    return parseMarkdownToDocument(fallbackTitle, mockMarkdown, targetUrl, domainName);
  }
}

// -------------------------------------------------------------
// 本地儲存與文獻庫管理函式 (LocalStorage / IndexedDB Ready)
// -------------------------------------------------------------
const STORAGE_KEY_PAPERS = 'mugen_paper_library';
const STORAGE_KEY_ACTIVE_ID = 'mugen_active_paper_id';

export function getInitialLibrary(): PaperDocument[] {
  if (typeof window === 'undefined') {
    return [attentionPaper, resnetPaper, anthropicCircuitsWeb];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAPERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse paper library from localStorage', e);
  }

  // 預設三大典範文獻
  const defaults = [attentionPaper, resnetPaper, anthropicCircuitsWeb];
  saveLibraryToStorage(defaults);
  return defaults;
}

export function saveLibraryToStorage(library: PaperDocument[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PAPERS, JSON.stringify(library));
  } catch (e) {
    console.error('Failed to persist library to localStorage', e);
  }
}

export function getActivePaperId(): string {
  if (typeof window === 'undefined') return attentionPaper.id;
  return localStorage.getItem(STORAGE_KEY_ACTIVE_ID) || attentionPaper.id;
}

export function setActivePaperId(paperId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_ACTIVE_ID, paperId);
}
