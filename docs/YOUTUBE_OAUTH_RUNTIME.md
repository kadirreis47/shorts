# YouTube desktop OAuth runtime configuration

Windows release builds require the matching Google Desktop OAuth credential pair:

- `SHORTSFLOW_YOUTUBE_CLIENT_ID`
- `SHORTSFLOW_YOUTUBE_CLIENT_SECRET`

`npm run prepare:electron-runtime` reads these values from the process environment
or the ignored local `.env` file and writes the main-process runtime resource under
`.shortsflow-build`. Neither value is exposed through the preload bridge or IPC.
Never commit a generated runtime file or a real credential value.

Google treats installed applications as unable to keep client credentials
confidential. The Desktop client secret packaged with a distributed native app can
be extracted and must not be treated as a strong secret. PKCE, state validation,
and the dynamic loopback redirect remain the controls protecting each authorization
code exchange. Restrict and monitor the associated Google Cloud project accordingly.

For PowerShell release builds, set both values in the current process before running
the release validation and package build:

```powershell
$env:SHORTSFLOW_YOUTUBE_CLIENT_ID='<desktop-client-id>'
$env:SHORTSFLOW_YOUTUBE_CLIENT_SECRET='<matching-desktop-client-secret>'
npm.cmd run validate:release:v1
npm.cmd run electron:build # internal unsigned RC / smoke build
```

For a public Windows release, use `npm.cmd run electron:release` after setting
the Windows signing variables described in
[Windows code-signing release contract](./WINDOWS_CODE_SIGNING.md). The public
command retains this YouTube runtime validation and additionally requires a
valid Authenticode signature.
