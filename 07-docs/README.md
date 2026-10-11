# CampusBiz Autopilot — Live Agent Office

A **live-wired** agent dashboard that triggers your real **CampusBiz Orchestrator Expert Group** inside WorkBuddy and streams genuine execution events to the browser. No fake animations — every event comes from a real run, or is explicitly labelled `[SIMULATED]`.

```
~/campusbiz-output/
├── bridge-server.js      # local HTTP + SSE bridge  (zero dependencies)
├── campusbiz-live.html   # single-file dashboard
├── README.md             # this file
├── landing-page.html     # artifact (opened by the dashboard)
├── order-form.html       # artifact
├── marketing-calendar.md # artifact
└── operations-checklist.md
```

---

## 1. Quick start

> **Want live model output?** Start the `workbuddy2api` wrapper first, then the
> bridge. Full instructions, verified results, and troubleshooting are in
> **[`WIRING-WORKBUDDY2API.md`](./WIRING-WORKBUDDY2API.md)**.
> Without the wrapper the bridge runs in `demo` mode (a replay, clearly labelled
> `[SIMULATED]` in the log).

### Easiest: one-click launcher

Double-click **`START-CAMPUSBIZ.bat`** (or run `./start-campusbiz.sh` from Git
Bash). It starts the wrapper, starts the bridge, waits until both are healthy,
then opens the dashboard. Two console windows appear — close them to stop.

Skip to **Step 3** to verify, or read on for the manual route.

### Manual: three steps

#### Step 1 — start the wrapper (Terminal 1)

```bash
cd C:/Users/HP/workbuddy2api
export WORKBUDDY_BACKEND="https://www.workbuddy.ai"
export WORKBUDDY_ELECTRON_PATH="C:/Users/HP/AppData/Local/Programs/WorkBuddyAI/WorkBuddyAI.exe"
"C:/Users/HP/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe" \
  -c "import sys; sys.argv=['converter','--port','8787','--skip-check']; sys.path.insert(0,'.'); from core.converter import main; main()"
```

#### Step 2 — start the bridge (Terminal 2)

```bash
node ~/campusbiz-output/bridge-server.js
```

You should see:

```
  CampusBiz Autopilot — Bridge Server
  ----------------------------------
  Listening : http://127.0.0.1:3333
  Mode      : openai | api | cli | demo
  Agent     : campusbiz-orchestrator
  ...
```

### Step 3 — verify the health endpoint

```bash
curl http://localhost:3333/api/health
```

Expected (with the wrapper running):

```json
{ "ok": true, "mode": "openai", "agent": "campusbiz-orchestrator",
  "openaiBase": "http://127.0.0.1:8787/v1", ... }
```

### Step 4 — open the dashboard

Open `~/campusbiz-output/campusbiz-live.html` in Chrome (double-click it, or drag it into a tab).
The badge in the top-right should turn **green — "Bridge online"**.

### Step 5 — run a workflow

