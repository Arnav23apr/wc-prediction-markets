/**
 * STRIKER, the trading bot for proof-settled World Cup markets.
 * Instant bets · team-name lookup · odds orders · copy-betting · sniping ·
 * pre-bet receipts · PnL · settlement pushes. Settlement is trustless:
 * TxLINE Merkle proofs checked by the program. No oracle. No vote.
 *
 *   BOT_TOKEN=… RPC_URL=http://127.0.0.1:8990 npm run bot
 */
import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import {
  OUTCOMES, ensureFunded, usdcBalance, fetchMarkets, isOpen, impliedPct, multiplier,
  payoutPreview, placeBet, positionsOf, fetchPositions, claim, ownerOf, simConsensus, toUi, Market,
} from "./chain";
import * as store from "./store";
import { startEngine } from "./engine";
import { bookOdds, edgesFor, sourceLabel } from "./txline";
import { agentInfo, AGENT_ID } from "./agent";
import * as fs from "fs";

const token = process.env.BOT_TOKEN;
if (!token) { console.error("BOT_TOKEN missing (bot/.env)"); process.exit(1); }
const bot = new Bot(token);

const label = (m: Market) => `${m.home} v ${m.away}`;
const kickoff = (m: Market) => new Date(m.bettingCloseTs * 1000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Friendly error translation, raw program errors scare people. */
function friendly(e: any): string {
  const s = String(e?.message ?? e);
  if (/insufficient|0x1\b|InsufficientFunds/i.test(s)) return "You're out of USDC. /faucet for a top-up.";
  if (/BettingClosed|MarketNotOpen/i.test(s)) return "That market just closed.";
  if (/already in use/i.test(s)) return "Already done.";
  return s.slice(0, 110);
}

const mainMenu = () => new InlineKeyboard()
  .text("Markets", "markets").text("My book", "pnl").row()
  .text("🤖 Agent", "agent").text("Edge scan", "edge").row()
  .text("Odds orders", "orders").text("Top traders", "toptraders").row()
  .text("Sniper", "snipehelp").text("Help", "help");

// ---------- start / menu / help ----------
bot.command(["start", "menu"], async (ctx) => {
  const u = ctx.from!;
  const name = (u.username ?? u.first_name ?? `trader${u.id}`).slice(0, 18);
  store.addUser(u.id, name);
  await ctx.replyWithChatAction("typing");
  try {
    const bal = await ensureFunded(u.id);
    await ctx.reply(
      `STRIKER · bet the World Cup, settled by proof\n\n` +
      `Wallet ready · ${bal.toFixed(0)} demo USDC\n\n` +
      `Tip: just type a team name ("spain") to bet it.`,
      { reply_markup: mainMenu() }
    );
  } catch (e) {
    await ctx.reply(`Setup hiccup: ${friendly(e)}`);
  }
});

const HELP =
  `HOW STRIKER WORKS\n\n` +
  `Type any team name → its market card → tap to bet. You always see a full receipt (exact payout, fee, proof settlement) before money moves.\n\n` +
  `AGENT: /agent runs a fully autonomous trader — deploy it and it bets the best value edge across all pools every 12s with zero human input. Watch its live decision log.\n\n` +
  `EDGE SCAN: /edge compares what the pool pays against TxLINE bookmaker fair value. When the pool pays more than the books, the crowd is mispricing it, that's your entry.\n\n` +
  `ODDS ORDERS: on any market tap "Odds order", set "fire at ≥ 2.0x" and Striker bets the instant the pool pays that. A limit order, but for football odds.\n\n` +
  `COPY-BETTING: "Top traders" → tap Copy next to anyone, every bet they make is mirrored at your size.\n\n` +
  `SNIPER: /snipe 20 auto-bets new markets seconds after they open (thin pools pay best). /snipe off stops.\n\n` +
  `MONEY: /pnl your book · /claim collect wins · /faucet top up demo USDC · /preset 25 default size\n\n` +
  `Every result is proven by a TxLINE Merkle proof and verified on-chain. Nobody grades your bet. Math does.`;
bot.command("help", (ctx) => ctx.reply(HELP, { reply_markup: mainMenu() }));
bot.callbackQuery("help", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply(HELP, { reply_markup: mainMenu() }); });

