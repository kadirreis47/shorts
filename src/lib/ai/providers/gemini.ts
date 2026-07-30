import { EdgeFunctionAIProvider } from '@/lib/ai/providers/edge-function-provider';

export const geminiProvider = new EdgeFunctionAIProvider({
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Gemini destekli metin üretimi ve analiz sağlayıcısı.',
  capabilities: ['script', 'hooks', 'seo', 'analysis'],
});
