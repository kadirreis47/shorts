# FFmpeg runtime distribution

Windows release builds stage a reviewed FFmpeg distribution before packaging. Set
`SHORTSFLOW_FFMPEG_BUNDLE_DIR` to a directory containing non-empty `ffmpeg.exe`
and `ffprobe.exe`; `npm run electron:build` then includes them under the
application resources directory as `ffmpeg/ffmpeg.exe` and `ffmpeg/ffprobe.exe`.

The release operator is responsible for obtaining a suitable distribution and
including its applicable license and notice files in that source directory. The
staging script copies common license/notice filenames when present. No binary is
downloaded at application runtime.

Development retains the existing environment/PATH resolution. Packaged builds
resolve only the trusted application resource paths and never fall back to PATH.
