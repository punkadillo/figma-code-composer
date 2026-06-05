#!/usr/bin/env node
// figma-code-composer (fcc) — Figma-to-code multi-agent pipeline scaffold + KG CLI.
//
// Subcommands:
//   init [target]              Scaffold the pipeline into a project (default)
//   doctor                     Validate config + MCP reachability
//   complexity <manifest>      Print complexity score for a manifest JSON
//   kg:query                   Retrieve top-K prior components for a manifest slice
//   kg:stage                   Subagent writes a ledger delta (parallel-safe)
//   kg:merge                   Coordinator merges staged deltas into the ledger
//   kg:rebuild                 Rebuild graph.json + embeddings from ledger.jsonl
//   handover                   Emit handover .md for a run
//   skills:prune               Guarded prune of .figma-pipeline/skills/ to a keep-set
//   brevit:encode              Flatten a JSON payload to Brevit wire format (round-trip-guarded)
//   brevit:decode              Inflate a Brevit payload back to JSON (for tooling)
//
// Legacy: invoking without a subcommand defaults to `init` for backward compat.
//
// Init usage:
//   npx figma-code-composer                            # interactive, current dir
//   npx figma-code-composer init ./my-app              # interactive, target dir
//   npx figma-code-composer init --yes                 # non-interactive, all tools
//   npx figma-code-composer init --tools claude,cursor # specific tools
//   npx figma-code-composer init --force               # overwrite existing files
//   npx figma-code-composer init --dry-run             # print plan, do nothing
//
// Init flags (all optional):
//   --target <dir>     Target directory (default: positional arg or cwd)
//   --tools <list>     Comma-separated: claude,cursor (default: all)
//   --force            Overwrite existing files at target
//   --skip <list>      Comma-separated paths to skip: claude-md, agents-md, cursor-rules
//   --dry-run          Show what would happen, write nothing
//   --yes / -y         Skip prompts; use defaults
//   --help / -h        This message
//   --version / -v     Print package version

import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdirSync, cpSync, chmodSync, statSync, readdirSync, writeFileSync, appendFileSync, openSync, closeSync, rmSync, renameSync } from "node:fs";
import { safeEncode, decodeText } from './lib/brevit.mjs';
import { dirname, join, relative, resolve, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const PKG = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));

const TOOL_PATHS = {
  claude: [".claude"],
  cursor: [".cursor"],
};
const ALWAYS_PATHS = [".figma-pipeline"];
// CLAUDE.md / AGENTS.md are no longer whole-file copies (that clobbered the
// consumer's own instructions). Instead a managed marker block — containing
// just the pointer to the scaffold-owned .figma-pipeline/PIPELINE.md — is
// injected into the consumer's existing file (created if absent), idempotently.
// `--skip claude-md` / `--skip agents-md` skip the injection.
const EXTRA_PATHS = {}; // kept for back-compat; injection replaces whole-file copy
const MANAGED_DOCS = {
  "claude-md": {
    file: "CLAUDE.md",
    block: [
      "<!-- figma-code-composer:start — managed block; edit outside the markers freely -->",
      "## figma-code-composer pipeline",
      "",
      "This project uses the figma-code-composer pipeline (`/init-figma-compose`, then `/figma-build <url>` etc.).",
      "Binding rules, repo map, and coverage live in the scaffold-owned reference — imported here so updates",
      "refresh them without touching your own instructions:",
      "",
      "@.figma-pipeline/PIPELINE.md",
      "<!-- figma-code-composer:end -->",
    ].join("\n"),
  },
  "agents-md": {
    file: "AGENTS.md",
    block: [
      "<!-- figma-code-composer:start — managed block; edit outside the markers freely -->",
      "## figma-code-composer pipeline",
      "",
      "Binding rules, repo map, and coverage: `.figma-pipeline/PIPELINE.md`.",
      "Per-tool enforcement: `.claude/hooks/README.md`, `.cursor/rules/README.md`.",
      "<!-- figma-code-composer:end -->",
    ].join("\n"),
  },
};
const MANAGED_START = "<!-- figma-code-composer:start";
const MANAGED_END = "<!-- figma-code-composer:end -->";
// --skip tokens that exclude a SUBPATH within an otherwise-copied tool dir.
// (EXTRA_PATHS tokens skip a whole top-level file; these skip a nested dir so
// the rest of the tool surface still updates.) Used for "keep my customized
// Cursor rules" on a re-scaffold.
const SKIP_SUBPATHS = {
  "cursor-rules": ".cursor/rules",
};

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};
const NO_COLOR = !output.isTTY || process.env.NO_COLOR;
const c = (color, str) => (NO_COLOR ? str : `${COLORS[color]}${str}${COLORS.reset}`);

// ─── subcommand dispatcher ──────────────────────────────────────────────────
const KNOWN_SUBCOMMANDS = new Set([
  "init",
  "migrate",
  "doctor",
  "complexity",
  "kg:query",
  "kg:stage",
  "kg:merge",
  "kg:rebuild",
  "kg:verify",
  "kg:repair",
  "handover",
  "skills:prune",
  "brevit:encode",
  "brevit:decode",
]);

const SUBCOMMAND_HANDLERS = {
  migrate:      runMigrate,
  doctor:       runDoctor,
  complexity:   runComplexity,
  "kg:query":   runKgQuery,
  "kg:stage":   runKgStage,
  "kg:merge":   runKgMerge,
  "kg:rebuild": runKgRebuild,
  "kg:verify":  runKgVerify,
  "kg:repair":  runKgRepair,
  handover:     runHandover,
  "skills:prune": runSkillsPrune,
  "brevit:encode": runBrevitEncode,
  "brevit:decode": runBrevitDecode,
};

async function dispatch(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { printHelp(); process.exit(0); }
  if (argv.includes("--version") || argv.includes("-v")) { printVersion(); process.exit(0); }

  const first = argv[0];
  if (!first || first.startsWith("--") || first.startsWith("-")) {
    return runInit(argv);
  }
  if (KNOWN_SUBCOMMANDS.has(first)) {
    const rest = argv.slice(1);
    if (first === "init") return runInit(rest);
    if (SUBCOMMAND_HANDLERS[first]) return SUBCOMMAND_HANDLERS[first](rest);
  }
  // Unknown first arg — treat as legacy positional target for init
  return runInit(argv);
}

// ─── arg parsing (init) ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    target: null,
    tools: null,
    force: false,
    skip: [],
    dryRun: false,
    yes: false,
    help: false,
    version: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--target": args.target = argv[++i]; break;
      case "--tools":  args.tools = argv[++i].split(",").map(s => s.trim()).filter(Boolean); break;
      case "--skip":   args.skip = argv[++i].split(",").map(s => s.trim()).filter(Boolean); break;
      case "--force":  args.force = true; break;
      case "--dry-run":args.dryRun = true; break;
      case "--yes": case "-y": args.yes = true; break;
      case "--help": case "-h": args.help = true; break;
      case "--version": case "-v": args.version = true; break;
      default:
        if (arg.startsWith("--")) {
          console.error(c("red", `Unknown flag: ${arg}`));
          process.exit(2);
        }
        rest.push(arg);
    }
  }
  if (!args.target && rest.length > 0) args.target = rest[0];
  return args;
}

// ─── help / version ─────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${c("bold", "figma-code-composer")} (fcc) — Figma-to-code pipeline scaffold + KG CLI

