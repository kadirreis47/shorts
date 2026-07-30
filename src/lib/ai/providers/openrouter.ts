import { EdgeFunctionAIProvider } from '@/lib/ai/providers/edge-function-provider';

export const openRouterProvider = new EdgeFunctionAIProvider({
  id: 'openrouter',
  name: 'OpenRouter',
  description: 'Birden fazla modele tek API üzerinden erişim sağlayan sağlayıcı.',
  capabilities: ['script', 'hooks', 'seo', 'analysis'],
});
