# ShortsFlow — Sprint 6.9.25 Quality Gates

ShortsFlow, YouTube Shorts üretim akışlarını React, TypeScript, Electron,
Supabase ve FFmpeg üzerinde birleştiren masaüstü otomasyon stüdyosudur.

## AI Director Engine

Sprint 7.0.0, render manifest ve media timeline verilerini deterministic
heuristic analyzer'larla değerlendiren type-safe AI Director foundation'ını
ekler. Hook, tempo, görsel potansiyel, hareket ve retention risk skorları
üretir; bu sürüm LLM, harici AI servisi veya gerçek ML tahmini kullanmaz.

## Mevcut durum

Sprint 6.9.25 kalite kapıları korunurken Sprint 7.0.0 AI Director domain,
analyzer engine, application service, Event Bus ve DI entegrasyonunu ekler.
GitHub Actions typecheck, lint, test, build ve FFmpeg smoke kontrollerini çalıştırır.

## Geliştirme

```powershell
npm install
npm run dev
```

Electron geliştirme ortamı için:

```powershell
npm run electron:dev
```

## Kalite kapıları

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm run test:smoke` FFmpeg ve FFprobe sistemde bulunuyorsa kısa sentetik bir
video üretip doğrular; araçlar yoksa test otomatik olarak skip edilir.

Testler `tests/` altında, üretim kaynaklarıyla aynı strict TypeScript ve `@/`
path alias sözleşmesiyle çalışır. Recovery testleri jsdom/localStorage,
çekirdek ve Electron sınır testleri Node ortamını kullanır.

Masaüstü paketleme ayrıntıları için `README-desktop.md`, sprint kapsamı için
`SPRINT_6_9_25_NOTES.md` dosyasına bakın.
