import type { DirectorEmotion } from '../types';

export const EMOTION_LEXICON: Readonly<Record<DirectorEmotion, readonly string[]>> = Object.freeze({
  neutral: [],
  curiosity: ['neden', 'nasıl', 'merak', 'sır', 'acaba', 'why', 'how', 'secret', 'wonder'],
  excitement: ['inanılmaz', 'harika', 'müthiş', 'heyecan', 'amazing', 'incredible', 'exciting'],
  tension: ['ama', 'ancak', 'bekle', 'risk', 'but', 'however', 'wait', 'risk'],
  urgency: ['şimdi', 'hemen', 'son', 'kaçırma', 'now', 'immediately', 'last', 'miss'],
  surprise: ['şaşırtıcı', 'şok', 'beklenmedik', 'surprise', 'shocking', 'unexpected'],
  sadness: ['üzgün', 'kayıp', 'yalnız', 'acı', 'sad', 'loss', 'lonely', 'pain'],
  inspiration: ['başar', 'mümkün', 'hayal', 'değişim', 'achieve', 'possible', 'dream', 'change'],
  trust: ['kanıt', 'araştırma', 'uzman', 'güven', 'proof', 'research', 'expert', 'trust'],
  fear: ['tehlike', 'korku', 'zarar', 'dikkat', 'danger', 'fear', 'harm', 'warning'],
  joy: ['mutlu', 'gül', 'eğlence', 'sevgi', 'happy', 'smile', 'fun', 'love'],
});
