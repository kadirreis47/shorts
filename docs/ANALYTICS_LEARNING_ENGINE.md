# Analytics, Performance Intelligence & Learning Engine

## Architecture

Analytics flows from a verified `PublishReceipt` into an immutable `PublishedContentBinding`. A platform adapter returns raw metric entries; normalization turns them into canonical metrics with provenance, availability, units, observation windows and source timestamps. The UI and learning engine never consume raw platform payloads.

Production adapters are deliberately honest: YouTube is `authentication-required`; TikTok and Instagram are `planned-only`; X is `unsupported`. They never fabricate views, retention, or historical points. The deterministic adapter is test/dev only and is never registered for production.

## Semantics, persistence and safety

`0` is an observed numeric value. `unavailable`, `unsupported`, `not-ready`, and `permission-missing` carry a null value and stay distinct through persistence, scoring, reports and UI. Snapshots append through deterministic observation identity, dedupe by the newest fetch, and retain ordering. Superseded async results are ignored. The persisted working set compacts to 60 observations per publication and 500 snapshots globally; malformed records are isolated on hydration.

Only account references are persisted. OAuth tokens, secrets, raw credentials, promises and abort controllers are excluded. JSON reports contain canonical bindings, snapshots, performance, insights, recommendations and policy versions, never credentials.

## Performance and learning

Baselines are account/channel/platform isolated and use the same observation window. They require five comparable samples and use median, p25/p75 and IQR outlier flags. Scores have reach, engagement, retention, conversion/growth and velocity dimensions; missing dimensions reduce confidence rather than inventing a score.

Learning profiles are per platform/account/channel. Cold-start profiles do not yield personalized recommendations. Signals require comparable cohorts and are worded `associated-with`, `correlated-with`, or `outperformed-in-observed-sample`; no API or UI makes a causal claim. Recommendations carry sample size, evidence, limitations and a `planned-only` auto-apply state. Attribution is read-only and can capture creative and publishing choices.

## Limitation

No official analytics OAuth integration is included in this repository. The studio accurately displays capability and empty states until an authenticated official adapter is added. Variant comparison preparation exists, but traffic allocation and platform manipulation do not.