1. Edit the goal textarea if you like (it's pre-filled with the cookie scenario).
2. Click **🚀 Launch Agent Workflow**.
3. Watch the desks light up and the Live Event Log fill in.

---

## 2. How the wiring works

```
 ┌────────────────────┐   POST /api/run        ┌────────────────────────┐
 │ campusbiz-live.html│ ─────────────────────► │  bridge-server.js      │
 │  (browser)         │                        │  (Node, localhost)     │
 │                    │ ◄────── SSE ────────── │                        │
 │  EventSource       │  GET /api/stream/:id   │  spawns / proxies the  │
 └────────────────────┘                        │  real WorkBuddy run    │
                                               └───────────┬────────────┘
                                                           │
                                            ┌──────────────┴──────────────┐
                                            │  WorkBuddy Expert Group     │
                                            │  campusbiz-orchestrator     │
                                            │  ├ finance-expert           │
                                            │  ├ demand-expert            │
                                            │  ├ growth-expert            │
                                            │  └ operations-expert        │
                                            └─────────────────────────────┘
```

The bridge has **three modes**, chosen automatically:

| Mode | When it's used | What happens |
|------|----------------|--------------|
| `api` | `workbuddyApiBase` **and** `workbuddyApiKey` are set | Proxies the WorkBuddy streaming API |
| `cli` | The `WORKBUDDY_CLI` command is found on PATH | Spawns the CLI, pipes stdout/stderr line-by-line as SSE |
| `demo` | Neither of the above | Replays the reference cookie scenario, **every event tagged `simulated: true`** |

> The dashboard only ever shows `[SIMULATED]` when the bridge itself declares an event simulated. Real `api`/`cli` events are never labelled simulated.

---

## 3. Configuration

The bridge reads config in this precedence order (highest wins):

1. **Environment variables**
2. **`~/.campusbiz-bridge.json`**
3. Built-in defaults

### `~/.campusbiz-bridge.json`

```json
{
  "port": 3333,
  "workbuddyApiBase": "http://localhost:PORT/v1",
  "workbuddyApiKey": "",
  "workbuddyCli": "workbuddy",
  "agentName": "campusbiz-orchestrator",
  "outputDir": "~/campusbiz-output/"
}
```

Copy the block above into `~/.campusbiz-bridge.json` and edit as needed.

### Environment variables

| Variable | Maps to | Default |
|----------|---------|---------|
| `CAMPUSBIZ_PORT` | `port` | `3333` |
| `WORKBUDDY_API_BASE` | `workbuddyApiBase` | *(empty)* |
| `WORKBUDDY_API_KEY` | `workbuddyApiKey` | *(empty)* |
| `WORKBUDDY_CLI` | `workbuddyCli` | `workbuddy` |
| `CAMPUSBIZ_AGENT` | `agentName` | `campusbiz-orchestrator` |
| `CAMPUSBIZ_OUTPUT_DIR` | `outputDir` | `~/campusbiz-output` |
| `CAMPUSBIZ_CLI_ARGS` | extra CLI args (space-separated) | *(empty)* |
| `CAMPUSBIZ_ALLOW_DEMO` | allow demo replay | `1` |

> **API keys are never hard-coded.** The bridge reads them from env/config only, never logs them, and never returns them in any response body.

---

## 5. API reference

### `POST /api/run`
Body: `{ "goal": "..." }` → `{ "sessionId": "...", "mode": "cli" }`

### `GET /api/stream/:sessionId`
Server-Sent Events. Each message:

```json
{ "type": "log" | "agent_status" | "result" | "notice" | "data" | "done" | "error",
  "agent": "finance",
  "status": "WORKING",
  "message": "Calculating unit contribution...",
  "ts": 1234567890 }
```

Late/reconnecting clients receive a **replay buffer** of everything already emitted.

### `POST /api/stop/:sessionId`
Kills the running task (CLI child process or in-flight API request).

### `GET /api/health`
`{ ok, mode, agent, outputDir, cliAvailable, apiConfigured, sessions, ts }`

### `GET /api/artifact/:filename`
Serves a real file from `outputDir` (path-traversal safe). This is what the artifact cards open.

---

## 6. Since no API key is needed — use the bundled CLI

**You do not need to create a WorkBuddy API key.** WorkBuddy ships a CLI that
runs the Expert Group directly and shares the desktop app's config/auth.

**The CLI lives here:**

```
C:\Users\HP\AppData\Local\Programs\WorkBuddyAI\resources\app.asar.unpacked\cli\bin\codebuddy
```

**RECOMMENDED: use `openai` mode instead.**

The bundled CLI blocks on a desktop-app handshake when run standalone, so
`cli` mode is unreliable. The working route is the community `workbuddy2api`
wrapper, which exposes the same subscription as an OpenAI-compatible API on
port 8787. Set:

```json
// ~/.campusbiz-bridge.json
{
  "openaiBase": "http://127.0.0.1:8787/v1",
  "openaiApiKey": "local",
  "openaiModel": "auto",
  "outputDir": "~/campusbiz-output/"
}
```

The bridge switches to `openai` mode automatically and streams real model
output. **Full setup, verified results, and troubleshooting:
[`WIRING-WORKBUDDY2API.md`](./WIRING-WORKBUDDY2API.md).**

The CLI route is still available as a fallback — point the bridge at it and it
uses `cli` mode:

```json
{
  "workbuddyCli": "C:/Users/HP/AppData/Local/Programs/WorkBuddyAI/resources/app.asar.unpacked/cli/bin/codebuddy",
  "cliFlavor": "codebuddy",
  "agentName": "campusbiz-orchestrator"
}
```

The bridge then runs:

```
codebuddy -p --agent campusbiz-orchestrator --output-format stream-json \
          --include-partial-messages --permission-mode acceptEdits "<your goal>"
```

and parses the newline-delimited JSON from stdout into SSE events.

> **Known environment caveat:** run standalone, the bundled CLI tries to reach
> back into the running WorkBuddy desktop app and may hit
> `EADDRINUSE` / `fetch config failed`. The bridge detects this and prints a
> hint. See `LINKING-WORKBUDDY.md` for the full investigation and both
> workarounds (run the bridge as a WorkBuddy child, or use `--serve`).

See `campusbiz-bridge.example.json` for a ready-to-copy config, and
`LINKING-WORKBUDDY.md` for the complete findings.

---

## 7. Troubleshooting

**Badge stays red / "Bridge offline"**
- The bridge isn't running, or is on a different port. Confirm with `curl http://localhost:3333/api/health`.
- Start it: `node ~/campusbiz-output/bridge-server.js`
- If port 3333 is taken: `CAMPUSBIZ_PORT=3334 node bridge-server.js` (and update `BRIDGE` in the HTML).

**`EADDRINUSE` on start**
- Another process holds the port. Find/kill it, or use `CAMPUSBIZ_PORT`.

**Mode shows `demo`**
- `openaiBase` is blank **and** the `workbuddy` CLI isn't on PATH.
- To go real, set `openaiBase` to `http://127.0.0.1:8787/v1` (wrapper mode —
  see `WIRING-WORKBUDDY2API.md`). Confirm the config is at
  `C:/Users/HP/.campusbiz-bridge.json` — the bridge reads that exact path, and
  silently falls back to `demo` if it is missing or misplaced.

**`404 Not Found` from the wrapper**
- The base URL is missing its `/v1` suffix, or a leading-slash URL bug dropped
  the prefix. Ensure `"openaiBase": "http://127.0.0.1:8787/v1"`.

**Wrapper returns `code:11128`**
- The upstream requires the first message to be a `system` message.
- Already patched in `core/system_identity.py` and `core/converter.py`. If you
  pull a fresh copy of the wrapper, re-apply the patch.

**Bridge says `cli` but nothing streams**
- Check the bridge console — the exact command it ran is logged.
- Confirm the command pattern matches your WorkBuddy build. The default is:
  `workbuddy task run --agent campusbiz-orchestrator --prompt "<goal>" --stream`
- Adjust `workbuddyCli` / `CAMPUSBIZ_CLI_ARGS` to match your actual CLI syntax.

**Artifact cards say "No artifacts found"**
- The bridge couldn't find matching files in `outputDir`. Confirm `outputDir` in `/api/health` points at `~/campusbiz-output`.

**SSE drops / "Stream connection dropped"**
- Normal for long runs. The dashboard auto-reconnects (2s backoff) and replays the buffer.

**CORS errors in console**
- The bridge sets `Access-Control-Allow-Origin: *`. If you see CORS errors, you're probably hitting a different port than the bridge is on.

---

## 8. Security notes

- The bridge binds to **127.0.0.1 only** — not reachable from other machines on your network.
- `outputDir` file serving is restricted to `path.basename` (no directory traversal).
- The CLI is spawned **without a shell** (`shell: false`), and the goal is passed as a single argv element — no shell injection.
- API keys live only in env/config and are never echoed to logs or responses.
