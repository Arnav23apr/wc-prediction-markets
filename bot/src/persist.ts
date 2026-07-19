/**
 * Worker persistence: the bot's state lives in one JSON blob in Cloudflare KV.
 * We hydrate it into module memory at the start of each invocation and flush it
 * back after, which lets store.ts / chain.ts keep their synchronous APIs so the
 * 25 command handlers don't need to change.
 */
import type { Data } from "./store";

const EMPTY: Data = {
  users: {}, orders: [], nextOrderId: 1, follows: [], snipers: {},
  knownMarkets: [], copySeen: {}, settledNotified: [],
};

interface Mem {
  store: Data;
  keys: Record<string, number[]>; // tgId -> secret key bytes (custodial demo wallets)
  log: string[];                  // agent + engine decision log (ring buffer)
}

export const mem: Mem = { store: structuredClone(EMPTY), keys: {}, log: [] };

let dirty = false;
export const markDirty = () => { dirty = true; };

const KEY = "striker-mem";

// `storage` is a Durable Object's transactional storage (strongly consistent,
// read-your-writes). We keep one blob under a single key.
export async function hydrate(storage: any): Promise<void> {
  try {
    const raw = (await storage.get(KEY)) as Mem | undefined;
    mem.store = raw?.store ?? structuredClone(EMPTY);
    mem.keys = raw?.keys ?? {};
    mem.log = raw?.log ?? [];
  } catch {
    mem.store = structuredClone(EMPTY);
    mem.keys = {};
    mem.log = [];
  }
  dirty = false;
}

export async function flush(storage: any, force = false): Promise<void> {
  if (!dirty && !force) return;
  if (mem.log.length > 300) mem.log.splice(0, mem.log.length - 300);
  await storage.put(KEY, { store: mem.store, keys: mem.keys, log: mem.log });
  dirty = false;
}
