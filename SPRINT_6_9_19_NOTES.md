# Sprint 6.9.19 — Render Capacity Planner

## Amaç
Toplanan render metriklerinden cihazın saatlik ve günlük üretim kapasitesini
hesaplamak; iş hedeflerine uygun concurrency/worker planı önermek.

## Eklenenler
- Ölçülen ortalama render süresinden kapasite modeli
- Ölçüm yoksa video süresine göre konservatif başlangıç tahmini
- Saatlik iş kapasitesi
- Günlük teorik üretim kapasitesi
- Hedef işlerin tahmini tamamlanma süresi
- Hedef pencere kullanım yüzdesi
- Low, medium ve high queue risk sınıflandırması
- 1–4 concurrency senaryo karşılaştırması
- Güvenli önerilen concurrency
- Veri miktarına göre kapasite güven puanı
- Render Ops ekranında interaktif Capacity Planner
- Günlük iş, video süresi, hedef süre ve concurrency girdileri
- Capacity plan persistence ve JSON export entegrasyonu

## Tasarım
Concurrency arttıkça doğrusal olmayan verim kaybı uygulanır. Bu sayede kapasite
tahmini teorik çekirdek sayısını doğrudan çarpmak yerine disk, GPU ve codec
çekişmesini dikkate alan daha konservatif sonuç üretir.
