# Sprint 6.9.6 — Zero-Copy Segment Assembly

## Amaç
Incremental segment cache çıktılarını final aşamada yeniden video encode etmeden
birleştirmek ve gerçek incremental render kazancını yükseltmek.

## Eklenenler
- Altyazıların global final pass yerine sahne segmenti üretilirken yakılması
- Sahneye göre yerel subtitle timestamp dönüşümü
- Altyazı içeriğinin scene fingerprint ile birlikte cache invalidation'a katılması
- FFmpeg concat demuxer ile `-c:v copy` final video birleştirme
- Final aşamada yalnızca ses track'inin kodlanması
- Eski altyazısız segmentlerin kullanılmaması için `v2-` segment cache namespace
- Çıktı metadata'sında `zero-copy-segment-assembly`
- Final video yeniden kodlanmadığını belirten metadata

## Sonuç
Değişmeyen sahneler cache'ten alınır, değişen sahneler bir kez render edilir ve
final video akışı yeniden encode edilmeden birleştirilir. Böylece önceki sprintte
kalan final video re-encode maliyeti kaldırılır.

## Not
Gerçek voice, music ve SFX track miksajı ayrı Audio Render Adapter sprintinde
sessiz ses yatağının yerini alacaktır.
