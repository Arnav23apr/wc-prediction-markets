# Demo scripts, World Cup Hackathon (TxODDS x Superteam)

Three entries, three short videos. Aim for about 2 to 3 minutes each, hard cap 5.
Judges watch a lot of these back to back, so the rule is simple: show the thing
working in the first 20 seconds, then explain why it matters.

Each script below is written as a shot list. `[SHOW]` is what is on screen,
`[SAY]` is roughly what you say over it. The words are a starting point, say them
in your own voice, do not read them like a script.

Record at 1440p or higher, browser zoomed so text is readable, sound on for the
apps that have it. A clean desktop and one browser window with only the tabs you
need looks a lot more credible than a cluttered screen.

---

## Before you record anything

Quick checklist so nothing looks dead on camera:

1. **Rotate the bot token first.** BotFather, `/revoke` for @tx0ddsbot, paste the
   new token into the bot host, restart. Do this before you film Striker.
2. Open the three live links in separate tabs and let them fully load once:
   - Markets: https://wc-markets.pages.dev
   - Terrace: https://terrace-wc.pages.dev
   - Striker: Telegram, @tx0ddsbot
3. Have a Solana wallet (Phantom or Backpack) on devnet with a little SOL, in case
   you want to place a bet on camera.
4. Refresh Markets once so the boot animation has already played (it only plays
   once per session, and you want it fresh on the take you keep, so use a new tab
   for the real take).

---

## TRACK 1, Markets & Settlement (the flagship)

**The one thing to land:** results are settled by proof, not by a trusted oracle.
Anyone can settle, a bad result can be disputed, and nobody can quietly drain the
pot. Everything else is supporting cast.

**What to have open:** a fresh Markets tab, and a second tab on the Solana
Explorer page for the program (link is in the README).

### Shot 1, the open (0:00 to 0:20)

[SHOW] Load https://wc-markets.pages.dev in a fresh tab so the particle ball
assembles and settles into the hero. Let it finish. Then scroll slowly down to the
market grid so the tiles cascade in.

[SAY] "This is World Cup Markets. Pooled prediction markets on every match, running
on Solana. Fifteen markets live right now across eighteen nations, about eleven
thousand dollars pooled. The whole product is built around one idea: every result
is settled by proof."

### Shot 2, a market up close (0:20 to 0:55)

[SHOW] Click any open market tile, for example Portugal vs Netherlands. The detail
panel opens. Point at the probability chart, then the pool book on the right with
the multipliers, then scroll down to the "TXLINE DATA" panel.

[SAY] "Each market is a parimutuel pool. Home, draw, away. Your odds are just your
share of the pool, so there is no bookmaker, no vig, and no house taking the other
side. As money moves, the implied odds move with it. This lower panel is the part
that matters: the odds source, the fair probabilities, and the fixture, all keyed
to the TxLINE feed. When the match ends, that feed is what settles the market."

Note: scrolling works inside this panel now, so scroll all the way down to show the
market info and the trade panel.

### Shot 3, the settlement story (0:55 to 1:50)

[SHOW] Close the detail. Click "How it works" in the strip under the hero (or the
"How settlement works" command in the palette). Walk through the three stages.
Then, if a market on the board shows a green "proof" badge, open it and show the
verified result and the Merkle proof receipt.

[SAY] "Here is why we treat settlement as the product. A naive market lets one
backend key write 'home won' and drain the pot. We split that into three powers.
An oracle can propose a result, but proposing never moves money. There is a dispute
window where a watcher can freeze a bad result. And after that window, anyone can
finalize, so funds are never stuck if the oracle disappears. When a result is
committed, the program does a cross-program call into TxLINE's on-chain validate
instruction and checks the score against a published Merkle root. No trusted key
can pay out a result the proof does not back."

### Shot 4, on chain proof (1:50 to 2:20)

[SHOW] Switch to the Explorer tab showing the program account. Optionally click into
a market account so they can see it is real on-chain state on devnet.

[SAY] "This is all live on Solana devnet. The program, the market vaults holding
USDC in escrow, the positions. Nothing here is a mockup of the chain. The only
simulated piece is the live odds feed itself, because our TxODDS data token is still
activating on their side, and we label that everywhere it appears."

### Closing line

[SAY] "So: pooled markets anyone can bet, settled by a proof anyone can check, with
no oracle you have to trust. That is World Cup Markets."

**Honesty note to keep you safe with judges:** do say the live odds are simulated
until the TxODDS token activates. It is in the README, and being upfront about it
reads as confidence, not weakness. The settlement program, the escrow, and the
on-chain state are all real.

---

## TRACK 2, Striker (Trading Tools & Agents)

**The one thing to land:** Striker is an autonomous agent. Deploy it and it trades
on its own, with zero human input, and every decision is logged with its reasoning.
The Telegram tools around it are the human-facing layer.

**What to have open:** Telegram with @tx0ddsbot, and the Markets tab so you can show
that the agent's bets show up as real pool movement.

### Shot 1, the open (0:00 to 0:25)

[SHOW] Open the chat with @tx0ddsbot. Send `/start`. Show the menu that comes back.

[SAY] "This is Striker, a Telegram agent for the World Cup markets. Two halves.
The human half lets anyone place bets, set odds orders, snipe new markets, and copy
other wallets, all from chat. The other half is the interesting one: a fully
autonomous trading agent."

### Shot 2, the autonomous agent (0:25 to 1:20)

[SHOW] Tap the "Agent" button or send `/agent`. Show the agent card: its wallet, its
rule, and the decision log with recent bets.

