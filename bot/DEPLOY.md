# Striker: hosting and operating

Striker runs on Cloudflare, so it is always on and independent of any laptop.

- **Worker:** `striker-bot` at `https://striker-bot.arnav23apr.workers.dev`
- **Telegram:** [@tx0ddsbot](https://t.me/tx0ddsbot)
- **State:** a single Durable Object (`BotDO`) with strong, read-your-writes
  consistency. It holds the users, the custodial wallets, and the agent's
  decision log, so state survives across cron ticks and cold starts.
- **Two entry points:**
  - `fetch` receives the Telegram webhook and replies to commands.
  - `scheduled` (cron, every minute) pokes the Durable Object to run the engine
    and the autonomous agent.
- **RPC:** `solana-devnet.api.onfinality.io`, chosen because it accepts requests
  from Cloudflare's egress (the public `api.devnet.solana.com` blocks it).
- **Anchor at the edge:** works with a lightweight custom wallet (the Node wallet
  is filesystem based and undefined in a Worker bundle), and transactions are
  confirmed by HTTP polling since Workers have no websocket for the usual confirm
  path.

## Rotate the bot token (do this before judging)

The token was exposed in a public repo, so rotate it, then point the new token at
the worker. Three steps:

1. In BotFather, send `/revoke`, pick @tx0ddsbot, and copy the new token.
2. Update the secret and re-point the webhook:

   ```bash
   cd bot
   printf '%s' 'NEW_TOKEN_HERE' | npx wrangler secret put BOT_TOKEN
   curl https://striker-bot.arnav23apr.workers.dev/setup
   ```

That is it. The Durable Object, the agent, and the cron keep running. `/setup`
re-registers the command menu and re-points Telegram at the worker with the new
token.

## Config

Set as Wrangler vars (in `wrangler.toml`) and secrets:

| Name | Kind | Purpose |
|---|---|---|
| `RPC_URL` | var | Solana devnet RPC that accepts Cloudflare egress |
| `USDC_MINT` | var | demo USDC mint the markets use |
| `PUBLIC_URL` | var | the worker's own URL, used to set the webhook |
| `BOT_TOKEN` | secret | the Telegram bot token |
| `ADMIN_SECRET` | secret | the demo admin keypair (funds custodial wallets) |
| `WEBHOOK_SECRET` | secret | random path segment so only Telegram can post updates |

## Deploy

```bash
cd bot
npx wrangler deploy
curl https://striker-bot.arnav23apr.workers.dev/setup   # first time, or after a token change
```

## Local development

The bot still runs as a normal long-polling process for local work:

```bash
cd bot
RUN_POLLING=1 BOT_TOKEN=... RPC_URL=... npx ts-node -r dotenv/config --transpile-only src/bot.ts
```
