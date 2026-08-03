# Sprint 6.9.5 — Physical Segment Render Cache

## Amaç
Incremental Scene Planner kararlarını gerçek MP4 sahne segmentlerine dönüştürmek
ve değişmeyen sahneleri fiziksel disk cache'inden tekrar kullanmak.

## Eklenenler
- Electron userData altında kalıcı sahne segment klasörü
- Fingerprint bazlı fiziksel `.mp4` segment yolları
- Segment varlık kontrolü, istatistik ve cache temizleme IPC'leri
- Tek sahne için bağımsız FFmpeg komut üretimi
- Değişen sahnelerin ayrı FFmpeg süreçlerinde kodlanması
- Değişmeyen sahnelerin disk cache'inden doğrudan kullanılması
- FFmpeg concat demuxer ile segment birleştirme
- Birleştirme aşamasında global altyazı ve ses yatağı uygulanması
- Parent render iptalinde aktif segment ve concat işlerinin iptali
- Çıktı metadata'sında rendered/reused segment sayıları
- Segment cache klasörü boyutu ve kayıt sayısı istatistikleri

## Güvenlik ve uyumluluk
Segmentler aynı preset, çözünürlük, FPS ve codec fingerprint'iyle üretildiğinden
concat aşamasına yalnızca uyumlu parçalar alınır. Geçiş bağımlı komşu sahneler
Incremental Planner tarafından zaten yeniden render listesine eklenir.

## Bilinen sınır
Final concat aşamasında altyazı yakıldığı için son bir video kodlama geçişi
devam eder. Buna rağmen kaynak asset ölçekleme, kırpma ve sahne kodlama işlemleri
değişmeyen sahnelerde tekrar yapılmaz.
