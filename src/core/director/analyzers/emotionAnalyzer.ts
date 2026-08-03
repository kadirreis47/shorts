import { EMOTION_LEXICON } from '../data/emotionLexicon';
import { tokenizeDirectorText } from '../textAnalysis';
import { dimensionScore, normalizeScore, recommendation } from '../scoring';
import type { DirectorAnalyzer, DirectorEmotion, DirectorEmotionAnalysis, DirectorInput } from '../types';

export function analyzeEmotionalArc(input: DirectorInput): DirectorEmotionAnalysis[] {
  let previous: DirectorEmotion = 'neutral';
  return input.scenes.map((scene) => {
    const tokens = tokenizeDirectorText(scene.text);
    const counts = Object.entries(EMOTION_LEXICON).map(([emotion, words]) => ({
      emotion: emotion as DirectorEmotion,
      count: tokens.filter((token) => words.includes(token)).length,
    })).sort((a, b) => b.count - a.count || a.emotion.localeCompare(b.emotion));
    const primary = counts[0].count > 0 ? counts[0].emotion : roleEmotion(scene.role);
    const secondary = counts[1].count > 0 ? counts[1].emotion : 'neutral';
    const punctuation = (scene.text.match(/[!?]/g) ?? []).length;
    const audioBoost = (scene.audioSignals?.includes('music') ? 5 : 0) + (scene.audioSignals?.includes('sfx') ? 8 : 0);
    const motionBoost = scene.cameraMotion === 'none' ? 0 : 5;
    const intensity = normalizeScore(scene.intensity * 65 + counts[0].count * 12 + punctuation * 5 + audioBoost + motionBoost);
    const clarity = normalizeScore(45 + (counts[0].count - counts[1].count) * 18 + (counts[0].count > 0 ? 18 : 0));
    const transition = normalizeScore(primary === previous ? 70 : compatible(previous, primary) ? 86 : 48);
    const evidence = [`Primary emotion signal: ${primary}.`, `Scene intensity: ${scene.intensity}.`,
      `Motion: ${scene.cameraMotion}; audio: ${scene.audioSignals?.join(', ') || 'none'}.`];
    const recommendations = transition < 55 ? [recommendation({
      sceneId: scene.id, category: 'continuity', priority: 'medium', title: 'Duygu geçişini yumuşat',
      description: `${previous} duygusundan ${primary} duygusuna ani geçiş var.`, expectedImpact: 'Duygusal akışı güçlendirebilir.',
      suggestedAction: 'Araya geçiş cümlesi, müzik köprüsü veya ara sahne ekle.', sourceAnalyzer: 'emotion-heuristic-v1', confidence: 78,
    })] : [];
    previous = primary;
    return { sceneId: scene.id, primaryEmotion: primary, secondaryEmotion: secondary,
      emotionIntensity: intensity, emotionalClarity: clarity, emotionTransitionQuality: transition,
      evidence, confidence: 82, recommendations };
  });
}

export function createEmotionAnalyzer(): DirectorAnalyzer {
  return { id: 'emotion-heuristic-v1', async analyze(input) {
    const arc = analyzeEmotionalArc(input);
    return { analyzerId: this.id, sceneResults: arc.map((item) => ({ sceneId: item.sceneId,
      dimensions: [dimensionScore('emotion', (item.emotionIntensity + item.emotionalClarity) / 2, item.confidence, item.evidence)],
      evidence: item.evidence })), recommendations: arc.flatMap((item) => item.recommendations) };
  } };
}

function roleEmotion(role: DirectorInput['scenes'][number]['role']): DirectorEmotion {
  if (role === 'hook') return 'curiosity';
  if (role === 'payoff') return 'inspiration';
  if (role === 'cta') return 'urgency';
  return 'neutral';
}
function compatible(left: DirectorEmotion, right: DirectorEmotion): boolean {
  return left === 'neutral' || right === 'neutral' ||
    (['curiosity', 'tension', 'surprise'].includes(left) && ['tension', 'surprise', 'excitement'].includes(right));
}
