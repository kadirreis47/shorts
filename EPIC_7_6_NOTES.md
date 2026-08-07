# Epic 7.6 Notes

- YouTube Shorts, TikTok, Instagram Reels ve generic short-video için versioned profile registry eklendi.
- Readiness score deterministic bir uyumluluk ölçümüdür; erişim/viral başarı tahmini değildir.
- Resolution, safe-area ve caption/audio profile metadata desteklenen immutable variant'a uygulanır.
- Aspect ratio farklıysa resolution tek başına uygulanmaz; crop/pad/reframe capability gelene kadar geometry planned-only kalır.
- Preview plan, profile ve canonical approval signature'a bağlıdır; stale veya yanlış preview apply edilemez.
- Geometry değişikliğinde source validation temizlenir ve variant kendi fingerprint'iyle yeniden doğrulanır.
- Source binding değişiminde aktif plan/preview invalid edilir; persisted veya diğer platform revision history kayıtları korunur.
- Applied preview tüketilir; duplicate/no-op revision'lar eklenmez ve history platform başına 12 kayıtla sınırlıdır.
- Crop/reframe, timeline pacing ve gerçek export işlemleri planned-only bırakılır.
- Preview zorunludur; stale fingerprint apply'i reddeder ve source manifest korunur.
- Platform Studio lazy-loaded'dır ve platform variant'larını source draft'tan ayrı gösterir.
