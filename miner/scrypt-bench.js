#!/usr/bin/env node
'use strict';

// Controlled Scrypt microbenchmark for Android/Termux.
// This measures the Scrypt primitive only; it is NOT a PEP miner and submits no shares.
const { Worker } = require('node:worker_threads');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const DURATION_MS = Math.max(1000, Math.min(8000, Number(process.env.BENCH_MS) || 3000));
const COOLDOWN_MS = Math.max(2000, Math.min(15000, Number(process.env.COOLDOWN_MS) || 5000));
const LIMIT_C = Math.max(38, Math.min(50, Number(process.env.MAX_TEMP_C) || 42));
const MAX_THREADS = Math.max(1, Math.min(os.cpus().length, Number(process.env.MAX_THREADS) || os.cpus().length));
const HEADER = Buffer.from(Array.from({ length: 80 }, (_, i) => (i * 37 + 11) & 255));

function temperatures() {
  const root = '/sys/class/thermal';
  let names = [];
  try { names = fs.readdirSync(root).filter(n => /^thermal_zone\d+$/.test(n)); } catch {}
  const values = [];
  for (const name of names) {
    try {
      const base = path.join(root, name);
      const raw = Number(fs.readFileSync(path.join(base, 'temp'), 'utf8').trim());
      if (Number.isFinite(raw) && raw > 0) values.push({ zone: name, type: fs.readFileSync(path.join(base, 'type'), 'utf8').trim(), c: raw > 1000 ? raw / 1000 : raw });
    } catch {}
  }
  return values;
}
function maxTemp(zones) {
  return zones.reduce((m, z) => Math.max(m, z.c), -Infinity);
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function runWorker(duration, shared) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const crypto = require('node:crypto');
      const header = Buffer.from(workerData.header, 'hex');
      const flag = new Int32Array(workerData.flag);
      let hashes = 0;
      const start = process.hrtime.bigint();
      const deadline = start + BigInt(workerData.duration) * 1000000n;
      try {
        while (process.hrtime.bigint() < deadline && Atomics.load(flag, 0) === 0) {
          // PEP uses scrypt_1024_1_1_256; this is a primitive benchmark only.
          crypto.scryptSync(header, header, 32, { N: 1024, r: 1, p: 1, maxmem: 32 * 1024 * 1024 });
          hashes++;
        }
        const elapsed = Number(process.hrtime.bigint() - start) / 1e9;
        parentPort.postMessage({ hashes, elapsed, error: null });
      } catch (e) {
        parentPort.postMessage({ hashes, elapsed: 0, error: e.message });
      }
    `, { eval: true, workerData: { header: HEADER.toString('hex'), duration, flag: shared } });
    worker.once('message', result => { worker.terminate(); resolve(result); });
    worker.once('error', reject);
  });
}
async function main() {
  const online = (() => {
    try { return fs.readFileSync('/sys/devices/system/cpu/online', 'utf8').trim(); } catch { return null; }
  })();
  console.log('PEP Scrypt primitive benchmark (not pool mining)');
  console.log(JSON.stringify({ architecture: os.arch(), logical_cpus: os.cpus().length, online_cpus: online, duration_per_test_ms: DURATION_MS, cooldown_ms: COOLDOWN_MS, thermal_stop_c: LIMIT_C }));
  let best = null;
  for (let threads = 1; threads <= MAX_THREADS; threads++) {
    const before = temperatures();
    if (before.length && maxTemp(before) >= LIMIT_C) {
      console.log('STOP: thermal reading reached limit before ' + threads + ' thread test.');
      break;
    }
    const shared = new SharedArrayBuffer(4);
    const jobs = Array.from({ length: threads }, () => runWorker(DURATION_MS, shared));
    const monitor = setInterval(() => {
      const zones = temperatures();
      if (zones.length && maxTemp(zones) >= LIMIT_C) Atomics.store(new Int32Array(shared), 0, 1);
    }, 250);
    let results;
    try { results = await Promise.all(jobs); } finally { clearInterval(monitor); }
    const hashes = results.reduce((sum, x) => sum + x.hashes, 0);
    const elapsed = Math.max(...results.map(x => x.elapsed), 0);
    const errors = results.filter(x => x.error).map(x => x.error);
    const zones = temperatures();
    const rate = elapsed > 0 ? hashes / elapsed : 0;
    const row = { threads, hashes, elapsed_seconds: Number(elapsed.toFixed(2)), scrypt_hashes_per_second: Number(rate.toFixed(2)), max_temperature_c: zones.length ? Number(maxTemp(zones).toFixed(1)) : null, errors };
    console.log(JSON.stringify(row));
    if (!errors.length && (!best || rate > best.rate)) best = { threads, rate };
    if (Atomics.load(new Int32Array(shared), 0) !== 0 || (zones.length && maxTemp(zones) >= LIMIT_C)) {
      console.log('STOP: thermal safety threshold reached. Android thermal protections remain enabled.');
      break;
    }
    if (threads < MAX_THREADS) await sleep(COOLDOWN_MS);
  }
  if (best) console.log('Best measured primitive setting: ' + best.threads + ' threads at ' + best.rate.toFixed(2) + ' hashes/s. This is not pool hashrate or accepted shares.');
  else console.log('No valid benchmark result. Check Node.js crypto support and device temperature readings.');
  if (!temperatures().length) console.log('WARNING: Android exposed no readable thermal zones; use a temperature monitor and stop manually if the device becomes too hot.');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
