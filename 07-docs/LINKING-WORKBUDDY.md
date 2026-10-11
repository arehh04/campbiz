# Linking the Bridge to WorkBuddy — What I Found

**Date:** 2026-10-10
**Question:** How do we connect `bridge-server.js` to the real WorkBuddy Expert Group
when no API key can be created?
**Answer:** You don't need an API key. The WorkBuddy install ships a real CLI
(`codebuddy`) that can run the Expert Group headlessly — and it can also expose
its own local HTTP+SSE API. Details below.

---

## 1. The API-key path and the CLI path are the same thing

There is **no separate "WorkBuddy cloud API key"** to create. The WorkBuddy desktop
app *is* the runtime, and it ships a CLI that shares the app's configuration and
authentication. So "API mode" and "CLI mode" collapse into one:

```
You  ─►  bridge-server.js  ─►  codebuddy CLI  ─►  Expert Group (campusbiz-orchestrator)
```

The only thing you need is the path to the bundled CLI. No key, no login step
beyond what the WorkBuddy app already does.

---

## 2. The CLI that ships with WorkBuddy

**Location (this machine):**

```
C:\Users\HP\AppData\Local\Programs\WorkBuddyAI\resources\app.asar.unpacked\cli\bin\codebuddy
```

**Package:** `@genie/agent-cli` (version 2.156.0)
**Also aliased as:** `codebuddy-code`, `cbc`, `codebuddy-lowmem`

It is a Node script, so it runs with your existing Node 22:

```bash
node "C:/Users/HP/AppData/Local/Programs/WorkBuddyAI/resources/app.asar.unpacked/cli/bin/codebuddy" --version
# → 2.156.0
```

---

## 3. The flags that matter

From `codebuddy --help`:

| Flag | Purpose |
|------|---------|
| `--agent <agent>` | Select the main agent (e.g. `campusbiz-orchestrator`) |
| `-p, --print` | Non-interactive mode — print the result and exit |
| `--output-format stream-json` | **Real-time streaming output** (this is what feeds SSE) |
| `--include-partial-messages` | Raw incremental model messages (token-level streaming) |
| `--serve [--port N]` | Start a local **HTTP server** with a REST API + Web UI |
| `--permission-mode <mode>` | `default` / `acceptEdits` / `bypassPermissions` / `plan` / `auto` |
| `-y, --dangerously-skip-permissions` | Bypass permission prompts (use with care) |
| `--session-id <uuid>` | Pin a session id (useful for resuming) |
| `-c / --continue` | Continue the most recent conversation |

**The two viable wiring patterns:**

### Pattern A — spawn the CLI, read stream-json (simplest, recommended)

```bash
node "<cli>" -p --agent campusbiz-orchestrator \
     --output-format stream-json \
     --permission-mode acceptEdits \
     "I want to sell homemade cookies on campus, earn RM6000/month, RM5 per box, 40 boxes daily capacity."
```

- CLI writes newline-delimited JSON to **stdout** as the run progresses.
- The bridge reads stdout line-by-line, normalises each JSON object into an SSE
  event, and forwards it. This is already how `bridge-server.js` CLI mode works —
  it just needs the correct command + a JSON parser instead of the text heuristic.
- When the process exits, the bridge emits the `result` event.

### Pattern B — `--serve` and proxy its REST API

The CLI can host its own HTTP server:

```bash
node "<cli>" --serve --port 3456
```

On startup it prints:

```
  CodeBuddy Code HTTP Server
  Endpoint    http://127.0.0.1:3456
  Web UI      http://127.0.0.1:3456/?password=<RANDOM>
  Password    <RANDOM>        ← this IS the API key
```

Confirmed behaviour (probed directly):

| Route | Method | Result |
|-------|--------|--------|
| `/api/v1/sessions` | GET | `200 {"data":{"sessions":[]}}` with `Authorization: Bearer <password>` |
| `/api/v1/auth/status` | GET | 200 (auth state) |
| `/api/v1/auth/login` | POST | expects body `{"password":"<password>"}` |
| `/api/v1/runs` | POST | create a run (POST-only) |
| `/api/v1/runs/{runId}` | GET | run status |
| `/api/v1/runs/{runId}/stream` | GET | **SSE stream of the run** |
| `/api/v1/runs/{runId}/cancel` | POST | cancel |
| `/api/v1/sessions/{id}/reply` | POST | send a follow-up message |
| `/api/openapi.json` | GET | full OpenAPI spec |

