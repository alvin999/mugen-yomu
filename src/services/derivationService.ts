/**
 * MUGEN YOMU - Derivation & Figure Deconstruction Service Layer
 * Facade 整合入口：轉發型別定義、經典預設推導庫、數值/張量模擬器與 AI 推導引擎。
 */

// 1. 導出核心 TypeScript 型別介面
export type {
  DerivationStep,
  TensorShapeInfo,
  LimitAnalysisItem,
  FormulaDerivationData,
  DataFlowStep,
  DesignDecisionItem,
  FigureDeconstructionData
} from '../types/derivation';

// 2. 導出經典預設推導與圖表資料庫
export { CLASSIC_FORMULA_DERIVATIONS } from '../data/derivations/formulaDerivations';
export { CLASSIC_FIGURE_DECONSTRUCTIONS } from '../data/derivations/figureDeconstructions';

// 3. 導出數值與張量沙盒推演純計算引擎
export {
  calculateNumericalSanity,
  calculateTransformerShapes
} from './derivationSimulator';

// 4. 導出 AI 動態推導與圖表解構服務
export {
  getDomainAdaptedFigurePipeline,
  fetchFormulaDerivation,
  fetchFigureDeconstruction,
  verifyScratchpadDerivation,
  scanAndExtractDocumentDerivationsHeuristically
} from './derivationAiService';
