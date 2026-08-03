# ShortsFlow — Sprint 6.9.25 Quality Gates

ShortsFlow, YouTube Shorts üretim akışlarını React, TypeScript, Electron,
Supabase ve FFmpeg üzerinde birleştiren masaüstü otomasyon stüdyosudur.

## Mevcut durum

Sprint 6.9.25 ile DI Container, Typed Event Bus, render resilience,
capacity/auto-tuning, Render Engine, recovery persistence ve Electron FFmpeg
IPC sınırı otomatik test kapsamına alınmıştır. Sprint 7 AI Director çalışmaları
öncesindeki kalite kapıları GitHub Actions üzerinde çalışır.

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