${c("bold", "Subcommands:")}
  init [target]              Scaffold the pipeline into a project (default)
  migrate                    De-dupe a pre-ownership-split CLAUDE.md into the PIPELINE.md import
  doctor                     Validate config + MCP reachability
  complexity <manifest>      Print complexity score for a manifest JSON
  kg:query                   Retrieve top-K prior components for a manifest slice
  kg:stage                   Subagent writes a ledger delta (parallel-safe)
  kg:merge                   Coordinator merges staged deltas into the ledger
  kg:rebuild                 Rebuild graph.json + embeddings from ledger.jsonl
  kg:verify                  Check ledger entries still match the filesystem
  kg:repair                  User-driven cleanup: prune orphans, rebuild, resolve paths
  handover                   Emit handover .md for a run
  skills:prune               Guarded prune of .figma-pipeline/skills/ to a --keep set
  brevit:encode              Flatten a JSON payload to Brevit wire format (round-trip-guarded)
  brevit:decode              Inflate a Brevit payload back to JSON (for tooling)

${c("bold", "Init usage:")}
  npx figma-code-composer [target] [options]
  npx figma-code-composer init [target] [options]

${c("bold", "Init options:")}
  --target <dir>     Target directory (default: positional arg or cwd)
  --tools <list>     Comma-separated: claude,cursor (default: all)
  --skip <list>      Comma-separated paths to skip: claude-md, agents-md, cursor-rules
  --force            Overwrite existing files at target
  --dry-run          Show what would happen, write nothing
  --yes, -y          Skip prompts; use defaults
  --help, -h         Show this message
  --version, -v      Print package version

${c("bold", "Examples:")}
  ${c("dim", "# Interactive, drops scaffold into cwd")}
  npx figma-code-composer

  ${c("dim", "# Non-interactive, all tools into ./my-app")}
  npx figma-code-composer init ./my-app --yes

  ${c("dim", "# Only Claude Code + Cursor")}
  npx figma-code-composer init --tools claude,cursor --yes

  ${c("dim", "# Skip CLAUDE.md (keep your existing one)")}
  npx figma-code-composer init --skip claude-md --yes

  ${c("dim", "# Short alias")}
  npx fcc init --yes

${c("bold", "After install:")}
  cd <target> && open in your AI tool of choice
  Claude Code: /init-figma-compose
  Cursor:      type /init-figma-compose in agent chat
