const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadLocalYouTubeOAuthConfig } = require('./electron-local-config.cjs');

const HOST = '127.0.0.1';
const START_PORT = 5173;
const MAX_PORT_ATTEMPTS = 20;
const READY_TIMEOUT_MS = 30_000;

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: HOST, port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort() {
  for (let port = START_PORT; port < START_PORT + MAX_PORT_ATTEMPTS; port += 1) {
    if (await canListen(port)) return port;
  }

  throw new Error(
    `No free development port found between ${START_PORT} and ${START_PORT + MAX_PORT_ATTEMPTS - 1}.`,
  );
}

function waitForServer(port) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = net.createConnection({ host: HOST, port });
      socket.setTimeout(1_000);

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });

      const retry = () => {
        socket.destroy();
        if (Date.now() - startedAt >= READY_TIMEOUT_MS) {
          reject(
            new Error(
              `Vite did not become ready on port ${port} within ${READY_TIMEOUT_MS / 1000}s.`,
            ),
          );
          return;
        }
        setTimeout(check, 250);
      };

      socket.once('error', retry);
      socket.once('timeout', retry);
    };

    check();
  });
}

function spawnChild(executable, args, options = {}) {
  const child = spawn(executable, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: false,
    ...options,
  });

  child.once('error', (error) => {
    console.error(`[ShortsFlow] Could not start ${path.basename(executable)}:`, error);
  });

  return child;
}

function stopProcess(child) {
  if (!child || child.killed || child.exitCode !== null) return;

  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.unref();
    return;
  }

  child.kill('SIGTERM');
}

async function main() {
  const youtubeOAuth = loadLocalYouTubeOAuthConfig();
  const port = await findAvailablePort();
  const devServerUrl = `http://${HOST}:${port}`;
  const viteEntry = require.resolve('vite');
  let vitePackageRoot = path.dirname(viteEntry);

  while (true) {
    const packageJsonPath = path.join(vitePackageRoot, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.name === 'vite') break;
      } catch {
        // Keep walking upward until the Vite package root is found.
      }
    }

    const parent = path.dirname(vitePackageRoot);
    if (parent === vitePackageRoot) {
      throw new Error(`Could not locate the Vite package root from ${viteEntry}.`);
    }
    vitePackageRoot = parent;
  }

  const viteCli = path.join(vitePackageRoot, 'bin', 'vite.js');
  if (!fs.existsSync(viteCli)) {
    throw new Error(`Vite CLI was not found at ${viteCli}.`);
  }

  const electronExecutable = require('electron');

  console.log(`[ShortsFlow] Starting Vite at ${devServerUrl}`);

  // Launch Vite through Node directly. This avoids Windows .cmd spawn EINVAL errors.
  const vite = spawnChild(
    process.execPath,
    [viteCli, '--host', HOST, '--port', String(port), '--strictPort'],
    { env: { ...process.env } },
  );

  let electron;
  let shuttingDown = false;

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopProcess(electron);
    stopProcess(vite);
    setTimeout(() => process.exit(exitCode), 150);
  };

  process.once('SIGINT', () => shutdown(0));
  process.once('SIGTERM', () => shutdown(0));

  vite.once('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[ShortsFlow] Vite exited unexpectedly with code ${code ?? 1}.`);
      shutdown(code ?? 1);
    }
  });

  try {
    await waitForServer(port);
  } catch (error) {
    console.error('[ShortsFlow] Failed to start development server:', error);
    shutdown(1);
    return;
  }

  console.log('[ShortsFlow] Vite is ready. Starting Electron...');

  electron = spawnChild(electronExecutable, ['electron/main.cjs'], {
    env: {
      ...process.env,
      ELECTRON_IS_DEV: '1',
      SHORTSFLOW_DEV_SERVER_URL: devServerUrl,
      ...(youtubeOAuth.clientId ? { SHORTSFLOW_YOUTUBE_CLIENT_ID: youtubeOAuth.clientId } : {}),
      ...(youtubeOAuth.clientSecret ? { SHORTSFLOW_YOUTUBE_CLIENT_SECRET: youtubeOAuth.clientSecret } : {}),
    },
  });

  electron.once('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 0);
  });
}

main().catch((error) => {
  console.error('[ShortsFlow] Development launcher failed:', error);
  process.exit(1);
});
