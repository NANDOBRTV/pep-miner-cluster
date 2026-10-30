#!/usr/bin/env node
'use strict';

// Mining-Dutch SOLO Stratum V1 PEP miner.
// Initial implementation: Node/OpenSSL Scrypt, bounded session, no fallback pool.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Worker } = require('node:worker_threads');
const {
  prepareStratumJob,
  compactToTarget,
  difficultyToScryptTarget,
  nonceToStratumHex
} = require('./pep-pow');

const configPath = path.join(__dirname, '..', 'config', 'config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('Cannot read config/config.json:', error.message);
  process.exit(2);
}

const pool = config.pool || {};
const mining = config.mining || {};
const dashboard = config.dashboard || {};
const dashboardUrl = dashboard.url || 'http://127.0.0.1:8787';
const workerId = String(dashboard.worker_id || mining.worker_id || pool.username || 'android-main').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'android-main';
const deviceName = String(dashboard.device || mining.device || 'Android ARM64').slice(0, 80);
let dashboardToken = process.env.PEP_CLUSTER_TOKEN || '';
if (!dashboardToken) {
  try {
    dashboardToken = fs.readFileSync(path.join(os.homedir(), '.config', 'pep-miner-cluster', 'token'), 'utf8').trim();
  } catch {}
}
let telemetryWarningShown = false;
const interactivePanel = Boolean(process.stdout.isTTY && process.env.TERM !== 'dumb');
let connectionState = 'starting';
let panelMessage = 'Inicializando minerador...';
let lastHashSample = 0;
let lastHashSampleAt = Date.now();
let liveHashrate = 0;
let lastEvents = [];
function note(message, isError = false) {
  const line = String(message);
  panelMessage = line;
  lastEvents.push(line);
  if (lastEvents.length > 3) lastEvents.shift();
  if (!interactivePanel) {
    (isError ? console.error : console.log)(line);
  }
}
function renderPanel() {
  if (!interactivePanel) return;
  const now = Date.now();
  const elapsedSample = Math.max(0.25, (now - lastHashSampleAt) / 1000);
  liveHashrate = Math.max(0, (totalHashes - lastHashSample) / elapsedSample);
  lastHashSample = totalHashes;
  lastHashSampleAt = now;
  const elapsed = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
  const fmt = value => {
    if (value >= 1e9) return (value / 1e9).toFixed(2) + ' GH/s';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + ' MH/s';
    if (value >= 1e3) return (value / 1e3).toFixed(2) + ' kH/s';
    return value.toFixed(2) + ' H/s';
  };
  const duration = Math.floor(elapsed);
  const clock = String(Math.floor(duration / 3600)).padStart(2,'0') + ':' +
    String(Math.floor(duration % 3600 / 60)).padStart(2,'0') + ':' +
    String(duration % 60).padStart(2,'0');
  const stateColor = connectionState === 'mining' ? '\x1b[32m' :
    connectionState === 'connected' ? '\x1b[36m' :
    connectionState === 'reconnecting' ? '\x1b[33m' : '\x1b[31m';
  const stateLabel = ({ starting: 'INICIANDO', connected: 'CONECTADO', mining: 'MINERANDO', reconnecting: 'RECONECTANDO', stopped: 'PARADO' })[connectionState] || connectionState.toUpperCase();
  const reset = '\x1b[0m';
  const width = Math.max(42, Math.min(64, (process.stdout.columns || 64) - 2));
  const line = '═'.repeat(width);
  const row = text => '║ ' + text.padEnd(width - 2).slice(0, width - 2) + ' ║';
  const rows = [
    '\x1b[2J\x1b[H',
    '╔' + line + '╗',
    row('PEP MINER CLUSTER  •  MINING-DUTCH SOLO'),
    '╠' + line + '╣',
    row('CONEXÃO   ' + stateColor + stateLabel + reset),
    row('POOL      ' + parsed.hostname + ':' + parsed.port),
    row('WORKER    ' + workerId),
    '╠' + line + '╣',
    row('HASHRATE  ' + fmt(liveHashrate)),
    row('HASHES    ' + totalHashes.toLocaleString('pt-BR')),
    row('THREADS   ' + threads + ' / ' + detectedCpus),
    row('TEMPO     ' + clock + ' / ' + maxRuntimeSeconds + 's'),
    '╠' + line + '╣',
    row('SHARES ENVIADAS  ' + submittedShares),
    row('SHARES ACEITAS   ' + acceptedShares),
    row('SHARES REJEITADAS ' + rejectedShares),
    '╠' + line + '╣',
    row('STATUS: ' + panelMessage),
    ...lastEvents.slice(-2).map(item => row('> ' + item)),
    '╚' + line + '╝',
    'Ctrl+C para parar com segurança.'
  ];
  process.stdout.write(rows.join('\n') + '\n');
}
let parsed;
try { parsed = new URL(pool.url); } catch {
  console.error('Invalid pool.url in config/config.json');
  process.exit(2);
}
if (parsed.protocol !== 'stratum+tcp:' || !parsed.hostname || !parsed.port) {
  console.error('This initial miner supports the tested stratum+tcp endpoint only.');
  process.exit(2);
}
if (typeof pool.username !== 'string' || !pool.username || pool.username.includes('YOUR_') ||
    typeof pool.password !== 'string' || !pool.password) {
  console.error('Set pool.username and pool.password in config/config.json.');
  process.exit(2);
}