`);
}

function printVersion() {
  console.log(`figma-code-composer ${PKG.version}`);
}

// ─── prompt helpers ─────────────────────────────────────────────────────────
async function askYesNo(rl, question, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await rl.question(`${question} (${hint}) `)).trim().toLowerCase();
  if (answer === "") return defaultYes;
  return answer === "y" || answer === "yes";
}

async function askChoice(rl, question, defaultValue) {
  const answer = (await rl.question(`${question}${defaultValue ? ` (${defaultValue})` : ""}: `)).trim();
  return answer || defaultValue;
}

// ─── filesystem helpers ─────────────────────────────────────────────────────
function pathExists(p) {
  try { statSync(p); return true; } catch { return false; }
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function listConflicts(targetDir, scaffoldEntries) {
  const conflicts = [];
  for (const entry of scaffoldEntries) {
    const target = join(targetDir, entry);
    if (pathExists(target)) conflicts.push(entry);
  }
  return conflicts;
}

function chmodShellScripts(dir) {
  if (!isDir(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += chmodShellScripts(full);
    } else if (entry.isFile() && entry.name.endsWith(".sh")) {
      try { chmodSync(full, 0o755); count++; } catch { /* noop */ }
    }
  }
  return count;
}

// Append scaffold-generated paths to the target project's .gitignore so
// consumers don't accidentally commit local wizard state. Idempotent — if
// the marker block already exists, do nothing.
const GITIGNORE_MARKER = "# figma-code-composer — local wizard state (do not commit)";
const GITIGNORE_BLOCK = [
  "",
  GITIGNORE_MARKER,
  ".figma-pipeline/config.json",
  ".figma-pipeline/scratch/",
  "/tmp/figma-*/",
  "graphify-out/",
  ".mcp.json",
  "",
].join("\n");

function patchGitignore(targetDir, dryRun) {
  const path = join(targetDir, ".gitignore");
  const existing = pathExists(path) ? readFileSync(path, "utf8") : "";
  if (existing.includes(GITIGNORE_MARKER)) {
    return { skipped: true, reason: "marker block already present" };
  }
  if (dryRun) {
    return { skipped: false, dryRun: true, lines: GITIGNORE_BLOCK.split("\n").length };
  }
  const trailingNewline = existing.length === 0 || existing.endsWith("\n");
  const next = (trailingNewline ? existing : existing + "\n") + GITIGNORE_BLOCK;
  if (existing === "") {
    writeFileSync(path, next);
  } else {
    appendFileSync(path, (trailingNewline ? "" : "\n") + GITIGNORE_BLOCK);
  }
  return { skipped: false, written: true };
}

// Inject (or refresh) a managed marker block into a doc file without disturbing
// the consumer's own content. Create if absent, replace between markers if
// present, append if the file exists without markers. Idempotent.
function injectManagedBlock(targetDir, file, block, dryRun) {
  const path = join(targetDir, file);
  const exists = pathExists(path);
  const existing = exists ? readFileSync(path, "utf8") : "";
  const hasBlock = existing.includes(MANAGED_START);

  if (dryRun) {
    return { file, action: !exists ? "create" : hasBlock ? "refresh-block" : "append-block", dryRun: true };
  }

  if (!exists) {
    writeFileSync(path, block + "\n");
    return { file, action: "created" };
  }
  if (hasBlock) {
    // Replace everything from the start marker through the end marker.
    const startIdx = existing.indexOf(MANAGED_START);
    const endMarkerIdx = existing.indexOf(MANAGED_END, startIdx);
    if (endMarkerIdx === -1) {
      // Malformed (start without end) — append a fresh block, leave the rest.
      appendFileSync(path, "\n" + block + "\n");
      return { file, action: "appended (prior block was malformed)" };
    }
    const endIdx = endMarkerIdx + MANAGED_END.length;
    const next = existing.slice(0, startIdx) + block + existing.slice(endIdx);
    if (next !== existing) writeFileSync(path, next);
    return { file, action: next !== existing ? "refreshed" : "unchanged" };
  }
  // File exists, no managed block → append.
  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  appendFileSync(path, sep + block + "\n");
  return { file, action: "appended" };
}

// ─── core: copy ─────────────────────────────────────────────────────────────
function copyEntry(source, target, dryRun, excludeAbsDirs = []) {
  if (dryRun) {
    const note = excludeAbsDirs.length ? ` (excluding ${excludeAbsDirs.map(d => relative(source, d)).join(", ")})` : "";
    console.log(`  ${c("dim", "→")} ${relative(process.cwd(), target)}${note}`);
    return;
  }
  const parent = dirname(target);
  if (!pathExists(parent)) mkdirSync(parent, { recursive: true });
  const opts = { recursive: true, errorOnExist: false, force: true };
  opts.filter = (src, dest) => {
    // 1. --skip <subpath>: leave a consumer-customized subdir entirely untouched.
    if (excludeAbsDirs.some(d => src === d || src.startsWith(d + "/"))) return false;
    // 2. Owner-guard for Cursor rules: a scaffold-shipped rule carries
    //    `owner: figma-pipeline` in its frontmatter. On re-scaffold we overwrite
    //    those (they're ours) and any rule that doesn't exist yet, but we NEVER
    //    overwrite a .mdc the consumer added or forked (no owner tag) — that's
    //    their file. (Override the whole behavior with `--skip cursor-rules`.)
    if (src.endsWith(".mdc") && /[/\\]\.cursor[/\\]rules[/\\]/.test(src) && pathExists(dest)) {
      const cur = readFileSync(dest, "utf8");
      if (!/(^|\n)owner:\s*figma-pipeline\b/.test(cur)) return false; // consumer-owned → preserve
    }
    return true;
  };
  cpSync(source, target, opts);
}

function buildPlan(tools, skipExtras) {
  const entries = [...ALWAYS_PATHS];
  for (const tool of tools) {
    if (TOOL_PATHS[tool]) entries.push(...TOOL_PATHS[tool]);
  }
  for (const [key, path] of Object.entries(EXTRA_PATHS)) {
    if (!skipExtras.includes(key)) entries.push(path);
  }
  return entries;
}

// ─── init: scaffolder ───────────────────────────────────────────────────────
async function runInit(argv) {
  const args = parseArgs(argv);

  if (args.help)    { printHelp(); process.exit(0); }
  if (args.version) { printVersion(); process.exit(0); }

  const targetDir = resolve(process.cwd(), args.target || ".");
  console.log(c("bold", "📐 figma-code-composer"));
  console.log(c("dim", `   Target: ${targetDir}`));

  if (!pathExists(targetDir)) {
    if (args.dryRun) {
      console.log(c("yellow", `   (would create) ${targetDir}`));
    } else {
      mkdirSync(targetDir, { recursive: true });
      console.log(c("green", `   Created target dir.`));
    }
  } else if (!isDir(targetDir)) {
    console.error(c("red", `   Target exists but is not a directory: ${targetDir}`));
    process.exit(2);
  }

  let tools = args.tools;
  let skipExtras = args.skip;
  let force = args.force;

  if (!args.yes && !tools && input.isTTY) {
    const rl = createInterface({ input, output });
    try {
      console.log("");
      console.log(c("bold", "Which AI tools should this scaffold wire for?"));
      const wantClaude = await askYesNo(rl, "  Claude Code (.claude/)?", true);
      const wantCursor = await askYesNo(rl, "  Cursor       (.cursor/)?", true);
      tools = [];
      if (wantClaude) tools.push("claude");
      if (wantCursor) tools.push("cursor");
      if (tools.length === 0) {
        console.error(c("red", "No tools selected — aborting."));
        process.exit(1);
      }
    } finally {
      rl.close();
    }
  } else if (!tools) {
    tools = ["claude", "cursor"];
  }

  for (const t of tools) {
    if (!TOOL_PATHS[t]) {
      console.error(c("red", `Unknown tool: ${t} (valid: claude, cursor)`));
      process.exit(2);
    }
  }

  const plan = buildPlan(tools, skipExtras);
  console.log("");
  console.log(c("bold", "Scaffold plan:"));
  for (const entry of plan) {
    console.log(`  ${c("cyan", "•")} ${entry}`);
  }
  if (skipExtras.length > 0) {
    console.log(c("dim", `  (skipping: ${skipExtras.join(", ")})`));
  }

  const conflicts = listConflicts(targetDir, plan);
  if (conflicts.length > 0 && !force) {
    console.log("");
    console.log(c("yellow", "⚠ Conflicts (already exist at target):"));
    for (const conflict of conflicts) {
      console.log(`  ${c("yellow", "•")} ${conflict}`);
    }
    if (args.yes) {
      console.error(c("red", "\nRefusing to overwrite. Re-run with --force or remove existing entries."));
      process.exit(1);
    }
    if (input.isTTY) {
      const rl = createInterface({ input, output });
      try {
        const proceed = await askYesNo(rl, "\nOverwrite? Existing files will be replaced.", false);
        if (!proceed) {
          console.log(c("dim", "Aborted by user."));
          process.exit(0);
        }
        force = true;
      } finally {
        rl.close();
      }
    } else {
      console.error(c("red", "\nNo TTY for prompt. Use --force to overwrite or --skip to exclude."));
      process.exit(1);
    }
  }

  console.log("");
  console.log(args.dryRun ? c("yellow", "Dry run — no files written:") : c("bold", "Copying:"));
  for (const entry of plan) {
    const source = join(PACKAGE_ROOT, entry);
    const target = join(targetDir, entry);
    if (!pathExists(source)) {
      console.warn(c("yellow", `  ⚠ Source missing (skipping): ${entry}`));
      continue;
    }
    // Per-entry subpath exclusions (e.g. --skip cursor-rules keeps the consumer's
    // .cursor/rules but still updates the rest of .cursor).
    const excludeAbsDirs = skipExtras
      .filter(s => SKIP_SUBPATHS[s] && (SKIP_SUBPATHS[s] === entry || SKIP_SUBPATHS[s].startsWith(entry + "/")))
      .map(s => join(PACKAGE_ROOT, SKIP_SUBPATHS[s]));
    copyEntry(source, target, args.dryRun, excludeAbsDirs);
    if (!args.dryRun) {
      console.log(`  ${c("green", "✓")} ${entry}${excludeAbsDirs.length ? c("dim", " (kept your " + excludeAbsDirs.map(d => relative(PACKAGE_ROOT, d)).join(", ") + ")") : ""}`);
    }
  }

  if (!args.dryRun) {
    let chmodCount = 0;
    if (tools.includes("claude")) chmodCount += chmodShellScripts(join(targetDir, ".claude", "hooks"));
    if (chmodCount > 0) {
      console.log(c("dim", `  (made ${chmodCount} shell script(s) executable)`));
    }
  }

  // Patch the target project's .gitignore so wizard state never leaks into commits.
  // (The wizard re-runs the same patch idempotently — safe to do here too.)
  const gi = patchGitignore(targetDir, args.dryRun);
  if (gi.skipped) {
    console.log(c("dim", `  .gitignore: already has scaffold block, leaving alone`));
  } else if (gi.dryRun) {
    console.log(c("yellow", `  .gitignore: would append ${gi.lines}-line scaffold block`));
  } else {
    console.log(`  ${c("green", "✓")} .gitignore patched (scaffold block appended)`);
  }

  // Inject the managed pointer block into CLAUDE.md / AGENTS.md (idempotent),
  // instead of clobbering files the consumer may have authored. --skip opts out.
  for (const [token, doc] of Object.entries(MANAGED_DOCS)) {
    if (skipExtras.includes(token)) {
      console.log(c("dim", `  ${doc.file}: skipped (--skip ${token})`));
      continue;
    }
    const r = injectManagedBlock(targetDir, doc.file, doc.block, args.dryRun);
    if (args.dryRun) {
      console.log(c("yellow", `  ${doc.file}: would ${r.action}`));
    } else {
      console.log(`  ${c("green", "✓")} ${doc.file} (${r.action})`);
    }
  }

  // Heads-up for projects scaffolded before the ownership split: an old CLAUDE.md
  // still carries the binding rules inline, now duplicated with the PIPELINE.md import.
  const claudeForCheck = join(targetDir, "CLAUDE.md");
  if (!args.dryRun && existsSync(claudeForCheck)) {
    const t = readFileSync(claudeForCheck, "utf8");
    if (t.includes("## Binding rules") && /Write-access allowlist driven by/.test(t)) {
      console.log(c("yellow", `  ⚠ CLAUDE.md still has the old inline binding rules (now in .figma-pipeline/PIPELINE.md).`));
      console.log(c("dim",    `     De-dupe with: npx figma-code-composer migrate   (backs up to CLAUDE.md.bak first)`));
    }
  }

  console.log("");
  console.log(c("bold", args.dryRun ? "Dry run complete." : "✅ Scaffold installed."));
  console.log("");
  console.log(c("bold", "Next steps:"));
  console.log(`  ${c("dim", "1.")} cd ${relative(process.cwd(), targetDir) || "."}`);
  console.log(`  ${c("dim", "2.")} Open the project in your AI tool of choice, then run the wizard:`);
  if (tools.includes("claude")) console.log(`     ${c("cyan", "Claude Code")}  →  /init-figma-compose`);
  if (tools.includes("cursor")) console.log(`     ${c("cyan", "Cursor")}       →  type /init-figma-compose in agent chat`);
  console.log(`  ${c("dim", "3.")} Read ${c("cyan", ".figma-pipeline/PIPELINE.md")} for binding rules + coverage (imported by your CLAUDE.md; AGENTS.md points to it).`);
  console.log("");
}

// ════════════════════════════════════════════════════════════════════════════
// Pipeline runtime — complexity, knowledge-graph, handover, doctor
// Spec: .figma-pipeline/protocols/{cli,knowledge-graph,complexity,handover}.md
// Stdlib-only. Local JSON embeddings (no sqlite-vec native dep) + atomic
// `wx` lockfile (no flock native dep). See cli.md § Implementation notes.
// ════════════════════════════════════════════════════════════════════════════

const REPO = process.cwd();
const CONFIG_PATH = join(REPO, ".figma-pipeline", "config.json");

function fail(code, msg) { console.error(c("red", msg)); process.exit(code); }
function emit(obj, asJson) { console.log(asJson ? JSON.stringify(obj, null, 2) : obj); }

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) fail(2, "No .figma-pipeline/config.json — run /init-figma-compose first.");
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); }
  catch (e) { fail(2, `config.json invalid JSON: ${e.message}`); }
}

function kgPaths(cfg) {
  const storeDir = resolve(REPO, (cfg.knowledgeGraph && cfg.knowledgeGraph.storeDir) || ".figma-pipeline/kg");
  return {
    storeDir,
    ledger:     join(storeDir, "ledger.jsonl"),
    deleted:    join(storeDir, ".deleted.jsonl"),
    graph:      join(storeDir, "graph.json"),
    embeddings: join(storeDir, "embeddings.json"),
    staging:    join(storeDir, "staging"),
    handovers:  join(storeDir, "handovers"),
    lock:       join(storeDir, "ledger.lock"),
  };
}

function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

function readLedger(p) {
  if (!existsSync(p)) return [];
  const out = [];
  const lines = readFileSync(p, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try { out.push(JSON.parse(line)); }
    catch (e) { throw new Error(`ledger.jsonl line ${i + 1} invalid JSON: ${e.message}`); }
  }
  return out;
}

function writeLedger(p, entries) {
  writeFileSync(p, entries.map(e => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : ""));
}

// ─── ledger entry validation (per knowledge-graph.md § Ledger entry schemas) ──
const REQUIRED_BY_KIND = {
  component: ["id", "kind", "figmaNodeId", "figmaHash", "framework", "cssSystem", "filePath", "exportName", "tokensUsed", "iconsUsed", "composes", "props", "summary", "buildRunId", "createdAt", "updatedAt"],
  icon:      ["id", "kind", "figmaNodeId", "figmaHash", "framework", "cssSystem", "filePath", "exportName", "tokensUsed", "iconsUsed", "composes", "props", "summary", "buildRunId", "createdAt", "updatedAt"],
  tokenSet:  ["id", "kind", "figmaHash", "framework", "cssSystem", "tokenStrategy", "fileLayout", "outputDir", "files", "tokens", "tokenCount", "summary", "buildRunId", "createdAt", "updatedAt"],
};

function validateEntry(e) {
  if (!e || typeof e !== "object") return "not an object";
  if (!e.kind || !REQUIRED_BY_KIND[e.kind]) return `unknown or missing kind: ${e.kind}`;
  const missing = REQUIRED_BY_KIND[e.kind].filter(k => !(k in e));
  if (missing.length) return `kind=${e.kind} missing required field(s): ${missing.join(", ")}`;
  if (e.kind === "tokenSet" && Array.isArray(e.tokens) && e.tokenCount !== e.tokens.length)
    return `tokenCount (${e.tokenCount}) != tokens.length (${e.tokens.length})`;
  return null; // valid
}

// ─── local embedding: bag-of-words term frequency (no native dep) ─────────────
function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}
function embed(text) {
  const tf = {};
  for (const tok of tokenize(text)) tf[tok] = (tf[tok] || 0) + 1;
  return tf;
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const k in a) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
  for (const k in b) nb += b[k] * b[k];
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function rebuildEmbeddings(entries) {
  const out = {};
  for (const e of entries) out[e.id] = embed(e.summary || e.id);
  return out;
}

// ─── graph.json (derived edges per knowledge-graph.md § Edges) ────────────────
function rebuildGraph(entries) {
  const nodes = entries.map(e => ({ id: e.id, kind: e.kind, framework: e.framework, cssSystem: e.cssSystem, filePath: e.filePath || null, orphaned: !!e.orphaned }));
  const edges = [];
  for (const e of entries) {
    for (const comp of (e.composes || [])) {
      edges.push({ type: comp.via === "instance" ? "composes-instance" : "composes-import", from: e.id, to: comp.id });
    }
    for (const icon of (e.iconsUsed || [])) edges.push({ type: "uses-icon", from: e.id, to: icon });
    for (const tok of (e.tokensUsed || [])) edges.push({ type: "uses-token", from: e.id, to: tok });
    if (e.figmaMainComponentId) edges.push({ type: "instance-of", from: e.figmaMainComponentId, to: e.id });
    if (e.replacedBy) edges.push({ type: "replaced-by", from: e.id, to: e.replacedBy });
  }
  return { version: "1.0", builtAt: new Date().toISOString(), nodeCount: nodes.length, edgeCount: edges.length, nodes, edges };
}

// ─── atomic lock via `wx` open (no native flock) ──────────────────────────────
function acquireLock(lockPath, timeoutMs = 30000) {
  const start = Date.now();
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(lockPath, String(process.pid));
      closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (Date.now() - start > timeoutMs) return false;
      // brief spin; tiny busy-wait via Atomics to avoid pulling in timers
      const sab = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(sab, 0, 0, 100);
    }
  }
}
function releaseLock(lockPath) { try { rmSync(lockPath, { force: true }); } catch { /* noop */ } }

// ─── generic flag parser ──────────────────────────────────────────────────────
function flags(args) {
  const f = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) { f[key] = true; }
      else { f[key] = next; i++; }
    } else f._.push(a);
  }
  return f;
}

// ─── fcc complexity <manifest> ────────────────────────────────────────────────
function runComplexity(args) {
  const f = flags(args);
  const manifestPath = f._[0];
  if (!manifestPath) fail(2, "Usage: fcc complexity <manifest> [--no-kg] [--print-routing]");
  if (!existsSync(manifestPath)) fail(2, `manifest not found: ${manifestPath}`);
  let m;
  try { m = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (e) { fail(2, `manifest invalid JSON: ${e.message}`); }

  const cfg = existsSync(CONFIG_PATH) ? loadConfig() : {};
  const comps = m.components || [];
  const signals = {
    nodeCount: Math.min(m.complexity?.signals?.nodeCount ?? (m.nodeCount || comps.length), 500),
    variantCount: comps.reduce((n, ce) => n + (ce.variantOptions || []).reduce((a, v) => a + (v.values || []).length, 0), 0),
    compositionDepth: m.complexity?.signals?.compositionDepth ?? 1,
    unboundValueCount: comps.reduce((n, ce) => n + (ce.styledProperties || []).filter(p => p.unbound).length, 0),
    iconCount: (m.icons || []).length,
    tokenReuseRatio: f["no-kg"] ? 0 : (m.complexity?.signals?.tokenReuseRatio ?? 0),
  };
  // Weighted score 0–100 (per complexity.md formula; weights mirror the protocol)
  let score = Math.min(100, Math.round(
    signals.nodeCount * 0.15 +
    signals.variantCount * 4 +
    signals.compositionDepth * 6 +
    signals.unboundValueCount * 2 +
    signals.iconCount * 1.5 -
    signals.tokenReuseRatio * 20
  ));
  if (score < 0) score = 0;
  const th = (cfg.complexity && cfg.complexity.thresholds) || { trivial: 15, moderate: 45, complex: 75 };
  let tier = "extreme";
  if (score <= th.trivial) tier = "trivial";
  else if (score <= th.moderate) tier = "moderate";
  else if (score <= th.complex) tier = "complex";
  const ov = cfg.complexity && cfg.complexity.tierOverrides && cfg.complexity.tierOverrides[tier];
  if (ov) tier = ov;

  const sizeByTier = { trivial: "sm", moderate: "md", complex: "lg", extreme: "lg" };
  const result = { score, tier, signals };
  if (f["print-routing"]) {
    result.size = sizeByTier[tier];
    result.secondPassReview = tier === "extreme";
  }
  emit(result, true);
  process.exit(0);
}

// ─── fcc kg:stage --run-id --agent --entry|--entry-file ───────────────────────
function runKgStage(args) {
  const f = flags(args);
  if (!f["run-id"] || !f.agent) fail(2, "Usage: fcc kg:stage --run-id <id> --agent <name> --entry <json>|--entry-file <path>");
  let raw = f.entry;
  if (f["entry-file"]) {
    if (!existsSync(f["entry-file"])) fail(2, `entry-file not found: ${f["entry-file"]}`);
    raw = readFileSync(f["entry-file"], "utf8");
  }
  if (!raw || raw === true) fail(2, "--entry <json> or --entry-file <path> required");
  let entry;
  try { entry = JSON.parse(raw); } catch (e) { fail(2, `--entry invalid JSON: ${e.message}`); }
  const err = validateEntry(entry);
  if (err) fail(2, `entry schema invalid: ${err}`);

  const cfg = loadConfig();
  const p = kgPaths(cfg);
  const dir = join(p.staging, f["run-id"]);
  try { ensureDir(dir); } catch (e) { fail(3, `staging dir unwritable: ${e.message}`); }
  try { appendFileSync(join(dir, `${f.agent}.jsonl`), JSON.stringify(entry) + "\n"); }
  catch (e) { fail(3, `could not append staging entry: ${e.message}`); }
  emit({ staged: true, runId: f["run-id"], agent: f.agent, id: entry.id }, f.json);
  process.exit(0);
}

// ─── fcc kg:merge --run-id [--dry-run] ────────────────────────────────────────
function runKgMerge(args) {
  const f = flags(args);
  if (!f["run-id"]) fail(2, "Usage: fcc kg:merge --run-id <id> [--dry-run]");
  const cfg = loadConfig();
  const p = kgPaths(cfg);
  const stagingDir = join(p.staging, f["run-id"]);
  if (!existsSync(stagingDir)) { emit({ merged: 0, note: "no staging dir for run" }, f.json); process.exit(0); }

  // Collect + validate all staged entries first (fail-closed)
  const staged = [];
  for (const file of readdirSync(stagingDir).filter(x => x.endsWith(".jsonl"))) {
    const lines = readFileSync(join(stagingDir, file), "utf8").split("\n").filter(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
      let e; try { e = JSON.parse(lines[i]); } catch (err) { fail(2, `${file} line ${i + 1}: invalid JSON`); }
      const v = validateEntry(e); if (v) fail(2, `${file} line ${i + 1}: ${v}`);
      staged.push(e);
    }
  }
  if (f["dry-run"]) { emit({ dryRun: true, wouldMerge: staged.length, ids: staged.map(e => e.id) }, f.json); process.exit(0); }

  ensureDir(p.storeDir);
  if (!acquireLock(p.lock)) fail(3, "could not acquire ledger lock within 30s");
  try {
    const ledger = readLedger(p.ledger);
    // Upsert by id (tokenSet + re-built components collapse to one evolving entry)
    const byId = new Map(ledger.map(e => [e.id, e]));
    const now = new Date().toISOString();
    for (const e of staged) {
      if (byId.has(e.id)) e.createdAt = byId.get(e.id).createdAt || e.createdAt;
      e.updatedAt = e.updatedAt || now;
      byId.set(e.id, e);
    }
    const merged = [...byId.values()];
    writeLedger(p.ledger, merged);
    writeFileSync(p.graph, JSON.stringify(rebuildGraph(merged), null, 2));
    let embedWarn = null;
    try { writeFileSync(p.embeddings, JSON.stringify(rebuildEmbeddings(merged))); }
    catch (e) { embedWarn = e.message; }
    rmSync(stagingDir, { recursive: true, force: true });
    releaseLock(p.lock);
    if (embedWarn) { emit({ merged: staged.length, total: merged.length, embeddingsWarning: embedWarn }, f.json); process.exit(4); }
    emit({ merged: staged.length, total: merged.length, ids: staged.map(e => e.id) }, f.json);
    process.exit(0);
  } catch (e) {
    releaseLock(p.lock);
    fail(3, `merge failed: ${e.message}`);
  }
}

// ─── fcc kg:query (exact instance lookup OR slice similarity) ─────────────────
function runKgQuery(args) {
  const f = flags(args);
  const cfg = loadConfig();
  const p = kgPaths(cfg);
  let ledger;
  try { ledger = readLedger(p.ledger); } catch (e) { fail(3, `ledger unreadable: ${e.message}`); }

  // Exact instance-reuse lookup: --kind component --figma-node-id <id> --framework --css-system
  if (f["figma-node-id"]) {
    const topK = Math.min(parseInt(f["top-k"] || "1", 10), 20);
    const hits = ledger.filter(e =>
      !e.orphaned &&
      (!f.kind || e.kind === f.kind) &&
      e.figmaNodeId === f["figma-node-id"] &&
      (!f.framework || e.framework === f.framework) &&
      (!f["css-system"] || e.cssSystem === f["css-system"])
    ).slice(0, topK);
    emit(hits, true);
    process.exit(0);
  }

  // Similarity RAG: --slice <path> --top-k --min-similarity
  if (!f.slice) fail(2, "Usage: fcc kg:query (--slice <path> [--top-k N] [--min-similarity 0..1]) | (--figma-node-id <id> [--kind] [--framework] [--css-system])");
  if (!existsSync(f.slice)) fail(2, `slice not found: ${f.slice}`);
  let slice; try { slice = JSON.parse(readFileSync(f.slice, "utf8")); } catch (e) { fail(2, `slice invalid JSON: ${e.message}`); }
  const topK = Math.min(parseInt(f["top-k"] || "5", 10), 20);
  const minSim = parseFloat(f["min-similarity"] || "0.3");
  const qvec = embed(slice.summaryHint || slice.name || "");
  const scored = ledger
    .filter(e => !e.orphaned && e.kind !== "tokenSet")
    .map(e => ({ e, similarity: cosine(qvec, embed(e.summary || e.id)) }))
    .filter(x => x.similarity >= minSim)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(({ e, similarity }) => ({
      id: e.id, similarity: Math.round(similarity * 100) / 100,
      filePath: e.filePath, summary: e.summary,
      tokensUsed: e.tokensUsed, composes: (e.composes || []).map(c => c.id), props: e.props,
    }));
  emit(scored, true);
  process.exit(0);
}

// ─── fcc kg:verify [--all | --component-id <id>] [--no-write] ─────────────────
function fileHasExport(filePath, exportName) {
  if (!existsSync(filePath)) return false;
  const src = readFileSync(filePath, "utf8");
  // Heuristic: named export, default-export-as, or const/function/class decl
  const re = new RegExp(`\\b(export\\s+(const|function|class|default)\\s+${exportName}\\b|export\\s*\\{[^}]*\\b${exportName}\\b|as\\s+${exportName}\\b)`);
  return re.test(src);
}

function runKgVerify(args) {
  const f = flags(args);
  const cfg = loadConfig();
  const p = kgPaths(cfg);
  let ledger; try { ledger = readLedger(p.ledger); } catch (e) { fail(2, `ledger unreadable: ${e.message}`); }
  const targets = f["component-id"] ? ledger.filter(e => e.id === f["component-id"]) : ledger;
  const orphans = [];
  const now = new Date().toISOString();
  for (const e of targets) {
    const problems = [];
    if (e.kind === "component" || e.kind === "icon") {
      const fp = resolve(REPO, e.filePath);
      if (!existsSync(fp)) problems.push(`filePath missing: ${e.filePath}`);
      else if (e.exportName && !fileHasExport(fp, e.exportName)) problems.push(`export '${e.exportName}' not found in ${e.filePath}`);
      if (e.storyPath && !existsSync(resolve(REPO, e.storyPath))) problems.push(`storyPath missing: ${e.storyPath}`);
      if (e.testPath && !existsSync(resolve(REPO, e.testPath))) problems.push(`testPath missing: ${e.testPath}`);
    } else if (e.kind === "tokenSet") {
      for (const t of (e.tokens || [])) {
        const tf = resolve(REPO, t.emittedIn);
        if (!existsSync(tf)) problems.push(`token file missing: ${t.emittedIn}`);
        else if (t.emittedAs && !readFileSync(tf, "utf8").includes(t.emittedAs)) problems.push(`token '${t.emittedAs}' not in ${t.emittedIn}`);
      }
    }
    if (problems.length) { orphans.push({ id: e.id, problems }); e.orphaned = true; e.orphanedAt = now; }
  }
  if (orphans.length && !f["no-write"]) writeLedger(p.ledger, ledger);
  emit({ checked: targets.length, orphans }, true);
  process.exit(orphans.length ? 1 : 0);
}

// ─── fcc kg:rebuild ───────────────────────────────────────────────────────────
function runKgRebuild(args) {
  const f = flags(args);
  const cfg = loadConfig();
  const p = kgPaths(cfg);
  let ledger; try { ledger = readLedger(p.ledger); } catch (e) { fail(2, `ledger unreadable: ${e.message}`); }
  for (const e of ledger) { const v = validateEntry(e); if (v) fail(2, `invalid ledger entry '${e && e.id}': ${v}`); }
  ensureDir(p.storeDir);
  writeFileSync(p.graph, JSON.stringify(rebuildGraph(ledger), null, 2));
  writeFileSync(p.embeddings, JSON.stringify(rebuildEmbeddings(ledger)));
  emit({ rebuilt: true, entries: ledger.length, graph: relative(REPO, p.graph), embeddings: relative(REPO, p.embeddings) }, f.json);
  process.exit(0);
}

// ─── fcc kg:repair --prune-orphans | --resolve-path <id> <newPath> ────────────
async function runKgRepair(args) {
  const f = flags(args);
  const cfg = loadConfig();
  const p = kgPaths(cfg);
  let ledger; try { ledger = readLedger(p.ledger); } catch (e) { fail(2, `ledger unreadable: ${e.message}`); }

  if (f["resolve-path"]) {
    const id = f["resolve-path"]; const newPath = f._[0];
    if (!newPath) fail(2, "Usage: fcc kg:repair --resolve-path <id> <newPath>");
    const entry = ledger.find(e => e.id === id);
    if (!entry) fail(2, `no ledger entry with id '${id}'`);
    if (entry.exportName && !fileHasExport(resolve(REPO, newPath), entry.exportName)) fail(2, `'${newPath}' does not contain export '${entry.exportName}'`);
    if (f["dry-run"]) { emit({ dryRun: true, id, from: entry.filePath, to: newPath }, f.json); process.exit(0); }
    entry.filePath = newPath; delete entry.orphaned; delete entry.orphanedAt; entry.updatedAt = new Date().toISOString();
    writeLedger(p.ledger, ledger);
    writeFileSync(p.graph, JSON.stringify(rebuildGraph(ledger), null, 2));
    emit({ resolved: id, filePath: newPath }, f.json);
    process.exit(0);
  }

  if (f["prune-orphans"]) {
    let orphans = ledger.filter(e => e.orphaned);
    if (f.where) {
      const m = String(f.where).match(/^\s*(\w+)\s*(==|!=)\s*"?([^"]*)"?\s*$/);
      if (!m) fail(2, `unsupported --where expression: ${f.where} (use 'field == "value"' or 'field != "value"')`);
      const [, field, op, val] = m;
      orphans = orphans.filter(e => op === "==" ? e[field] === val : e[field] !== val);
    }
    if (orphans.length === 0) { emit({ pruned: 0, note: "no matching orphans" }, f.json); process.exit(0); }
    if (f["dry-run"]) { emit({ dryRun: true, wouldPrune: orphans.map(e => e.id) }, f.json); process.exit(0); }
    if (!f.yes && !f.y) {
      const rl = createInterface({ input, output });
      const ans = (await rl.question(`Prune ${orphans.length} orphaned entr${orphans.length === 1 ? "y" : "ies"} (${orphans.map(e => e.id).join(", ")})? [y/N] `)).trim().toLowerCase();
      rl.close();
      if (ans !== "y" && ans !== "yes") { console.log("Declined."); process.exit(1); }
    }
    const orphanIds = new Set(orphans.map(e => e.id));
    const kept = ledger.filter(e => !orphanIds.has(e.id));
    for (const o of orphans) appendFileSync(p.deleted, JSON.stringify({ ...o, deletedAt: new Date().toISOString() }) + "\n");
    writeLedger(p.ledger, kept);
    writeFileSync(p.graph, JSON.stringify(rebuildGraph(kept), null, 2));
    writeFileSync(p.embeddings, JSON.stringify(rebuildEmbeddings(kept)));
    emit({ pruned: orphans.length, ids: [...orphanIds], archive: relative(REPO, p.deleted) }, f.json);
    process.exit(0);
  }

  fail(2, "Usage: fcc kg:repair (--prune-orphans [--where '<expr>'] [--yes] [--dry-run]) | (--resolve-path <id> <newPath>)");
}

// ─── fcc handover --run-id --manifest [--output] [--failed] [--verify] ────────
function runHandover(args) {
  const f = flags(args);
  if (!f["run-id"] || !f.manifest) fail(2, "Usage: fcc handover --run-id <id> --manifest <path> [--output <path>] [--failed] [--verify]");
  if (!existsSync(f.manifest)) fail(2, `manifest not found: ${f.manifest}`);
  let m; try { m = JSON.parse(readFileSync(f.manifest, "utf8")); } catch (e) { fail(2, `manifest invalid JSON: ${e.message}`); }
  const cfg = loadConfig();
  const p = kgPaths(cfg);
  let ledger = []; try { ledger = readLedger(p.ledger); } catch { /* handover still useful without ledger */ }
  const runEntries = ledger.filter(e => e.buildRunId === f["run-id"]);

  const suffix = f.failed ? ".failed.md" : ".md";
  const out = f.output || join(p.handovers, `${f["run-id"]}${suffix}`);
  ensureDir(dirname(out));

  const built = runEntries.map(e => `- \`${e.id}\` (${e.kind}) → \`${e.filePath || e.outputDir || "—"}\``).join("\n") || "- (none recorded in ledger for this run)";
  const tokens = runEntries.filter(e => e.kind === "tokenSet").reduce((n, e) => n + (e.tokenCount || 0), 0);

  // Per-specialist cost ledger (coordinator-written, one JSON line per spawn).
  const costsPath = f.costs || `/tmp/figma-${f["run-id"]}/costs.jsonl`;
  const costRows = [];
  if (existsSync(costsPath)) {
    for (const line of readFileSync(costsPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try { costRows.push(JSON.parse(t)); } catch { /* skip malformed cost line */ }
    }
  }
  const costTokens = costRows.reduce((n, r) => n + (Number(r.totalTokens) || 0), 0);
  const costTools = costRows.reduce((n, r) => n + (Number(r.toolUses) || 0), 0);
  const fmtNum = (n) => n.toLocaleString("en-US");
  const costSection = costRows.length
    ? `Per-specialist totals from \`${costsPath}\` (coordinator-written, one line per spawn). Excludes the coordinator's own context + the top-level orchestrator; \`total_tokens\`-based estimate, not billed.

| agent | model | totalTokens | toolUses |
| ----- | ----- | ----------: | -------: |
${costRows.map(r => `| ${r.agent || "—"} | ${r.model || "—"} | ${r.totalTokens == null ? "n/a" : fmtNum(Number(r.totalTokens))} | ${r.toolUses == null ? "—" : r.toolUses} |`).join("\n")}
| **total** | — | **${fmtNum(costTokens)}** | **${costTools}** |`
    : "- No per-specialist cost ledger found for this run (costs.jsonl absent).";

  const drift = [];
  if (f.verify) {
    for (const e of runEntries) {
      if ((e.kind === "component" || e.kind === "icon") && e.filePath && !existsSync(resolve(REPO, e.filePath)))
        drift.push(`${e.id}: filePath missing (${e.filePath})`);
    }
  }
  const body = `---
runId: ${f["run-id"]}
completedAt: ${new Date().toISOString()}
status: ${f.failed ? "failed" : drift.length ? "partial" : "ok"}
manifest: ${f.manifest}
entriesThisRun: ${runEntries.length}
tokensThisRun: ${tokens}
specialistTokensThisRun: ${costTokens}
specialistToolUsesThisRun: ${costTools}
---

# Handover — ${f["run-id"]}

## Built this run

${built}

## Cost (this run — estimate)

${costSection}

## Open issues

${drift.length ? drift.map(d => `- ⚠️ ${d}`).join("\n") : "- None flagged."}

## Next steps

- Safe to \`/clear\`; the next build rehydrates from this file + the KG ledger.
${cfg.knowledgeGraph && cfg.knowledgeGraph.enabled ? "- Run `/graphify .` to refresh the project knowledge graph for cross-run reuse." : ""}
`;
  writeFileSync(out, body);
  emit({ handover: relative(REPO, out), entriesThisRun: runEntries.length, drift: drift.length }, f.json);
  process.exit(drift.length ? 1 : 0);
}

