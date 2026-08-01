# Sprint 6.9.23a — DI Token Path Fix

## Düzeltmeler
- Projenin gerçek DI token dosyası olan `src/core/di/tokens.ts` güncellendi.
- `RenderRecoveryStore` için type-safe `renderRecoveryStore` tokenı eklendi.
- Yanlış oluşturulan `src/core/di/dependencyTokens.ts` dosyasını kaldıran
  PowerShell uygulama betiği eklendi.

## Giderilen hatalar
- `renderRecoveryStore does not exist`
- `unknown is not assignable to RenderRecoveryStore`
- `Cannot find module './dependencyToken'`
