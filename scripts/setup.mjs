// One-command setup and deploy to Cloudflare Pages.
//
//   npm run setup                          # project "eric-champ-portfolio"
//   PAGES_PROJECT=shiplayer npm run setup  # deploy into an existing project instead
//
// Steps: log in (opens your browser once), create the KV store, create the Pages
// project, set the private edit key, deploy, and write your edit link to EDIT-LINK.txt.
// Safe to run again: it reuses what already exists and keeps the same edit key.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const TOML = "wrangler.toml";
const PLACEHOLDER = "00000000000000000000000000000000";
const toml = () => readFileSync(TOML, "utf8");
const PROJECT = process.env.PAGES_PROJECT || toml().match(/^name\s*=\s*"([^"]+)"/m)[1];
const log = (s) => console.log(`\n▸ ${s}`);

function wrangler(args, { capture = false, input } = {}) {
  const r = spawnSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    shell: process.platform === "win32",
    input,
    stdio: [input !== undefined ? "pipe" : "inherit", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  if (capture && r.status !== 0 && !/already exists/i.test(out)) {
    console.error(out);
  }
  return { ok: r.status === 0, out };
}

// 1. login
log("Checking your Cloudflare login");
let who = wrangler(["whoami"], { capture: true });
if (!who.ok || /not authenticated|You are not logged in/i.test(who.out)) {
  log("Opening the browser so you can allow access to your Cloudflare account");
  if (!wrangler(["login"]).ok) { console.error("Login did not complete."); process.exit(1); }
  who = wrangler(["whoami"], { capture: true });
}
const email = (who.out.match(/associated with the email ([^\s.]+@[^\s]+?)\.?\s/) || [])[1];
console.log(email ? `  Logged in as ${email}` : "  Logged in.");

// 2. KV namespace for the site data
if (toml().includes(PLACEHOLDER)) {
  log("Creating the storage for your site data (KV namespace PORTFOLIO)");
  const r = wrangler(["kv", "namespace", "create", "PORTFOLIO"], { capture: true });
  let id = (r.out.match(/id\s*=\s*"([0-9a-f]{32})"/) || r.out.match(/"id"\s*:\s*"([0-9a-f]{32})"/) || [])[1];
  if (!id) {
    // it may exist from an earlier run: look it up
    const list = wrangler(["kv", "namespace", "list"], { capture: true });
    try {
      const arr = JSON.parse(list.out.slice(list.out.indexOf("[")));
      const hit = arr.find((n) => /PORTFOLIO$/.test(n.title));
      if (hit) id = hit.id;
    } catch (e) { /* fall through */ }
  }
  if (!id) { console.error("Could not create or find the KV namespace.\n" + r.out); process.exit(1); }
  writeFileSync(TOML, toml().replace(PLACEHOLDER, id));
  console.log(`  Storage ready (${id})`);
} else {
  console.log("\n▸ Storage already configured in wrangler.toml");
}

// 3. Pages project
log(`Preparing the Pages project "${PROJECT}"`);
const projects = wrangler(["pages", "project", "list"], { capture: true });
if (!projects.out.includes(PROJECT)) {
  const r = wrangler(["pages", "project", "create", PROJECT, "--production-branch", "main"], { capture: true });
  if (!r.ok && !/already exists/i.test(r.out)) process.exit(1);
  console.log("  Project created");
} else {
  console.log("  Project exists, reusing it");
}

// 4. private edit key (kept between runs)
let key = "";
if (existsSync("EDIT-LINK.txt")) key = (readFileSync("EDIT-LINK.txt", "utf8").match(/\/edit\/([A-Za-z0-9_-]{20,})/) || [])[1] || "";
if (!key) key = randomBytes(24).toString("base64url");
log("Setting your private edit key");
if (!wrangler(["pages", "secret", "put", "ADMIN_KEY", "--project-name", PROJECT], { capture: true, input: key + "\n" }).ok) process.exit(1);
console.log("  Edit key stored as a secret");

// 5. deploy
log("Deploying");
const dep = wrangler(["pages", "deploy", "--project-name", PROJECT, "--branch", "main", "--commit-dirty=true"], { capture: true });
process.stdout.write(dep.out);
if (!dep.ok) process.exit(1);
const preview = (dep.out.match(/https:\/\/[a-z0-9-]+\.([a-z0-9-]+\.pages\.dev)/) || [])[0];
const host = preview ? preview.replace(/^https:\/\/[a-z0-9-]+\./, "") : `${PROJECT}.pages.dev`;
const site = `https://${host}`;
const edit = `${site}/edit/${key}`;

// 6. save the edit link locally (never committed: listed in .gitignore)
writeFileSync("EDIT-LINK.txt",
  `Portfolio\n  Site:    ${site}\n  Stacks:  ${site}/stack\n  Editor:  ${edit}\n\nThe editor link is your password. Do not share it or post it anywhere.\nTo change it: delete this file and run  npm run setup  again.\n`);
log("Done");
console.log(`  Site:    ${site}`);
console.log(`  Stacks:  ${site}/stack`);
console.log(`  Editor:  ${edit}`);
console.log("  (also saved in EDIT-LINK.txt)\n");
