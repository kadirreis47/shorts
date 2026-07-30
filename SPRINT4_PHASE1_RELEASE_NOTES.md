# ShortsFlow Sprint 4 — Phase 1

## Yapılan değişiklikler

- Supabase kanal yükleme isteği için tekrar kullanılabilir `withTimeout` yardımcı fonksiyonu eklendi.
- Zaman aşımı timer'ının işlem sonrasında temizlenmesi sağlandı.
- Lazy-loaded ekranlarda eksik export durumunda anlaşılır çalışma zamanı hatası eklendi.
- Navigasyon öğeleri `useMemo` ile sabitlendi.
- Electron penceresi içerik hazır olmadan gösterilmeyecek şekilde düzenlendi.
- Electron `sandbox` ve `webSecurity` açık hâle getirildi.
- Uygulama içi yeni pencere ve kontrolsüz yönlendirmeler engellendi.
- Güvenli HTTPS ve mailto bağlantıları sistem tarayıcısında açılacak şekilde ayarlandı.
- DevTools otomatik açılması kaldırıldı; gerektiğinde `SHORTSFLOW_OPEN_DEVTOOLS=1` ile açılabilir.
- Renderer çökmesi ve yanıt vermeme durumları için kayıt eklendi.
- Electron ikon yolu proje kökündeki `build/icon.png` konumuna düzeltildi.

## Doğrulama

- `npm run typecheck`: başarılı
- `node --check electron/main.cjs`: başarılı
- `node --check electron/preload.cjs`: başarılı
- Değiştirilen React/TypeScript dosyalarında ESLint: başarılı

## Ortam notu

Linux doğrulama ortamında, ZIP içindeki Windows `node_modules` klasöründe Linux Rollup ikilisi bulunmadığından tam Vite build çalıştırılamadı. Temiz `npm ci` denemesi de paket aynasındaki eksik `yocto-queue` paketi nedeniyle tamamlanamadı. Kullanıcının Windows ortamında `npm run build` ve `npm run electron:dev` ile son doğrulama yapılmalıdır.
