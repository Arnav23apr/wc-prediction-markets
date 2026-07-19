# Technical documentation

**TxODDS x Superteam World Cup Hackathon**

Three entries built on one spine: a single TxLINE feed, one Solana settlement
program, and three products on top of it, a prediction market, an autonomous
trading agent, and a live watch-along.

| Entry | Track | Live |
|---|---|---|
| World Cup Markets | Markets & Settlement | https://wc-markets.pages.dev |
| Striker | Trading Tools & Agents | Telegram, @tx0ddsbot |
| Terrace | Consumer & Fan Experiences | https://terrace-wc.pages.dev |

**On-chain (Solana devnet):**

- Program: `GxkLKoL4aUqvVnUonkM9xXegjUepEaDV68EUCJJbEwtM`
- Demo USDC mint: `C3Edg8T9SWbB1dh6fRUKwSkAjeEomCM1yeKQqBGbNyCj`

---

## 1. What is real and what is simulated

We want this stated up front, because it is the first thing a careful judge checks.

**Real:**

- The Anchor program, deployed and running on Solana devnet.
- The market accounts, the USDC escrow vaults, and the positions. All live
  on-chain state, currently 15 markets across 18 nations.
- The full settlement pipeline, including the cross-program call into TxLINE's
  on-chain validation instruction.
- Striker's autonomous agent, which signs and sends real devnet transactions.

**Simulated, and labelled everywhere it appears:**

- The live odds feed. Our TxODDS data token is still activating on their side
  (the subscribe transaction is in this repo as evidence), so pre-kickoff odds and
  match events run on a deterministic, clearly labelled replay. The event schema
  mirrors the real TxLINE feed, so the replay swaps for the live stream without a
  front-end change.

We chose to be explicit about this rather than hide it behind a polished UI. The
parts that make the entries defensible, the settlement program and the on-chain
state, do not depend on the odds feed being live.

---

## 2. The settlement program (the core)

The interesting problem in a prediction market is not taking bets, it is paying
them out correctly and trustlessly. A naive design lets one backend key write "home
won" and drain the pot. We designed the whole program around removing that
single point of trust.

### 2.1 Accounts

- **Market**: keyed by `matchId`, holds the two team names, status, betting close
  timestamp, the three outcome pools, total pool, fee in basis points, the final
  and proposed outcome, the goals, and a `resultVerified` flag.
- **Position**: keyed by market plus owner, holds the per-outcome stakes and a
  `claimed` flag that makes claims idempotent.
- **Vault**: a per-market SPL token account that escrows all USDC stake.
- **RootRegistry**: holds the published TxLINE Merkle root that settlements are
  checked against.

### 2.2 Lifecycle and separation of powers

```
place_bet (until kickoff)
      -> OPEN
oracle: commit_result(outcome)          proposes, does not pay out
      -> RESULT_PROPOSED (dispute window)
watcher: dispute_result                 freezes a bad proposal
anyone:  finalize_result (after window) settles, snapshot frozen
admin:   resolve_dispute                authoritative outcome for a disputed market
user:    claim()                        winnings or refund
```

Four distinct authorities, and no single one can pay out a result on its own:

| Role | Who | Can | Cannot |
|---|---|---|---|
| Oracle | TxODDS relayer | Propose a result | Finalize or move funds |
| Watcher | dispute authority | Freeze a bad proposal in the window | Decide the outcome |
| Admin | market authority | Resolve a disputed market | Touch an undisputed one |
| Anyone | any signer | Finalize after the window, trigger claims | Change the result |

The oracle proposing and the network finalizing are separate actions by separate
parties, with a dispute window in between. That gap is the whole thesis.

### 2.3 The TxLINE proof, cross-program call

The path that matters is `commit_result_validated`
(`programs/prediction-market/src/instructions/commit_result_validated.rs`). It does
a manual cross-program call into TxLINE's on-chain `validate_stat` instruction
(`programs/prediction-market/src/txline_cpi.rs`), passing the score to prove and a
Merkle proof against TxLINE's published daily root. The program only accepts the
committed outcome if that call confirms it. In other words, no key, not even the
oracle's, can commit a result that the proof does not back. The instruction is fee
payer agnostic on purpose: the cross-program call result is what is trusted, not
who paid.

`validate_stat` takes a general stat plus a comparison expression (the
`Comparison` and `BinaryExpression` types in the CPI module), which is why the same
settlement path extends to other market types later without a redesign.

### 2.4 Parimutuel payout math

All stake for a match pools into three outcomes. At settlement the numbers are
snapshotted so claims are pure arithmetic and order independent:

- `fee = total_pool * fee_bps / 10_000`, capped at 10 percent, skimmed once to the
  treasury.
- `payout_pool = total_pool - fee`.
- A winning position claims `stake_on_winner * payout_pool / winning_pool`.
- Sub-lamport rounding dust stays in the vault, so claims can never sum to more than
  the pool.

We chose parimutuel over an AMM or an order book on purpose. There is no liquidity
provider to bootstrap, no impermanent loss, and no vig. The payout is a transparent
function of the pool, which also makes the trustless-settlement story cleaner: at
settlement there is nothing to unwind, just a frozen snapshot to claim against.

