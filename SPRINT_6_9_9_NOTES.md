# Sprint 6.9.9 — Advanced Subtitle & Typography Renderer

## Amaç
Kelime zamanlaması ve sahne yoğunluğunu gelişmiş ASS tipografi animasyonlarına
dönüştürmek.

## Eklenenler
- FFmpeg libass tabanlı gelişmiş altyazı render sistemi
- Clean, Bold, Karaoke ve Viral subtitle presetleri
- Hook ve yüksek yoğunluklu sahnelerde otomatik viral preset
- CTA ve orta-yüksek yoğunlukta bold preset
- Kelime bazlı karaoke highlight
- Kelime bazlı pop/scale animasyonu
- Fade-in/fade-out
- Dikey video çözünürlüğüne göre dinamik font boyutu
- Outline, shadow, safe margin ve mobil okunabilirlik ayarları
- ASS özel karakter kaçış sistemi
- Sahneye yerel subtitle timestamp dönüşümü
- Segment cache ve zero-copy assembly ile tam uyum
- Subtitle metni/timing değiştiğinde otomatik segment invalidation
- Metadata'da advancedSubtitleRenderer ve karaokeReadyCueCount

## Tasarım
Stil seçimi sahne rolü ve intensity değerinden deterministik olarak yapılır.
Bu sayede aynı proje her render'da aynı tipografi sonucunu üretir ve cache
fingerprint güvenilir kalır.