// ─── fcc skills:prune --keep <list> [--dry-run] [--json] ──────────────────────
// Vetted, guarded replacement for the wizard's old ad-hoc `rm -rf` skill prune
// (which a zsh word-splitting bug once turned into a full-catalog wipe). Deletes
// skill dirs under .figma-pipeline/skills/ that are NOT in the keep-set. Guards:
//   - refuses if --keep is missing/empty (an empty keep-set = delete everything)
//   - refuses if the keep-set is disjoint from on-disk (= delete the whole
//     catalog — the exact failure mode that nuked all 137 dirs)
//   - every target is basename-only, resolved + confirmed under the skills dir;
//     names with a path separator / relative segment are rejected
function runSkillsPrune(args) {
  const f = flags(args);
  const skillsDir = join(REPO, ".figma-pipeline", "skills");
  if (!existsSync(skillsDir)) fail(2, "No .figma-pipeline/skills/ directory — nothing to prune.");

  const rawKeep = typeof f.keep === "string" ? f.keep : "";
  const keep = rawKeep.split(",").map(s => s.trim()).filter(Boolean);
  if (keep.length === 0) {
    fail(2, "Refusing to prune: --keep <comma-list> is required and must be non-empty (an empty keep-set would delete every skill).");
  }
  for (const name of keep) {
    if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      fail(2, `Refusing to prune: unsafe keep entry '${name}' (no path separators or relative segments allowed).`);
    }
  }

  const onDisk = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  const keepSet = new Set(keep);
  const kept = onDisk.filter(n => keepSet.has(n));
  const remove = onDisk.filter(n => !keepSet.has(n));
  const missing = keep.filter(n => !onDisk.includes(n));

  // GUARD: keep-set disjoint from on-disk → pruning would wipe the whole catalog.
  if (onDisk.length > 0 && kept.length === 0) {
    fail(3, `Refusing to prune: none of the ${keep.length} keep entr${keep.length === 1 ? "y" : "ies"} match any of the ${onDisk.length} on-disk skill dir(s) — pruning would delete the entire catalog. Check the keep-set (likely a resolution bug).`);
  }

  if (f["dry-run"]) {
    emit({ dryRun: true, total: onDisk.length, keep: kept.length, remove: remove.length, removeNames: remove, missing }, f.json);
    process.exit(0);
  }

  const skillsRoot = resolve(skillsDir);
  for (const name of remove) {
    const target = resolve(join(skillsDir, name));
    if (target !== join(skillsRoot, name) || !target.startsWith(skillsRoot + "/")) {
      fail(3, `Refusing to delete out-of-scope path: ${target}`);
    }
    rmSync(target, { recursive: true, force: true });
  }

  // Best-effort: keep skills-lock.json in sync with on-disk (per skills.md § Out-of-band).
  let lockSynced = false;
  const lockPath = join(REPO, "skills-lock.json");
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      if (lock && lock.skills && typeof lock.skills === "object") {
        const remaining = new Set(kept);
        lock.skills = Object.fromEntries(Object.entries(lock.skills).filter(([k]) => remaining.has(k)));
        writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
        lockSynced = true;
      }
    } catch { /* non-fatal — lock is advisory */ }
  }

  emit({ pruned: remove.length, kept: kept.length, total: onDisk.length, removed: remove, missing, lockSynced }, f.json);
  process.exit(0);
}

