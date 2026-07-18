// Share helpers — open a prefilled post on X or Farcaster, or use the native
// share sheet on mobile. No SDKs, just intent URLs.

export function shareToX(text: string, url?: string) {
  const u = new URL("https://twitter.com/intent/tweet");
  u.searchParams.set("text", text);
  if (url) u.searchParams.set("url", url);
  window.open(u.toString(), "_blank", "noopener,noreferrer");
}

export function shareToFarcaster(text: string, url?: string) {
  const u = new URL("https://warpcast.com/~/compose");
  u.searchParams.set("text", url ? `${text} ${url}` : text);
  window.open(u.toString(), "_blank", "noopener,noreferrer");
}

export async function nativeShare(title: string, text: string, url?: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Solana Explorer link for an address or tx, cluster-aware from the RPC URL. */
export function explorerUrl(idOrSig: string, kind: "address" | "tx", rpcUrl: string): string {
  const base = `https://explorer.solana.com/${kind}/${idOrSig}`;
  if (/devnet/.test(rpcUrl)) return `${base}?cluster=devnet`;
  if (/testnet/.test(rpcUrl)) return `${base}?cluster=testnet`;
  if (/127\.0\.0\.1|localhost/.test(rpcUrl))
    return `${base}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  return base;
}
