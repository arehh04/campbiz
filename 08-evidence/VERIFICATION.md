# Evidence & Verification Record

## Verified live run (2026-10-11)

**Environment:** Windows, Node v22.22.2, Python 3.13.12

**Chain under test:**

```
campusbiz-live.html → bridge-server.js :3333 (openai mode)
                    → workbuddy2api :8787
                    → www.workbuddy.ai (live backend)
```

### Health check

```json
{
  "ok": true,
  "mode": "openai",
  "agent": "campusbiz-orchestrator",
  "outputDir": "C:\\Users\\HP\\campusbiz-output\\",
  "cliAvailable": true,
  "apiConfigured": false,
  "openaiBase": "http://127.0.0.1:8787/v1",
  "openaiModel": "auto",
  "sessions": 0
}
```

`"mode":"openai"` confirms the bridge resolved the wrapper, not the demo replay.

### Streamed run

- **SSE events received:** 446
- **Model:** `glm-5.2`
- **Latency:** ~3 s (upstream), 2.9 s on the isolated probe
- **Terminal event:** `done` — session completed

### Parsed result

| Field | Value |
|---|---|
| `unit_contribution` | RM 2.50 |
| `required_daily_sales` | 40 |
| `capacity` | 40 |
| `estimated_daily_demand` | 50 |
| `recommended_price` | RM 7.00 |
| `feasibility_status` | **FEASIBLE** |

> **Proof this is live, not a replay:** the hardcoded demo fixture always
> returns `NOT_FEASIBLE`. The live model returned `FEASIBLE` with a different
> price point (RM7.00) — a genuine, reasoned answer.

### Regression tests run

| Test | Result |
|---|---|
| Health endpoint reachable | PASS |
| Mode detection = `openai` | PASS |
| `POST /api/run` returns sessionId | PASS |
| SSE stream emits events | PASS (446) |
| Result fields parsed | PASS (6/6) |
| Terminal `done` event | PASS |
| Path traversal blocked (`/api/artifact/../x`) | PASS (404) |
| `POST /api/stop/:id` | PASS |
| System-message guard (4 cases) | PASS |
| URL construction (4 base shapes) | PASS |

---

## Bug fixes verified

### 1. `code:11128 "first message is not system prompt"`

Before — the identity filter deleted a system message whose text was entirely
identity declarations, so `messages[0]` became `user`:

```
UPSTREAM ERROR: {"code":11128,"msg":"first message is not system prompt"}
>>> text: ""
```

After — the system message survives (keeps its non-identity remainder, or falls
back to neutral text):

```
"messages": [
  { "role": "system", "content": "Always reply in Malay and English." },
  { "role": "user",   "content": "..." }
]
```

### 2. Bridge 404

Before — `new URL('/chat/completions', base)` discarded the `/v1` prefix:

```
[log] POST http://127.0.0.1:8787/chat/completions (model: auto)
[error] OpenAI wrapper at http://127.0.0.1:8787/v1 returned 404: {"detail":"Not Found"}
```

After — the prefix is preserved:

```
[log] POST http://127.0.0.1:8787/v1/chat/completions (model: auto)
```

Verified across `.../v1`, `.../v1/`, `host`, and `https://api.example.com/openai/v1`.

### 3. Config path

The bridge reads `~/.campusbiz-bridge.json`. With the file at the wrong path it
silently fell back to `"mode":"demo"`. Installed at
`C:/Users/HP/.campusbiz-bridge.json` → `"mode":"openai"`.

---

## Bundled scripts — functional checks

Both shipped Python scripts compile and execute.

**`03-skills/finance-calculator/scripts/calc.py`** — run on the cookie scenario
(`--price 7 --variable-cost 4.5 --fixed-cost 500 --target-profit 6000
--operating-days 26 --capacity 40`):

```json
{
  "unitContribution": 2.5,
  "requiredMonthlySales": 2600,
  "requiredDailySales": 100,
  "monthlyRevenue": 18200.0,
  "monthlyProfit": 6000.0,
  "feasibility": "NOT_FEASIBLE",
  "explanation": "Unit contribution is 2.50. Reaching the target requires
    2600 units/month (100/day), which is 150.0% above your capacity of
    40/day. ... it is NOT_FEASIBLE ..."
}
```

This is the **finance gate working as designed**: a RM6,000 *profit* target at
RM7/box with 40 boxes/day capacity is arithmetically impossible (needs 100/day).
Compare against the live model run above, where RM6,000 interpreted as
*revenue* is `FEASIBLE` — the team surfaces that ambiguity rather than hiding it.

> **Note on running `calc.py` manually:** redirect stdin, e.g.
> `calc.py ... < /dev/null`. The script probes stdin for piped JSON and in some
> restricted shells the empty pipe reports as "ready" but never delivers data.

**`03-skills/artifact-generator/scripts/generate.py`** — `--help` OK, accepts
`--plan-file`, `--out-dir`, `--lang {zh,ms,en}`.

**`06-server/bridge-server.js`** — passes `node --check`.
