# World Cup Prediction Markets — Markets & Settlement

Parimutuel prediction markets for World Cup matches on **Solana**, with a
settlement pipeline designed to be driven by the **TxODDS** football feed.

Built for the TxODDS × Superteam *World Cup Hackathon — Markets & Settlement* track.

> **Submission links** · Demo video: _in submission form_ · Live app: _in submission form_ ·
> Devnet program: [`GxkLKoL4aUqvVnUonkM9xXegjUepEaDV68EUCJJbEwtM`](https://explorer.solana.com/address/GxkLKoL4aUqvVnUonkM9xXegjUepEaDV68EUCJJbEwtM?cluster=devnet) ·
> Devnet demo mint: `C3Edg8T9SWbB1dh6fRUKwSkAjeEomCM1yeKQqBGbNyCj` ·
> Telegram bot: [@tx0ddsbot](https://t.me/tx0ddsbot)
>
> This repo holds **two entries**: the Markets & Settlement product (`app/` + `programs/` + `relayer/`)
> and **Striker**, the Trading Tools & Agents entry (`bot/`, section below).

> The interesting part of a prediction market isn't taking bets — it's paying
> them out **correctly and trustlessly**. This project treats settlement as the
> product: a single oracle key can *propose* a result but can never unilaterally
> *finalize* a payout, every irregular match (abandoned, postponed, or with no
> winning stake) refunds cleanly, and finalization is permissionless so funds
> are never hostage to the oracle staying online.

---

## Why this design

A naive on-chain market lets one backend key write "Home won" and immediately
drain the pot to whoever it likes. That's the failure mode judges will probe.
Our settlement is deliberately a **three-stage, separation-of-powers** process:

```
            place_bet (until kickoff)
                  │
   ┌──────────────▼───────────────┐
   │            OPEN              │
   └──────────────┬───────────────┘
       oracle: commit_result(outcome)         ← proposes, does NOT pay out
                  │
   ┌──────────────▼───────────────┐
   │       RESULT_PROPOSED        │  dispute window counting down
   └───────┬───────────────┬──────┘
  watcher: │               │ anyone: finalize_result (after window)
  dispute_result           │
           ▼               ▼
   ┌───────────────┐   ┌───────────────────────┐
   │   DISPUTED    │   │  SETTLED  /  VOIDED    │ ← payout snapshot frozen
   └───────┬───────┘   └───────────┬───────────┘
 admin: resolve_dispute            │ user: claim()
        (authoritative outcome)    ▼
                          winnings or refund
```

**Three distinct authorities, by design:**

| Role | Key | Can do | Cannot do |
|------|-----|--------|-----------|
| **Oracle** | TxODDS relayer | Propose the result | Finalize, move funds |
| **Watcher** | dispute authority | Freeze a bad proposal during the window | Decide the outcome |
| **Admin** | market authority | Resolve a *disputed* market | Touch an undisputed one |
| **Anyone** | — | Finalize after the window, trigger claims | Change the result |

The oracle proposing and the network finalizing are **different actions by
different parties**. That gap — plus the dispute window — is the whole thesis.

---

## Settlement economics (parimutuel)

All stake for a match pools into three outcomes (Home / Draw / Away). At
settlement we snapshot the numbers so claims are pure arithmetic and order-independent:

- `fee = total_pool * fee_bps / 10_000` (capped at 10%, skimmed once to treasury)
- `payout_pool = total_pool − fee`
- A winning position claims `stake_on_winner * payout_pool / winning_pool`
- Rounding dust (sub-lamport) stays in the vault — claims can never sum to more
  than the pool.

### Edge-case matrix (the part that wins the track)

| Situation | Handling |
|-----------|----------|
| Normal result | Winners split `payout_pool` pro-rata; fee to treasury |
| **Match abandoned / postponed** | Oracle commits `VOID` → **every stake refunded**, zero fee |
| **Nobody backed the winning outcome** | Auto-treated as void → **full refunds**, no trapped funds |
| **Oracle posts a wrong result** | Watcher disputes within window → admin sets the authoritative outcome |
| Oracle goes offline after proposing | `finalize_result` is permissionless — anyone closes it out |
| Double claim | `claimed` flag makes claims idempotent |
| Bet after kickoff | Rejected on-chain (`betting_close_ts` check) |
| Fee set absurdly high at creation | Rejected (`MAX_FEE_BPS` = 10%) |

All of the above are covered by the integration tests in `tests/`.

---

## Repo layout

```
programs/prediction-market/   Anchor (Rust) program — the core
  src/state.rs                Market / Position / Config accounts + status enum
  src/settlement.rs           Pure payout math + the single vault-payout primitive
  src/instructions/           initialize_market, place_bet, commit_result,
                              dispute_result, finalize_result, resolve_dispute, claim
tests/prediction-market.ts    Full lifecycle + every edge case above
relayer/                      TxODDS → Solana oracle service (TypeScript)
  src/txodds.ts               Feed client + a MOCK client for keyless demos
  src/index.ts                Poll loop: propose finished matches, finalize elapsed ones
  src/createMarket.ts         Admin: open markets from fixtures
  src/setupDevnet.ts          One-shot devnet bootstrap (mint, treasury, oracle key)
app/                          Next.js frontend: market list, betting, claims
```

---

## Quickstart

### 0. Prerequisites
- Rust (`rustup`), the **Agave 4.x** Solana CLI, Node 18+. See `SETUP.md`.

> **Toolchain note (important).** Anchor 0.30.1's CLI hard-pins Solana 1.18.17,
> whose bundled cargo (1.75) can no longer resolve the current crate ecosystem
> (crates now require `edition2024`), and its IDL macro won't compile on modern
> Rust. The program itself compiles cleanly with the modern Agave 4.0 /
> platform-tools v1.53 SBF compiler. So this repo builds the `.so` with that
> compiler directly and generates the IDL deterministically (`scripts/gen-idl.js`)
> instead of using `anchor build`. The helper scripts below wrap all of it.

### 1. Build the program + IDL
```bash
bash scripts/build.sh     # cargo-build-sbf (Agave 4.0) + generates target/idl
```
This produces `target/deploy/prediction_market.so` and the IDL. The program id is
already synced into `declare_id!` and `Anchor.toml`; if you regenerate the keypair,
update both to match (the script prints the id) and re-run `scripts/gen-idl.js`.

### 1b. Run the test suite (local validator)
```bash
bash scripts/test-local.sh   # boots a validator, deploys the .so, runs ts-mocha
```
All six settlement tests should pass (payout, void, no-winner refund, dispute
override, late-bet guard, double-claim guard).

### 1c. Deploy to devnet
```bash
solana config set --url devnet
solana airdrop 2          # or https://faucet.solana.com
solana program deploy target/deploy/prediction_market.so \
  --program-id target/deploy/prediction_market-keypair.json
```

### 2. Bootstrap devnet infra
```bash
cd relayer && npm install && cp .env.example .env
# set ADMIN_KEYPAIR / PROGRAM_ID in .env, then:
npm run setup-devnet      # prints USDC_MINT, TREASURY_TOKEN_ACCOUNT, ORACLE_KEYPAIR
# paste those back into relayer/.env (and NEXT_PUBLIC_USDC_MINT into app/.env.local)
```

### 3. Open markets + run the oracle
```bash
npm run create-market     # creates markets for the (mock) fixtures
npm run relayer           # polls, proposes results, finalizes after the window
```
> Leave `TXODDS_API_KEY` empty to run in **mock mode** — three scripted fixtures
> (a home win, a draw, and an abandoned match) drive a full propose→finalize
> cycle with no external key. Drop in the real key + confirm the endpoint paths
> in `txodds.ts` to go live.

### 4. Run the app
```bash
cd ../app && npm install && cp .env.local.example .env.local
npm run dev               # http://localhost:3000  (auto-copies the built IDL)
```

### Run the tests
```bash
bash scripts/test-local.sh   # see step 1b — boots a local validator and runs tests/
```

### One-command end-to-end demo (real USDC, real payouts)
```bash
bash scripts/localnet.sh     # terminal A: persistent validator
# terminal B:
cd relayer && npm install
RPC_URL=http://127.0.0.1:8899 PROGRAM_ID=GxkLKoL4aUqvVnUonkM9xXegjUepEaDV68EUCJJbEwtM npm run demo
```
Creates a market, places three bets, settles via oracle commit → finalize, and
claims — printing the on-chain balances (winners paid pro-rata, 2% fee to treasury,
loser gets nothing).

---

## Demo script (≈3 min)

1. `anchor test` — show the edge-case matrix going green (payout, void, no-winner, dispute override).
2. App: connect Phantom (devnet), place bets on a couple of outcomes — watch the
   pools and implied odds shift live.
3. Relayer terminal: a fixture hits full-time → `commit_result` logs a proposed
   outcome; market badge flips to **Result proposed** with a live dispute countdown.
4. After the window: permissionless `finalize` → badge flips to **Settled**;
   winners hit **Claim**, the voided fixture shows **Claim refund**.
5. Point at `dispute_result` → `resolve_dispute` in the tests as the "what if the
   oracle is wrong" answer.

---

## TxLINE integration

The relayer talks to the real **TxLINE** API (`relayer/src/txodds.ts`):
- Auth: guest JWT (`POST /auth/guest/start`) + a long-lived `X-Api-Token` from the
  on-chain activate-subscription flow. **World Cup data is on free service levels
  (1 = 60s delay, 12 = real-time)**, so no TxL token purchase is required.
- Fixtures: `GET /api/fixtures/snapshot` → markets (teams oriented via `Participant1IsHome`).
- Results: `GET /api/scores/snapshot/{fixtureId}` → full-time goals → outcome.
- Leave `TXODDS_API_TOKEN` empty to run in **mock mode** (scripted fixtures) and
  demo the whole pipeline with no key.

> One field to confirm against live data: the exact `gameState` spellings for
> finished/abandoned (we match defensively in `mapGameState`).

### Trustless settlement: TxLINE Merkle-proof verification (built)
TxLINE exposes a **three-stage Merkle proof for every score statistic**
(`GET /api/scores/stat-validation`) — their "scout-verified, blockchain-confirmed"
guarantee. We verify it **on-chain**, so settlement needs no trusted oracle key:

- `RootRegistry` (a singleton PDA) holds the published TxLINE batch root, refreshed
  by `set_score_root` (root authority = TxLINE's publisher / a mirroring relayer).
- **`commit_result_verified`** is **permissionless**: anyone submits the proof of
  *both* full-time goal totals (TxLINE's two-stat `statKey2` variant). The program
  (`merkle.rs`) folds each stat → event root → sub-tree root → batch root, requires
  it to equal the registry root, then derives the outcome from the proven goals and
  flags the market `result_verified`. A tampered proof fails `MerkleVerificationFailed`.
- The trusted `commit_result` path remains as a fallback; the dispute window and
  permissionless `finalize_result` are unchanged.

This turns settlement from *"trust the relayer's key"* into *"cryptographically
prove the score came from TxODDS"* — the strongest answer to *why trust the result*.
Covered by `tests/merkle-verified.ts` (happy path + tampered-proof rejection) and
runnable via `cd relayer && npm run verified-demo`.

> Two TxLINE specifics aren't in the public docs — the hash function and exact leaf
> byte-encoding. They're isolated to `merkle.rs` (SHA-256, domain-separated LE) and
> mirrored in `relayer/src/verified.ts`; change both together to match live data.
> Everything else (tree shape, three-stage fold, two-stat consistency) is final.

## TxLINE API — endpoints used

TxLINE (`https://txline.txodds.com`) is the **primary data source**. Consumed in
`relayer/src/txodds.ts` (feed) and `relayer/src/verified.ts` (proof mapping):

| Endpoint | Use |
|---|---|
| `POST /auth/guest/start` | Guest JWT (30-day) for the `Authorization` header |
| `POST /api/token/activate` | Long-lived `X-Api-Token` (free World Cup leagues) |
| `GET /api/fixtures/snapshot` | Upcoming fixtures → market creation (teams, kickoff) |
| `GET /api/scores/snapshot/{fixtureId}` | Full-time score → outcome |
| `GET /api/scores/stat-validation` | Three-stage Merkle proof of the goal stats → on-chain verification |

Both auth headers (`Authorization: Bearer <jwt>` + `X-Api-Token`) are sent on data
calls. **Mock mode** (`TXODDS_API_TOKEN` empty) mirrors the exact JSON schema so the
full pipeline runs on a *simulated* feed with no key.

### Architecture notes (vs. the brief's options)
- **Verification approach.** We implemented the brief's *"Experimental Verification
  Layer"* — an **independent on-chain Merkle verifier** (`merkle.rs`) over TxLINE's
  scores-validation proof primitive — rather than CPI'ing into TxLINE's
  `validate_stat`. Rationale: it works against the simulated feed with no live-program
  dependency and demonstrates the validation logic transparently. A CPI into
  `validate_stat` is a natural drop-in for the final fold step where that program is
  available on the target cluster — the `commit_result_verified` boundary is shaped to
  accept it.
- **Streaming.** We consume the REST snapshot endpoints via the relayer poll loop;
  the loop is stream-ready and can swap to the **SSE scores stream** for push-based
  resolution triggers without touching the on-chain logic.

## TxLINE API — our feedback
*What we liked:* the **single normalised JSON schema** made scaling from one fixture
to the whole tournament trivial; the **guest JWT** is a frictionless way to start; and
the **cryptographic Merkle proofs** are exactly the primitive an on-chain settlement
engine needs — being able to *verify* the score rather than *trust* a relayer is the
feature that made our whole design possible. Free World Cup access removed all
commercial friction.

*Where we hit friction:* (1) the **proof's hash function and leaf byte-encoding aren't
specified** in the public docs, so our on-chain leaf hashing is a documented assumption
(`merkle.rs`) we'd confirm against one real proof; (2) the **`X-Api-Token` requires the
on-chain activate flow** — a guest JWT alone returns `403 Missing API token` on data
endpoints, which adds a step before first data; (3) **timestamp units are inconsistent**
(fixtures `StartTime` in seconds, scores `ts` in ms); (4) the exact **`gameState`
strings** for finished/abandoned aren't enumerated, so we match defensively.

## Production notes / honest TODO
- The watcher (`dispute_authority`) is a single key here; in production it would
  be a multisig or a second data source comparing against the oracle.
- The admin override (`resolve_dispute`) is the trust backstop; a mature version
  would escalate to token-holder governance rather than a single admin key.


## Striker — the Trading Tools & Agents entry (`bot/`)

A Telegram trading bot ([@tx0ddsbot](https://t.me/tx0ddsbot)) that treats the pools like a trading desk treats an order book.

**Autonomous operation** — the engine (`bot/src/engine.ts`) runs unattended on a 12s loop with zero human input:
odds orders fire when a pool multiplier crosses a user's trigger, snipes enter new markets seconds after creation,
copy-betting mirrors tracked wallets, and settlement pushes notify winners. Every autonomous action appends a
timestamped line to `striker-decisions.log` — trigger condition, sizes, and tx signature — so the strategy is auditable:

```
2026-07-18T09:14:02.113Z [odds-order] user=… Spain v Germany outcome=Draw amt=25 trigger>=4x got=12.15x sig=5XGJ9nW7HDoa
```

**Defensible logic in one sentence:** *bet when the pool pays more than bookmaker fair value.* The `/edge` scanner
compares every pool's payout multiplier against overround-stripped StablePrice odds (TxLINE odds feed; deterministic
labelled sim until API activation unblocks) and every pre-bet receipt shows "you're +N% vs the books" before money moves.

**Production posture:** custodial per-user keypairs (0600 on disk, gitignored), flat-file store, friendly program-error
translation, single-instance polling guard, devnet RPC with airdrop→transfer fallback. Run: `cd bot && npm i && npm run bot`
(needs `BOT_TOKEN` in `bot/.env`; `RPC_URL` defaults to devnet).

## License
MIT
