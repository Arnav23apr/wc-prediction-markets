import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

// Outcome codes (mirror constants.rs)
const HOME = 0;
const DRAW = 1;
const AWAY = 2;
const VOID = 255;

const USDC_DECIMALS = 6;
const usdc = (n: number) => new BN(Math.round(n * 10 ** USDC_DECIMALS));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Loaded via fs (not `import`) so the test works under either CJS or ESM loaders.
const idl = JSON.parse(fs.readFileSync("target/idl/prediction_market.json", "utf-8"));

describe("prediction-market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  // Build the Program straight from the generated IDL (see scripts/gen-idl.js).
  const program = new anchor.Program(idl as anchor.Idl, provider) as any;
  const admin = provider.wallet as anchor.Wallet; // market authority

  let usdcMint: PublicKey;
  let treasuryAta: PublicKey;
  const oracle = Keypair.generate();
  const disputeAuth = Keypair.generate();

  // Reusable funded bettors
  const A = Keypair.generate();
  const B = Keypair.generate();
  const C = Keypair.generate();
  const ataOf = new Map<string, PublicKey>();

  let matchCounter = 1000;
  const nextMatchId = () => new BN(++matchCounter);

  const pdas = (matchId: BN) => {
    const idBuf = matchId.toArrayLike(Buffer, "le", 8);
    const [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), idBuf],
      program.programId
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), market.toBuffer()],
      program.programId
    );
    return { market, vault };
  };

  const positionPda = (market: PublicKey, owner: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), market.toBuffer(), owner.toBuffer()],
      program.programId
    )[0];

  const fund = async (kp: Keypair, usdcAmount: number) => {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      kp.publicKey
    );
    ataOf.set(kp.publicKey.toBase58(), ata.address);
    await mintTo(
      provider.connection,
      admin.payer,
      usdcMint,
      ata.address,
      admin.payer,
      BigInt(usdc(usdcAmount).toString())
    );
  };

  const bal = async (owner: PublicKey) =>
    Number((await getAccount(provider.connection, ataOf.get(owner.toBase58())!)).amount);

  before(async () => {
    usdcMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      USDC_DECIMALS
    );
    const treasury = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      admin.publicKey
    );
    treasuryAta = treasury.address;
    ataOf.set(admin.publicKey.toBase58(), treasuryAta);

    await fund(A, 10_000);
    await fund(B, 10_000);
    await fund(C, 10_000);
  });

  // Helper: spin up a market with a chosen timing profile.
  const createMarket = async (opts: {
    closeInSec: number;
    disputeWindow: number;
    feeBps: number;
  }) => {
    const matchId = nextMatchId();
    const { market, vault } = pdas(matchId);
    const closeTs = new BN(Math.floor(Date.now() / 1000) + opts.closeInSec);
    await program.methods
      .initializeMarket(
        matchId,
        closeTs,
        new BN(opts.disputeWindow),
        opts.feeBps,
        oracle.publicKey,
        disputeAuth.publicKey,
        "Argentina",
        "France"
      )
      .accounts({
        authority: admin.publicKey,
        market,
        usdcMint,
        vault,
        treasury: treasuryAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    return { matchId, market, vault };
  };

  const bet = (market: PublicKey, vault: PublicKey, who: Keypair, outcome: number, amount: BN) =>
    program.methods
      .placeBet(outcome, amount)
      .accounts({
        bettor: who.publicKey,
        market,
        position: positionPda(market, who.publicKey),
        vault,
        bettorTokenAccount: ataOf.get(who.publicKey.toBase58())!,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who])
      .rpc();

  const claim = (market: PublicKey, vault: PublicKey, who: Keypair) =>
    program.methods
      .claim()
      .accounts({
        claimant: who.publicKey,
        market,
        position: positionPda(market, who.publicKey),
        vault,
        claimantTokenAccount: ataOf.get(who.publicKey.toBase58())!,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who])
      .rpc();

  it("pays winners pro-rata minus the protocol fee", async () => {
    const { market, vault } = await createMarket({ closeInSec: 3, disputeWindow: 1, feeBps: 200 });

    const aBefore = await bal(A.publicKey);
    const bBefore = await bal(B.publicKey);
    const treBefore = await bal(admin.publicKey);

    await bet(market, vault, A, HOME, usdc(100));
    await bet(market, vault, B, HOME, usdc(300));
    await bet(market, vault, C, AWAY, usdc(200));

    await sleep(3500); // betting closes
    await program.methods.commitResult(HOME).accounts({ market, oracle: oracle.publicKey }).signers([oracle]).rpc();
    await sleep(2600); // dispute window (1s) elapses, with margin for integer-second on-chain clock
    await program.methods
      .finalizeResult()
      .accounts({ market, vault, treasury: treasuryAta, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();

    const m = await program.account.market.fetch(market);
    assert.equal(m.finalOutcome, HOME);
    assert.equal(m.feeCollected.toString(), usdc(12).toString()); // 2% of 600
    assert.equal(m.payoutPool.toString(), usdc(588).toString());
    assert.equal(m.winningPool.toString(), usdc(400).toString());

    await claim(market, vault, A);
    await claim(market, vault, B);

    // A: 100/400 * 588 = 147 ; B: 300/400 * 588 = 441
    assert.equal((await bal(A.publicKey)) - aBefore, usdc(47).toNumber()); // net +47 (staked 100, got 147)
    assert.equal((await bal(B.publicKey)) - bBefore, usdc(141).toNumber()); // net +141 (staked 300, got 441)
    assert.equal((await bal(admin.publicKey)) - treBefore, usdc(12).toNumber());

    // Loser has nothing to claim.
    try {
      await claim(market, vault, C);
      assert.fail("C should not be able to claim");
    } catch (e: any) {
      assert.match(e.toString(), /NothingToClaim|nothing to claim/);
    }
  });

  it("refunds everyone when the oracle commits VOID", async () => {
    const { market, vault } = await createMarket({ closeInSec: 3, disputeWindow: 1, feeBps: 200 });
    const aBefore = await bal(A.publicKey);

    await bet(market, vault, A, HOME, usdc(100));
    await bet(market, vault, B, AWAY, usdc(50));

    await sleep(3500);
    await program.methods.commitResult(VOID).accounts({ market, oracle: oracle.publicKey }).signers([oracle]).rpc();
    await sleep(2600);
    await program.methods
      .finalizeResult()
      .accounts({ market, vault, treasury: treasuryAta, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();

    const m = await program.account.market.fetch(market);
    assert.deepEqual(Object.keys(m.status)[0], "voided");

    await claim(market, vault, A);
    await claim(market, vault, B);
    assert.equal(await bal(A.publicKey), aBefore); // fully refunded, net zero
  });

  it("treats a winning outcome with no backers as a void refund", async () => {
    const { market, vault } = await createMarket({ closeInSec: 3, disputeWindow: 1, feeBps: 200 });
    const aBefore = await bal(A.publicKey);

    await bet(market, vault, A, HOME, usdc(100));
    await bet(market, vault, B, DRAW, usdc(100));

    await sleep(3500);
    await program.methods.commitResult(AWAY).accounts({ market, oracle: oracle.publicKey }).signers([oracle]).rpc();
    await sleep(2600);
    await program.methods
      .finalizeResult()
      .accounts({ market, vault, treasury: treasuryAta, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();

    const m = await program.account.market.fetch(market);
    assert.deepEqual(Object.keys(m.status)[0], "voided");
    assert.equal(m.feeCollected.toString(), "0");

    await claim(market, vault, A);
    assert.equal(await bal(A.publicKey), aBefore);
  });

  it("supports dispute then admin override", async () => {
    const { market, vault } = await createMarket({ closeInSec: 3, disputeWindow: 30, feeBps: 0 });
    const cBefore = await bal(C.publicKey);

    await bet(market, vault, A, HOME, usdc(100));
    await bet(market, vault, C, AWAY, usdc(100));

    await sleep(3500);
    // Oracle wrongly proposes HOME...
    await program.methods.commitResult(HOME).accounts({ market, oracle: oracle.publicKey }).signers([oracle]).rpc();
    // ...watcher disputes within the window...
    await program.methods
      .disputeResult()
      .accounts({ market, disputeAuthority: disputeAuth.publicKey })
      .signers([disputeAuth])
      .rpc();
    // ...admin resolves to the correct AWAY.
    await program.methods
      .resolveDispute(AWAY)
      .accounts({ market, authority: admin.publicKey, vault, treasury: treasuryAta, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();

    const m = await program.account.market.fetch(market);
    assert.deepEqual(Object.keys(m.status)[0], "settled");
    assert.equal(m.finalOutcome, AWAY);

    await claim(market, vault, C);
    // 0% fee, C had the only AWAY stake, wins the whole 200 pool: net +100.
    assert.equal((await bal(C.publicKey)) - cBefore, usdc(100).toNumber());
  });

  it("rejects bets after betting closes", async () => {
    const { market, vault } = await createMarket({ closeInSec: 2, disputeWindow: 1, feeBps: 0 });
    await sleep(2500);
    try {
      await bet(market, vault, A, HOME, usdc(10));
      assert.fail("bet after close should fail");
    } catch (e: any) {
      assert.match(e.toString(), /BettingClosed|Betting is closed/);
    }
  });

  it("rejects double claims", async () => {
    const { market, vault } = await createMarket({ closeInSec: 3, disputeWindow: 1, feeBps: 0 });
    await bet(market, vault, A, HOME, usdc(100));
    await sleep(3500);
    await program.methods.commitResult(HOME).accounts({ market, oracle: oracle.publicKey }).signers([oracle]).rpc();
    await sleep(2600);
    await program.methods
      .finalizeResult()
      .accounts({ market, vault, treasury: treasuryAta, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    await claim(market, vault, A);
    try {
      await claim(market, vault, A);
      assert.fail("second claim should fail");
    } catch (e: any) {
      assert.match(e.toString(), /AlreadyClaimed|already been claimed/);
    }
  });
});
