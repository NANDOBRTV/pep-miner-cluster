#!/usr/bin/env node
'use strict';

// Consensus primitives for Pepecoin (PEP).
// Header byte arrays are the exact serialized 80-byte CPureBlockHeader fields.
const crypto = require('node:crypto');

// Litecoin-family Scrypt Stratum difficulty-1 share target.
const SCRYPT_DIFF1_TARGET = 0x0000ffff00000000000000000000000000000000000000000000000000000000n;

function decodeHex(value, bytes, label) {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/i.test(value)) {
    throw new TypeError(label + ' must be exactly ' + bytes + ' bytes of hexadecimal data.');
  }
  return Buffer.from(value, 'hex');
}

function uint32HexToLE(value, label) {
  return Buffer.from(decodeHex(value, 4, label)).reverse();
}

function sha256d(data) {
  const first = crypto.createHash('sha256').update(data).digest();
  return crypto.createHash('sha256').update(first).digest();
}

function buildCoinbase(coinbasePrefix, extranonce1, extranonce2, coinbaseSuffix) {
  const values = [coinbasePrefix, extranonce1, extranonce2, coinbaseSuffix];
  for (const value of values) {
    if (typeof value !== 'string' || value.length % 2 || !/^[0-9a-f]*$/i.test(value)) {
      throw new TypeError('Coinbase components must be even-length hexadecimal strings.');
    }
  }
  return Buffer.concat(values.map(value => Buffer.from(value, 'hex')));
}

function computeMerkleRoot(coinbase, branches) {
  if (!Buffer.isBuffer(coinbase)) throw new TypeError('coinbase must be a Buffer.');
  if (!Array.isArray(branches)) throw new TypeError('branches must be an array.');
  let root = sha256d(coinbase);
  for (const branch of branches) {
    if (!Buffer.isBuffer(branch) && (typeof branch !== 'string' || !/^[0-9a-f]{64}$/i.test(branch))) {
      throw new TypeError('Each Merkle branch must be 32 bytes of hexadecimal data.');
    }
    const branchBytes = Buffer.isBuffer(branch) ? branch : Buffer.from(branch, 'hex');
    if (branchBytes.length !== 32) throw new TypeError('Each Merkle branch must be exactly 32 bytes.');
    root = sha256d(Buffer.concat([root, branchBytes]));
  }
  return root;
}

function buildHeader({ version, prevHash, merkleRoot, ntime, nbits, nonce }) {
  // prevHash and merkleRoot must already be in serialized uint256/internal byte order.
  const header = Buffer.concat([
    uint32HexToLE(version, 'version'),
    decodeHex(prevHash, 32, 'prevHash'),
    decodeHex(merkleRoot, 32, 'merkleRoot'),
    uint32HexToLE(ntime, 'ntime'),
    uint32HexToLE(nbits, 'nbits'),
    uint32HexToLE(nonce, 'nonce')
  ]);
  if (header.length !== 80) throw new Error('PEP pure block header must be exactly 80 bytes.');
  return header;
}

function prepareStratumJob(params, extranonce1, extranonce2) {
  if (!Array.isArray(params) || params.length < 9) {
    throw new TypeError('mining.notify must contain the nine Stratum V1 job fields.');
  }
  const [jobId, prevHash, coinbasePrefix, coinbaseSuffix, branches, version, nbits, ntime, cleanJobs] = params;
  if (typeof jobId !== 'string' || !jobId) throw new TypeError('Invalid Stratum job_id.');
  if (!Array.isArray(branches)) throw new TypeError('Stratum merkle_branch must be an array.');
  const coinbase = buildCoinbase(coinbasePrefix, extranonce1, extranonce2, coinbaseSuffix);
  const merkleRoot = computeMerkleRoot(coinbase, branches);
  // Stratum V1 version/ntime/nbits are numeric hex fields; serialize as LE.
  // prevHash and the resulting SHA256d Merkle root are already internal uint256 bytes.
  const headerPrefix = Buffer.concat([
    uint32HexToLE(version, 'version'),
    decodeHex(prevHash, 32, 'prevHash'),
    merkleRoot,
    uint32HexToLE(ntime, 'ntime'),
    uint32HexToLE(nbits, 'nbits')
  ]);
  if (headerPrefix.length !== 76) throw new Error('PEP Stratum header prefix must be 76 bytes.');
  return {
    jobId,
    extranonce2,
    ntime,
    nbits,
    version,
    cleanJobs: cleanJobs === true,
    coinbase,
    merkleRoot,
    headerPrefix
  };
}

