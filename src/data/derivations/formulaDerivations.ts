import type { FormulaDerivationData } from '../../types/derivation';

/* =========================================================================
   內建經典預設論文公式推導資料 (Pre-computed Classic Derivations)
   ========================================================================= */

export const CLASSIC_FORMULA_DERIVATIONS: Record<string, FormulaDerivationData> = {
  // Transformer: Scaled Dot-Product Attention
  eq1: {
    formulaId: 'eq1',
    formulaNumber: '(1)',
    formulaName: '縮放點積注意力機制 (Scaled Dot-Product Attention)',
    latexText: '\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V',
    sourceSectionId: '3.2.1',
    sourceSectionTitle: '3.2.1 Scaled Dot-Product Attention',
    sourcePage: 'p. 4',
    sourceContextSnippet: 'We call our particular attention "Scaled Dot-Product Attention". The input consists of queries and keys of dimension d_k, and values of dimension d_v.',
    assumptions: [
      '向量 q 與 k 的各維度分量均為獨立同分布之隨機變數 (i.i.d. Random Variables)。',
      '各維度隨機變數具有零均值與單位方差：\\mathbb{E}[q_i] = \\mathbb{E}[k_i] = 0, \\; \\mathrm{Var}(q_i) = \\mathrm{Var}(k_i) = 1。',
      '假設向量維度為 d_k，不考慮遮罩 (Masking) 時之標準點積形式。'
    ],
    steps: [
      {
        stepNumber: 1,
        title: '向量點積之數學期望值計算',
        latexFormula: '\\mathbb{E}[q \\cdot k] = \\mathbb{E}\\left[ \\sum_{i=1}^{d_k} q_i k_i \\right] = \\sum_{i=1}^{d_k} \\mathbb{E}[q_i] \\mathbb{E}[k_i] = 0',
        explanation: '由於 q_i 與 k_i 為相互獨立且均值為 0 之隨機變數，其乘積之期望值可拆解為個別期望值之乘積，總和仍為 0。',
        intuition: '點積的統計中心位在原點，沒有偏向任何特定方向。'
      },
      {
        stepNumber: 2,
        title: '向量點積方差之線性累積展開',
        latexFormula: '\\mathrm{Var}(q \\cdot k) = \\mathrm{Var}\\left( \\sum_{i=1}^{d_k} q_i k_i \\right) = \\sum_{i=1}^{d_k} \\mathrm{Var}(q_i k_i) = \\sum_{i=1}^{d_k} \\mathbb{E}[q_i^2] \\mathbb{E}[k_i^2] = \\sum_{i=1}^{d_k} (1)(1) = d_k',
        explanation: '獨立隨機變數和的方差等於各方差之和。每一維度分量的方差皆為 1，因此 d_k 維度的累加方差恰好等於維度大小 d_k，標準差為 \\sigma = \\sqrt{d_k}。',
        intuition: '當維度 d_k 很大時（如 64 或 128），點積的振幅會以 \\sqrt{d_k} 的速度劇烈發散！'
      },
      {
        stepNumber: 3,
        title: '除以根號 d_k 完成方差歸一化',
        latexFormula: '\\mathrm{Var}\\left( \\frac{q \\cdot k}{\\sqrt{d_k}} \\right) = \\frac{1}{(\\sqrt{d_k})^2} \\mathrm{Var}(q \\cdot k) = \\frac{1}{d_k} \\cdot d_k = 1',
        explanation: '利用方差的純量倍率性質 \\mathrm{Var}(cX) = c^2 \\mathrm{Var}(X)。透過將點積除以 \\sqrt{d_k}，強制將方差拉回數值 1。',
        intuition: '這就是「Scaled」的數學真諦：徹底消除向量維度大小對內積數值尺度的影響。'
      },
      {
        stepNumber: 4,
        title: 'Softmax 梯度活化與加權聚合',
        latexFormula: 'A_{i,j} = \\frac{\\exp\\left( \\frac{q_i \\cdot k_j}{\\sqrt{d_k}} \\right)}{\\sum_{m=1}^S \\exp\\left( \\frac{q_i \\cdot k_m}{\\sqrt{d_k}} \\right)}, \\quad \\mathrm{Output} = A V',
        explanation: '將方差歸一化後的相關度得分通過 Softmax 映射為合法的概率分布，最後與 Value 矩陣做線性組合輸出特徵。',
        intuition: '輸入方差為 1 恰好落在 Softmax 梯度最活躍的靈敏區，保證反向傳播梯度穩定流動。'
      }
    ],
    limitAnalysis: [
      {
        condition: '未縮放情境：d_k \\gg 1 (例如 d_k = 512, \\sqrt{d_k} \\approx 22.6)',
        consequence: '點積幅值將達到幾十甚至上百，Softmax 會被推入極端飽和的平坦區（接近 0 或 1），此時局部導數 \\frac{\\partial \\mathrm{softmax}}{\\partial z} \\approx 0，導致嚴重的梯度消失 (Vanishing Gradient)。',
        mathSnippet: '\\lim_{z_i \\to \\infty} \\frac{\\partial \\mathrm{softmax}(z)_i}{\\partial z_j} = 0'
      },
      {
        condition: '縮放後情境：\\sigma = 1 的數值穩定態',
        consequence: '注意力得分集中在 [-3, +3] 區間，Softmax 具有充沛的梯度流動能力，反向傳播能順暢更新 Query 與 Key 投影矩陣。',
        mathSnippet: '\\mathbb{E}[z] = 0, \\; \\mathrm{Var}(z) = 1 \\implies \\text{梯度健康流動}'
      }
    ],
    tensorShapes: [
      { stage: 'Query (Q) 矩陣', shape: '(B, H, S, d_k)', description: 'Batch, Multi-Heads, 序列長度, Head 維度' },
      { stage: 'Key (K^T) 轉置矩陣', shape: '(B, H, d_k, S)', description: '用於矩陣相乘對齊維度' },
      { stage: '點積矩陣 Q K^T / \\sqrt{d_k}', shape: '(B, H, S, S)', description: '每對 token 之間的雙向注意力相關度分數' },
      { stage: 'Softmax 注意力權重', shape: '(B, H, S, S)', description: '歸一化權重，每列總和為 1' },
      { stage: 'Value (V) 矩陣', shape: '(B, H, S, d_v)', description: '儲存內容特徵' },
      { stage: '最終輸出 Output', shape: '(B, H, S, d_v)', description: '融合上下文後的單頭表示，隨後進行多頭 Concat' }
    ],
    physicalIntuition:
      '點積注意力本質上是高維向量空間中的「投影相關度搜尋引擎」。Query 像是搜尋請求，Key 是檔案索引，Value 是檔案內容。縮放因子 \\sqrt{d_k} 則是「數值阻尼器」，防止高維空間距離平方和引起的梯度凍結。'
  },

  // Transformer: Multi-Head Attention
  eq2: {
    formulaId: 'eq2',
    formulaNumber: '(2)',
    formulaName: '多頭注意力子空間投影 (Multi-Head Attention)',
    latexText: '\\mathrm{MultiHead}(Q,K,V) = \\mathrm{Concat}(\\mathrm{head}_1, \\dots, \\mathrm{head}_h) W^O, \\quad \\mathrm{head}_i = \\mathrm{Attention}(Q W_i^Q, K W_i^K, V W_i^V)',
    sourceSectionId: '3.2.2',
    sourceSectionTitle: '3.2.2 Multi-Head Attention',
    sourcePage: 'p. 5',
    sourceContextSnippet: 'Instead of performing a single attention function with d_model-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times...',
    assumptions: [
      '模型整體隱藏維度為 d_{\\mathrm{model}}，並行頭數為 h。',
      '各子空間維度滿足 d_k = d_v = d_{\\mathrm{model}} / h（例如 512 / 8 = 64）。',
      'W_i^Q \\in \\mathbb{R}^{d_{\\mathrm{model}} \\times d_k}, W_i^K \\in \\mathbb{R}^{d_{\\mathrm{model}} \\times d_k}, W_i^V \\in \\mathbb{R}^{d_{\\mathrm{model}} \\times d_v}, W^O \\in \\mathbb{R}^{h d_v \\times d_{\\mathrm{model}}}。'
    ],
    steps: [
      {
        stepNumber: 1,
        title: '線性投影至多個獨立低維子空間',
        latexFormula: 'Q_i = Q W_i^Q, \\quad K_i = K W_i^K, \\quad V_i = V W_i^V \\quad (i = 1, \\dots, h)',
        explanation: '若只使用單一注意力機制，注意力權重會被迫將語法、語義、指代、位置等所有特徵混雜平均化。透過 h 組投影矩陣，將特徵投射到不同的語義子維度。',
        intuition: '相當於讓 8 位專家各自戴上不同波長的濾鏡觀察同一個句子。'
      },
      {
        stepNumber: 2,
        title: '並行運算各頭之 Scaled Dot-Product Attention',
        latexFormula: '\\mathrm{head}_i = \\mathrm{softmax}\\left( \\frac{Q_i K_i^T}{\\sqrt{d_k}} \\right) V_i \\in \\mathbb{R}^{S \\times d_v}',
        explanation: '在各個子空間內獨立計算注意力分布，計算複雜度與在全維度下進行單頭運算相當（8 個 64 維 vs 1 個 512 維）。',
        intuition: '計算總量完全相同，卻換來了多子空間的表達多樣性！'
      },
      {
        stepNumber: 3,
        title: '多頭特徵向量拼接與最終線性融合',
        latexFormula: '\\mathrm{MultiHead} = [\\mathrm{head}_1 \\;\\Vert\\; \\mathrm{head}_2 \\;\\Vert\\; \\dots \\;\\Vert\\; \\mathrm{head}_h] W^O',
        explanation: '將 h 個 d_v 維度的注意力輸出沿最後一個維度進行拼接 (Concat)，形成 h \\times d_v = d_{\\mathrm{model}} 的大矩陣，再乘以權重 W^O 進行跨子空間的特徵融合。',
        intuition: '把 8 位專家的觀察筆記拼湊起來，交由融合層產出最終結論。'
      }
    ],
    limitAnalysis: [
      {
        condition: '單頭注意力 (h=1) 之表達瓶頸',
        consequence: '注意力只會聚焦在最顯著的單一關聯（例如單純的相鄰詞或動賓關係），喪失同時捕捉「語法主謂」、「遠距離代名詞指代」與「語境轉折」的能力。',
        mathSnippet: 'h=1 \\implies \\text{平均化損失}'
      },
      {
        condition: '過多頭 (h \\gg d_{\\mathrm{model}}) 之維度退化',
        consequence: '若子空間維度 d_k 過小（例如 d_k < 16），每個空間的向量難以具備足夠的幾何自由度來表達複雜關係。因此通常取 h=8 或 h=16 達最佳平衡。',
        mathSnippet: 'd_k = 64 \\;\\text{為經典經驗最佳值}'
      }
    ],
    tensorShapes: [
      { stage: '輸入 X (Q, K, V)', shape: '(B, S, d_{model})', description: '原始 Token 隱藏向量 (例如 512 維)' },
      { stage: '投影後 Q_i, K_i, V_i', shape: '(B, H, S, d_k)', description: '分流為 H 個並行頭，每頭維度 d_k = 64' },
      { stage: '各頭注意力矩陣', shape: '(B, H, S, S)', description: '每個頭具有獨立的 S x S 注意力分布圖' },
      { stage: '多頭拼接 Concat', shape: '(B, S, H \\times d_v)', description: '沿通道拼接回 512 維度' },
      { stage: '最終線性投影輸出', shape: '(B, S, d_{model})', description: '輸出維度與輸入嚴格一致，便於殘差相加' }
    ],
    physicalIntuition:
      '多頭注意力就是「正交子空間並行投影」。一個頭專注於「主詞動詞搭配」，另一個頭專注於「定語修飾」，第三個頭專注於「代名詞消除歧義」。最後的 W^O 矩陣負責把這些多重視角收束為統一的語義表徵。'
  },

  // Cognitive Reading Efficiency Model
  eq_efficiency: {
    formulaId: 'eq_efficiency',
    formulaNumber: '(1)',
    formulaName: '認知精讀與快取效能模型 (Cognitive Reading & Cache Efficiency Model)',
    latexText: '\\eta_{\\text{reading}} = \\frac{\\mathcal{C}_{\\text{comp}} \\cdot (1 + \\gamma_{\\text{cache}})}{\\ln(\\tau_{\\text{lat}} + 1) \\cdot \\sqrt{\\Omega_{\\text{svo}}}}',
    sourceSectionId: '3.2',
    sourceSectionTitle: '3.2 Cognitive Load Reduction via SVO Parsing & Caching',
    sourcePage: 'p. 3',
    sourceContextSnippet: 'We formulate the cognitive reading efficiency as a function of contextual comprehension, cache retrieval, and syntactic sentence complexity.',
    assumptions: [
      '閱讀理解深度 \\mathcal{C}_{\\text{comp}} 介於 0 至 1.0 之間。',
      '本機快取重複命中率 \\gamma_{\\text{cache}} 介於 0 至 1.0（MUGEN YOMU 基準實測為 82%）。',
      '推論延遲 \\tau_{\\text{lat}} 以毫秒為單位，以自然對數 \\ln(\\tau + 1) 平滑非線性心理阻抗。',
      '長難句複雜度阻抗係數 \\Omega_{\\text{svo}} 代表句法迷宮深度，SVO 拆解後將顯著降低。'
    ],
    steps: [
      {
        stepNumber: 1,
        title: '認知收益分子建構 (Cognitive Gain)',
        latexFormula: '\\text{Gain} = \\mathcal{C}_{\\text{comp}} \\cdot (1 + \\gamma_{\\text{cache}})',
        explanation: '當理解度愈高，閱讀收益呈線性增長；而本機快取提供即時秒開體驗，放大學者的專注沉浸度與心流連續性。',
        intuition: '零等待的快取回應帶來流暢的大腦思考體驗。'
      },
      {
        stepNumber: 2,
        title: '心理阻抗與延遲懲罰 (Friction Penalty)',
        latexFormula: '\\text{Friction} = \\ln(\\tau_{\\text{lat}} + 1) \\cdot \\sqrt{\\Omega_{\\text{svo}}}',
        explanation: '延遲對心流的破壞隨時間以對數增長；複雜嵌套句型對工作記憶體造成平方根級別的負載負擔。',
        intuition: 'SVO 拆解將長句化繁為簡，消除大腦語法解析的阻抗。'
      },
      {
        stepNumber: 3,
        title: '極限效能比值評估 (Ratio Optimization)',
        latexFormula: '\\eta_{\\text{reading}} = \\frac{\\text{Gain}}{\\text{Friction}}',
        explanation: '透過極小化推論延遲（本機快取 8ms）與極小化語法複雜度（SVO 彩色主謂賓拆解），使學術閱讀效能指標 \\eta 達到最大值。',
        intuition: '從死板翻譯躍升為真正的認知直覺洞悉。'
      }
    ],
    limitAnalysis: [
      {
        condition: '極速快取態：\\tau_{\\text{lat}} \\to 8\\text{ms}, \\; \\gamma_{\\text{cache}} = 0.82',
        consequence: '分母對數項極小，效能指標 \\eta 暴增 4.8 倍，學者進入深度無阻礙心流狀態。',
        mathSnippet: '\\ln(8 + 1) \\approx 2.197 \\ll \\ln(2500 + 1) \\approx 7.82'
      }
    ],
    tensorShapes: [
      { stage: '輸入變數向量', shape: '(\\mathcal{C}, \\gamma, \\tau, \\Omega)', description: '4 維度即時遙測狀態' },
      { stage: '綜合效能輸出', shape: '\\mathbb{R}^+', description: '正純量，即時反應於視線密度軌跡列' }
    ],
    physicalIntuition:
      '閱讀並非逐字掃描，而是大腦工作記憶體與資訊流之間的信噪比對決。本模型刻劃了如何透過降低延遲與語法解構，協助讀者跨越認知過載的門檻。'
  }
};