// ---------- market browser: ONE message, tap to open ----------
async function marketList(): Promise<{ text: string; kb: InlineKeyboard } | null> {
  const open = (await fetchMarkets()).filter(isOpen);
  if (open.length === 0) return null;
  const kb = new InlineKeyboard();
  open.slice(0, 8).forEach((m) => {
    const best = Math.max(...[0, 1, 2].map((i) => multiplier(m, i)));
    kb.text(`${m.home} v ${m.away} · ${best > 0 ? `up to ${best.toFixed(1)}x` : "new"}`, `mk:${m.matchId}`).row();
  });
  kb.text("↻ Refresh", "markets");
  return { text: `OPEN MARKETS (${open.length})\nTap one to bet:`, kb };
}
async function sendMarkets(ctx: any, edit = false) {
  const list = await marketList();
  if (!list) return ctx.reply("No open markets right now. I'll shout when one opens if you /snipe.");
  if (edit) await ctx.editMessageText(list.text, { reply_markup: list.kb }).catch(() => ctx.reply(list.text, { reply_markup: list.kb }));
  else await ctx.reply(list.text, { reply_markup: list.kb });
}
bot.command("markets", (ctx) => sendMarkets(ctx));
bot.callbackQuery("markets", async (ctx) => { await ctx.answerCallbackQuery(); await sendMarkets(ctx, true); });

// ---------- edge scan: pool payout vs bookmaker fair value ----------
async function edgeScan(): Promise<{ text: string; kb: InlineKeyboard } | null> {
  const open = (await fetchMarkets()).filter(isOpen).filter((m) => m.totalPool > 0);
  if (open.length === 0) return null;
  const rows: { m: Market; line: string; edge: number }[] = [];
  let src = "";
  for (const m of open) {
    const book = await bookOdds(m);
    src = sourceLabel(book);
    const best = edgesFor(m, book, (o) => multiplier(m, o))[0];
    if (!best) continue;
    const name = best.outcome === 0 ? m.home : best.outcome === 2 ? m.away : "Draw";
    const sign = best.edgePct >= 0 ? "+" : "";
    rows.push({
      m,
      edge: best.edgePct,
      line:
        `${label(m)}\n` +
        `  ${name} · pool pays ${best.poolMult.toFixed(2)}x vs fair ${best.fairMult.toFixed(2)}x → ${sign}${best.edgePct.toFixed(0)}%`,
    });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.edge - a.edge);
  const kb = new InlineKeyboard();
  rows.slice(0, 6).forEach((r) => kb.text(`${label(r.m)} ${r.edge >= 15 ? "🔥" : ""} ${r.edge >= 0 ? "+" : ""}${r.edge.toFixed(0)}%`, `mk:${r.m.matchId}`).row());
  kb.text("↻ Rescan", "edge");
  const text =
    `EDGE SCAN · pool vs bookmaker\n` +
    `Where the pool pays more than the bookies' fair price, the crowd is mispricing it.\n\n` +
    rows.slice(0, 6).map((r) => r.line).join("\n\n") +
    `\n\nodds: ${src}`;
  return { text, kb };
}
bot.command("edge", async (ctx) => {
  const s = await edgeScan();
  await ctx.reply(s ? s.text : "No funded open markets to scan yet.", s ? { reply_markup: s.kb } : undefined);
});
bot.callbackQuery("edge", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Scanning…" });
  const s = await edgeScan();
  if (!s) return ctx.reply("No funded open markets to scan yet.");
  await ctx.editMessageText(s.text, { reply_markup: s.kb }).catch(() => ctx.reply(s.text, { reply_markup: s.kb }));
});

