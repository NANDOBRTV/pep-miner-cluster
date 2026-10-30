#!/usr/bin/env node
'use strict';

// End-to-end Stratum protocol simulation. Uses only localhost and dummy credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pep-stratum-test-'));
const tempMiner = path.join(temp, 'miner');
const tempConfig = path.join(temp, 'config');
fs.mkdirSync(tempMiner, { recursive: true });
fs.mkdirSync(tempConfig, { recursive: true });
for (const name of ['pep-pow.js', 'scrypt-worker.js', 'stratum-miner.js']) {
  fs.copyFileSync(path.join(__dirname, name), path.join(tempMiner, name));
}

let child = null;
let childOutput = '';
let sawSubmit = false;
let stopRequested = false;
let finished = false;
const server = net.createServer();
const timeout = setTimeout(() => finish(new Error('Simulated miner did not submit a share within 10 seconds.')), 10000);

function sendLine(socket, value) {
  socket.write(JSON.stringify(value) + '\n');
}

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (child && child.exitCode === null) child.kill('SIGTERM');
  server.close();
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  if (error) {
    console.error('Stratum simulation failed:', error.message);
    process.exitCode = 1;
  } else {
    console.log('Stratum simulation passed: subscribe, authorize, job, Scrypt share submit, and accepted response.');
  }
}

server.on('connection', socket => {
  socket.setEncoding('utf8');
  let buffer = '';
  socket.on('data', chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let request;
      try { request = JSON.parse(line); } catch { finish(new Error('Miner sent invalid JSON.')); return; }

      if (request.method === 'mining.subscribe') {
        sendLine(socket, { id: request.id, result: [[], 'a1b2c3d4', 4], error: null });
      } else if (request.method === 'mining.authorize') {
        sendLine(socket, { id: request.id, result: true, error: null });
        sendLine(socket, { id: null, method: 'mining.set_difficulty', params: [0.001] });
        sendLine(socket, {
          id: null,
          method: 'mining.notify',
          params: [
            'simulated-job',
            '11'.repeat(32),
            '0100000001',
            'ffffffff',
            [],
            '20000002',
            '1d00ffff',
            '6ae4b1cb',
            true
          ]
        });
      } else if (request.method === 'mining.submit') {
        sawSubmit = true;
        sendLine(socket, { id: request.id, result: true, error: null });
        if (!stopRequested) {
          stopRequested = true;
          setTimeout(() => { if (child && child.exitCode === null) child.kill('SIGTERM'); }, 150);
        }
      }
    }
  });
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  fs.writeFileSync(path.join(tempConfig, 'config.json'), JSON.stringify({
    pool: {
      url: 'stratum+tcp://127.0.0.1:' + address.port,
      username: 'simulation.worker',
      password: 'd=1'
    },
    mining: { threads: 1, max_runtime_seconds: 30 }
  }));
  child = spawn(process.execPath, [path.join(tempMiner, 'stratum-miner.js')], {
    env: { ...process.env, MINE_THREADS: '1', MINE_SECONDS: '30' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { childOutput += chunk.toString(); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString(); });
  child.on('error', error => finish(error));
  child.on('exit', code => {
    if (finished) return;
    try {
      assert.equal(code, 0, 'miner process should exit cleanly');
      assert.equal(sawSubmit, true, 'miner should submit at least one share');
      assert.match(childOutput, /Share ACCEPTED by Mining-Dutch\./);
      finish(null);
    } catch (error) {
      console.error(childOutput);
      finish(error);
    }
  });
});
