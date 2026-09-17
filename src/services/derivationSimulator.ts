/**
 * 數值代入試算沙盒：試算點積在縮放前與縮放後進入 Softmax 的數值與梯度情況
 */
export function calculateNumericalSanity(dk: number, dotProduct: number) {
  const sqrtDk = Math.sqrt(dk);
  const scaledValue = dotProduct / (sqrtDk || 1);

  // 模擬與另一干擾項 (假設為 0) 進行 Softmax 競爭時的概率差距
  // e^(z) / (e^(z) + e^0) = 1 / (1 + e^(-z))
  const unscaledSigmoid = 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, dotProduct))));
  const scaledSigmoid = 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, scaledValue))));

  // 導數梯度乘子：p * (1 - p)
  const unscaledGradMultiplier = unscaledSigmoid * (1 - unscaledSigmoid);
  const scaledGradMultiplier = scaledSigmoid * (1 - scaledSigmoid);

  return {
    dk,
    sqrtDk: Number(sqrtDk.toFixed(3)),
    dotProduct,
    scaledValue: Number(scaledValue.toFixed(3)),
    unscaledSigmoid: Number(unscaledSigmoid.toFixed(4)),
    scaledSigmoid: Number(scaledSigmoid.toFixed(4)),
    unscaledGradMultiplier: Number(unscaledGradMultiplier.toFixed(6)),
    scaledGradMultiplier: Number(scaledGradMultiplier.toFixed(4)),
    isSaturated: unscaledGradMultiplier < 0.001
  };
}

/**
 * 張量維度推演器：輸入 Transformer 各層參數，輸出各運算節點之精確張量形狀
 */
export function calculateTransformerShapes(batchSize: number, seqLen: number, dModel: number, numHeads: number) {
  const dK = Math.floor(dModel / numHeads);
  const dFfn = dModel * 4;

  return [
    {
      stage: '1. 輸入張量 Token Embeddings',
      shape: `(${batchSize}, ${seqLen}, ${dModel})`,
      desc: 'Batch Size x 序列長度 x 隱藏維度'
    },
    {
      stage: '2. 多頭子空間拆分 (Q, K, V)',
      shape: `(${batchSize}, ${numHeads}, ${seqLen}, ${dK})`,
      desc: `每頭獨立維度 d_k = ${dModel} / ${numHeads} = ${dK}`
    },
    {
      stage: '3. 注意力矩陣 Q K^T',
      shape: `(${batchSize}, ${numHeads}, ${seqLen}, ${seqLen})`,
      desc: '自注意力權重分布矩陣 (每頭序列自乘)'
    },
    {
      stage: '4. 注意力輸出與多頭拼接 (Concat)',
      shape: `(${batchSize}, ${seqLen}, ${dModel})`,
      desc: `Concat ${numHeads} 個 ${dK} 維向量，恢復為 ${dModel} 維`
    },
    {
      stage: '5. 前饋神經網路 (FFN 膨脹層)',
      shape: `(${batchSize}, ${seqLen}, ${dFfn})`,
      desc: `中間隱藏層放大 4 倍至 ${dFfn}`
    },
    {
      stage: '6. 前饋神經網路 (FFN 收縮輸出)',
      shape: `(${batchSize}, ${seqLen}, ${dModel})`,
      desc: '收縮回原始隱藏維度，與殘差相加'
    }
  ];
}
