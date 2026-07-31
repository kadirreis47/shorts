# Sprint 6.8.2a — Asset Candidate Type Fix

## Düzeltme
`rankAssetCandidates()` fonksiyonu `RankedAssetCandidate[]` döndürmesine rağmen seçilen aday `AssetCandidate` olarak tutuluyordu. Bu yüzden `selected.score` alanı TypeScript tarafından görünmüyordu.

Seçilen adayın tipi `RankedAssetCandidate | null` olarak düzeltildi ve ilgili type import edildi.

## Etki
- Runtime davranışı değişmez.
- Asset sıralaması ve seçim algoritması değişmez.
- Yalnızca TypeScript tip güvenliği düzeltilir.