function headerWithNonce(headerPrefix, nonce) {
  if (!Buffer.isBuffer(headerPrefix) || headerPrefix.length !== 76) {
    throw new TypeError('headerPrefix must be exactly 76 bytes.');
  }
  if (!Number.isInteger(nonce) || nonce < 0 || nonce > 0xffffffff) {
    throw new RangeError('nonce must be an unsigned 32-bit integer.');
  }
  const nonceLE = Buffer.allocUnsafe(4);
  nonceLE.writeUInt32LE(nonce, 0);
  return Buffer.concat([headerPrefix, nonceLE]);
}

function scrypt1024(header) {
  if (!Buffer.isBuffer(header) || header.length !== 80) {
    throw new TypeError('PEP Scrypt input must be an 80-byte serialized block header.');
  }
  // Matches Pepecoin Core scrypt_1024_1_1_256: password=input, salt=input,
  // N=1024, r=1, p=1, output=32 bytes. Returned bytes are uint256 internal LE.
  return crypto.scryptSync(header, header, 32, {
    N: 1024,
    r: 1,
    p: 1,
    maxmem: 32 * 1024 * 1024
  });
}

function hashToDisplayHex(hashLE) {
  if (!Buffer.isBuffer(hashLE) || hashLE.length !== 32) throw new TypeError('hash must be 32 bytes.');
  return Buffer.from(hashLE).reverse().toString('hex');
}

function compactToTarget(compactHex) {
  const compact = Number.parseInt(compactHex, 16);
  if (!/^[0-9a-f]{8}$/i.test(compactHex) || !Number.isSafeInteger(compact)) {
    throw new TypeError('Compact target must be an 8-character hexadecimal nBits value.');
  }
  const exponent = compact >>> 24;
  const mantissa = compact & 0x007fffff;
  if ((compact & 0x00800000) !== 0 || mantissa === 0 || exponent === 0) {
    throw new RangeError('Invalid or negative compact target.');
  }
  let target = BigInt(mantissa);
  if (exponent <= 3) target >>= 8n * BigInt(3 - exponent);
  else target <<= 8n * BigInt(exponent - 3);
  if (target <= 0n || target >= (1n << 256n)) throw new RangeError('Compact target is outside uint256 range.');
  return target;
}

function difficultyToScryptTarget(difficulty) {
  const text = String(difficulty);
  if (!/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(text)) {
    throw new TypeError('Share difficulty must be a positive decimal number.');
  }
  const [whole, fraction = ''] = text.split('.');
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) throw new RangeError('Share difficulty must be greater than zero.');
  const denominator = 10n ** BigInt(fraction.length);
  const target = (SCRYPT_DIFF1_TARGET * denominator) / numerator;
  if (target <= 0n) throw new RangeError('Share difficulty is too high for uint256 target precision.');
  return target;
}

function hashMeetsTarget(hashLE, target) {
  if (!Buffer.isBuffer(hashLE) || hashLE.length !== 32) throw new TypeError('hash must be 32 bytes.');
  if (typeof target !== 'bigint' || target <= 0n) throw new TypeError('target must be a positive BigInt.');
  return BigInt('0x' + hashToDisplayHex(hashLE)) <= target;
}

module.exports = {
  sha256d,
  buildCoinbase,
  computeMerkleRoot,
  buildHeader,
  prepareStratumJob,
  headerWithNonce,
  scrypt1024,
  hashToDisplayHex,
  compactToTarget,
  difficultyToScryptTarget,
  SCRYPT_DIFF1_TARGET,
  hashMeetsTarget
};
