# Sprint 6.9.13 — Render Performance Analytics

## Amaç
Render motorunun hız, başarı, kuyruk, cache ve retry davranışlarını merkezi ve
type-safe metriklerle ölçmek.

## Eklenenler
- Toplam, başarılı, hatalı ve iptal edilen iş sayıları
- Render başarı oranı
- Ortalama ve maksimum render süresi
- Ortalama kuyruk bekleme süresi
- Cache hit sayısı
- Retry sayısı
- Toplam ve ortalama çıktı boyutu
- Render stage bazlı örnek, toplam, ortalama ve maksimum süre
- Terminal işlerden sonra `render:metrics-updated` olayı
- Render Engine üzerinden `metrics()` ve `resetMetrics()` API'leri
- Cache-hit işlerinin sıfır süreli başarılı çalışma olarak ölçülmesi

## Sonuç
Render altyapısı artık yalnızca işi çalıştırmaz; performans darboğazlarının,
cache kazancının ve üretim güvenilirliğinin sayısal olarak izlenmesini sağlar.
