# Sprint 6.6.0 — Query Layer Foundation

## Amaç
Sunucudan okunan veriler için merkezi, tip güvenli ve servislerden bağımsız bir query/cache katmanı oluşturmak.

## Eklenenler
- In-memory QueryClient
- Query key factory
- Stale-time tabanlı cache
- Aynı anda gelen aynı sorgular için request deduplication
- Force refresh
- Prefix tabanlı invalidation ve cache temizleme
- Mutation sonrası cache senkronizasyonu
- DI Container kaydı
- Channel Store entegrasyonu

## Davranış
- Kanal listesi 30 saniye boyunca taze kabul edilir.
- Aynı sorgu eşzamanlı çağrılırsa tek ağ isteği paylaşılır.
- Create/update/delete işlemleri cache ve Zustand state'ini birlikte günceller.
- Dependency reset sırasında query cache temizlenir.

## Test
```powershell
npm run typecheck
npm run build
```
