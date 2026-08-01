# Sprint 6.9.21a — Retry API Fix

Render retry akışındaki yanlış `engine.enqueue()` çağrısı, RenderEngine
sözleşmesindeki doğru `engine.submit()` metoduna bağlandı.

Bu düzeltme TS2339 hatasını giderir.
