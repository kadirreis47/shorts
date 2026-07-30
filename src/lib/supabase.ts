import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const hasValidUrl = Boolean(rawUrl && /^https:\/\/.+\.supabase\.co\/?$/i.test(rawUrl));
const hasValidAnonKey = Boolean(rawAnonKey && rawAnonKey.length > 20);

export const isSupabaseConfigured = hasValidUrl && hasValidAnonKey;
export const supabaseConfigurationError = isSupabaseConfigured
  ? null
  : 'Supabase bağlantı bilgileri eksik veya geçersiz. Uygulama çevrimdışı modda açıldı.';

// createClient geçerli bir URL ister. Ayarlar eksikken güvenli bir yer tutucu
// kullanılır; uygulama isSupabaseConfigured kontrolü sayesinde bu adrese istek atmaz.
const url = isSupabaseConfigured ? rawUrl! : 'https://offline-placeholder.supabase.co';
const anonKey = isSupabaseConfigured ? rawAnonKey! : 'offline-placeholder-anon-key';

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