const detectedCpus = (() => {
  try {
    const text = fs.readFileSync('/sys/devices/system/cpu/online', 'utf8').trim();
    return text.split(',').reduce((sum, range) => {
      const p = range.split('-').map(Number);
      return sum + (p.length === 2 ? p[1] - p[0] + 1 : 1);
    }, 0);
  } catch { return os.cpus().length || 1; }
})();
const threads = Math.max(1, Math.min(8, Number(process.env.MINE_THREADS) || Number(mining.threads) || detectedCpus || 1));
const maxRuntimeSeconds = Math.max(30, Math.min(600, Number(process.env.MINE_SECONDS) || Number(mining.max_runtime_seconds) || 120));
const THERMAL_STOP_C = 42;

let socket;
let inputBuffer = '';
let nextId = 1;
let authorized = false;
let subscription = null;
let currentJobParams = null;
let nextDifficulty = 65536;
let activeJobId = null;
let activeWorkers = [];
let nonceCounter = null;
let stopFlag = null;
let extranonceCounter = 0n;
let totalHashes = 0;
let acceptedShares = 0;
let rejectedShares = 0;
let submittedShares = 0;
let startedAt = 0;
let finished = false;
let reconnectDelayMs = 1000;
let reconnectTimer = null;
const pending = new Map();
const thermalTimer = setInterval(checkThermal, 2000);
const runtimeTimer = setTimeout(() => shutdown('Configured mining session limit reached.'), maxRuntimeSeconds * 1000);

function send(method, params) {
  if (!socket || socket.destroyed) return null;
  const id = nextId++;
  pending.set(id, method);
  socket.write(JSON.stringify({ id, method, params }) + '\n');
  return id;
}

function makeExtranonce2(size, counter) {
  const value = Buffer.alloc(size);
  let n = counter;
  for (let i = size - 1; i >= 0; i--) {
    value[i] = Number(n & 255n);
    n >>= 8n;
  }
  if (n > 0n) throw new RangeError('extranonce2 counter exhausted; reconnect to obtain a new session.');
  return value.toString('hex');
}

function stopWorkers() {
  // Ask workers to finish their current Scrypt call and flush their final hash count.
  if (stopFlag) Atomics.store(new Int32Array(stopFlag), 0, 1);
  activeWorkers = [];
}

function startWorkers(job) {
  stopWorkers();
  const shareTarget = difficultyToScryptTarget(nextDifficulty);
  const networkTarget = compactToTarget(job.nbits);
  const targetHex = shareTarget.toString(16).padStart(64, '0');
  nonceCounter = new SharedArrayBuffer(8);
  stopFlag = new SharedArrayBuffer(4);
  activeJobId = job.jobId;
  totalHashes = totalHashes || 0;

  connectionState = 'mining';
  note('Novo trabalho recebido: ' + job.jobId + ' | dificuldade ' + nextDifficulty);

  for (let i = 0; i < threads; i++) {
    const worker = new Worker(path.join(__dirname, 'scrypt-worker.js'), {
      workerData: {
        headerPrefix: job.headerPrefix.toString('hex'),
        targetHex,
        networkTargetHex: networkTarget.toString(16).padStart(64, '0'),
        nonceCounter,
        stopFlag,
        jobId: job.jobId,
        extranonce2: job.extranonce2,
        ntime: job.ntime
      }
    });
    worker.on('message', message => {
      if (message.type === 'hashes') totalHashes += message.count;
      else if (message.type === 'share') {
        if (message.jobId !== activeJobId || finished) return;
        const nonceHex = nonceToStratumHex(message.nonce);
        const requestId = send('mining.submit', [pool.username, message.jobId, message.extranonce2, message.ntime, nonceHex]);
        if (requestId === null) return;
        submittedShares++;
        note('Share enviada: ' + message.hash + ' | nonce ' + nonceHex + (message.blockCandidate ? ' | POSSÍVEL BLOCO' : ''));
      } else if (message.type === 'error') {
        note('ERRO no worker: ' + message.message, true);
        shutdown('Hash worker failed.');
      }
    });
    worker.on('error', error => {
      note('ERRO na thread: ' + error.message, true);
      shutdown('Worker thread failed.');
    });
    activeWorkers.push(worker);
  }
}

