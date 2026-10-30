# Mining-Dutch / PEP integration

**Selected pool: Mining-Dutch only.** SoloPool is intentionally not configured.

## Official pool settings checked on 2026-10-30

Mining-Dutch lists Pepecoin (PEP) as a Scrypt pool with native PEP payouts. Select PEP in the Mining-Dutch account dashboard. The published regional Stratum endpoints use port **3407**:

- Americas: `stratum+tcp://americas.mining-dutch.nl:3407`
- Europe: `stratum+tcp://europe.mining-dutch.nl:3407`
- Asia: `stratum+tcp://asia.mining-dutch.nl:3407`
- Australia: `stratum+tcp://australia.mining-dutch.nl:3407`

The pool's published generic miner format is worker `username.workername` and password `x`. Use the exact Mining-Dutch account username, followed by a dot and a worker name. The example config uses `worker1`.

The older endpoint previously tried in this project, `india.mining-dutch.nl:8888`, is not listed on the current official PEP pool page; do not assume it is still valid.

## Implementation status

The dashboard is only a monitor. **No mining engine or Stratum client is implemented yet.** A TCP connection or successful Stratum authorization alone does not mean mining is working.

Required milestones:

1. Implement and test Stratum subscribe/authorize and job notifications against Mining-Dutch.
2. Confirm the exact Scrypt parameters and byte-order/target handling for PEP.
3. Implement Scrypt hashing with known-answer tests on Android ARM64.
4. Submit only correctly computed shares and count only actual pool accept/reject responses.
5. Measure hashrate locally and report real counters to the cluster dashboard.
6. Add reconnect/backoff, graceful stop, and Android thermal safeguards.

Never commit account passwords, API keys, private keys, or seed phrases. Keep credentials in local Termux-only files or environment variables.
