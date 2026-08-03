# Sprint 6.9.10 — Render Diagnostics & Output Quality Gate

## Amaç
Üretilen MP4 dosyasını FFprobe ile analiz etmek ve yayın öncesi teknik kalite
kapısından geçirmek.

## Eklenenler
- Electron main process içinde güvenli FFprobe çalıştırma
- Container format, süre, boyut ve toplam bitrate analizi
- Video codec, profil, çözünürlük, pixel format, FPS ve bitrate analizi
- Audio codec, sample rate, kanal sayısı ve channel layout analizi
- Manifest ile gerçek çıktı çözünürlük/FPS/süre karşılaştırması
- 0–100 render quality score
- Teknik uyarılar ve passed/failed kararı
- Boş çıktı, eksik video/audio stream ve duration drift tespiti
- FFmpeg adapter metadata'sında diagnostics raporu
- Render progress içinde kalite kontrol sonucu
- FFprobe özel path için `SHORTSFLOW_FFPROBE_PATH` desteği

## Kalite eşiği
75 ve üzeri puan alan, video stream içeren çıktılar teknik kalite kapısından
geçmiş sayılır. Uyarılar render işlemini silmez; çıktı metadata'sında görünür.
