#!/usr/bin/env node
'use strict';

// Diagnostic only: checks TCP + Stratum subscribe/authorize.
// It does NOT calculate hashes or submit shares.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, '..', 'config', 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('Missing config/config.json. Copy config/config.example.json to config/config.json and fill in your Mining-Dutch username.');
  process.exit(2);
}

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
if (!['stratum:', 'stratums:'].includes(parsed.protocol) || !parsed.hostname || !parsed.port) {
  console.error('pool.url must be a Stratum URL with an explicit host and port.');
  process.exit(2);
}
if (typeof pool.username !== 'string' || !pool.username || pool.username.includes('YOUR_')) {
  console.error('Set pool.username to your Mining-Dutch account username.workername in config/config.json.');
  process.exit(2);
}
if (typeof pool.password !== 'string' || !pool.password) {
  console.error('Set pool.password in config/config.json (Mining-Dutch default shown on its PEP page is x).');
  process.exit(2);
}

const socket = net.createConnection({ host: parsed.hostname, port: Number(parsed.port) });
let buffer = '';
let authorized = false;
let finished = false;
let nextId = 1;
const pending = new Map();
const timer = setTimeout(() => finish(1, 'Timed out waiting for Stratum response.'), 15000);

function finish(code, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (message) console.log(message);
  socket.destroy();
  process.exitCode = code;
}
function send(method, params) {
  const id = nextId++;
  pending.set(id, method);
  socket.write(JSON.stringify({ id, method, params }) + '\n');
  return id;
}

socket.setEncoding('utf8');
socket.on('connect', () => {
  console.log('TCP connected to ' + parsed.hostname + ':' + parsed.port);
  send('mining.subscribe', ['PEP-Miner-Cluster/0.1']);
});
socket.on('data', chunk => {
  buffer += chunk;
  let cut;
  while ((cut = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, cut).trim();
    buffer = buffer.slice(cut + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch {
      console.log('Received a non-JSON Stratum line; ignoring.');
      continue;
    }
    if (msg.method) {
      if (msg.method === 'mining.set_difficulty') console.log('Pool difficulty notification received.');
      else if (msg.method === 'mining.notify') console.log('Mining job notification received (job details hidden).');
      else console.log('Pool notification: ' + msg.method);
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
      console.log('Stratum subscribe response received.');
      send('mining.authorize', [pool.username, pool.password]);
    } else if (method === 'mining.authorize') {
      authorized = msg.result === true;
      if (authorized) finish(0, 'Stratum authorization accepted. Diagnostic passed; no hashes were computed and no shares were submitted.');
      else finish(1, 'Stratum authorization was rejected. Check the Mining-Dutch username, worker name, and password.');
      return;
    }
  }
});
socket.on('error', err => finish(1, 'Pool connection error: ' + err.message));
socket.on('close', () => {
  if (!finished) finish(1, authorized ? 'Connection closed.' : 'Connection closed before authorization completed.');
});
