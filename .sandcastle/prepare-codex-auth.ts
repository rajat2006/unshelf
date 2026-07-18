import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireEnv } from "./require-env";

/**
 * The provider name Sandcastle's `codex()` builder reports (`ctx.agent.name`).
 * Only this provider needs the auth-file materialisation below; the Claude Code
 * default authenticates purely from `CLAUDE_CODE_OAUTH_TOKEN` in the env.
 */
export const CODEX_PROVIDER = "codex";

/**
 * The credential-store setting Codex CI requires. The default store is the OS
 * keyring, which is unreachable on the Actions runner, so `codex exec` must be
 * told to read the file-based store (the `auth.json` we write below) instead.
 */
export const CREDENTIALS_STORE_LINE = 'cli_auth_credentials_store = "file"';

/** OpenAI API-key vars that must never be visible to `codex exec`. */
export const OPENAI_KEY_VARS = ["OPENAI_KEY", "OPENAI_API_KEY"] as const;

/**
 * Prepare the runner environment so `codex exec` authenticates against the
 * ChatGPT subscription seat (`gpt-5.6-sol`) rather than the metered Platform API.
 * Called by every capability script immediately before `sandcastle.run()`, so the
 * setup is uniform across phases (spec #52 / #64).
 *
 * For the Claude Code default (`providerName !== "codex"`) this is a no-op — its
 * token lives in the env and needs no file materialisation.
 *
 * For Codex it does three things, in the order Codex needs them:
 *
 * 1. Materialise the `CODEX_AUTH_JSON` secret into `$CODEX_HOME/auth.json`
 *    (mode 0600) — Sandcastle/`codex exec` fails fast if the file is absent.
 * 2. Ensure `$CODEX_HOME/config.toml` sets {@link CREDENTIALS_STORE_LINE}, so
 *    Codex reads that file rather than the unreachable OS keyring.
 * 3. Strip `OPENAI_KEY` / `OPENAI_API_KEY` from the env — if either is present
 *    Codex bills the metered API and can fail `Quota exceeded` even with a valid
 *    subscription. The workflow does not set them; this is the defensive backstop.
 *
 * `CODEX_AUTH_JSON` is validated as JSON and required when Codex is selected: a
 * missing/mangled secret is a wiring bug that should land the issue in
 * `agent:blocked`, not silently fall through to a broken run.
 *
 * @param providerName the resolved provider (`ctx.agent.name`)
 * @param env the environment to read the secret from and strip keys on; defaults
 *   to `process.env` (the live env `run()` hands to the spawned `codex exec`)
 */
export function prepareCodexAuth(
  providerName: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (providerName !== CODEX_PROVIDER) {
    return;
  }

  const codexHome = env.CODEX_HOME ?? path.join(env.HOME ?? os.homedir(), ".codex");
  const authJson = requireEnvFrom(env, "CODEX_AUTH_JSON");

  // Fail fast on a mangled secret rather than writing garbage Codex will reject
  // deep inside the run with a confusing error.
  try {
    JSON.parse(authJson);
  } catch (cause) {
    throw new Error(
      "CODEX_AUTH_JSON is not valid JSON — paste the whole contents of ~/.codex/auth.json as the secret value.",
      { cause },
    );
  }

  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "auth.json"), authJson, { mode: 0o600 });
  ensureFileCredentialStore(path.join(codexHome, "config.toml"));

  for (const name of OPENAI_KEY_VARS) {
    delete env[name];
  }
}

/**
 * Write (or reconcile) `config.toml` so the file credential store is selected.
 * A pre-existing `cli_auth_credentials_store = …` line is rewritten to `"file"`
 * so a stale keyring value can't win; otherwise the setting is appended, leaving
 * any other config the operator committed intact.
 */
function ensureFileCredentialStore(configPath: string): void {
  const keyLine = /^\s*cli_auth_credentials_store\s*=.*$/m;
  let content = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf8")
    : "";

  if (keyLine.test(content)) {
    content = content.replace(keyLine, CREDENTIALS_STORE_LINE);
  } else {
    const body = content.replace(/\s*$/, "");
    content = body ? `${body}\n${CREDENTIALS_STORE_LINE}\n` : `${CREDENTIALS_STORE_LINE}\n`;
  }

  fs.writeFileSync(configPath, content);
}

/**
 * {@link requireEnv} but reading a caller-supplied env object, so the check works
 * against the same `env` the rest of this module mutates (and stays unit-testable
 * without touching `process.env`).
 */
function requireEnvFrom(env: NodeJS.ProcessEnv, name: string): string {
  if (env === process.env) {
    return requireEnv(name);
  }
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