function activateJob(params) {
  if (!authorized || !subscription) {
    currentJobParams = params;
    return;
  }
  currentJobParams = params;
  try {
    extranonceCounter++;
    const extranonce2 = makeExtranonce2(subscription.extranonce2_size, extranonceCounter);
    const job = prepareStratumJob(params, subscription.extranonce1, extranonce2);
    startWorkers(job);
  } catch (error) {
    note('ERRO ao preparar trabalho: ' + error.message, true);
    shutdown('Invalid mining job.');
  }
}

function readMaxTemperature() {
  const root = '/sys/class/thermal';
  let zones = [];
  try { zones = fs.readdirSync(root).filter(name => /^thermal_zone\d+$/.test(name)); } catch {}
  let max = -Infinity;
  let readable = false;
  for (const name of zones) {
    try {
      const raw = Number(fs.readFileSync(path.join(root, name, 'temp'), 'utf8').trim());
      if (Number.isFinite(raw) && raw > 0) {
        readable = true;
        max = Math.max(max, raw > 1000 ? raw / 1000 : raw);
      }
    } catch {}
  }
  return readable ? max : null;
}

function checkThermal() {
  const max = readMaxTemperature();
  if (max !== null && max >= THERMAL_STOP_C) {
    shutdown('Thermal safety stop at ' + max.toFixed(1) + ' °C.');
  }
}

