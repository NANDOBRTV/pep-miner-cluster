#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  buildHeader,
  scrypt1024,
  hashToDisplayHex,
  compactToTarget,
  difficultyToScryptTarget,
  SCRYPT_DIFF1_TARGET,
  hashMeetsTarget,
  buildCoinbase,
  computeMerkleRoot
} = require('./pep-pow');

// These five 80-byte inputs and displayed PoW hashes are copied from
// Pepecoin Core src/test/scrypt_tests.cpp (scrypt_hashtest).
const vectors = [
  ['020000004c1271c211717198227392b029a64a7971931d351b387bb80db027f270411e398a07046f7d4a08dd815412a8712f874a7ebf0507e3878bd24e20a3b73fd750a667d2f451eac7471b00de6659', '00000000002bef4107f882f6115e0b01f348d21195dacd3582aa2dabd7985806'],
  ['0200000011503ee6a855e900c00cfdd98f5f55fffeaee9b6bf55bea9b852d9de2ce35828e204eef76acfd36949ae56d1fbe81c1ac9c0209e6331ad56414f9072506a77f8c6faf551eac7471b00389d01', '00000000003a0d11bdd5eb634e08b7feddcfbbf228ed35d250daf19f1c88fc94'],
  ['02000000a72c8a177f523946f42f22c3e86b8023221b4105e8007e59e81f6beb013e29aaf635295cb9ac966213fb56e046dc71df5b3f7f67ceaeab24038e743f883aff1aaafaf551eac7471b0166249b', '00000000000b40f895f288e13244728a6c2d9d59d8aff29c65f8dd5114a8ca81'],
  ['010000007824bc3a8a1b4628485eee3024abd8626721f7f870f8ad4d2f33a27155167f6a4009d1285049603888fe85a84b6c803a53305a8d497965a5e896e1a00568359589faf551eac7471b0065434e', '00000000003007005891cd4923031e99d8e8d72f6e8e7edc6a86181897e105fe'],
  ['0200000050bfd4e4a307a8cb6ef4aef69abc5c0f2d579648bd80d7733e1ccc3fbc90ed664a7f74006cb11bde87785f229ecd366c2d4e44432832580e0608c579e4cb76f383f7f551eac7471b00c36982', '000000000018f0b426a4afc7130ccb47fa02af730d345b4fe7c7724d3800ec8c']
];

for (const [headerHex, expected] of vectors) {
  const header = Buffer.from(headerHex, 'hex');
  assert.equal(header.length, 80);
  assert.equal(hashToDisplayHex(scrypt1024(header)), expected);
}

const header = buildHeader({
  version: '20000002',
  prevHash: '11'.repeat(32),
  merkleRoot: '22'.repeat(32),
  ntime: '6ae4b1cb',
  nbits: '1a41cc93',
  nonce: '00000001'
});
assert.equal(header.length, 80);
assert.equal(header.subarray(0, 4).toString('hex'), '02000020');
assert.equal(header.subarray(4, 36).toString('hex'), '11'.repeat(32));
assert.equal(header.subarray(36, 68).toString('hex'), '22'.repeat(32));
assert.equal(header.subarray(68, 72).toString('hex'), 'cbb1e46a');
assert.equal(header.subarray(72, 76).toString('hex'), '93cc411a');
assert.equal(header.subarray(76, 80).toString('hex'), '01000000');

const coinbase = buildCoinbase('0102', 'aabb', '00000001', '0304');
assert.equal(coinbase.toString('hex'), '0102aabb000000010304');
assert.equal(computeMerkleRoot(coinbase, []).length, 32);
assert.equal(compactToTarget('1d00ffff'), 0xffffn << 208n);
assert.equal(difficultyToScryptTarget('1'), SCRYPT_DIFF1_TARGET);
assert.equal(difficultyToScryptTarget('65536'), SCRYPT_DIFF1_TARGET / 65536n);
assert.equal(difficultyToScryptTarget('0.5'), SCRYPT_DIFF1_TARGET * 2n);
assert.equal(hashMeetsTarget(Buffer.alloc(32), 1n), true);
assert.equal(hashMeetsTarget(Buffer.from('01' + '00'.repeat(31), 'hex'), 1n), false);

console.log('PEP PoW tests passed: 5 official Scrypt vectors + header/coinbase/target checks.');
