import { average } from '../analyzerUtils';
import { sentenceWordCounts, tokenizeDirectorText } from '../textAnalysis';
import { dimensionScore, normalizeScore, recommendation } from '../scoring';
import type { DirectorAnalyzer, DirectorClarityAnalysis, DirectorInput } from '../types';

const VAGUE_PRONOUNS = new Set(['bu', 'şu', 'o', 'bunlar', 'şey', 'it', 'this', 'that', 'they', 'thing']);

export function analyzeClarity(input: DirectorInput): DirectorClarityAnalysis[] {
  const seen = new Set<string>();
  return input.scenes.map((scene) => {
    const words = tokenizeDirectorText(scene.text);
    const sentences = sentenceWordCounts(scene.text);
    const wpm = Math.round(words.length / Math.max(scene.durationMs / 60_000, 1 / 60));
    const avgSentence = average(sentences, words.length);
    const vagueCount = words.filter((word) => VAGUE_PRONOUNS.has(word)).length;
    const repeated = seen.has(words.join(' ')); seen.add(words.join(' '));
    const density = normalizeScore(words.length / Math.max(1, scene.durationMs / 1_000) * 18);
    const speechPace = normalizeScore(100 - Math.abs(wpm - 155) * 0.55);
    let clarity = 90 - Math.max(0, avgSentence - 18) * 2 - vagueCount * 6 - Math.max(0, density - 72) * 0.5;
    if (repeated) clarity -= 18;
    if (scene.role === 'cta' && !/\b(takip|abone|yorum|tıkla|follow|subscribe|comment|click)\b/iu.test(scene.text)) clarity -= 16;
    const overload = normalizeScore(Math.max(0, density - 45) * 1.6 + Math.max(0, avgSentence - 20) * 2);
    const evidence = [`${words.length} kelime, tahmini ${wpm} WPM.`, `Ortalama cümle uzunluğu ${Math.round(avgSentence)} kelime.`];
    const recommendations = overload > 60 ? [recommendation({ sceneId: scene.id, category: 'clarity', priority: overload > 80 ? 'high' : 'medium',
      title: 'Metni sadeleştir', description: 'Sahne konuşma yoğunluğu veya cümle karmaşıklığı yüksek.',
      expectedImpact: 'Anlama hızını artırabilir.', suggestedAction: 'Tek ana fikre odaklan ve uzun cümleyi ikiye böl.',
      sourceAnalyzer: 'clarity-heuristic-v1', confidence: 90 })] : [];
    return { sceneId: scene.id, clarityScore: normalizeScore(clarity), informationDensity: density,
      speechPaceScore: speechPace, estimatedWordsPerMinute: wpm, overloadRisk: overload, evidence, recommendations };
  });
}

export function createClarityAnalyzer(): DirectorAnalyzer {
  return { id: 'clarity-heuristic-v1', async analyze(input) {
    const analysis = analyzeClarity(input);
    return { analyzerId: this.id, sceneResults: analysis.map((item) => ({ sceneId: item.sceneId,
      dimensions: [dimensionScore('clarity', item.clarityScore, 90, item.evidence)], evidence: item.evidence })),
      recommendations: analysis.flatMap((item) => item.recommendations) };
  } };
}
