# Sprint 6.9.11a — Recovery Checkpoint Scope Fix

Cache-hit akışına yanlış scope içinde eklenen `job` checkpoint satırı kaldırıldı.
Bu düzeltme yalnızca TypeScript kapsam hatasını giderir; recovery davranışını
değiştirmez.
