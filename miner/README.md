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

The dashboard is a monitor and `miner/stratum-probe.js` is a diagnostic only. **No Scrypt mining engine or share-submission client is implemented yet.**

Remaining milestones:

1. Receive and parse Stratum mining jobs and difficulty notifications.
2. Confirm exact PEP Scrypt parameters, serialization, target, and byte order.
3. Implement Scrypt hashing with known-answer tests on Android ARM64.
4. Submit correctly computed shares and count only actual accepted/rejected responses.
5. Measure local hashrate and report real counters to the cluster dashboard.
6. Add reconnect/backoff, graceful stop, and Android thermal safeguards.

A TCP connection and successful Stratum authorization alone do not mean mining is active.

## Android ARM64 performance preparation

Run the read-only device profile in Termux:

```bash
npm run device:profile
```

It reports the detected architecture, online logical CPUs, readable CPU frequency data, and thermal-zone readings when Android exposes them. It also lists thread-count candidates from 1 through the detected online CPU count. Missing sysfs values are normal on some Android builds.

This tool does not change CPU governors, frequencies, thermal limits, or Android safety controls. It does not claim a hashrate and does not mine. The next performance milestone is a verified ARM64 Scrypt implementation with known-answer tests, followed by a controlled per-thread benchmark and only then real Stratum share submission.
