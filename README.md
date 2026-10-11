# CampusBiz Autopilot — Hackathon Submission

An **AI agent team** that turns a rough campus micro-business idea into a
validated, executable launch plan — with a live operations dashboard and a
real streaming backend.

---

## The problem

A student says: *"I want to sell homemade cookies on campus, earn RM6,000 a
month, RM5 per box, 40 boxes daily capacity."*

A single AI answer to that is a wall of text with no accountability. The
interesting questions — *is the target even reachable? does demand clear
capacity? what's the binding constraint?* — get buried.

**CampusBiz Autopilot answers with a team, not a monologue.** A lead
orchestrator splits the goal into four workstreams, four specialists each
compute their own slice against a real tool, and the lead **cross-validates**
the results. When the numbers conflict, it says so and names the binding
constraint.

For the cookie scenario the live model returned:

> `capacity = 40/day` vs `required_daily_sales = 40/day` vs `demand = 50/day`
> → **FEASIBLE**, recommended price **RM7.00**, unit contribution **RM2.50**

---

## What's in this folder

| Folder | Contents |
|---|---|
| `01-experts/` | The **4 member experts** as standalone packages — finance, demand, growth, operations. Each has a `plugin.json`, an `agents/*.md` spec, and a README. |
| `02-team-type/` | The **team-type expert** (`expertType: "team"`) — the orchestrator package with the team lead + all 4 member specs, plus the marketplace manifest and prebuilt `.zip` bundles. |
| `03-skills/` | The **3 skills created for this project**: `finance-calculator`, `artifact-generator`, `agent-team-orchestration`. |
| `04-output/` | The **generated business artifacts** — landing page, order form, marketing calendar, operations checklist. |
| `05-dashboard/` | `campusbiz-live.html` — single-file live agent-office dashboard. |
| `06-server/` | `bridge-server.js` — zero-dependency Node bridge, bridge configs, and the **one-click launchers** (`START-CAMPUSBIZ.bat`, `start-campusbiz.sh`). |
| `07-docs/` | Full setup, wiring, and troubleshooting documentation. |
| `08-evidence/` | Verification record and file manifest with SHA-256 checksums. Includes [`E2E-ONE-PROMPT-EVIDENCE.md`](08-evidence/E2E-ONE-PROMPT-EVIDENCE.md) — proof of **one prompt → one goal → end-to-end execution**. |

---

## The system

```
┌──────────────────────────────────────────────────────────────┐
│  campusbiz-live.html    (dashboard — single file, no deps)   │
│  · agent office floor: 5 desks + SVG connection lines        │
│  · live event log via SSE                                    │
│  · results panel: feasibility badge + key numbers            │
└───────────────────────────┬──────────────────────────────────┘
                            │  EventSource (SSE)
┌───────────────────────────▼──────────────────────────────────┐
│  bridge-server.js :3333   (zero-dep Node HTTP + SSE)         │
│  POST /api/run · GET /api/stream/:id · POST /api/stop/:id    │
│  GET  /api/health · GET /api/artifact/:file                  │
│  modes: openai → api → cli → demo  (auto-detected)           │
└───────────────────────────┬──────────────────────────────────┘
                            │  OpenAI Chat Completions (stream)
┌───────────────────────────▼──────────────────────────────────┐
│  workbuddy2api :8787      (OpenAI-compatible wrapper)        │
└───────────────────────────┬──────────────────────────────────┘
                            │
                    WorkBuddy backend
```

### The four workstreams

| Expert | Persona | Owns | Tool |
|---|---|---|---|
| Orchestrator (lead) | Bryan Zheng | decomposition, cross-validation, final verdict | — |
| Finance | Fiona Suan | unit contribution, break-even, feasibility gate | `finance-calculator` |
| Demand | Qiu Zhiben | daily demand estimate, labelled when simulated | — |
| Growth | Zhang Shengyi | launch assets (real files on disk) | `artifact-generator` |
| Operations | Yun Zhuanzhuan | capacity-respecting daily plan | — |

---

## Quick start

The bridge runs in **`demo` mode** out of the box — a clearly labelled
`[SIMULATED]` replay, so the dashboard is always demonstrable.

For **live model output**, run the wrapper first.

### Easiest — one-click launcher

Double-click **`06-server/START-CAMPUSBIZ.bat`** (or run
`./06-server/start-campusbiz.sh` from Git Bash). It starts the wrapper, starts
the bridge, waits until both are healthy, then opens the dashboard. Two console
windows appear — close them to stop everything.

### Manual — three terminals

```bash
# Terminal 1 — wrapper
cd C:/Users/HP/workbuddy2api
export WORKBUDDY_BACKEND="https://www.workbuddy.ai"
export WORKBUDDY_ELECTRON_PATH="C:/Users/HP/AppData/Local/Programs/WorkBuddyAI/WorkBuddyAI.exe"
"C:/Users/HP/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe" \
  -c "import sys; sys.argv=['converter','--port','8787','--skip-check']; sys.path.insert(0,'.'); from core.converter import main; main()"

# Terminal 2 — bridge
cd 06-server && node bridge-server.js

# Terminal 3 — dashboard
start ../05-dashboard/campusbiz-live.html
```

Confirm live mode before demoing:

```bash
curl http://localhost:3333/api/health
# expect: "mode":"openai"
```

Full details: [`07-docs/WIRING-WORKBUDDY2API.md`](07-docs/WIRING-WORKBUDDY2API.md).

---

## Engineering notes

Three real bugs were found and fixed during development. All are documented
with before/after evidence in [`08-evidence/VERIFICATION.md`](08-evidence/VERIFICATION.md).

1. **`code:11128 "first message is not system prompt"`** — the wrapper's
   identity filter deleted system messages that were entirely identity text,
   leaving `messages[0]` as `user`. Fixed so a system message is never dropped.
2. **Bridge 404** — `new URL('/chat/completions', base)` let a leading slash
   discard the `/v1` prefix. Fixed to preserve any base path.
3. **Silent `demo` fallback** — the bridge reads `~/.campusbiz-bridge.json`;
   a misplaced config degraded it to replay mode without warning. Resolved.

### Security posture

- No API keys committed. Config is env-var overridable and key-free by default.
- Bound to `127.0.0.1` only.
- `shell: false` spawn with a single argv element — no shell injection.
- `path.basename` guard on the artifact endpoint — no path traversal
  (verified: `../` returns 404).
- Zero npm dependencies in the bridge — built-in modules only.

---

## Verification

Live end-to-end run on 2026-10-11: **446 SSE events**, model `glm-5.2`, ~3 s.

| Field | Value |
|---|---|
| `unit_contribution` | RM 2.50 |
| `required_daily_sales` | 40 |
| `capacity` | 40 |
| `estimated_daily_demand` | 50 |
| `recommended_price` | RM 7.00 |
| `feasibility_status` | **FEASIBLE** |

The demo fixture always answers `NOT_FEASIBLE`. The live model answered
`FEASIBLE` at a different price point — that divergence is what confirms the
output is genuinely computed, not replayed.

Reproduce: `07-docs/WIRING-WORKBUDDY2API.md` §3.