// ---------- autonomous agent: status + live decision log ----------
async function agentCard(): Promise<{ text: string; kb: InlineKeyboard }> {
  const info = agentInfo();
  let bal = 0;
  try { bal = await usdcBalance(AGENT_ID); } catch {}
  let tail = "";
  try {
    const lines = fs.readFileSync("striker-decisions.log", "utf8").trim().split("\n").filter((l) => l.includes("[agent]"));
    tail = lines.slice(-6).map((l) => {
      const t = l.slice(11, 19); // HH:MM:SS
      const msg = l.split("] ").slice(1).join("] ");
      return `${t}  ${msg}`;
    }).join("\n");
  } catch {}
  const text =
    `AUTONOMOUS AGENT ${info.enabled ? "● running" : "○ off"}\n` +
    `Deploys and trades on its own — no human input. Every 12s it scans all pools and stakes the best value bet vs bookmaker fair odds.\n\n` +
    `Wallet   ${info.wallet.slice(0, 8)}…\n` +
    `Balance  ${bal.toFixed(0)} demo USDC\n` +
    `Rule     bet ≥ +${info.minEdge}% edge · ${info.stake} USDC/bet\n` +
    `Bets     ${info.betsPlaced} placed this run\n\n` +
    (tail ? `DECISION LOG (live)\n${tail}` : `Warming up — first scan within 12s…`);
  const kb = new InlineKeyboard().text("↻ Refresh", "agent").text("Edge scan", "edge").row().text("← Menu", "menu");
  return { text, kb };
}
bot.command("agent", async (ctx) => { const c = await agentCard(); await ctx.reply(c.text, { reply_markup: c.kb }); });
bot.callbackQuery("agent", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Reading decision log…" });
  const c = await agentCard();
  await ctx.editMessageText(c.text, { reply_markup: c.kb }).catch(() => ctx.reply(c.text, { reply_markup: c.kb }));
});

async function marketCard(m: Market): Promise<{ text: string; kb: InlineKeyboard }> {
  const pct = impliedPct(m.pools);
  const mults = [0, 1, 2].map((i) => multiplier(m, i));
  const book = await bookOdds(m);
  const line = (name: string, i: number) => {
    const base = `${name.padEnd(6)} ${m.totalPool === 0 ? "  new" : pct[i].toFixed(0).padStart(4) + "%"}   ${mults[i] ? mults[i].toFixed(2) + "x" : "–"}`;
    return `${base}   bk ${book.decimal[i].toFixed(2)}`;
  };
  const best = edgesFor(m, book, (o) => multiplier(m, o))[0];
  const edgeLine = best && best.edgePct >= 10
    ? `\n\n🔥 ${best.outcome === 0 ? m.home : best.outcome === 2 ? m.away : "Draw"} pays +${best.edgePct.toFixed(0)}% over bookie fair value`
    : "";
  const text =
    `${label(m)}\ncloses ${kickoff(m)} · pool ${toUi(m.totalPool).toFixed(0)} USDC\n\n` +
    `${line("Home", 0)}\n${line("Draw", 1)}\n${line("Away", 2)}` +
    edgeLine +
    `\n\nbk = ${sourceLabel(book)}`;
  const kb = new InlineKeyboard()
    .text(m.home, `bet:${m.matchId}:0`).text("Draw", `bet:${m.matchId}:1`).text(m.away, `bet:${m.matchId}:2`).row()
    .text("Odds order", `oo:${m.matchId}`).text("Intel", `intel:${m.matchId}`).row()
    .text("← All markets", "markets");
  return { text, kb };
}
bot.callbackQuery(/^mk:(\d+)$/, async (ctx) => {
  const m = (await fetchMarkets()).find((x) => x.matchId === Number(ctx.match![1]));
  await ctx.answerCallbackQuery();
  if (!m || !isOpen(m)) return ctx.reply("That market just closed. /markets");
  const { text, kb } = await marketCard(m);
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => ctx.reply(text, { reply_markup: kb }));
});

// ---------- team-name lookup ----------
bot.on("message:text", async (ctx, next) => {
  const q = ctx.message.text.trim().toLowerCase();
  if (q.startsWith("/")) return next();
  const open = (await fetchMarkets()).filter(isOpen);
  const hits = open.filter((m) => m.home.toLowerCase().includes(q) || m.away.toLowerCase().includes(q)).slice(0, 3);
  if (hits.length === 0) return ctx.reply(`No open market matches "${ctx.message.text.trim()}".`, { reply_markup: new InlineKeyboard().text("See all markets", "markets") });
  for (const hit of hits) {
    const { text, kb } = await marketCard(hit);
    await ctx.reply(text, { reply_markup: kb });
  }
});

// ---------- bet flow: size → receipt → execute ----------
bot.callbackQuery(/^bet:(\d+):([012])$/, async (ctx) => {
  const [, mid, o] = ctx.match!;
  const preset = store.getPreset(ctx.from!.id);
  const kb = new InlineKeyboard();
  [preset, 25, 100, 250].filter((v, i, a) => a.indexOf(v) === i).forEach((v) => kb.text(`${v} USDC`, `recv:${mid}:${o}:${v}`));
  kb.row().text("← Back", `mk:${mid}`);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`How much on ${OUTCOMES[Number(o)]}?`, { reply_markup: kb }).catch(() => ctx.reply(`How much on ${OUTCOMES[Number(o)]}?`, { reply_markup: kb }));
});

