import { ensureFunded, fetchMarkets, isOpen, placeBet, positionsOf, usdcBalance, payoutPreview } from "./chain";
(async () => {
  const bal = await ensureFunded(888001);
  console.log("funded, balance:", bal);
  const open = (await fetchMarkets()).filter(isOpen);
  console.log("open markets:", open.map(m => `${m.matchId} ${m.home} v ${m.away}`));
  if (open.length) {
    const m = open[0];
    console.log("preview 10 on Home:", payoutPreview(m, 0, 10));
    const sig = await placeBet(888001, m, 0, 10);
    console.log("bet placed:", sig.slice(0, 12));
    console.log("positions:", (await positionsOf(888001)).length, "balance:", await usdcBalance(888001));
  }
  console.log("SMOKE PASS");
})().catch(e => { console.error("SMOKE FAIL:", e.message); process.exit(1); });
