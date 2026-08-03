import { describe, expect, it } from 'vitest';
import { analyzeEmotionalArc, analyzeClarity, analyzeContinuity, analyzeHookIntelligence } from '@/core/director';
import { directorInput, directorScene } from './fixtures';

describe('Emotion Analyzer', () => {
  it('curiosity, excitement ve tension sinyallerini ayırır', () => {
    const arc = analyzeEmotionalArc(directorInput([
      directorScene('a', 0, { text: 'Bu sırrı neden kimse bilmiyor?' }),
      directorScene('b', 1, { text: 'Bu inanılmaz ve harika sonuç!' }),
      directorScene('c', 2, { text: 'Ama bekle, ciddi bir risk var.' }),
    ]));
    expect(arc.map((item) => item.primaryEmotion)).toEqual(['curiosity', 'excitement', 'tension']);
  });
  it('intensity ve clarity skorlarını normalize eder', () => {
    const result = analyzeEmotionalArc(directorInput())[0];
    expect(result.emotionIntensity).toBeGreaterThanOrEqual(0); expect(result.emotionIntensity).toBeLessThanOrEqual(100);
    expect(result.emotionalClarity).toBeGreaterThanOrEqual(0); expect(result.emotionalClarity).toBeLessThanOrEqual(100);
  });
  it('uyumsuz duygu geçişini düşük puanlar', () => {
    const arc = analyzeEmotionalArc(directorInput([
      directorScene('a', 0, { text: 'Çok mutluyuz, sevgi ve eğlence!' }),
      directorScene('b', 1, { text: 'Tehlike, korku ve ciddi zarar!' }),
    ]));
    expect(arc[1].emotionTransitionQuality).toBeLessThan(60);
    expect(arc[1].recommendations).toHaveLength(1);
  });
});

describe('Clarity Analyzer', () => {
  it('kısa ve net metni yoğun metinden yüksek puanlar', () => {
    const result = analyzeClarity(directorInput([
      directorScene('clear', 0, { text: 'Üç adımda daha iyi odaklan.' }),
      directorScene('dense', 1, { text: Array.from({ length: 70 }, (_, i) => `bilgi${i}`).join(' '), durationMs: 2_000 }),
    ]));
    expect(result[0].clarityScore).toBeGreaterThan(result[1].clarityScore);
  });
  it('aşırı yoğun metne overload cezası verir', () => {
    const [result] = analyzeClarity(directorInput([directorScene('dense', 0, { text: 'kelime '.repeat(80), durationMs: 1_500 })]));
    expect(result.overloadRisk).toBeGreaterThan(70); expect(result.recommendations.length).toBeGreaterThan(0);
  });
  it('WPM değerini sahne süresinden hesaplar', () => {
    const [result] = analyzeClarity(directorInput([directorScene('wpm', 0, { text: 'bir iki üç dört beş altı', durationMs: 6_000 })]));
    expect(result.estimatedWordsPerMinute).toBe(60);
  });
});

describe('Continuity Analyzer', () => {
  it('tekrarlanan asset/görsel davranışını cezalandırır', () => {
    const result = analyzeContinuity(directorInput([
      directorScene('a', 0, { visualPrompt: 'same', assetTypes: ['video'] }),
      directorScene('b', 1, { visualPrompt: 'same', assetTypes: ['video'] }),
    ]));
    expect(result.visualContinuityScore).toBeLessThan(90);
  });
  it('ani intensity geçişini discontinuity olarak işaretler', () => {
    const result = analyzeContinuity(directorInput([
      directorScene('a', 0, { intensity: 0.05 }), directorScene('b', 1, { intensity: 0.95 }),
    ]));
    expect(result.discontinuitySceneIds).toContain('b');
  });
  it('mantıksız rol sıralamasını narrative flow içinde cezalandırır', () => {
    const result = analyzeContinuity(directorInput([
      directorScene('a', 0, { role: 'payoff' }), directorScene('b', 1, { role: 'setup' }),
    ]));
    expect(result.narrativeFlowScore).toBeLessThan(80);
  });
});

describe('Advanced Hook Intelligence', () => {
  it('güçlü sayısal hook specificity avantajı sağlar', () => {
    const hook = analyzeHookIntelligence(directorInput([directorScene('h', 0, { text: '7 kanıtlanmış yöntemle hemen odaklan?' })]));
    expect(hook.specificityScore).toBeGreaterThan(75); expect(hook.copyScore).toBeGreaterThan(60);
  });
  it('uzun selamlamayı anti-pattern olarak algılar', () => {
    const hook = analyzeHookIntelligence(directorInput([directorScene('h', 0, { text: 'Herkese merhaba bugün size anlatacağım bu oldukça uzun ve gereksiz giriş metnidir' })]));
    expect(hook.antiPatterns).toContain('long-greeting'); expect(hook.antiPatterns).toContain('unnecessary-intro');
  });
  it('ilk üç saniye motion sinyalini skora yansıtır', () => {
    const moving = analyzeHookIntelligence(directorInput([directorScene('h', 0, { cameraMotion: 'zoom_in', firstVisualChangeMs: 500 })]));
    const still = analyzeHookIntelligence(directorInput([directorScene('h', 0, { cameraMotion: 'none', firstVisualChangeMs: null })]));
    expect(moving.visualInterruptScore).toBeGreaterThan(still.visualInterruptScore);
  });
  it('Türkçe Unicode merak kelimelerini tanır', () => {
    expect(analyzeHookIntelligence(directorInput([directorScene('h', 0, { text: 'Bu sırrı nasıl öğrendiler?' })])).curiosityScore).toBeGreaterThan(70);
  });
});
