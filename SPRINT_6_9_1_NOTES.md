# Sprint 6.9.1 — FFmpeg Render Adapter

- Electron main process FFmpeg IPC service
- FFmpeg capability/encoder detection
- Gerçek MP4 üretimi
- Scene asset veya renk fallback kompozisyonu
- Scale/crop/fps/concat filter graph
- SRT altyazı yakma
- Sessiz AAC ses yatağı
- FFmpeg progress parser
- Render Engine cancellation
- CPU ve NVENC codec seçimi
- Varsayılan çıktı: Windows Videolar/ShortsFlow

FFmpeg sistemde kurulu ve PATH üzerinde olmalıdır. Alternatif executable yolu
SHORTSFLOW_FFMPEG_PATH ortam değişkeniyle verilebilir.
