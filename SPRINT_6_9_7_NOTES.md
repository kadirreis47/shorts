# Sprint 6.9.7 — Production Audio Render Mixer

## Amaç
Media Engine tarafından planlanan voice, music ve SFX katmanlarını gerçek FFmpeg
audio filter graph'ına dönüştürmek.

## Eklenenler
- Audio asset ID'lerini gerçek medya kaynaklarına çözümleme
- Voice, music ve SFX için bağımsız FFmpeg input ve filtre zincirleri
- Segment başlangıç zamanına göre sample-level `adelay`
- Gain, fade-in ve fade-out uygulaması
- Voice, music ve SFX bus kompozisyonu
- Voice sidechain ile gerçek background music ducking
- Master gain
- EBU R128 hedefli `loudnorm`
- Peak koruması için `alimiter`
- 48 kHz stereo AAC/Opus çıktı
- Gerçek audio asset bulunmazsa güvenli sessiz audio fallback
- Zero-copy video assembly korunurken yalnızca audio encode edilmesi
- Çıktı metadata'sında realAudioMixed ve audioDuckingApplied

## Sonuç
Final MP4 artık yalnızca sessiz ses yatağı taşımaz. Manifest içindeki gerçek
seslendirme, müzik ve efekt assetleri zaman çizelgesine uygun biçimde mikslenir.
Video segmentleri `-c:v copy` ile yeniden kodlanmadan korunur.
