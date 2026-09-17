export interface DerivationStep {
  stepNumber: number;
  title: string;
  latexFormula: string;
  explanation: string;
  intuition?: string;
}

export interface TensorShapeInfo {
  stage: string;
  shape: string;
  description: string;
}

export interface LimitAnalysisItem {
  condition: string;
  consequence: string;
  mathSnippet?: string;
}

export interface FormulaDerivationData {
  formulaId: string;
  formulaNumber?: string;
  formulaName: string;
  latexText: string;
  sourceSectionId?: string;
  sourceSectionTitle?: string;
  sourcePage?: string;
  sourceContextSnippet?: string;
  assumptions: string[];
  steps: DerivationStep[];
  limitAnalysis: LimitAnalysisItem[];
  tensorShapes: TensorShapeInfo[];
  physicalIntuition: string;
  isAiGenerated?: boolean;
}

export interface DataFlowStep {
  step: number;
  component: string;
  action: string;
  tensorTransformation?: string;
}

export interface DesignDecisionItem {
  decision: string;
  rationale: string;
}

export interface FigureDeconstructionData {
  figureId: string;
  figureNumber?: string;
  name: string;
  conceptOverview: string;
  dataFlowSteps: DataFlowStep[];
  designDecisions: DesignDecisionItem[];
  relatedFormulaId?: string;
  keyTakeaway: string;
  isAiGenerated?: boolean;
}
