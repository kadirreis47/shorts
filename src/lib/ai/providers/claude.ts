import { EdgeFunctionAIProvider } from '@/lib/ai/providers/edge-function-provider';

export const claudeProvider = new EdgeFunctionAIProvider({
  id: 'claude',
  name: 'Anthropic Claude',
  description: 'Claude destekli metin üretimi ve analiz sağlayıcısı.',
  capabilities: ['script', 'hooks', 'seo', 'analysis'],
});
