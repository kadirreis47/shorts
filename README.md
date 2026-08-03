# ShortsFlow — Epic 7.1 AI Director Intelligence Suite

ShortsFlow, YouTube Shorts üretim akışlarını React, TypeScript, Electron,
Supabase ve FFmpeg üzerinde birleştiren masaüstü otomasyon stüdyosudur.

## AI Director Engine

Epic 7.1; emotion, clarity, continuity ve gelişmiş hook analizini scene ranking,
heuristic retention risk map ve uygulanabilir Edit Decision Plan ile birleştirir.
Versioned Director Report V2, Zustand store ve lazy-loaded AI Director ekranı
üzerinden görüntülenebilir ve JSON olarak dışa aktarılabilir. Sistem tamamen
deterministiktir; LLM, harici AI servisi veya gerçek ML/retention tahmini kullanmaz.

## Mevcut durum

Sprint 6.9.25 kalite kapıları ve Sprint 7.0.0 sözleşmeleri korunurken Epic 7.1
Director Report V2, report store/monitor, proje analizi aksiyonu ve rapor UI'ını ekler.
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