bot.callbackQuery(/^recv:(\d+):([012]):(\d+)$/, async (ctx) => {
  const [, mid, o, amt] = ctx.match!;
  const m = (await fetchMarkets()).find((x) => x.matchId === Number(mid));
  if (!m || !isOpen(m)) { await ctx.answerCallbackQuery({ text: "Market closed." }); return; }
  const { payout, mult } = payoutPreview(m, Number(o), Number(amt));
  const book = await bookOdds(m);
  const fairMult = 1 / book.fair[Number(o)];
  const edge = mult > 0 ? (mult / fairMult - 1) * 100 : 0;
  await ctx.answerCallbackQuery();
  const text =
    `PRE-BET RECEIPT\n` +
    `${label(m)} · ${OUTCOMES[Number(o)]}\n\n` +
    `Stake        ${amt} USDC\n` +
    `If it wins   ${payout.toFixed(2)} USDC (${mult.toFixed(2)}x)\n` +
    `Bookie fair  ${fairMult.toFixed(2)}x → you're ${edge >= 0 ? "+" : ""}${edge.toFixed(0)}% vs the books\n` +
    `Fee          ${m.feeBps / 100}% of pool at settlement\n` +
    `Settlement   TxLINE proof, verified on-chain\n` +
    `Voids        full refund`;
  const kb = new InlineKeyboard().text("✓ Confirm", `exec:${mid}:${o}:${amt}`).text("Cancel", `mk:${mid}`);
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => ctx.reply(text, { reply_markup: kb }));
});

bot.callbackQuery(/^exec:(\d+):([012]):(\d+)$/, async (ctx) => {
  const [, mid, o, amt] = ctx.match!;
  const u = ctx.from!;
  const m = (await fetchMarkets()).find((x) => x.matchId === Number(mid));
  if (!m || !isOpen(m)) { await ctx.answerCallbackQuery({ text: "Market closed." }); return; }
  await ctx.answerCallbackQuery({ text: "Placing bet…" });
  try {
    await ensureFunded(u.id);
    const sig = await placeBet(u.id, m, Number(o), Number(amt));
    const bal = await usdcBalance(u.id);
    await ctx.editMessageText(
      `BET PLACED ✓\n${label(m)} · ${OUTCOMES[Number(o)]} · ${amt} USDC\n` +
      `${sig.slice(0, 10)}… · balance ${bal.toFixed(0)} USDC\n` +
      `Settles by proof at full time. I'll message you.`,
      { reply_markup: new InlineKeyboard().text("More markets", "markets").text("My book", "pnl") }
    );
  } catch (e) {
    await ctx.reply(`Bet failed: ${friendly(e)}`);
  }
});

