import type { PaperDocument } from '../../types/document';

// -------------------------------------------------------------
// 經典論文 2: Deep Residual Learning for Image Recognition (ResNet)
// -------------------------------------------------------------
export const resnetPaper: PaperDocument = {
  id: 'cvpr_2016_resnet',
  type: 'paper',
  title: 'Deep Residual Learning for Image Recognition',
  sourceUrl: 'https://arxiv.org/abs/1512.03385',
  pdfUrl: 'https://arxiv.org/pdf/1512.03385.pdf',
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
      page: 1,
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
      page: 2,
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
          sectionId: '2',
          sectionTitle: '2. Deep Residual Learning',
          sourceContextSnippet: 'Instead of hoping each few stacked layers directly fit a desired underlying mapping H(x), we explicitly let these layers fit a residual mapping F(x) := H(x) - x.',
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
      page: 3,
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
        { term: 'Degradation Problem', zh: '深層網路退化問題', explanation: '深層網路訓練集誤差反而高於淺層網路之非過擬合現象', color: '#fabd2f' },
        { term: 'Identity Shortcut', zh: '恆等快捷連接', explanation: '直接無損傳遞特徵 F(x)+x，不引入額外參數量與計算複雜度', color: '#8ec07c' }
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
