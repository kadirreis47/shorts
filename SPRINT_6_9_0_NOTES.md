# Sprint 6.9.0 — Professional Render Engine Foundation

## Amaç
Doğrulanmış Render Manifest'lerini adapter tabanlı, iptal edilebilir ve
gözlemlenebilir bir render kuyruğunda çalıştırmak.

## Eklenenler
- Type-safe Render Engine ve Render Adapter sözleşmeleri
- FIFO render kuyruğu ve ayarlanabilir concurrency
- AbortController tabanlı iptal
- Render lifecycle ve progress eventleri
- Aktif iş ve geçmiş takibi için renderStore
- Event Bus -> RenderJobMonitor -> Zustand akışı
- DI Container entegrasyonu
- Render preset ve codec modeli
- Manifest Plan Adapter
- Render kalite kapısı zorunluluğu
- Frame sayısı ve yürütme planı metrikleri

## Önemli
Bu sprint gerçek MP4 kodlaması yapmaz. Render manifestini yürütülebilir bir plana
dönüştüren adapter ve kuyruk omurgasını kurar. Gerçek FFmpeg adapter'ı Sprint
6.9.1'de aynı sözleşmeye takılacaktır.