### 2.5 Edge cases (covered by tests in `tests/`)

| Situation | Handling |
|---|---|
| Normal result | Winners split the payout pool pro rata, fee to treasury |
| Match abandoned or postponed | Oracle commits VOID, every stake refunded, zero fee |
| Nobody backed the winning outcome | Treated as void, full refunds, no trapped funds |
| Oracle posts a wrong result | Watcher disputes in the window, admin sets the outcome |
| Oracle goes offline after proposing | Finalize is permissionless, anyone closes it |
| Double claim | The `claimed` flag makes claims idempotent |
| Bet after kickoff | Rejected on-chain via the betting-close check |
| Fee set too high at creation | Rejected, the max is 10 percent |

---

## 3. The web app (Markets & Settlement)

Next.js 14, static-exported and hosted on Cloudflare Pages. It reads all markets
directly from the program on devnet, so the board is live on-chain state, not a
database. Key surfaces:

- The market grid, with live implied odds from each pool's share.
- The market detail: a pre-kickoff probability chart, a pool book with live
  multipliers, and the TxLINE data panel showing the odds source, fair
  probabilities, fixture, and the settlement chain of custody.
- The proof receipt (`MerkleProof.tsx`, `ProofDrawer.tsx`), which renders the
  TxLINE Merkle proof and the `validate_stat` chain for a settled market.
- Wallet betting and claiming through Phantom, Backpack, or Solflare.

Rendering is client-side against a public devnet RPC. The design language is a
dark, terminal-inspired dashboard with a single amber accent.

---

## 4. Striker (Trading Tools & Agents)

A grammY Telegram bot (`bot/`) with two halves that share one engine.

**Human tools:** place bets from chat, set odds orders that fire when a
multiplier crosses a target, snipe new markets while pools are thin, and
copy-betting that mirrors any wallet you follow. Each user gets a custodial
keypair and a demo-USDC faucet on first touch.

**The autonomous agent** (`bot/src/agent.ts`): the "deploy it and it trades on its
own" mode, with no human input. On each cycle it scans every open funded market,
computes the edge between the pool payout and the bookmaker's fair price after
stripping the overround, and stakes a fixed size on the single best value bet above
its threshold, from its own dedicated wallet. Every decision is written to a
decision log with its reasoning and the transaction signature, so the agent's
behaviour is fully auditable.

Both halves place real transactions against the same devnet program as the web app,
so the agent's stakes show up as actual pool movement on the site.

**Hosting:** the bot runs on Cloudflare (Worker for the Telegram webhook, a
scheduled trigger for the autonomous engine), so it is always on and independent of
any laptop. Anchor runs at the edge with a lightweight custom wallet, and the RPC
uses an endpoint that accepts Cloudflare's egress.

---

## 5. Terrace (Consumer & Fan Experiences)

A live watch-along. Next.js hub and room on Cloudflare Pages, a realtime backend on
a Cloudflare Durable Object, and a browser extension widget.

- **Room:** a presence orbit of who is watching, emoji reactions with real physics,
  a knitted rivalry scarf that pulls toward the louder end, live polls to call the
  next goal, and a broadcast-grade goal takeover with the new score.
- **Widget:** an MV3 extension that floats a draggable mini-room over whatever site
  is streaming the match, with live score, reactions, and goal flashes.
- **Spoiler shield:** streams run behind the data feed, so second screens usually
  score before the TV does. Terrace lets you delay events to line up with your
  stream. No incumbent does this.
- **Identity:** fans sign in with Solana (a wallet message signature is the
  account).

The realtime backend is a single Durable Object holding the engine and rooms in
memory, driven by a self-rescheduling alarm, using the WebSocket hibernation API.
It is laptop independent: the site stays live with the laptop off. Match action is
a labelled replay of scripted fixtures whose event schema mirrors the live TxLINE
feed, so it swaps to the real stream without a client change.

---

## 6. TxLINE integration summary

| What we use | Where |
|---|---|
| Guest authentication and fixtures | Terrace calls the live guest-auth endpoint (HTTP 200), provable at its `/txline-status` route |
| Scores and stat validation feed | The event schema the replay engine mirrors, and the score the settlement path validates |
| On-chain Merkle proofs | `validate_stat` cross-program call in the settlement program, the "settled by proof" trust chain |

Data-plane endpoints currently return 403 without an activated API token, and the
activation call is blocked on the TxODDS side (a 504), so the live data surfaces run
on the labelled replay. Guest authentication works today, and the settlement proof
path is real on-chain code.

---

## 7. Running it locally

Each entry has its own README with exact commands. In short:

- **Program and app:** build the Anchor program, deploy to a local validator or
  devnet, seed markets with `relayer/seed.ts`, run the Next.js app in `app/`.
- **Striker:** set the bot token and RPC in the environment, run `bot/`.
- **Terrace:** run the ws server and the Next.js hub, load the extension unpacked.

See `README.md` (Markets and Striker) and `terrace/README.md` (Terrace) for the
full setup.
