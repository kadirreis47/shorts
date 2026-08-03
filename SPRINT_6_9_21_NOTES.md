# Sprint 6.9.21 — Render Queue Inspector & Controls

## Amaç
Render Ops ekranından gerçek render kuyruğunu izlemek, duraklatmak, sürdürmek ve
başarısız işleri yeniden başlatmak.

## Eklenenler
- Render Engine queue pause/resume API'leri
- Queue paused durumunda yeni iş başlatmayı durdurma
- Aktif render işlerini kesmeden güvenli duraklatma
- Başarısız veya iptal edilmiş işi force-render ile yeniden deneme
- Queue paused/resumed Event Bus olayları
- En fazla 100 iş tutan Zustand Queue Inspector store
- Aktif işler önce, terminal işler sonra sıralama
- Render Ops ekranında kuyruk listesi
- İş ilerleme çubukları
- İş ayrıntı paneli
- Seçili işi yeniden deneme
- Terminal iş geçmişini temizleme

## Güvenlik
Kuyruk duraklatıldığında çalışan FFmpeg süreçleri devam eder. Yalnızca yeni iş
başlatılmaz. Resume sonrasında scheduler mevcut concurrency sınırına göre kuyruğu
yeniden işler.
