# Sprint 6.9.4 — Incremental Scene Rendering Planner

## Amaç
Tam proje cache'inin ötesine geçerek her sahneyi bağımsız fingerprint ile
karşılaştırmak ve hangi sahnelerin yeniden render edilmesi gerektiğini
deterministik biçimde planlamak.

## Eklenenler
- Sahne bazlı SHA-256 fingerprint
- Asset, altyazı, kamera hareketi, geçiş, süre, çözünürlük ve preset bağımlılıkları
- `render`, `reuse`, `render-dependency` karar modeli
- Geçiş/overlap komşuluk bağımlılığı analizi
- Değişen, tekrar kullanılabilir ve bağımlı sahne listeleri
- Tahmini tekrar kullanılabilir frame sayısı
- Tahmini render tasarruf yüzdesi
- Proje + adapter + preset bazlı kalıcı snapshot
- `forceRender` ve incremental kapatma desteği
- Event Bus lifecycle olayları
- FFmpeg çıktı metadata'sında incremental plan bilgileri

## Önemli kapsam notu
Bu sprint gerçek sahne segmentlerini ayrı MP4 dosyaları olarak birleştirmeden
önce gereken doğru değişiklik analizini ve plan sözleşmesini kurar. Mevcut
FFmpeg adapter güvenli biçimde tam çıktı üretmeye devam eder; fakat hangi
sahnelerin değiştiğini ve teorik tasarrufu artık eksiksiz bilir.

Bir sonraki segment-cache sprintinde bu plan, sahne MP4 parçalarının fiziksel
olarak yeniden kullanılmasını yönetecektir.
