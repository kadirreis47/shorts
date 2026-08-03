import { includesPhrase, tokenizeDirectorText, tokenOverlap } from './textAnalysis';
import { average } from './analyzerUtils';
import { normalizeScore, recommendation } from './scoring';
import type { DirectorHookIntelligence, DirectorInput, DirectorRecommendation } from './types';

const GREETINGS = ['merhaba', 'selam', 'herkese merhaba', 'hello', 'hi everyone', 'welcome'];
const GENERIC_INTROS = ['bugün size anlatacağım', 'bu videoda', 'today i will tell you', 'in this video'];

export function analyzeHookIntelligence(input: DirectorInput): DirectorHookIntelligence {
  const hook = input.scenes.find((scene) => scene.role === 'hook') ?? input.scenes[0];
  if (!hook) return emptyHook();
  const words = tokenizeDirectorText(hook.text);
  const opening = words.slice(0, 8).join(' ');
  const hasQuestion = hook.text.includes('?');
  const hasNumber = words.some((word) => /^\d+$/u.test(word));
  const curiosity = includesPhrase(hook.text, ['neden', 'nasıl', 'sır', 'şaşırtıcı', 'why', 'how', 'secret']);
  const urgency = includesPhrase(hook.text, ['hemen', 'şimdi', 'kaçırma', 'tehlike', 'now', 'never miss', 'danger']);
  const direct = includesPhrase(opening, ['sen', 'siz', 'your', 'you']);
  const antiPatterns: string[] = [];
  if (includesPhrase(opening, GREETINGS)) antiPatterns.push('long-greeting');
  if (includesPhrase(hook.text, GENERIC_INTROS)) antiPatterns.push('unnecessary-intro');
  if (words.length > 28) antiPatterns.push('too-long-copy');
  if (hook.cameraMotion === 'none') antiPatterns.push('low-motion');
  const copyScore = normalizeScore(55 + (hasQuestion ? 18 : 0) + (direct ? 10 : 0) - antiPatterns.length * 10);
  const curiosityScore = normalizeScore(35 + (curiosity ? 45 : 0) + (hasQuestion ? 15 : 0));
  const urgencyScore = normalizeScore(35 + (urgency ? 50 : 0));
  const visualInterruptScore = normalizeScore(30 + (hook.cameraMotion !== 'none' ? 40 : 0) +
    (hook.firstVisualChangeMs !== null && hook.firstVisualChangeMs <= 1_500 ? 15 : 0) +
    (hook.firstCutMs !== null && hook.firstCutMs !== undefined && hook.firstCutMs <= 1_500 ? 8 : 0) +
    (hook.firstSubtitleMs !== null && hook.firstSubtitleMs !== undefined && hook.firstSubtitleMs <= 1_500 ? 7 : 0));
  const specificityScore = normalizeScore(40 + (hasNumber ? 40 : 0) + (words.length >= 4 && words.length <= 18 ? 15 : 0));
  const credibilityScore = normalizeScore(45 + (includesPhrase(hook.text, ['kanıt', 'araştırma', 'uzman', 'proof', 'research', 'expert']) ? 42 : 0));
  const firstThreeSecondsScore = normalizeScore(average([copyScore, curiosityScore, urgencyScore, visualInterruptScore, specificityScore]));
  const recommendations: DirectorRecommendation[] = [];
  const add = (action: string, title: string) => recommendations.push(recommendation({ sceneId: hook.id, category: action.includes('motion') ? 'motion' : 'hook',
    priority: 'high', title, description: 'İlk üç saniye heuristic skoru geliştirilebilir.', expectedImpact: 'Hook açıklığını ve dikkat kesmesini artırabilir.',
    suggestedAction: action, sourceAnalyzer: 'advanced-hook-heuristic-v2', confidence: 88 }));
  if (!hasQuestion && !hasNumber) add('add-question', 'Soru veya sayısal vaat ekle');
  if (antiPatterns.includes('long-greeting') || antiPatterns.includes('unnecessary-intro')) add('shorten', 'Girişi kısalt');
  if (hook.cameraMotion === 'none') add('increase-motion', 'Pattern interrupt ekle');
  if (hook.firstAudioCueMs === null || hook.firstAudioCueMs === undefined || hook.firstAudioCueMs > 1_500) add('add-sfx', 'İlk saniyeye ses vurgusu ekle');
  if (tokenOverlap(hook.text, hook.visualPrompt) < 0.08) add('add-pattern-interrupt', 'Hook görselini vaatle eşleştir');
  return { sceneId: hook.id, copyScore, curiosityScore, urgencyScore, visualInterruptScore, specificityScore,
    credibilityScore, firstThreeSecondsScore, overallHookScore: normalizeScore(average([firstThreeSecondsScore, credibilityScore])),
    antiPatterns, evidence: [`Opening: ${opening}.`, `Word count: ${words.length}.`], recommendations };
}

function emptyHook(): DirectorHookIntelligence {
  return { sceneId: null, copyScore: 0, curiosityScore: 0, urgencyScore: 0, visualInterruptScore: 0,
    specificityScore: 0, credibilityScore: 0, firstThreeSecondsScore: 0, overallHookScore: 0,
    antiPatterns: ['missing-hook'], evidence: [], recommendations: [] };
}
