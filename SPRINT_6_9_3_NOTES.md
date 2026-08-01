# Sprint 6.9.3 — Smart Render Cache

## Amaç
Aynı render manifesti, preset ve adapter kombinasyonu yeniden istendiğinde
gereksiz FFmpeg işlemini atlayıp daha önce üretilen geçerli çıktıyı kullanmak.

## Eklenenler
- Deterministik render fingerprint üretimi
- SHA-256 destekli stabil manifest hash algoritması
- Preset ve adapter bilgisini fingerprint'e dahil etme
- LocalStorage tabanlı kalıcı LRU cache indexi
- En fazla 50 render cache kaydı
- Electron üzerinden cache çıktısının diskte hâlâ var olduğunu doğrulama
- Eksik veya silinmiş çıktıların otomatik cache invalidation işlemi
- Cache hit, miss ve store Event Bus olayları
- Cache hit durumunda FFmpeg kuyruğunu tamamen atlama
- `forceRender` ile cache'i bilinçli olarak bypass etme
- Hit, miss, invalid entry ve kazanılan render süresi metrikleri
- Çıktı metadata'sında render fingerprint ve cacheHit bilgisi

## Kapsam
Bu sürüm tam proje fingerprint cache'i uygular. Sahne bazlı parça render cache'i
ve yalnızca değişen sahneleri yeniden kodlama, sonraki incremental rendering
sprintinde bu temel üzerine kurulacaktır.
