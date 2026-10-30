#!/usr/bin/env node
'use strict';

// Read-only Android/Termux device profiler. It never changes governors,
// CPU frequencies, thermal limits, or other kernel safety controls.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function read(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return null; }
}
function command(bin, args) {
  try { return execFileSync(bin, args, { encoding: 'utf8', timeout: 2500 }).trim(); }
  catch { return null; }
}
function cpuList(value) {
  const out = [];
  for (const part of String(value || '').split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    for (let n = a; n <= b && out.length < 512; n++) out.push(n);
  }
  return out;
}
function thermalZones() {
  const root = '/sys/class/thermal';
  let dirs = [];
  try { dirs = fs.readdirSync(root).filter(x => /^thermal_zone\d+$/.test(x)); } catch {}
  return dirs.map(name => {
    const base = path.join(root, name);
    const raw = read(path.join(base, 'temp'));
    const n = raw === null ? null : Number(raw);
    return { zone: name, type: read(path.join(base, 'type')), celsius: Number.isFinite(n) ? (n > 1000 ? n / 1000 : n) : null };
  }).filter(x => x.celsius !== null || x.type);
}
function main() {
  const cpuinfo = read('/proc/cpuinfo') || '';
  const online = cpuList(read('/sys/devices/system/cpu/online')) ;
  const count = online.length || os.cpus().length;
  const arch = os.arch();
  const freq = [];
  for (const id of online.length ? online : Array.from({ length: count }, (_, i) => i)) {
    const base = '/sys/devices/system/cpu/cpu' + id + '/cpufreq';
    const max = read(base + '/cpuinfo_max_freq');
    const cur = read(base + '/scaling_cur_freq');
    if (max || cur) freq.push({ cpu: id, current_mhz: cur ? Math.round(Number(cur) / 1000) : null, max_mhz: max ? Math.round(Number(max) / 1000) : null });
  }
  const profile = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    architecture: arch,
    arm64: arch === 'arm64' || /AArch64|ARMv8/i.test(cpuinfo),
    logical_cpus: count,
    online_cpus: online,
    cpu_model: (cpuinfo.match(/^(?:Hardware|model name|Processor)\s*:\s*(.+)$/mi) || [])[1] || null,
    cpu_frequencies: freq,
    thermal_zones: thermalZones(),
    android_battery: command('dumpsys', ['battery']),
    benchmark_thread_candidates: Array.from({ length: count }, (_, i) => i + 1),
    safety: 'Read-only profile. No thermal limits, governors, or frequency controls were changed.'
  };
  console.log(JSON.stringify(profile, null, 2));
}
main();
