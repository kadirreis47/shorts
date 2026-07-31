# Sprint 6.7.2a — Persistence Generic Fix

## Düzeltme
Zustand `persist` middleware içindeki `storage` generic tipleri, tam store state'i yerine `partialize` tarafından gerçekten kalıcılaştırılan state şekilleriyle eşleştirildi.

## Etkilenen store'lar
- AI Store
- Channel Store
- Project Store
- Settings Store
- UI Store

## Teknik sonuç
- `PersistStorage<FullState>` / `PersistStorage<PartialState>` uyumsuzluğu kaldırıldı.
- Store action'ları ve geçici runtime alanları kalıcı storage tipine dahil edilmiyor.
- IndexedDB persistence davranışı değişmiyor.
- Runtime iş mantığı ve AI pipeline resilience koduna dokunulmuyor.

## Test
```powershell
npm run typecheck
npm run build
```
