#!/usr/bin/env node
'use strict';

// Read-only Stratum inspector. It does not hash work or submit shares.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, '..', 'config', 'config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error('Could not read config/config.json:', err.message);
  process.exit(2);
}

const pool = config.pool || {};
let parsed;
try { parsed = new URL(pool.url); } catch {
  console.error('Invalid pool.url in config/config.json');
  process.exit(2);
}
if (!['stratum+tcp:', 'stratum+ssl:'].includes(parsed.protocol) || !parsed.hostname || !parsed.port) {
  console.error('pool.url must be a Stratum URL with an explicit host and port.');
  process.exit(2);
}
if (typeof pool.username !== 'string' || !pool.username || pool.username.includes('YOUR_')) {
  console.error('Set pool.username to your Mining-Dutch account username.workername.');
  process.exit(2);
}
if (typeof pool.password !== 'string' || !pool.password) {
  console.error('Set pool.password in config/config.json.');
  process.exit(2);
}

const socket = net.createConnection({ host: parsed.hostname, port: Number(parsed.port) });
let buffer = '';
let nextId = 1;
let authorized = false;
let gotJob = false;
let finished = false;
let subscription = null;
let shareDifficulty = null;
const pending = new Map();
const timer = setTimeout(() => finish(gotJob ? 0 : 1,
  gotJob ? 'Inspection complete. No hashes were computed and no shares were submitted.' :
  'Timed out waiting for a mining job. No hashes were computed and no shares were submitted.'), 30000);

function finish(code, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (message) console.log(message);
  socket.end();
  setTimeout(() => socket.destroy(), 250).unref();
  process.exitCode = code;
}
function send(method, params) {
  const id = nextId++;
  pending.set(id, method);
  socket.write(JSON.stringify({ id, method, params }) + '\n');
}
function describeJob(params) {
  if (!Array.isArray(params)) return console.log('mining.notify received with unexpected params shape.');
  const fields = [
    'job_id', 'previous_hash', 'coinbase_prefix', 'coinbase_suffix',
    'merkle_branch', 'version', 'network_bits', 'ntime', 'clean_jobs'
  ];
  const capturePath = path.join(__dirname, '..', 'config', 'job-capture.json');
  const capture = {
    captured_at: new Date().toISOString(),
    pool: parsed.hostname + ':' + parsed.port,
    worker: pool.username,
    extranonce1: subscription && subscription.extranonce1,
    extranonce2_size: subscription && subscription.extranonce2_size,
    share_difficulty: shareDifficulty,
    job: {
      job_id: params[0], previous_hash: params[1], coinbase_prefix: params[2],
      coinbase_suffix: params[3], merkle_branch: params[4], version: params[5],
      network_bits: params[6], ntime: params[7], clean_jobs: params[8]
    }
  };
  try {
    fs.writeFileSync(capturePath, JSON.stringify(capture, null, 2) + '\\n', { mode: 0o600 });
    console.log('Full public job data saved locally to config/job-capture.json (do not publish this file).');
  } catch (err) {
    console.log('Could not save job capture: ' + err.message);
  }
  console.log('Mining job received:');
  fields.forEach((name, i) => {
    const value = params[i];
    if (i === 2 || i === 3) console.log('  ' + name + ': ' + (typeof value === 'string' ? value.length / 2 + ' bytes' : 'missing'));
    else if (i === 4) console.log('  ' + name + ': ' + (Array.isArray(value) ? value.length + ' branches' : 'missing'));
    else console.log('  ' + name + ': ' + (value === undefined ? 'missing' : JSON.stringify(value)));
  });
}
socket.setEncoding('utf8');
socket.on('connect', () => {
  console.log('Connected to ' + parsed.hostname + ':' + parsed.port);
  send('mining.subscribe', ['PEP-Miner-Cluster/0.2']);
});
socket.on('data', chunk => {
  buffer += chunk;
  let cut;
  while ((cut = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, cut).trim();
    buffer = buffer.slice(cut + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { console.log('Ignored non-JSON Stratum line.'); continue; }

    if (msg.method === 'mining.set_difficulty') {
      shareDifficulty = msg.params && msg.params[0];
      console.log('Pool share difficulty: ' + JSON.stringify(msg.params));
      continue;
    }
    if (msg.method === 'mining.set_extranonce') {
      console.log('Pool changed extranonce: ' + JSON.stringify(msg.params));
      continue;
    }
    if (msg.method === 'mining.notify') {
      gotJob = true;
      describeJob(msg.params);
      if (authorized) finish(0, 'Stratum job inspection passed. No hashes were computed and no shares were submitted.');
      continue;
    }
    if (msg.method) {
      console.log('Pool notification: ' + msg.method);
      continue;
    }

    const method = pending.get(msg.id);
    if (!method) continue;
    pending.delete(msg.id);
    if (msg.error) {
      finish(1, method + ' failed: ' + JSON.stringify(msg.error));
      return;
    }
    if (method === 'mining.subscribe') {
      const result = msg.result;
      if (Array.isArray(result) && result.length >= 3) {
        subscription = { extranonce1: result[1], extranonce2_size: result[2] };
        console.log('Subscribe accepted; extranonce1=' + result[1] + '; extranonce2_size=' + result[2]);
      } else {
        console.log('Subscribe response received: ' + JSON.stringify(result));
      }
      send('mining.authorize', [pool.username, pool.password]);
    } else if (method === 'mining.authorize') {
      authorized = msg.result === true;
      if (!authorized) {
        finish(1, 'Stratum authorization rejected. Check worker credentials.');
        return;
      }
      console.log('Stratum authorization accepted; waiting for difficulty and mining job...');
      if (gotJob) finish(0, 'Stratum job inspection passed. No hashes were computed and no shares were submitted.');
    }
  }
});
socket.on('error', err => finish(1, 'Pool connection error: ' + err.message));
socket.on('close', () => {
  if (!finished) finish(1, 'Connection closed before job inspection completed.');
});
