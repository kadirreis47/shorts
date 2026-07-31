# Sprint 6.8.5 — Media Validation & Render Readiness

## Amaç
Render başlamadan önce media projesinin timeline, asset, altyazı, ses ve çıktı
ayarlarını merkezi bir kalite kapısından geçirmek.

## Eklenenler
- Kategorize edilmiş validation issue modeli
- Error, warning ve info seviyeleri
- 0–100 genel kalite puanı
- Altı kategoride ayrı kalite puanları
- Asset kapsama ve tekrar kontrolü
- Subtitle coverage ve okuma hızı kontrolü
- Voice coverage, LUFS ve ses katmanı yoğunluğu kontrolü
- Timeline sırası, süre ve pacing kontrolü
- Dikey çözünürlük, FPS ve minimum çözünürlük kontrolü
- Render readiness quality gate
- Event Bus ve mediaStore entegrasyonu
- Render Manifest schema 1.4

## Not
Validation motoru render gerçekleştirmez. FFmpeg/renderer başlamadan önce deterministik
bir kalite raporu ve güvenli render kararı üretir.
