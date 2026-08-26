# ShortsFlow - Desktop App Setup

## What you need installed on your computer

1. **Node.js** (version 18 or newer) — download from https://nodejs.org and install it. This gives you the `npm` command.

## Steps to build the .exe

1. Copy the entire project folder into a folder called `EXE` on your desktop.

2. Open a terminal (on Windows: press `Win+R`, type `cmd`, press Enter).

3. Navigate to the folder:
   ```
   cd Desktop\EXE
   ```

4. Install dependencies:
   ```
   npm install
   ```

5. Build the .exe installer:
   ```
   npm run electron:build
   ```

6. When it finishes, look inside the `release` folder. You will find an installer file called `ShortsFlow Setup 1.1.0.exe`. Double-click it to install and run the app.

## To run in development mode (without building .exe)

```
npm run electron:dev
```

This opens the app window with developer tools visible.

## Troubleshooting

- If `npm install` fails, make sure Node.js is installed (run `node -v` to check).
- The release build requires the approved release-owner icon at `build/icon.png`; do not substitute Electron's default icon or arbitrary artwork.
- The app needs an internet connection to reach the Supabase database.
