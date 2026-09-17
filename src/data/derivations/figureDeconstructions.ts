import type { FigureDeconstructionData } from '../../types/derivation';

/* =========================================================================
   內建經典預設論文圖表解構資料 (Pre-computed Classic Figures)
   ========================================================================= */

export const CLASSIC_FIGURE_DECONSTRUCTIONS: Record<string, FigureDeconstructionData> = {
  fig1: {
    figureId: 'fig1',
    figureNumber: 'Figure 1',
    name: 'The Transformer - Model Architecture 全景拓撲',
    conceptOverview:
      'Transformer 顛覆了長達數年的循環神經網路 (RNN/LSTM) 與卷積網路 (CNN) 典範，首創全基於自注意力機制的序列到序列 (Seq2Seq) 架構。架構分為左側編碼器 (Encoder) 與右側解碼器 (Decoder)，徹底實現了訓練期間的全序列高度並行化。',
    dataFlowSteps: [
      {
        step: 1,
        component: '輸入嵌入與位置編碼 (Positional Encoding)',
        action: 'Token 經過 Word Embedding 後，直接與正弦波位置編碼相加，賦予純注意力矩陣絕對與相對位置感知能力。',
        tensorTransformation: '(B, S) \\to (B, S, d_{\\mathrm{model}})'
      },
      {
        step: 2,
        component: 'Encoder: Multi-Head Self-Attention',
        action: '所有 Token 同時互相關注，計算全對全 (All-to-All) 的上下文交互語義表徵。',
        tensorTransformation: '(B, S, d_{\\mathrm{model}}) \\to (B, S, d_{\\mathrm{model}})'
      },
      {
        step: 3,
        component: '殘差連接與層歸一化 (Add & Norm)',
        action: '引入 x + \\mathrm{SubLayer}(x) 與 LayerNorm，打通無阻礙反向傳播高速公路，抑制深層梯度爆炸/消失。',
        tensorTransformation: '\\mathrm{LayerNorm}(x + \\mathrm{Sublayer}(x))'
      },
      {
        step: 4,
        component: '前饋神經網路 (Position-wise Feed-Forward Network)',
        action: '每個位置獨立進行兩層線性變換與 ReLU/GELU 活化，先擴展維度至 4 \\times d_{\\mathrm{model}} 再收縮，儲存概念記憶。',
        tensorTransformation: '(B, S, 512) \\to (B, S, 2048) \\to (B, S, 512)'
      },
      {
        step: 5,
        component: 'Decoder: Masked Attention & Cross-Attention',
        action: '解碼端在自我注意力中遮蔽未來詞（因果遮罩），接著透過交叉注意力將 Encoder 的輸出（K, V）與解碼端（Q）對齊。',
        tensorTransformation: '(B, S_{dec}, 512) \\times (B, S_{enc}, 512) \\to (B, S_{dec}, 512)'
      }
    ],
    designDecisions: [
      {
        decision: '徹底捨棄循環結構 (No Recurrence)',
        rationale: 'RNN 的 h_t 依賴 h_{t-1}，無法在 GPU 顯存中跨時間步並行計算。Transformer 將計算複雜度從 O(S) 步串行轉化為 O(1) 步矩陣運算，奠定了千億參數大模型預訓練的算力基石。'
      },
      {
        decision: '為什麼需要殘差連接 (Add & Norm)?',
        rationale: '深層網路中矩陣連乘易引發梯度消失。殘差連接使得 \\frac{\\partial y}{\\partial x} = 1 + \\frac{\\partial F}{\\partial x}，保證了至少有為 1 的梯度無損回傳，使得深層網路能夠極其穩定地收斂。'
      },
      {
        decision: '兩層式 FFN 的設計意圖',
        rationale: '自注意力層本質上是加權平均的特徵匯聚（線性混合），而 FFN 提供了強大的非線性擬合能力與記憶儲存空間。'
      }
    ],
    relatedFormulaId: 'eq2',
    keyTakeaway:
      'Transformer 成功的核心在於：用注意力取代循環實現「全局感受野」，用矩陣運算取代逐步迭代實現「極致並行」，用殘差連接與 LayerNorm 實現「深層穩定性」。'
  },

  fig2: {
    figureId: 'fig2',
    figureNumber: 'Figure 2',
    name: 'Scaled Dot-Product Attention 運算電路',
    conceptOverview:
      '圖 2 清晰展示了縮放點積注意力機制的計算流圖。從底部的 Q、K 內積開始，向上依序經過 Scale 因子除法、Masking 因果遮罩（可選）、Softmax 概率歸一化，最後與 V 進行矩陣乘法，完成動態特徵檢索與聚合。',
    dataFlowSteps: [
      {
        step: 1,
        component: '矩陣相乘 MatMul (Q · K^T)',
        action: '計算每個 Query 與所有 Key 的點積相似度，產出未歸一化的關聯分數矩陣。',
        tensorTransformation: '(B, H, S, d_k) \\times (B, H, d_k, S) \\to (B, H, S, S)'
      },
      {
        step: 2,
        component: '數值縮放 Scale (÷ √d_k)',
        action: '將矩陣數值除以 \\sqrt{d_k}，把方差強制壓回單位 1，阻斷數值膨脹。',
        tensorTransformation: 'S_{i,j} = (Q K^T)_{i,j} / \\sqrt{d_k}'
      },
      {
        step: 3,
        component: '遮罩運算 Mask (Optional)',
        action: '在自回歸生成時，將上三角未來位置填入 -\\infty，使得 Softmax 後未來權重嚴格為 0。',
        tensorTransformation: 'S_{i,j} = -\\infty \\; (\\forall j > i)'
      },
      {
        step: 4,
        component: 'Softmax 概率化',
        action: '沿最後一個維度進行 Softmax，將關聯分數轉化為合法的注意力權重分布（每列總和為 1）。',
        tensorTransformation: 'A = \\mathrm{softmax}(S) \\in [0, 1]^{S \\times S}'
      },
      {
        step: 5,
        component: '加權聚合 MatMul with V',
        action: '用計算出的注意力權重矩陣對 Value 矩陣進行加權線性組合，輸出富含上下文語境的新特徵。',
        tensorTransformation: '(B, H, S, S) \\times (B, H, S, d_v) \\to (B, H, S, d_v)'
      }
    ],
    designDecisions: [
      {
        decision: '為什麼採用點積而非加法注意力 (Dot-Product vs Additive)?',
        rationale: '加法注意力（如 Bahdanau 2014）使用單隱藏層前饋網路，在理論複雜度上與點積相似，但在現代硬體上，點積可直接調用高度最佳化的 BLAS 矩陣乘法 (GEMM)，速度快出數倍且顯存空間更經濟。'
      },
      {
        decision: '為什麼必須除以 √d_k?',
        rationale: '若無此縮放，當 d_k 較大時，點積結果在數量級上過大，Softmax 函數輸出極端偏向 one-hot，梯度接近 0，模型將徹底停止學習。'
      }
    ],
    relatedFormulaId: 'eq1',
    keyTakeaway:
      '圖 2 是整個現代大語言模型最核心的最小原子計算單元。理解了「MatMul -> Scale -> Softmax -> MatMul」，就掌握了當代所有 Transformer 架構的運算中樞。'
  }
};
