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

The dashboard is a monitor. The repository now contains `miner/pep-pow.js` for PEP's 80-byte pure-header serialization, coinbase/Merkle construction, compact network-target decoding, Scrypt share-target math, and the Scrypt 1024/1/1/256 primitive. It also contains a first bounded Stratum V1 miner (`miner/stratum-miner.js`) with worker threads, nonce allocation, share submission, accepted/rejected counters, reconnect-free initial session handling, and a 120-second default runtime limit.

The Scrypt primitive is checked against all five known-answer vectors in Pepecoin Core's `src/test/scrypt_tests.cpp`. Run `npm run test:pow` in Termux. The module also calculates the Scrypt Stratum share target from the pool difficulty using the Scrypt difficulty-1 target. These tests validate the hash primitive and local byte-layout helpers; they do not yet validate Mining-Dutch's exact Stratum prevhash representation, submit shares, or constitute a running miner.

The Stratum miner is an initial implementation and has **not yet been verified against an accepted share from Mining-Dutch**. Do not treat a successful connection or local hash count as proof that the pool accepted work.

Remaining milestones:

1. Validate the assembled header against Mining-Dutch by obtaining a real accepted share; confirm prevhash and Merkle byte order.
2. Confirm pool share-difficulty handling from actual accept/reject responses.
3. Add reconnect/backoff and robust recovery for socket interruptions.
4. Optimize the Scrypt engine for Android ARM64 while retaining known-answer tests.
5. Measure sustained PEP hashrate and report counters to the cluster dashboard.
6. Expand Android thermal safeguards for devices that expose readable sensors.

Mining-Dutch documents `d=` as a password argument for requesting a static share difficulty. For this phone's low CPU hashrate, set `pool.password` in the private local `config/config.json` to `d=1` for the first accepted-share test. The pool may clamp or adjust settings. Do not confuse a share target with the network block target. A TCP connection and successful Stratum authorization alone do not mean mining is active.

## First bounded mining session

After pulling the repository and confirming the tests, start a short session with all eight logical CPUs:

```bash
MINE_THREADS=8 MINE_SECONDS=120 npm run mine
```

The miner defaults to 120 seconds and caps one run at 600 seconds. If readable thermal sensors are exposed, it stops at 42 °C. This Android device previously exposed no thermal zones to Termux, so keep an external temperature monitor visible and stop the run if the phone becomes too hot. Android thermal protections are not modified.

The miner reports local hashes/second, submitted shares, and actual accepted/rejected pool responses. It does not claim a share was accepted until Mining-Dutch replies `result: true`. The first implementation does not yet reconnect automatically after a dropped socket.

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

This tool does not change CPU governors, frequencies, thermal limits, or Android safety controls. It does not claim a hashrate and does not mine. The current Scrypt implementation uses Node/OpenSSL and passes the official known-answer vectors. A native ARM64 optimization can be considered after the first real pool share is verified.

## Controlled Scrypt benchmark (Termux)

After updating the repository, run:

```bash
npm run bench:scrypt
```

The benchmark uses Node's OpenSSL-backed Scrypt primitive with parameters N=1024, r=1, p=1 and a fixed 80-byte test input. It tests thread counts from 1 up to the detected logical CPU count, with short runs and cooldowns. It checks readable Android thermal zones and stops at 42 °C by default. Optional environment settings: `BENCH_MS` (1000–8000), `COOLDOWN_MS` (2000–15000), and `MAX_THREADS` (1–logical CPU count).

If Android does not expose thermal zones to Termux, the script warns that automatic thermal stopping is unavailable. Monitor the device independently and stop the test if it becomes uncomfortably hot.

**Interpretation:** this is a Scrypt primitive benchmark, not a complete PEP block-header miner. Its hashes/second must not be presented as pool hashrate. No Stratum shares are computed or submitted. The actual miner still requires verified PEP header serialization, byte order, target comparison, native/optimized ARM64 hashing, and accepted-share tests.