// ─── fcc doctor [--explain-output] [--no-write] [--mcp-skip] ──────────────────
function runDoctor(args) {
  const f = flags(args);
  if (!existsSync(CONFIG_PATH)) fail(2, "No .figma-pipeline/config.json — run /init-figma-compose first.");
  const cfg = loadConfig();
  const p = kgPaths(cfg);
  const report = { config: "ok", kg: {}, warnings: [] };

  // config sanity
  for (const k of ["version", "framework", "cssSystem", "tokens", "components", "writeScope"]) {
    if (!(k in cfg)) report.warnings.push(`config missing key: ${k}`);
  }
  if (cfg.version && cfg.version !== "1.0") report.warnings.push(`config.version is ${cfg.version}, expected 1.0`);

  // KG health
  if (cfg.knowledgeGraph && cfg.knowledgeGraph.enabled) {
    try {
      const ledger = readLedger(p.ledger);
      report.kg.entries = ledger.length;
      report.kg.orphans = ledger.filter(e => e.orphaned).length;
      report.kg.graphPresent = existsSync(p.graph);
      report.kg.embeddingsPresent = existsSync(p.embeddings);
      if (existsSync(p.staging) && readdirSync(p.staging).length) report.warnings.push(`stale staging dirs under ${relative(REPO, p.staging)} — a prior merge may have aborted`);
      if (report.kg.orphans) report.warnings.push(`${report.kg.orphans} orphaned ledger entr${report.kg.orphans === 1 ? "y" : "ies"} — run 'fcc kg:repair --prune-orphans'`);
    } catch (e) { report.kg.error = e.message; report.warnings.push(`ledger unreadable: ${e.message}`); }
  } else report.kg.enabled = false;

  if (f["explain-output"]) {
    const tree = {
      components: cfg.components, icons: cfg.icons, tokens: cfg.tokens,
      stories: cfg.stories, tests: cfg.tests,
    };
    emit(tree, true);
    process.exit(0);
  }

  emit(report, true);
  process.exit(report.warnings.length ? 1 : 0);
}