// ---------- odds orders ----------
bot.callbackQuery(/^oo:(\d+)$/, async (ctx) => {
  const [, mid] = ctx.match!;
  const kb = new InlineKeyboard().text("Home", `oo2:${mid}:0`).text("Draw", `oo2:${mid}:1`).text("Away", `oo2:${mid}:2`).row().text("← Back", `mk:${mid}`);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Odds order, which outcome should I watch?", { reply_markup: kb }).catch(() => {});
});
bot.callbackQuery(/^oo2:(\d+):([012])$/, async (ctx) => {
  const [, mid, o] = ctx.match!;
  const preset = store.getPreset(ctx.from!.id);
  const kb = new InlineKeyboard();
  [1.5, 2, 3, 5].forEach((x) => kb.text(`≥ ${x.toFixed(1)}x`, `oo3:${mid}:${o}:${x}`));
  kb.row().text("← Back", `oo:${mid}`);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `Fire ${preset} USDC on ${OUTCOMES[Number(o)]} when the pool pays at least: (size = your /preset)`,
    { reply_markup: kb }
  ).catch(() => {});
});
bot.callbackQuery(/^oo3:(\d+):([012]):([\d.]+)$/, async (ctx) => {
  const [, mid, o, x] = ctx.match!;
  const u = ctx.from!;
  const amount = store.getPreset(u.id);
  const id = store.addOrder({ tgId: u.id, matchId: Number(mid), outcome: Number(o), minMult: Number(x), amount });
  await ctx.answerCallbackQuery({ text: "Armed." });
  await ctx.editMessageText(
    `ODDS ORDER #${id} armed ✓\n${OUTCOMES[Number(o)]} at ≥ ${Number(x).toFixed(2)}x → ${amount} USDC.\nI watch the pool every 12s and fire the moment it crosses.`,
    { reply_markup: new InlineKeyboard().text("My orders", "orders").text("Markets", "markets") }
  ).catch(() => {});
});
async function sendOrders(ctx: any) {
  const orders = store.listOrders(ctx.from!.id);
  if (orders.length === 0) return ctx.reply("No odds orders armed. Open a market → Odds order.", { reply_markup: new InlineKeyboard().text("Markets", "markets") });
  const markets = await fetchMarkets();
  for (const o of orders) {
    const m = markets.find((x) => x.matchId === o.matchId);
    const cur = m ? multiplier(m, o.outcome) : 0;
    await ctx.reply(
      `#${o.id} ${m ? label(m) : o.matchId} · ${OUTCOMES[o.outcome]}\nfire ≥ ${o.minMult.toFixed(2)}x · now ${cur ? cur.toFixed(2) + "x" : "–"} · ${o.amount} USDC`,
      { reply_markup: new InlineKeyboard().text("Cancel order", `oox:${o.id}`) }
    );
  }
}
bot.command("orders", sendOrders);
bot.callbackQuery("orders", async (ctx) => { await ctx.answerCallbackQuery(); await sendOrders(ctx); });
bot.callbackQuery(/^oox:(\d+)$/, async (ctx) => {
  store.removeOrder(Number(ctx.match![1]));
  await ctx.answerCallbackQuery({ text: "Cancelled" });
  await ctx.deleteMessage().catch(() => {});
});

