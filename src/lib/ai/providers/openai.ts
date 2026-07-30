import { EdgeFunctionAIProvider } from '@/lib/ai/providers/edge-function-provider';

export const openAIProvider = new EdgeFunctionAIProvider({
  id: 'openai',
  name: 'OpenAI',
  description: 'ShortsFlow mevcut Supabase Edge Function altyapısını kullanır.',
  capabilities: ['script', 'hooks', 'seo', 'analysis'],
  includeProviderInPayload: false,
});
