import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as crypto from "crypto";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

const idl = JSON.parse(fs.readFileSync("target/idl/prediction_market.json", "utf-8"));
const usdc = (n: number) => new BN(Math.round(n * 1e6));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- off-chain mirror of merkle.rs (sha256, domain-separated, i64 LE) ---
const sha256 = (...bufs: Buffer[]) => crypto.createHash("sha256").update(Buffer.concat(bufs)).digest();
const i64le = (n: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
const LEAF = Buffer.from([0x00]);
const NODE = Buffer.from([0x01]);
type Stat = { key: number; value: number; period: number };
const leafHash = (s: Stat) => sha256(LEAF, i64le(s.key), i64le(s.value), i64le(s.period));
const nodeHash = (l: Buffer, r: Buffer) => sha256(NODE, l, r);
type PNode = { hash: number[]; isRightSibling: boolean };
const node = (h: Buffer, right: boolean): PNode => ({ hash: Array.from(h), isRightSibling: right });
const toStat = (s: Stat) => ({ key: new BN(s.key), value: new BN(s.value), period: new BN(s.period) });

describe("merkle-verified settlement", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider) as any;
  const admin = provider.wallet as anchor.Wallet;

  let usdcMint: PublicKey;
  let treasuryAta: PublicKey;
  const A = Keypair.generate(); // bets HOME (winner)
  const B = Keypair.generate(); // bets AWAY (loser)
  let ataA: PublicKey, ataB: PublicKey;

  const registry = PublicKey.findProgramAddressSync([Buffer.from("root_registry")], program.programId)[0];
  const marketPda = (id: BN) =>
    PublicKey.findProgramAddressSync([Buffer.from("market"), id.toArrayLike(Buffer, "le", 8)], program.programId)[0];
  const vaultPda = (m: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("vault"), m.toBuffer()], program.programId)[0];
  const posPda = (m: PublicKey, o: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("position"), m.toBuffer(), o.toBuffer()], program.programId)[0];

  // Build a tree where home(2) and away(1) goals prove to one batch root.
  const home: Stat = { key: 1, value: 2, period: 0 };
  const away: Stat = { key: 2, value: 1, period: 0 };
  const subSibling = crypto.randomBytes(32);
  const mainSibling = crypto.randomBytes(32);
  const eventRoot = nodeHash(leafHash(home), leafHash(away)); // home left, away right
  const subRoot = nodeHash(eventRoot, subSibling);
  const batchRoot = nodeHash(mainSibling, subRoot);
  const homeProof = [node(leafHash(away), true)]; // away is right sibling of home
  const awayProof = [node(leafHash(home), false)]; // home is left sibling of away
  const subTreeProof = [node(subSibling, true)];
  const mainTreeProof = [node(mainSibling, false)];

  before(async () => {
    usdcMint = await createMint(provider.connection, admin.payer, admin.publicKey, null, 6);
    treasuryAta = (await getOrCreateAssociatedTokenAccount(provider.connection, admin.payer, usdcMint, admin.publicKey)).address;
    for (const kp of [A, B]) {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL), "confirmed");
    }
    ataA = (await getOrCreateAssociatedTokenAccount(provider.connection, admin.payer, usdcMint, A.publicKey)).address;
    ataB = (await getOrCreateAssociatedTokenAccount(provider.connection, admin.payer, usdcMint, B.publicKey)).address;
    await mintTo(provider.connection, admin.payer, usdcMint, ataA, admin.payer, BigInt(usdc(1000).toString()));
    await mintTo(provider.connection, admin.payer, usdcMint, ataB, admin.payer, BigInt(usdc(1000).toString()));

    // Registry: admin is the root authority; publish the batch root.
    try {
      await program.methods.initRootRegistry(admin.publicKey)
        .accounts({ payer: admin.publicKey, registry, systemProgram: SystemProgram.programId }).rpc();
    } catch (_) { /* already initialised on this validator */ }
    await program.methods.setScoreRoot(Array.from(batchRoot))
      .accounts({ registry, authority: admin.publicKey }).rpc();
  });

  const newMarket = async () => {
    const id = new BN(7000 + Math.floor(Math.random() * 100000));
    const market = marketPda(id);
    const vault = vaultPda(market);
    const closeTs = new BN(Math.floor(Date.now() / 1000) + 3);
    await program.methods
      .initializeMarket(id, closeTs, new BN(1), 200, admin.publicKey, admin.publicKey, "Brazil", "Spain")
      .accounts({ authority: admin.publicKey, market, usdcMint, vault, treasury: treasuryAta, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    return { market, vault };
  };

  const bet = (market: PublicKey, vault: PublicKey, who: Keypair, ata: PublicKey, outcome: number, amt: BN) =>
    program.methods.placeBet(outcome, amt)
      .accounts({ bettor: who.publicKey, market, position: posPda(market, who.publicKey), vault, bettorTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([who]).rpc();

  it("settles from a verified TxLINE Merkle proof (home win) and pays out", async () => {
    const { market, vault } = await newMarket();
    await bet(market, vault, A, ataA, 0, usdc(100)); // HOME
    await bet(market, vault, B, ataB, 2, usdc(300)); // AWAY
    await sleep(3500);

    await program.methods
      .commitResultVerified(toStat(home), toStat(away), homeProof, awayProof, subTreeProof, mainTreeProof)
      .accounts({ submitter: admin.publicKey, market, registry })
      .rpc();

    let m = await program.account.market.fetch(market);
    assert.equal(m.proposedOutcome, 0, "outcome should be HOME (2-1)");
    assert.isTrue(m.resultVerified, "result should be flagged verified");
    assert.deepEqual(Object.keys(m.status)[0], "resultProposed");

    await sleep(2600);
    await program.methods.finalizeResult()
      .accounts({ market, vault, treasury: treasuryAta, tokenProgram: TOKEN_PROGRAM_ID }).rpc();

    const aBefore = Number((await getAccount(provider.connection, ataA)).amount);
    await program.methods.claim()
      .accounts({ claimant: A.publicKey, market, position: posPda(market, A.publicKey), vault, claimantTokenAccount: ataA, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([A]).rpc();
    // pool 400, fee 8, payout 392, A is sole HOME staker -> claims 392 (net +292 on 100).
    const gained = Number((await getAccount(provider.connection, ataA)).amount) - aBefore;
    assert.equal(gained, usdc(392).toNumber());
  });

  it("rejects a tampered proof", async () => {
    const { market, vault } = await newMarket();
    await bet(market, vault, A, ataA, 0, usdc(10));
    await sleep(3500);

    const badProof = [node(crypto.randomBytes(32), true)]; // wrong sibling
    try {
      await program.methods
        .commitResultVerified(toStat(home), toStat(away), badProof, awayProof, subTreeProof, mainTreeProof)
        .accounts({ submitter: admin.publicKey, market, registry })
        .rpc();
      assert.fail("tampered proof should be rejected");
    } catch (e: any) {
      assert.match(e.toString(), /MerkleVerificationFailed|reconstruct/);
    }
  });
});
