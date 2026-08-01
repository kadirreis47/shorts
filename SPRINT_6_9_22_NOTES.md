# Sprint 6.9.22 — Queue Inspector Runtime Integration

## Amaç
Sprint 6.9.21'de oluşturulan Queue Inspector store ve monitor katmanını gerçek
uygulama bootstrap yaşam döngüsüne bağlamak.

## Eklenenler
- Queue Inspector monitor bootstrap sırasında otomatik başlatılır
- Event Bus ve Render Engine gerçek instance'larıyla bağlantı
- Uygulama yeniden bootstrap edilirse eski listener'ları güvenli kaldırma
- Mevcut render işlerini açılışta store'a hydrate etme
- Queue pause durumunu açılışta Render Engine'den alma
- `render:queue-paused` ve `render:queue-resumed` olaylarıyla reaktif UI
- Dashboard pause/resume düğmesinin anlık durum güncellemesi
- Duplicate event listener ve memory leak koruması

## Sonuç
Queue Inspector artık yalnızca hazırlanmış bir UI/store değildir; gerçek render
işlerini otomatik izleyen ve kuyruğun canlı durumunu yansıtan tam entegre bir
operasyon aracıdır.
