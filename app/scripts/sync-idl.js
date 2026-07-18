// Copies the freshly built Anchor IDL into the app bundle so the client and the
// on-chain program never drift. Runs automatically before `dev` and `build`.
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "../../target/idl/prediction_market.json");
const destDir = path.resolve(__dirname, "../src/idl");
const dest = path.join(destDir, "prediction_market.json");

if (!fs.existsSync(src)) {
  console.error(`\n[sync-idl] IDL not found at ${src}\n[sync-idl] Run \`anchor build\` in the repo root first.\n`);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[sync-idl] copied IDL -> ${path.relative(process.cwd(), dest)}`);
