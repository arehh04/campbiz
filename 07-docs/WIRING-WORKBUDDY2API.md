# Wiring the Bridge to a Live WorkBuddy Backend

**Status: WORKING (verified end-to-end on 2026-10-11).**

The bridge runs in **`openai` mode** and streams real model output from the
WorkBuddy backend, via the community `workbuddy2api` wrapper.

```
campusbiz-live.html  →  bridge-server.js :3333  →  workbuddy2api :8787  →  www.workbuddy.ai
       (browser)              (openai mode)          (OpenAI-compatible)      (real backend)
```

---

## 1. What was broken, and how it was fixed

Three separate bugs blocked the chain. All three are fixed.

### Bug 1 — `code:11128 "first message is not system prompt"`

The wrapper's `core/system_identity.py` strips client identity declarations
(e.g. *"You are Codex, powered by OpenAI"*) from system messages. The bug:
when a system message was *entirely* identity text, the filter **deleted the
message outright**. With the system message gone, the first message became
`user` — and the backend rejects that with error `11128`.

**Fix** (`core/system_identity.py`): a system message is now **never dropped**.
If filtering would empty it, it is replaced with neutral fallback text, so
`messages[0]` always stays `system`.

A second guard was added in `core/converter.py`: if the client sends **no**
system message at all, a neutral one is prepended. Both paths are now safe.

### Bug 2 — bridge dropped the `/v1` prefix (404)

`bridge-server.js` built the endpoint as:

```js
new URL('/chat/completions', base + '/')   // BUG: leading "/" discards the path prefix
```

The leading `/` made it an absolute path, so `http://127.0.0.1:8787/v1` became
`http://127.0.0.1:8787/chat/completions` → **404**.

**Fix**: concatenate the path so any base prefix survives. Verified for
`.../v1`, `.../v1/`, bare host, and multi-segment bases like `/openai/v1`.

### Bug 3 — config file at the wrong path

The bridge reads `~/.campusbiz-bridge.json` (and `./.campusbiz-bridge.json`).
The file was initially saved as `campusbiz-bridge.json`, so the bridge fell
back to **demo mode**.

**Fix**: installed at `C:/Users/HP/.campusbiz-bridge.json`.

---

## 2. Start the chain

### Easiest — one-click launcher

Double-click `START-CAMPUSBIZ.bat`, or from Git Bash run:

```bash
cd C:/Users/HP/campusbiz-output && ./start-campusbiz.sh
```

It starts the wrapper, starts the bridge, polls until both answer, then opens
the dashboard. Two console windows appear; close them to stop everything.

The rest of this section is the manual equivalent.

### Terminal 1 — wrapper

```bash
cd C:/Users/HP/workbuddy2api
export WORKBUDDY_BACKEND="https://www.workbuddy.ai"
export WORKBUDDY_ELECTRON_PATH="C:/Users/HP/AppData/Local/Programs/WorkBuddyAI/WorkBuddyAI.exe"
"C:/Users/HP/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe" \
  -c "import sys; sys.argv=['converter','--port','8787','--skip-check']; sys.path.insert(0,'.'); from core.converter import main; main()"
```

Wait for `监听 http://127.0.0.1:8787`.

> `WORKBUDDY_ELECTRON_PATH` is **required** — the wrapper calls the WorkBuddy
> Electron binary to decrypt the at-rest auth token. Without it you get
> `RuntimeError: 无法获取 WorkBuddy at-rest 密钥`.
>
> `WORKBUDDY_BACKEND` is **required** — the default `copilot.tencent.com` does
> not accept these tokens (returns `401` from APISIX).

### Terminal 2 — bridge

```bash
cd C:/Users/HP/campusbiz-output
node bridge-server.js
```

### Terminal 3 — dashboard

```bash
start C:/Users/HP/campusbiz-output/campusbiz-live.html
```

The badge should read **CONNECTED** and the health output should show
`"mode":"openai"`. Submit the pre-filled cookie goal.

---

## 3. Verify

```bash
# wrapper alive?
curl -s http://127.0.0.1:8787/v1/models

# bridge in openai mode?
curl -s http://127.0.0.1:3333/api/health
# expect: "mode":"openai", "openaiBase":"http://127.0.0.1:8787/v1"
```

---

## 4. Verified result

Real streamed run (446 SSE events, model `glm-5.2`, ~3s):

| Field | Value |
|---|---|
| `unit_contribution` | RM 2.50 |
| `required_daily_sales` | 40 |
| `capacity` | 40 |
| `estimated_daily_demand` | 50 |
| `recommended_price` | RM 7.00 |
| `feasibility_status` | **FEASIBLE** |

Note the verdict is **FEASIBLE** — different from the hardcoded demo fixture
(`NOT_FEASIBLE`). That difference is the proof this is live model output, not
a replay.

---

## 5. Mode precedence

`openai` → `api` → `cli` → `demo`

`openai` wins whenever `openaiBase` is set. The bundled CLI (`cli` mode) still
**hangs standalone** — it blocks on a desktop-app handshake. See
`LINKING-WORKBUDDY.md`. With `openai` mode working, the CLI is no longer needed.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `mode: "demo"` in health | config not found / `openaiBase` blank | confirm `C:/Users/HP/.campusbiz-bridge.json` exists |
| `404 Not Found` from wrapper | base URL missing `/v1`, or a leading-slash URL bug | ensure `openaiBase` ends in `/v1` |
| `code:11128` | system message missing or not first | already patched in `system_identity.py` + `converter.py` |
| `RuntimeError: ... at-rest 密钥` | `WORKBUDDY_ELECTRON_PATH` unset | export it (see §2) |
| `401 Authorization Required` | wrong backend | `WORKBUDDY_BACKEND=https://www.workbuddy.ai` |
| `ECONNREFUSED :8787` | wrapper not running | start Terminal 1 first |
| `ECONNREFUSED :3333` | bridge not running | start Terminal 2 |

### Changing the model

`/v1/models` on the wrapper lists live models (`hy3`, `hy4-preview`, `kimi-k3`,
…). Set `"openaiModel"` in the config, or leave it `"auto"`.
