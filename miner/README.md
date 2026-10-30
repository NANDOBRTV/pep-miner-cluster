# Mining-Dutch / PEP integration

**Selected pool: Mining-Dutch only.** No fallback pool is configured.

## Device-tested connection (2026-10-30)

The user confirmed the following endpoint from their Android device:

- `stratum+tcp://brazil.mining-dutch.nl:8888`
- TCP connection succeeded.
- Stratum subscribe response received.
- Stratum authorization accepted.

This is a successful connection/authorization diagnostic for that device and network. It does **not** prove that mining jobs were received, hashes were computed, or shares were submitted/accepted.

The public Mining-Dutch PEP page documents regional endpoints on port 3407. Those endpoints refused or timed out from the user's test network. Keep the device-tested Brazil endpoint in the local config unless the pool operator changes or confirms its settings.

## Worker credentials

Use the exact Mining-Dutch account username followed by `.workername`, for example `account.worker1`. Use the password specified by the pool/account configuration. Do not commit credentials, API keys, private keys, or seed phrases.

Select PEP and configure the PEP payout wallet in the Mining-Dutch account dashboard.

## Implementation status

The dashboard is a monitor and `miner/stratum-probe.js` is a diagnostic only. The repository now contains `miner/pep-pow.js`, which implements PEP's 80-byte pure-header serialization helpers, coinbase/Merkle construction, compact network-target decoding, and the Scrypt 1024/1/1/256 primitive.

The Scrypt primitive is checked against all five known-answer vectors in Pepecoin Core's `src/test/scrypt_tests.cpp`. Run `npm run test:pow` in Termux. These tests validate the hash primitive and local byte-layout helpers; they do not yet validate Mining-Dutch's exact Stratum prevhash representation, submit shares, or constitute a running miner.

**The Stratum mining loop and share-submission client are not implemented yet.**

Remaining milestones:

1. Confirm Mining-Dutch's exact Stratum prevhash and Merkle-branch byte order using a real captured job and an independently reconstructed block header.
2. Confirm pool share-difficulty target semantics for its Scrypt PEP endpoint.
3. Implement the Stratum mining loop and nonce/extranonce scheduling.
4. Submit only shares that pass the local share-target check; count actual pool accept/reject replies.
5. Measure real PEP Scrypt hashrate and report real counters to the cluster dashboard.
6. Add reconnect/backoff, graceful stop, and Android thermal safeguards.

A TCP connection and successful Stratum authorization alone do not mean mining is active.

## Android ARM64 performance preparation

Run the consensus known-answer tests in Termux:

```bash
npm run check
npm run test:pow
```

Run the read-only device profile in Termux:

```bash
npm run device:profile
```

It reports the detected architecture, online logical CPUs, readable CPU frequency data, and thermal-zone readings when Android exposes them. It also lists thread-count candidates from 1 through the detected online CPU count. Missing sysfs values are normal on some Android builds.

This tool does not change CPU governors, frequencies, thermal limits, or Android safety controls. It does not claim a hashrate and does not mine. The next performance milestone is a verified ARM64 Scrypt implementation with known-answer tests, followed by a controlled per-thread benchmark and only then real Stratum share submission.

## Controlled Scrypt benchmark (Termux)

After updating the repository, run:

```bash
npm run bench:scrypt
```

The benchmark uses Node's OpenSSL-backed Scrypt primitive with parameters N=1024, r=1, p=1 and a fixed 80-byte test input. It tests thread counts from 1 up to the detected logical CPU count, with short runs and cooldowns. It checks readable Android thermal zones and stops at 42 °C by default. Optional environment settings: `BENCH_MS` (1000–8000), `COOLDOWN_MS` (2000–15000), and `MAX_THREADS` (1–logical CPU count).

If Android does not expose thermal zones to Termux, the script warns that automatic thermal stopping is unavailable. Monitor the device independently and stop the test if it becomes uncomfortably hot.

**Interpretation:** this is a Scrypt primitive benchmark, not a complete PEP block-header miner. Its hashes/second must not be presented as pool hashrate. No Stratum shares are computed or submitted. The actual miner still requires verified PEP header serialization, byte order, target comparison, native/optimized ARM64 hashing, and accepted-share tests.
