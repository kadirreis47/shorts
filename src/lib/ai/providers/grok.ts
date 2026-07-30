import { EdgeFunctionAIProvider } from '@/lib/ai/providers/edge-function-provider';

export const grokProvider = new EdgeFunctionAIProvider({
  id: 'grok',
  name: 'xAI Grok',
  description: 'Grok destekli metin üretimi ve analiz sağlayıcısı.',
  capabilities: ['script', 'hooks', 'seo', 'analysis'],
});
