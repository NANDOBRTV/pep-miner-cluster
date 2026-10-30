'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { headerWithNonce, scrypt1024, hashMeetsTarget, hashToDisplayHex } = require('./pep-pow');

const prefix = Buffer.from(workerData.headerPrefix, 'hex');
const target = BigInt('0x' + workerData.targetHex);
const networkTarget = BigInt('0x' + workerData.networkTargetHex);
const nonceCounter = new BigUint64Array(workerData.nonceCounter);
const stopFlag = new Int32Array(workerData.stopFlag);
const jobId = workerData.jobId;
const extranonce2 = workerData.extranonce2;
const ntime = workerData.ntime;
let hashes = 0;

try {
  while (Atomics.load(stopFlag, 0) === 0) {
    const allocated = Atomics.add(nonceCounter, 0, 1n);
    if (allocated > 0xffffffffn) {
      parentPort.postMessage({ type: 'exhausted', jobId, hashes });
      hashes = 0;
      break;
    }
    const nonce = Number(allocated);
    const header = headerWithNonce(prefix, nonce);
    const hash = scrypt1024(header);
    hashes++;

    if (hashMeetsTarget(hash, target)) {
      parentPort.postMessage({
        type: 'share',
        jobId,
        extranonce2,
        ntime,
        nonce,
        hash: hashToDisplayHex(hash),
        blockCandidate: hashMeetsTarget(hash, networkTarget)
      });
    }
    if (hashes >= 128) {
      parentPort.postMessage({ type: 'hashes', jobId, count: hashes });
      hashes = 0;
    }
  }
} catch (error) {
  parentPort.postMessage({ type: 'error', jobId, message: error.message });
} finally {
  if (hashes > 0) parentPort.postMessage({ type: 'hashes', jobId, count: hashes });
  parentPort.postMessage({ type: 'stopped', jobId });
}