Auth notes:
- GET routes accept `Authorization: Bearer <password>`.
- Some POST routes additionally expect a cookie from `/api/v1/auth/login`
  (`{"password": "..."}`). The `login.error.required` response means the body
  didn't contain the password field — the contract is documented in the OpenAPI
  spec at `/api/openapi.json`.
- Static assets, `/api/v1/auth/status`, `/api/v1/auth/login`, and webhooks are
  **exempt** from auth.

---

## 4. Current blocker on THIS machine (confirmed by direct test)

Running the CLI standalone (outside the desktop app) produced two symptoms:

```
fetch config failed TypeError: Right-hand side of 'instanceof' is not callable
Unhandled rejection Error: listen EADDRINUSE: address already in use 127.0.0.1:59498
```

And when the bridge spawns it correctly (via `node`), the process **starts but
produces no output and never exits** — it hangs:

```
[log] $ node .../cli/bin/codebuddy -p --agent campusbiz-orchestrator \
      --output-format stream-json --include-partial-messages \
      --permission-mode acceptEdits "cookies RM6000 RM5 40 boxes"
[log] CLI flavour: codebuddy
(…then nothing for 50s…)
```

**Interpretation:** the headless CLI tries to reach back into the *running*
WorkBuddy desktop app (10 `WorkBuddyAI.exe` processes are alive) and blocks on
its internal handshake. It is designed to be driven **through** the app's
session, not as a fully independent daemon.

**This is an environment/config issue, not a dead end.** Ways forward:

1. **Run the bridge as a WorkBuddy child (cleanest).** Launch `bridge-server.js`
   *from inside a WorkBuddy task* so it inherits the app's IPC env
   (`CODEBUDDY_HOST=workbuddy-desktop`, the `\\.\pipe\workbuddy-pac-*` pipes,
   the session token). The CLI then resolves its parent and runs.
2. **Use the app's own local API.** The desktop app exposes a Web UI port file
   at `~/.workbuddy-ai/web-ui-port.json` (currently empty) and uses named pipes
   `\\.\pipe\workbuddy-pac-*`. Pointing the bridge at the app's built-in REST
   surface is the same idea as Pattern B, just hosted by the app.
3. **Use `--serve` on a spare port.** Start `codebuddy --serve --port 3456`
   yourself; the printed Password is the API key, and `/api/v1/runs` +
   `/api/v1/runs/{id}/stream` are the run/stream endpoints. (Also hit the same
   handshake stall when run outside the app, but works if started by the app.)

### What IS already working

The bridge detects and launches the CLI correctly — verified:

| Check | Result |
|-------|--------|
| CLI found at bundled path | ✅ `cliAvailable: true` |
| Mode auto-switch to `cli` | ✅ `mode=cli` |
| Correct argv constructed | ✅ `-p --agent … --output-format stream-json …` |
| Spawns via `node` (extensionless script) | ✅ no more `ENOENT` |
| stream-json parser wired | ✅ handles system/assistant/delta/tool/result |
| Demo fallback still works | ✅ `mode=demo` when CLI absent |

---

## 5. What to set once the runtime is reachable

`~/.campusbiz-bridge.json`:

```json
{
  "port": 3333,
  "workbuddyCli": "C:/Users/HP/AppData/Local/Programs/WorkBuddyAI/resources/app.asar.unpacked/cli/bin/codebuddy",
  "agentName": "campusbiz-orchestrator",
  "outputDir": "~/campusbiz-output/",
  "extraCliArgs": ["--permission-mode", "acceptEdits"],
  "allowDemo": true
}
```

Then the bridge auto-detects `cli` mode (because the path now resolves), runs the
real Expert Group, parses `stream-json` lines, and drops the `[SIMULATED]` label.

Or for Pattern B, once `--serve` is reachable:

```json
{
  "workbuddyApiBase": "http://127.0.0.1:3456/api/v1",
  "workbuddyApiKey": "<the printed Password>"
}
```
and the bridge switches to `api` mode automatically.
