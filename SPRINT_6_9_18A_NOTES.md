# Sprint 6.9.18a — Auto-Tuner Refresh Type Fix

`buildRenderTuningReport()` çağrısına yanlışlıkla gönderilen desteklenmeyen
`tuningReport` parametresi kaldırıldı.

Bu düzeltme TS2353 hatasını giderir ve Auto-Tuner yenileme davranışını korur.
