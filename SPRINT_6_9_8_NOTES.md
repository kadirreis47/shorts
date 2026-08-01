# Sprint 6.9.8 — Dynamic Motion & Transition Renderer

## Amaç
Media Engine tarafından planlanan kamera hareketleri ve geçişleri gerçek FFmpeg
sahne segment filtrelerine dönüştürmek.

## Eklenenler
- Zoom-in ve zoom-out kamera hareketleri
- Sağ/sol pan hareketleri
- Ken Burns hareketi
- Frame ve süre tabanlı deterministik hareket ifadeleri
- Fade ve crossfade benzeri güvenli sahne giriş/çıkışları
- Zoom ve slide geçişleri için segment uyumlu efektler
- Blur geçiş efekti
- Transition sürelerini sahne süresine göre güvenli sınırlama
- Zero-copy final assembly ile uyum
- Kamera hareketi ve geçiş kullanılan sahne sayılarının render metadata'sı
- Segment fingerprint mevcut kamera/geçiş alanlarını içerdiği için otomatik
  cache invalidation

## Tasarım kararı
Gerçek iki-klip xfade işlemi segment sınırında video yeniden kodlama gerektirir.
Zero-copy mimarisini korumak için bu sürüm geçişleri sahne segmenti içinde
güvenli giriş/çıkış efektleri olarak uygular. İleri seviye overlap compositor,
ayrı bir transition compositor adapter ile eklenebilir.
