// Self-host EmulatorJS: copy the loader and the console cores we support from
// node_modules into public/emulatorjs/data/ (gitignored), so the site serves
// a pinned, tested version instead of a third-party CDN. Runs before
// `next dev` and `next build`. Thread builds are skipped: none of these cores
// need threads (that would require COOP/COEP headers).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

export const CORES = ["fceumm", "snes9x", "gambatte", "mgba", "genesis_plus_gx", "mupen64plus_next", "pcsx_rearmed"];

const out = new URL("../public/emulatorjs/data/", import.meta.url).pathname;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const data = join(pkgDir("@emulatorjs/emulatorjs"), "data");
for (const entry of readdirSync(data)) {
  if (entry === "cores") continue;
  cpSync(join(data, entry), join(out, entry), { recursive: true });
}

// The npm package ships only the unminified sources; the loader asks for
// emulator.min.js/.css first and falls back after two 404s. Provide them by
// joining the sources in the loader's own order (same code, one request).
const loader = readFileSync(join(data, "loader.js"), "utf8");
const scripts = [...loader.match(/const scripts = \[([\s\S]*?)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
writeFileSync(
  join(out, "emulator.min.js"),
  scripts.map((f) => `/* ${f} */\n${readFileSync(join(data, "src", f), "utf8")}`).join("\n;\n"),
);
cpSync(join(data, "emulator.css"), join(out, "emulator.min.css"));

mkdirSync(join(out, "cores", "reports"), { recursive: true });
for (const core of CORES) {
  const dir = pkgDir(`@emulatorjs/core-${core}`);
  for (const file of [`${core}-wasm.data`, `${core}-legacy-wasm.data`]) cpSync(join(dir, file), join(out, "cores", file));
  cpSync(join(dir, "reports", `${core}.json`), join(out, "cores", "reports", `${core}.json`));
}
console.log(`EmulatorJS + ${CORES.length} cores copied to public/emulatorjs/`);