async function sendTelemetry(statusOverride) {
  if (!dashboardToken) return;
  try {
    const elapsed = startedAt ? Math.max(1, (Date.now() - startedAt) / 1000) : 1;
    const body = {
      workerId,
      device: deviceName,
      status: statusOverride || (activeJobId ? 'mining' : authorized ? 'connected' : 'connecting'),
      hashrateH: Number((totalHashes / elapsed).toFixed(2)),
      accepted: acceptedShares,
      rejected: rejectedShares
    };
    const response = await fetch(new URL('/api/workers', dashboardUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Cluster-Token': dashboardToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok && !telemetryWarningShown) {
      telemetryWarningShown = true;
      note('Telemetria do painel indisponível: HTTP ' + response.status, true);
    }
  } catch (error) {
    if (!telemetryWarningShown) {
      telemetryWarningShown = true;
      note('Telemetria do painel indisponível: ' + error.message, true);
    }
  }
}

function reportStats() {
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const rate = elapsed > 0 ? totalHashes / elapsed : 0;
  if (interactivePanel) return;
  console.log('Stats:', JSON.stringify({
    elapsed_seconds: Number(elapsed.toFixed(1)),
    hashes: totalHashes,
    hashrate_hs: Number(rate.toFixed(2)),
    submitted_shares: submittedShares,
    accepted_shares: acceptedShares,
    rejected_shares: rejectedShares
  }));
}

function shutdown(reason) {
  if (finished) return;
  finished = true;
  clearInterval(thermalTimer);
  clearTimeout(runtimeTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  clearInterval(telemetryTimer);
  stopWorkers();
  connectionState = 'stopped';
  note(reason);
  if (interactivePanel) renderPanel();
  // Allow workers to leave their current Scrypt call and report final counters.
  setTimeout(async () => {
    reportStats();
    await sendTelemetry('stopped');
    if (interactivePanel) renderPanel();
    if (socket && !socket.destroyed) socket.end();
    process.exit(0);
  }, 500);
}

function handleMessage(message) {
  if (message.method === 'mining.ping' && message.id !== undefined && message.id !== null) {
    if (socket && !socket.destroyed) socket.write(JSON.stringify({ id: message.id, result: 'pong', error: null }) + '\n');
    return;
  }
  if (message.method === 'mining.set_difficulty') {
    const value = message.params && message.params[0];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      nextDifficulty = value;
      note('Dificuldade de share atualizada: ' + value);
    }
    return;
  }
  if (message.method === 'mining.set_extranonce') {
    if (Array.isArray(message.params) && message.params.length >= 2) {
      subscription = {
        extranonce1: message.params[0],
        extranonce2_size: message.params[1]
      };
      if (currentJobParams && authorized) activateJob(currentJobParams);
    }
    return;
  }
  if (message.method === 'mining.notify') {
    activateJob(message.params);
    return;
  }
  if (message.method === 'client.show_message') {
    note('Mensagem da pool: ' + (message.params && message.params[0]));
    return;
  }
  if (message.method) {
    note('Notificação da pool: ' + message.method);
    return;
  }

  const method = pending.get(message.id);
  if (!method) return;
  pending.delete(message.id);
  if (method === 'mining.submit') {
    if (message.result === true && !message.error) {
      acceptedShares++;
      note('Share aceita pela Mining-Dutch.');
    } else {
      rejectedShares++;
      note('Share rejeitada: ' + JSON.stringify(message.error || message.result), true);
    }
    return;
  }
  if (message.error) {
    console.error(method + ' failed:', JSON.stringify(message.error));
    shutdown('Stratum request failed.');
    return;
  }
  if (method === 'mining.subscribe') {
    const result = message.result;
    if (!Array.isArray(result) || result.length < 3 || typeof result[1] !== 'string' ||
        !Number.isInteger(result[2]) || result[2] < 1 || result[2] > 16) {
      shutdown('Pool returned an invalid subscription response.');
      return;
    }
    subscription = { extranonce1: result[1], extranonce2_size: result[2] };
    send('mining.authorize', [pool.username, pool.password]);
  } else if (method === 'mining.authorize') {
    if (message.result !== true) {
      shutdown('Mining-Dutch authorization rejected the worker.');
      return;
    }
    authorized = true;
    connectionState = 'connected';
    note('Worker autorizado; aguardando trabalho da pool.');
    if (currentJobParams) activateJob(currentJobParams);
  }
}

function onData(chunk) {
  inputBuffer += chunk;
  let index;
  while ((index = inputBuffer.indexOf('\n')) !== -1) {
    const line = inputBuffer.slice(0, index).trim();
    inputBuffer = inputBuffer.slice(index + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch {
      note('Linha JSON inválida recebida da pool.', true);
      continue;
    }
    handleMessage(message);
  }
}

if (!interactivePanel) {
  console.log('PEP Scrypt miner — Mining-Dutch SOLO only');
  console.log('Endpoint:', parsed.hostname + ':' + parsed.port);
  console.log('Threads:', threads, '| Session limit:', maxRuntimeSeconds, 'seconds');
  if (!dashboardToken) console.log('Dashboard telemetry disabled: start the dashboard first to create its local token.');
  console.log('Safety: stop at 42 °C when a readable sensor exists; Android thermal controls are untouched.');
}
if (readMaxTemperature() === null) note('AVISO: sensores térmicos não acessíveis; monitore a temperatura externamente.');

function scheduleReconnect(reason) {
  if (finished || reconnectTimer) return;
  connectionState = 'reconnecting';
  note(reason);
  stopWorkers();
  activeJobId = null;
  authorized = false;
  subscription = null;
  currentJobParams = null;
  pending.clear();
  inputBuffer = '';
  extranonceCounter = 0n;
  const delay = reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
  note('Reconectando ao mesmo endereço em ' + (delay / 1000) + 's.');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectPool();
  }, delay);
}

function connectPool() {
  if (finished) return;
  const connection = net.createConnection({ host: parsed.hostname, port: Number(parsed.port) });
  socket = connection;
  connection.setEncoding('utf8');
  connection.on('connect', () => {
    if (socket !== connection || finished) return;
    if (!startedAt) startedAt = Date.now();
    reconnectDelayMs = 1000;
    connectionState = 'connected';
    note('Conectado à Mining-Dutch; autenticando worker...');
    send('mining.subscribe', ['PEP-Miner-Cluster/0.2']);
  });
  connection.on('data', chunk => {
    if (socket === connection && !finished) onData(chunk);
  });
  connection.on('error', error => {
    if (socket === connection && !finished) note('Erro na conexão Stratum: ' + error.message, true);
  });
  connection.on('close', () => {
    if (socket === connection && !finished) scheduleReconnect('Pool connection closed.');
  });
}

process.on('SIGINT', () => shutdown('Stopped by user.'));
process.on('SIGTERM', () => shutdown('Stopped by system.'));
connectPool();
const telemetryTimer = setInterval(() => { sendTelemetry(); }, 10000);
const statsTimer = setInterval(() => {
  if (finished) return clearInterval(statsTimer);
  if (interactivePanel) renderPanel();
  else reportStats();
}, interactivePanel ? 1000 : 10000);