// ─── fcc migrate [--dry-run] [--yes] ──────────────────────────────────────────
// One-time migration for projects scaffolded BEFORE the ownership split: old
// CLAUDE.md carried the binding rules / repo map / coverage / quick-start inline;
// those now live in .figma-pipeline/PIPELINE.md (imported via a managed block).
// This de-dupes: backs up CLAUDE.md, removes the superseded scaffold sections,
// ensures the managed block + @import is present. Safe — always writes a .bak,
// idempotent, and only strips sections whose headings match the known scaffold set.
async function runMigrate(args) {
  const f = flags(args);
  const targetDir = f.target ? resolve(REPO, f.target) : REPO;
  const SUPERSEDED = ["## Quick start", "## Repo map", "## Binding rules", "## Coverage"];
  // Fingerprint of the old scaffold-authored CLAUDE.md (unlikely in a consumer's own file).
  const isOldScaffoldDoc = (t) =>
    !t.includes(MANAGED_START) &&
    t.includes("## Binding rules") &&
    /Write-access allowlist driven by/.test(t);

  function removeSection(text, heading) {
    const lines = text.split("\n");
    const start = lines.findIndex(l => l.trim() === heading);
    if (start === -1) return text;
    let end = start + 1;
    while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
    lines.splice(start, end - start);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  const results = [];

  // ---- CLAUDE.md ----
  const claudePath = join(targetDir, "CLAUDE.md");
  if (existsSync(claudePath)) {
    const orig = readFileSync(claudePath, "utf8");
    if (orig.includes(MANAGED_START) && !isOldScaffoldDoc(orig)) {
      results.push({ file: "CLAUDE.md", action: "already migrated (managed block present)" });
    } else if (isOldScaffoldDoc(orig)) {
      let next = orig;
      const removed = SUPERSEDED.filter(h => next.split("\n").some(l => l.trim() === h));
      for (const h of removed) next = removeSection(next, h);
      next = next.trimEnd() + "\n\n" + MANAGED_DOCS["claude-md"].block + "\n";
      if (f["dry-run"]) {
        results.push({ file: "CLAUDE.md", action: "would migrate", removeSections: removed, backup: "CLAUDE.md.bak" });
      } else {
        if (!f.yes && !f.y) {
          const rl = createInterface({ input, output });
          const ans = (await rl.question(`Migrate CLAUDE.md? Removes superseded sections [${removed.join(", ")}], backs up to CLAUDE.md.bak, adds the PIPELINE.md import block. [y/N] `)).trim().toLowerCase();
          rl.close();
          if (ans !== "y" && ans !== "yes") { console.log("Declined."); process.exit(1); }
        }
        writeFileSync(claudePath + ".bak", orig);
        writeFileSync(claudePath, next);
        results.push({ file: "CLAUDE.md", action: "migrated", removedSections: removed, backup: "CLAUDE.md.bak" });
      }
    } else {
      // Consumer's own CLAUDE.md without the block — just ensure the block is present.
      if (!f["dry-run"]) injectManagedBlock(targetDir, "CLAUDE.md", MANAGED_DOCS["claude-md"].block, false);
      results.push({ file: "CLAUDE.md", action: f["dry-run"] ? "would add managed block" : "added managed block (no scaffold sections to strip)" });
    }
  } else {
    results.push({ file: "CLAUDE.md", action: "absent — nothing to migrate" });
  }

  // ---- AGENTS.md: lighter — ensure the managed pointer block exists ----
  const agentsPath = join(targetDir, "AGENTS.md");
  if (existsSync(agentsPath)) {
    const orig = readFileSync(agentsPath, "utf8");
    if (orig.includes(MANAGED_START)) {
      results.push({ file: "AGENTS.md", action: "already has managed block" });
    } else if (!f["dry-run"]) {
      injectManagedBlock(targetDir, "AGENTS.md", MANAGED_DOCS["agents-md"].block, false);
      results.push({ file: "AGENTS.md", action: "added managed block" });
    } else {
      results.push({ file: "AGENTS.md", action: "would add managed block" });
    }
  }

  emit({ migrated: results, note: f["dry-run"] ? "dry run — nothing written" : "review CLAUDE.md.bak if anything looks off" }, true);
  process.exit(0);
}

// ─── fcc brevit:encode / brevit:decode ─────────────────────────────────────
function readPayloadInput(argv) {
  const fileArg = argv.find((a) => !a.startsWith('-'));
  return fileArg ? readFileSync(fileArg, 'utf8') : readFileSync(0, 'utf8'); // 0 = stdin
}

async function runBrevitEncode(argv) {
  let raw;
  try { raw = readPayloadInput(argv); }
  catch { console.error('brevit:encode — no input (pass a file or pipe JSON on stdin)'); process.exit(2); }
  let value;
  try { value = JSON.parse(raw); }
  catch { process.stdout.write(raw); return; } // already non-JSON → pass through
  // Absent/broken brevit or guard failure → safeEncode returns raw JSON. Never fatal.
  process.stdout.write(String(await safeEncode(value)));
}

async function runBrevitDecode(argv) {
  let raw;
  try { raw = readPayloadInput(argv); }
  catch { console.error('brevit:decode — no input'); process.exit(2); }
  try { process.stdout.write(JSON.stringify(decodeText(raw))); }
  catch { process.stdout.write(raw); } // unparseable → pass through
}

// ─── entry ──────────────────────────────────────────────────────────────────
dispatch(process.argv.slice(2)).catch(err => {
  console.error(c("red", `\nError: ${err.message}`));
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
