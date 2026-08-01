# Sprint 6.9.2 — GPU Render Queue & Hardware Acceleration

## Eklenenler
- `nvidia-smi` ile GPU, VRAM, sürücü, sıcaklık ve kullanım tespiti
- `auto`, `disabled`, `nvenc` donanım politikası
- H.264/HEVC NVENC otomatik seçimi
- VRAM güvenlik eşikleri ve GPU concurrency sınırı
- RTX 3050 Ti / 4 GB sınıfında tek NVENC iş politikası
- GPU doluyken bekleyen hardware queue
- NVENC runtime hatasında otomatik CPU fallback
- Hardware selection ve waiting eventleri
- Render metadata içinde backend, FPS ve encoding speed

Bu sprint GPU kullanımı güvenli değilse renderı kaybetmek yerine CPU'ya düşer.
