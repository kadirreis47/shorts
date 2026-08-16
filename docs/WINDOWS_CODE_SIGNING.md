# Windows code-signing release contract

Internal RC and smoke builds remain intentionally unsigned and use the existing
release-runtime validation:

```powershell
npm.cmd run electron:build
```

An official public Windows release must use the fail-closed signed workflow:

```powershell
$env:WIN_CSC_LINK = '<certificate reference>'
$env:WIN_CSC_KEY_PASSWORD = '<certificate password>'
npm.cmd run electron:release
```

`CSC_LINK` and `CSC_KEY_PASSWORD` are accepted as the standard electron-builder
fallback. The public command validates that a complete credential pair is present,
forces electron-builder to require code signing, and verifies both the unpacked
application executable and NSIS installer with Windows Authenticode verification.
It never prints certificate material or passwords.

The public command also retains the existing production YouTube runtime and
bundled FFmpeg validation. Do not commit certificate files, generated runtime
configuration, or signing environment values.
