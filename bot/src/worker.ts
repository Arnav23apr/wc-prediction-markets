/**
 * Striker on Cloudflare Workers, backed by a single Durable Object.
 *
 *   Worker.fetch      -> forwards the Telegram webhook + /setup to the DO
 *   Worker.scheduled  -> pokes the DO once a minute to run the engine + agent
 *   BotDO             -> owns all state (strongly consistent, read-your-writes),
 *                        runs grammY for updates and the engine on ticks
 *
 * The DO gives us reliable read-your-writes state, which KV could not: the
 * agent's keypair and decision log must accumulate across cron ticks.
 */

let inited = false;

async function boot(env: any) {
  (globalThis as any).__BOT_TOKEN = env.BOT_TOKEN;
  const chain = await import("./chain");
  chain.initChain({ RPC_URL: env.RPC_URL, USDC_MINT: env.USDC_MINT, ADMIN_SECRET: env.ADMIN_SECRET });
  const persist = await import("./persist");
  const engine = await import("./engine");
  const agent = await import("./agent");
  const { bot, registerCommands } = await import("./bot");
  if (!inited) {
    try { await bot.init(); } catch { /* api still usable for sends */ }
    inited = true;
  }
  return { persist, engine, agent, bot, registerCommands };
}

export class BotDO {
  state: any;
  env: any;
  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { persist, engine, agent, bot, registerCommands } = await boot(this.env);
    await persist.hydrate(this.state.storage);

    let res = new Response("ok");
    try {
      if (url.pathname === "/webhook") {
        const update = await request.json();
        try { await bot.handleUpdate(update as any); } catch (e: any) { console.error("handleUpdate:", e?.message ?? e); }
      } else if (url.pathname === "/tick") {
        try { await engine.tick(bot.api); } catch (e: any) { console.error("tick:", e?.message ?? e); }
        try { await agent.agentTick(); } catch (e: any) { console.error("agent:", e?.message ?? e); }
        res = new Response("ticked");
      } else if (url.pathname === "/setup") {
        await registerCommands();
        const hook = `${this.env.PUBLIC_URL}/webhook/${this.env.WEBHOOK_SECRET}`;
        const r = await fetch(`https://api.telegram.org/bot${this.env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(hook)}&drop_pending_updates=true`);
        res = new Response(await r.text(), { headers: { "content-type": "application/json" } });
      }
    } finally {
      await persist.flush(this.state.storage, true);
    }
    return res;
  }
}

function stub(env: any) {
  return env.BOT_DO.get(env.BOT_DO.idFromName("striker"));
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("striker ok");

    if (url.pathname === "/setup") {
      return stub(env).fetch(new Request("https://do/setup"));
    }
    if (url.pathname === `/webhook/${env.WEBHOOK_SECRET}` && request.method === "POST") {
      const body = await request.text();
      return stub(env).fetch(new Request("https://do/webhook", { method: "POST", body, headers: { "content-type": "application/json" } }));
    }
    return new Response("Striker is live. Message @tx0ddsbot on Telegram.");
  },

  async scheduled(_event: any, env: any): Promise<void> {
    await stub(env).fetch(new Request("https://do/tick"));
  },
};
