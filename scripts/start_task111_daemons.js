/**
 * Task 111 — Start Next.js and reframe-worker as background daemons.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const rootDir = path.resolve(__dirname, '..');

function isPortOpen(port, host = '127.0.0.1', timeout = 1000) {
  return new Promise((resolve) => {
    const s = net.createConnection(port, host);
    s.setTimeout(timeout);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => { resolve(false); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

async function main() {
  console.log('=== Starting Task 111 Daemons ===');

  // 1. Next.js
  const nextOpen = await isPortOpen(3000);
  if (nextOpen) {
    console.log('Next.js is already listening on port 3000.');
  } else {
    console.log('Spawning Next.js dev server...');
    const nextLog = fs.openSync(path.join(rootDir, 'nextjs.log'), 'a');
    const nextProc = spawn(process.execPath, [
      path.join(rootDir, 'node_modules/next/dist/bin/next'),
      'dev',
      '--port',
      '3000',
    ], {
      cwd: rootDir,
      detached: true,
      stdio: ['ignore', nextLog, nextLog],
    });
    nextProc.unref();
    fs.writeFileSync(path.join(rootDir, 'nextjs.pid'), String(nextProc.pid));
    console.log(`Spawned Next.js (PID: ${nextProc.pid}). Waiting for port 3000...`);

    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await isPortOpen(3000)) {
        ready = true;
        console.log(`Next.js is ready on port 3000 after ${i + 1}s!`);
        break;
      }
    }
    if (!ready) {
      console.error('ERROR: Next.js did not start on port 3000 within 40s.');
      process.exit(1);
    }
  }

  // 2. Reframe Worker
  console.log('Spawning Reframe Worker...');
  const workerLog = fs.openSync(path.join(rootDir, 'worker.log'), 'a');
  const workerProc = spawn(process.execPath, [
    path.join(rootDir, 'node_modules/tsx/dist/cli.mjs'),
    'reframe-worker/index.ts',
  ], {
    cwd: rootDir,
    detached: true,
    stdio: ['ignore', workerLog, workerLog],
  });
  workerProc.unref();
  fs.writeFileSync(path.join(rootDir, 'worker.pid'), String(workerProc.pid));
  console.log(`Spawned Worker (PID: ${workerProc.pid}). Waiting for worker initialization...`);

  await new Promise(r => setTimeout(r, 4000));
  console.log('=== Service Start Completed ===');
}

main().catch(err => {
  console.error('Failed to start daemons:', err);
  process.exit(1);
});
