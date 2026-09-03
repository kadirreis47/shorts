/** Browser-facing strict contract shared with the server-only semantic Edge boundary. */
export {
  VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION,
  VISUAL_SEMANTIC_ANALYSIS_DIMENSIONS,
  normalizeVisualSemanticAnalysisRequest as normalizeSemanticImageAnalysisRequest,
  normalizeVisualSemanticAnalysisResponse as normalizeSemanticImageAnalysisResponse,
  normalizeDiscoveryCandidateSemanticAnalysisRequest,
} from '../../../supabase/functions/_shared/visual-semantic-analysis';
export type {
  VisualSemanticAnalysisRequest as SemanticImageAnalysisRequest,
  VisualSemanticAnalysisResponse as SemanticImageAnalysisResponse,
  VisualSemanticAnalysisReason as SemanticImageAnalysisReason,
  VisualSemanticObservation as SemanticImageObservation,
  DiscoveryCandidateSemanticAnalysisRequest,
} from '../../../supabase/functions/_shared/visual-semantic-analysis';