[SAY] "The agent runs with no human input, ever. On every cycle it scans every open
market, works out the edge between the pool payout and the bookmaker's fair price
after stripping the overround, and it stakes a fixed size on the single best value
bet it can find above its threshold, from its own dedicated wallet. Here is the
decision log. Every line is a real decision: which market, which outcome, the pool
multiplier versus the fair multiplier, the edge percent, and the transaction
signature. This one bet fifteen USDC on the draw because the pool paid eleven times
against a fair price of four, a plus one hundred and eighty nine percent edge."

### Shot 3, prove it is real (1:20 to 2:00)

[SHOW] Send `/markets` in the bot, open one, and show the odds or pool. Then flip to
the Markets web app and show the same market's pool with the extra stake in it.

[SAY] "This is not a paper simulation. The agent signs and sends real Solana
transactions on devnet. You can see its stake land in the actual pool on the web
app. Same program, same markets, same money the humans are betting into."

### Shot 4, the human tools (2:00 to 2:30)

[SHOW] Quickly demo one human feature. For example send an odds order: pick a market,
set a target multiplier, and show the confirmation. Mention copy-betting and sniping
without fully demoing them.

[SAY] "For humans, the same engine powers odds orders that fire when a multiplier
crosses your target, new-market sniping while pools are thin, and copy-betting that
mirrors any wallet you follow. One engine, serving both a person and an autonomous
agent."

### Closing line

[SAY] "Striker: an autonomous on-chain trading agent, plus the tools for humans to
trade alongside it, all inside Telegram. It is live at @tx0ddsbot."

**Recording tip:** the autonomous decision log is the star. Make sure there are a
few good lines in it before you film. If it is empty, let the agent run for a few
minutes first so it has real bets to show.

---

## TRACK 3, Terrace (Consumer & Fan Experiences)

**The one thing to land:** Terrace makes watching a match with strangers feel alive
in five seconds. A live room, crowd reactions with real physics, a rivalry scarf
that pulls toward the louder end, and a goal takeover, plus a floating widget that
sits over any stream.

**What to have open:** https://terrace-wc.pages.dev, and if you loaded the browser
extension, a second tab with any video playing so you can show the widget over it.

### Shot 1, the open (0:00 to 0:25)

[SHOW] Load Terrace. Show the hub of live match rooms. Click into a room.

[SAY] "This is Terrace, a live watch-along for the World Cup. You do not watch alone,
you watch with the whole terrace. Pick a match, pick your end, and you are in a room
with everyone else watching."

### Shot 2, the room feels alive (0:25 to 1:15)

[SHOW] In the room, fire off a few emoji reactions and let them burst with physics.
Show the presence orbit of who is watching. Show the rivalry scarf reacting. Vote in
a live poll if one is open.

[SAY] "The room is designed to feel alive instantly. Reactions burst with real
physics. There is a presence orbit of who is here. This knitted scarf is a live
tug of war between the two ends, it pulls toward whichever side is louder. When
there is a moment coming, a poll opens so you can call the next goal with the crowd."

### Shot 3, the goal takeover (1:15 to 1:45)

[SHOW] Trigger or wait for a goal event in the replay. Show the full-screen goal
takeover with the updated score.

[SAY] "And when a goal goes in, the whole room takes over. Broadcast-grade, with the
new score, shared by everyone in the room at the same time."

### Shot 4, the widget and the spoiler shield (1:45 to 2:30)

[SHOW] Switch to the tab with a video playing and show the floating extension widget
over it: live score, reactions, the open-room button. If you can, show the delay
setting.

[SAY] "You do not even need our site. This browser widget floats a mini room over
whatever is streaming your match. And one thing no incumbent does: streams run
behind the data feed, so second screens usually spoil the goal before your TV shows
it. Terrace lets you delay events to line up with your stream, so it celebrates with
your telly, not before it."

### Closing line

[SAY] "Terrace: watch the World Cup with the whole terrace, on our site or over any
stream. Fans sign in with Solana, and results land proof-verified from the same
on-chain feed as our markets."

**Honesty note:** the match action is a labelled replay of scripted fixtures on a
loop, because the live TxODDS feed is still activating. The event schema mirrors the
real feed, so it swaps to live without touching the front end. Say that plainly if
it comes up.

---

## How to show everything (the master flow)

If you want one narrative that ties all three together, film them in this order and
mention the shared spine:

1. **Markets** first. It carries the settlement thesis and the on-chain proof. This
   is your strongest, most technical entry, so it earns trust.
2. **Striker** second. It shows the same markets being traded by an autonomous agent
   and by humans. It reuses the Markets program, so it inherits the credibility.
3. **Terrace** third. It is the consumer face, and it consumes the same fixture feed
   and the same proof-settled results.

The one-sentence spine, repeat some version of it in each video: "One TxLINE feed,
one settlement program, three products on top: a market, an agent, and a live
watch-along."

### The five things a judge should walk away having seen

1. A real pooled market on Solana devnet, with live implied odds.
2. The settlement story: propose, dispute, finalize, and a Merkle proof checked by a
   cross-program call, so no single key can pay out a fake result.
3. An autonomous agent placing real on-chain bets with a logged reason for each.
4. A live room that feels social in seconds, plus a widget over any stream.
5. Honesty about what is simulated (the odds feed) versus what is real (the chain,
   the program, the settlement, the agent's transactions).

### Practical filming notes

- Do each track in one take if you can, it feels more real than heavy cuts.
- If you fluff a line, pause two seconds and say it again, you can trim the gap.
- Keep the mouse calm. Slow, deliberate movement reads as confidence.
- End each video by saying the live link out loud and putting it on screen.
- Put the three live links and the devnet program address in every submission form.