// ---------- top traders + one-tap copy ----------
async function sendTopTraders(ctx: any) {
  await ctx.replyWithChatAction("typing");
  const [positions, markets] = await Promise.all([fetchPositions(), fetchMarkets()]);
  const byOwner = new Map<string, { staked: number; ret: number; bets: number }>();
  for (const p of positions) {
    const m = markets.find((x) => x.pubkey.equals(p.market));
    if (!m) continue;
    const row = byOwner.get(p.owner) ?? { staked: 0, ret: 0, bets: 0 };
    row.staked += toUi(p.totalStake);
    row.bets += 1;
    if (m.status === "settled" && m.finalOutcome < 3 && p.stakes[m.finalOutcome] > 0) {
      row.ret += toUi((p.stakes[m.finalOutcome] / m.pools[m.finalOutcome]) * m.totalPool * (1 - m.feeBps / 10000));
    } else if (m.status === "voided") {
      row.ret += toUi(p.totalStake);
    }
    byOwner.set(p.owner, row);
  }
  const me = ownerOf(ctx.from!.id).toBase58();
  const top = [...byOwner.entries()]
    .filter(([o]) => o !== me)
    .map(([o, r]) => ({ owner: o, pnl: r.ret - r.staked, ...r }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 5);
  if (top.length === 0) return ctx.reply("No other bettors on the tape yet.");
  for (const t of top) {
    await ctx.reply(
      `${t.owner.slice(0, 4)}…${t.owner.slice(-4)}\n${t.bets} bets · ${t.staked.toFixed(0)} staked · PnL ${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(1)} USDC`,
      { reply_markup: new InlineKeyboard().text(`Copy at ${store.getPreset(ctx.from!.id)} USDC/bet`, `cp:${t.owner}`) }
    );
  }
}
bot.command("toptraders", sendTopTraders);
bot.callbackQuery("toptraders", async (ctx) => { await ctx.answerCallbackQuery(); await sendTopTraders(ctx); });
bot.callbackQuery(/^cp:([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (ctx) => {
  const target = ctx.match![1];
  store.addFollow({ tgId: ctx.from!.id, target, amount: store.getPreset(ctx.from!.id) });
  await ctx.answerCallbackQuery({ text: "Copying." });
  await ctx.reply(`Copying ${target.slice(0, 6)}…, every bet they make is mirrored at ${store.getPreset(ctx.from!.id)} USDC within seconds. /follows to manage.`);
});
bot.command("copy", async (ctx) => {
  const [, target, size] = ctx.message!.text.split(/\s+/);
  if (!target) return ctx.reply("Usage: /copy <wallet> [size], or use Top traders for one-tap copy.", { reply_markup: new InlineKeyboard().text("Top traders", "toptraders") });
  const amount = Number(size) || store.getPreset(ctx.from!.id);
  store.addFollow({ tgId: ctx.from!.id, target, amount });
  await ctx.reply(`Copying ${target.slice(0, 6)}… at ${amount} USDC per bet.`);
});
bot.command("follows", async (ctx) => {
  const fs = store.listFollows(ctx.from!.id);
  if (fs.length === 0) return ctx.reply("Not copying anyone.", { reply_markup: new InlineKeyboard().text("Top traders", "toptraders") });
  await ctx.reply(fs.map((f) => `${f.target.slice(0, 8)}… · ${f.amount} USDC`).join("\n") + "\n\n/uncopy <wallet> to stop.");
});
bot.command("uncopy", async (ctx) => {
  const [, target] = ctx.message!.text.split(/\s+/);
  if (!target) return ctx.reply("Usage: /uncopy <wallet>");
  store.removeFollow(ctx.from!.id, target);
  await ctx.reply("Stopped.");
});

// ---------- sniper ----------
const SNIPE_HELP = "SNIPER\n/snipe 20 – auto-bet 20 USDC the second a new market opens (thin pools pay best)\n/snipe – alerts only\n/snipe off – stop";
bot.callbackQuery("snipehelp", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply(SNIPE_HELP); });
bot.command("snipe", async (ctx) => {
  const [, arg] = ctx.message!.text.split(/\s+/);
  if (arg === "off") { store.clearSniper(ctx.from!.id); return ctx.reply("Sniper off."); }
  const auto = arg ? Number(arg) : null;
  if (arg && (!auto || auto <= 0)) return ctx.reply(SNIPE_HELP);
  store.setSniper(ctx.from!.id, auto);
  await ctx.reply(auto ? `Sniper armed: ${auto} USDC on every new market, the second it opens.` : "Sniper alerts on.");
});

// ---------- pnl / claim / faucet / preset / intel ----------
async function sendPnl(ctx: any) {
  await ctx.replyWithChatAction("typing");
  const u = ctx.from!;
  const [positions, markets, bal] = await Promise.all([positionsOf(u.id), fetchMarkets(), usdcBalance(u.id)]);
  if (positions.length === 0) return ctx.reply(`No positions yet. Balance ${bal.toFixed(0)} USDC.\nType a team name to place your first bet.`, { reply_markup: new InlineKeyboard().text("Markets", "markets") });
  const lines: string[] = [];
  let staked = 0, credited = 0, live = 0, claimable = false;
  for (const p of positions) {
    const m = markets.find((x) => x.pubkey.equals(p.market));
    if (!m) continue;
    staked += toUi(p.totalStake);
    if (m.status === "settled" && m.finalOutcome < 3) {
      const winStake = p.stakes[m.finalOutcome];
      if (winStake > 0) {
        const share = (winStake / m.pools[m.finalOutcome]) * m.totalPool * (1 - m.feeBps / 10000);
        credited += toUi(share);
        if (!p.claimed) claimable = true;
        lines.push(`W  ${label(m)}  +${toUi(share).toFixed(1)}${p.claimed ? "" : "  ← claim"}`);
      } else lines.push(`L  ${label(m)}  -${toUi(p.totalStake).toFixed(1)}`);
    } else if (m.status === "voided") {
      credited += toUi(p.totalStake);
      if (!p.claimed) claimable = true;
      lines.push(`V  ${label(m)}  refund${p.claimed ? "" : "  ← claim"}`);
    } else {
      live += toUi(p.totalStake);
      lines.push(`·  ${label(m)}  ${toUi(p.totalStake).toFixed(0)} riding`);
    }
  }
  const realized = credited - (staked - live);
  const kb = new InlineKeyboard();
  if (claimable) kb.text("Claim all", "claim");
  kb.text("Markets", "markets");
  await ctx.reply(
    `YOUR BOOK\n${lines.join("\n")}\n\nStaked ${staked.toFixed(0)} · riding ${live.toFixed(0)} · realized ${realized >= 0 ? "+" : ""}${realized.toFixed(1)}\nBalance ${bal.toFixed(0)} USDC`,
    { reply_markup: kb }
  );
}
bot.command("pnl", sendPnl);
bot.callbackQuery("pnl", async (ctx) => { await ctx.answerCallbackQuery(); await sendPnl(ctx); });

async function doClaim(ctx: any) {
  const u = ctx.from!;
  const [positions, markets] = await Promise.all([positionsOf(u.id), fetchMarkets()]);
  let n = 0;
  for (const p of positions.filter((p) => !p.claimed)) {
    const m = markets.find((x) => x.pubkey.equals(p.market));
    if (!m || (m.status !== "settled" && m.status !== "voided")) continue;
    const winnable = m.status === "voided" ? p.totalStake > 0 : m.finalOutcome < 3 && p.stakes[m.finalOutcome] > 0;
    if (!winnable) continue;
    try { await claim(u.id, m); n++; } catch { /* nothing */ }
  }
  const bal = await usdcBalance(u.id);
  await ctx.reply(n ? `Claimed ${n} position${n > 1 ? "s" : ""} ✓ Balance ${bal.toFixed(0)} USDC.` : `Nothing to claim. Balance ${bal.toFixed(0)} USDC.`);
}
bot.command("claim", doClaim);
bot.callbackQuery("claim", async (ctx) => { await ctx.answerCallbackQuery({ text: "Claiming…" }); await doClaim(ctx); });

bot.command("faucet", async (ctx) => {
  await ctx.replyWithChatAction("typing");
  try {
    const bal = await ensureFunded(ctx.from!.id);
    await ctx.reply(`Topped up. Balance ${bal.toFixed(0)} demo USDC.`);
  } catch (e) { await ctx.reply(friendly(e)); }
});

bot.callbackQuery(/^intel:(\d+)$/, async (ctx) => {
  const m = (await fetchMarkets()).find((x) => x.matchId === Number(ctx.match![1]));
  if (!m) { await ctx.answerCallbackQuery(); return; }
  const pool = impliedPct(m.pools);
  const cons = simConsensus(m.matchId);
  const edge = [0, 1, 2].map((i) => cons[i] - pool[i]);
  const best = edge.indexOf(Math.max(...edge));
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `MATCH INTEL · ${label(m)}\n` +
    `        pool   consensus*\n` +
    OUTCOMES.map((o, i) => `${o.padEnd(5)} ${m.totalPool === 0 ? "  new" : pool[i].toFixed(0).padStart(4) + "%"}   ${cons[i].toFixed(0).padStart(5)}%`).join("\n") +
    `\n\nEdge: ${OUTCOMES[best]}, priced ${Math.abs(edge[best]).toFixed(0)} pts ${edge[best] > 0 ? "below" : "above"} consensus here.\n` +
    `*simulated consensus (live TxODDS odds pending token activation)`,
    { reply_markup: new InlineKeyboard().text("Bet it", `bet:${m.matchId}:${best}`).text("← Market", `mk:${m.matchId}`) }
  );
});

bot.command("preset", async (ctx) => {
  const [, v] = ctx.message!.text.split(/\s+/);
  const n = Number(v);
  if (!n || n <= 0) return ctx.reply(`Current preset: ${store.getPreset(ctx.from!.id)} USDC. Usage: /preset 25`);
  store.setPreset(ctx.from!.id, n);
  await ctx.reply(`Preset bet size: ${n} USDC ✓`);
});

// ---------- boot ----------
bot.catch((err) => console.error("bot error:", err.error));
bot.api.setMyCommands([
  { command: "menu", description: "Main menu" },
  { command: "markets", description: "Open markets" },
  { command: "edge", description: "Pool vs bookmaker value scan" },
  { command: "agent", description: "Autonomous trading agent + live log" },
  { command: "pnl", description: "Your book and balance" },
  { command: "orders", description: "Your odds orders" },
  { command: "toptraders", description: "Leaderboard, one-tap copy" },
  { command: "snipe", description: "Auto-bet new markets" },
  { command: "claim", description: "Collect wins and refunds" },
  { command: "faucet", description: "Top up demo USDC" },
  { command: "preset", description: "Default bet size" },
  { command: "help", description: "How Striker works" },
]).catch(() => {});
bot.start({ onStart: (me) => { console.log(`@${me.username} is live`); startEngine(bot.api); } });
