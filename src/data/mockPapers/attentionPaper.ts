import type { PaperDocument } from '../../types/document';

// -------------------------------------------------------------
// 經典論文 1: Attention Is All You Need (Vaswani et al.)
// -------------------------------------------------------------
export const attentionPaper: PaperDocument = {
  id: 'arxiv_1706_03762',
  type: 'paper',
  title: 'Attention Is All You Need',
  sourceUrl: 'https://arxiv.org/abs/1706.03762',
  pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
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
      page: 1,
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
      page: 2,
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
      page: 2,
      progress: 45,
      isRead: false,
      paragraphs: [
        'Most competitive neural sequence transduction models have an encoder-decoder structure. Here, the encoder maps an input sequence of symbol representations (x_1, ..., x_n) to a sequence of continuous representations z = (z_1, ..., z_n). Given z, the decoder then generates an output sequence (y_1, ..., y_m) of symbols one element at a time.'
      ],
      figures: [
        {
          id: 'fig1_transformer',
          name: 'Figure 1: The Transformer - model architecture.',
          caption: 'Figure 1: The Transformer - model architecture. The encoder maps an input sequence of symbol representations to a sequence of continuous representations, and the decoder generates an output sequence.',
          figureNumber: 'Figure 1',
          imageUrl: 'https://ar5iv.labs.arxiv.org/html/1706.03762/assets/x1.png'
        }
      ],
      children: [
        {
          id: '3.1',
          title: '3.1 Encoder and Decoder Stacks',
          level: 2,
          page: 3,
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
          page: 3,
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
              page: 4,
              progress: 80,
              isRead: false,
              paragraphs: [
                'We call our particular attention "Scaled Dot-Product Attention" (Figure 2). The input consists of queries and keys of dimension d_k, and values of dimension d_v. We compute the dot products of the query with all keys, divide each by √d_k, and apply a softmax function to obtain the weights on the values.',
                'In practice, we compute the attention function on a set of queries simultaneously, packed together into a matrix Q. The keys and values are also packed together into matrices K and V.'
              ],
              figures: [
                {
                  id: 'fig2_attention',
                  name: 'Figure 2: (left) Scaled Dot-Product Attention. (right) Multi-Head Attention.',
                  caption: 'Figure 2: (left) Scaled Dot-Product Attention consists of queries and keys of dimension d_k, and values of dimension d_v. (right) Multi-Head Attention consists of several attention layers running in parallel.',
                  figureNumber: 'Figure 2',
                  imageUrl: 'https://ar5iv.labs.arxiv.org/html/1706.03762/assets/x2.png'
                }
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
                  latexText: '\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V',
                  page: 'p. 4',
                  sectionId: '3.2.1',
                  sectionTitle: '3.2.1 Scaled Dot-Product Attention',
                  sourceContextSnippet: 'We call our particular attention "Scaled Dot-Product Attention". The input consists of queries and keys of dimension d_k, and values of dimension d_v.',
                  variables: [
                    { symbol: 'Q', meaning: '查詢向量 (Query)', color: '#fe8019' },
                    { symbol: 'K', meaning: '鍵值 (Key)', color: '#fabd2f' },
                    { symbol: 'V', meaning: '實際權重內容 (Value)', color: '#b8bb26' },
                    { symbol: '\\sqrt{d_k}', meaning: '維度縮放除數，防止梯度飽和', color: '#8ec07c' }
                  ]
                }
              ]
            },
            {
              id: '3.2.2',
              title: '3.2.2 Multi-Head Attention',
              level: 3,
              page: 5,
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
                  latexText: '\\mathrm{MultiHead}(Q,K,V) = \\mathrm{Concat}(\\mathrm{head}_1, ..., \\mathrm{head}_h) W^O',
                  page: 'p. 5',
                  sectionId: '3.2.2',
                  sectionTitle: '3.2.2 Multi-Head Attention',
                  sourceContextSnippet: 'Instead of performing a single attention function with d_model-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times...',
                  variables: [
                    { symbol: 'h', meaning: '多頭數量 (通常為 8)', color: '#fe8019' },
                    { symbol: '\\mathrm{head}_i', meaning: '第 i 個子空間注意力頭', color: '#8ec07c' },
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
          page: 5,
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
      page: 5,
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
        { term: 'Scaled Dot-Product', zh: '縮放點積注意力', explanation: '點積除以根號維度穩定方差，阻斷 Softmax 梯度消失', color: '#fabd2f' },
        { term: 'Large in magnitude', zh: '數值幅值過大', explanation: '向量內積數值幅值過大（非幾何尺寸），會將函數推入飽和區', color: '#8ec07c' }
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
