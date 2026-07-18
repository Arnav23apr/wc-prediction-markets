/**
 * Flat-file store: users, bet-size presets, odds orders, copy-betting follows,
 * sniper subscriptions, and notification bookkeeping for the engine loop.
 */
import * as fs from "fs";
import * as path from "path";

const FILE = path.resolve(__dirname, "../.store.json");

export interface OddsOrder {
  id: number;
  tgId: number;
  matchId: number;
  outcome: number;
  minMult: number;   // fire when current multiplier >= this
  amount: number;    // UI USDC
}
export interface Follow {
  tgId: number;
  target: string;    // wallet base58 being copied
  amount: number;    // fixed size per mirrored bet
}

interface Data {
  users: Record<string, { name: string; preset: number }>;
  orders: OddsOrder[];
  nextOrderId: number;
  follows: Follow[];
  snipers: Record<string, { auto: number | null }>;  // tgId -> auto-bet size (null = alert only)
  knownMarkets: number[];                             // matchIds engine has seen
  copySeen: Record<string, number>;                   // `${owner}:${matchId}:${outcome}` -> stake seen
  settledNotified: number[];                          // matchIds users were told about
}

function load(): Data {
  if (!fs.existsSync(FILE)) {
    return { users: {}, orders: [], nextOrderId: 1, follows: [], snipers: {}, knownMarkets: [], copySeen: {}, settledNotified: [] };
  }
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}
function save(d: Data) { fs.writeFileSync(FILE, JSON.stringify(d, null, 1)); }

export const addUser = (tgId: number, name: string) => { const d = load(); d.users[tgId] = { name, preset: d.users[tgId]?.preset ?? 10 }; save(d); };
export const allUsers = () => Object.keys(load().users).map(Number);
export const getPreset = (tgId: number) => load().users[tgId]?.preset ?? 10;
export const setPreset = (tgId: number, v: number) => { const d = load(); if (d.users[tgId]) { d.users[tgId].preset = v; save(d); } };
export const nameOf = (tgId: number) => load().users[tgId]?.name ?? String(tgId);

export const addOrder = (o: Omit<OddsOrder, "id">) => { const d = load(); const id = d.nextOrderId++; d.orders.push({ ...o, id }); save(d); return id; };
export const listOrders = (tgId?: number) => load().orders.filter((o) => tgId === undefined || o.tgId === tgId);
export const removeOrder = (id: number) => { const d = load(); d.orders = d.orders.filter((o) => o.id !== id); save(d); };

export const addFollow = (f: Follow) => { const d = load(); d.follows = d.follows.filter((x) => !(x.tgId === f.tgId && x.target === f.target)); d.follows.push(f); save(d); };
export const listFollows = (tgId?: number) => load().follows.filter((f) => tgId === undefined || f.tgId === tgId);
export const removeFollow = (tgId: number, target: string) => { const d = load(); d.follows = d.follows.filter((x) => !(x.tgId === tgId && x.target === target)); save(d); };

export const setSniper = (tgId: number, auto: number | null) => { const d = load(); d.snipers[tgId] = { auto }; save(d); };
export const clearSniper = (tgId: number) => { const d = load(); delete d.snipers[tgId]; save(d); };
export const listSnipers = () => Object.entries(load().snipers).map(([id, v]) => ({ tgId: Number(id), auto: v.auto }));

export const knownMarkets = () => new Set(load().knownMarkets);
export const rememberMarkets = (ids: number[]) => { const d = load(); d.knownMarkets = Array.from(new Set([...d.knownMarkets, ...ids])); save(d); };

export const copySeen = (key: string) => load().copySeen[key] ?? 0;
export const setCopySeen = (key: string, stake: number) => { const d = load(); d.copySeen[key] = stake; save(d); };

export const settledNotified = () => new Set(load().settledNotified);
export const markSettled = (id: number) => { const d = load(); if (!d.settledNotified.includes(id)) d.settledNotified.push(id); save(d); };
