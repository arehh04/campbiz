# Evidence — "One Prompt, One Goal, End-to-End Execution"

**Criterion:** One prompt, one goal, end-to-end execution
**Status:** ✅ PASS
**Captured:** 2026-10-11 (GMT+8)
**Repo:** `campbiz` (`campusbiz-hackathon-submission`, origin `github.com/arehh04/campbiz.git`)

---

## 1. The claim

A single user prompt — no follow-ups, no mid-run steering, no manual per-agent
hand-offs — drove the CampusBiz agent team from a bare business idea all the way
to a finished, cross-validated execution plan **plus** four downloadable
artifacts.

## 2. The single prompt (verbatim)

> I have a campus micro-business idea. Please run the full CampusBiz team workflow.
> Business: I sell homemade cookies on campus.
> - Price: RM5 per box
> - Goal: earn RM6,000 per month
> - Capacity: max 40 boxes per day
> - Operating days: 26 per month
> - Variable cost and fixed cost: not sure, please state your assumptions clearly

That is the **entire** input. Everything below was produced from it in one turn.

## 3. What the one prompt produced end-to-end

| Phase | Activity | Executed by | Output |
|---|---|---|---|
| 0 | Goal parse + assumption lock | Orchestrator | Structured goal, RM2.20 VC / RM450 FC assumptions |
| 1 | Parallel 3-way computation | finance / demand / operations experts (spawned concurrently) | 3 independent JSON payloads |
| 2 | Cross-validation + feasibility ruling | Orchestrator | **NOT_FEASIBLE** (89 required vs 40 capacity = 2.23×) |
| 3 | Refinement + asset generation | operations (recompute) + growth (assets) | Ramp/scale ops plan + 3 real files |
| 4 | Unified plan assembly | Orchestrator | Final plan document |

**No human intervention occurred between phases.** No prompt was issued after
the initial one. The orchestrator routed, validated, rejected, and compiled
autonomously.

## 4. Evidence trail

### 4.1 Multiple agents, actually invoked (not simulated)

Four distinct sub-agents were spawned, each returning its own structured JSON:

| Agent ID | Role | Returned |
|---|---|---|
| `finance-expert` | 算得清 / Finance | `unit_contribution 2.80`, `required_daily_sales 89`, `NOT_FEASIBLE` |
| `demand-expert` | 丘知本 / Demand | `estimated_daily_demand 11` (SIMULATED, band 5–22) |
| `operations-expert` | 运转安 / Operations | `daily_capacity 40`, `prep_quantity 30` (v1) + `12/40` ramp/scale (v2) |
| `growth-expert` | 张声艺 / Growth | 3 real files written to disk |

Agent IDs are recorded in the run trace (e.g. `agent-935595fb212e4303`,
`agent-485fd1c0ee8d44c5`, `agent-847540e57e7847e2`, `agent-c68f4650d5874c9c`).

### 4.2 The finance number came from the mandated tool, not the model

The finance expert was required to use the `finance-calculator` skill
(`03-skills/finance-calculator/scripts/calc.py`). Raw stdout from the run:

```json
{
  "inputs": {"price": 5.0, "variableCost": 2.2, "fixedCost": 450.0,
             "targetProfit": 6000.0, "operatingDays": 26.0, "capacity": 40.0},
  "unitContribution": 2.8,
  "requiredMonthlySales": 2304,
  "requiredDailySales": 89,
  "monthlyRevenue": 11520.0,
  "monthlyProfit": 6001.2,
  "feasibility": "NOT_FEASIBLE",
  "explanation": "Unit contribution is 2.80. Reaching the target requires 2304
    units/month (89/day), which is 122.5% above your capacity of 40/day. ..."
}
```

### 4.3 The orchestrator rejected an unrealistic goal (the hard gate)

This is the strongest proof of genuine end-to-end reasoning: the run did **not**
just please the user. It applied the SOP's mandatory rule
`required_sales > capacity → NOT_FEASIBLE` and refused the RM6,000 target,
then quantified correction paths and the honest ceiling (**RM2,460/month**).

### 4.4 Artifacts produced without further prompting

Written to `C:/Users/HP/WorkBuddy AI/2026-10-11-08-22-06/outputs/`:

| File | Bytes | Purpose |
|---|---|---|
| `CampusBiz-Cookie-Business-Plan.md` | 10535 | Final unified execution plan |
| `campusbiz-landing-page.html` | 8430 | Mobile order page (live-previewed) |
| `campusbiz-7-day-marketing-calendar.md` | 6265 | 7-day launch calendar |
| `campusbiz-poster.svg` | 4126 | Promotional poster |

## 5. Verification checklist

| Check | Result |
|---|---|
| Input was a single prompt (no follow-ups) | ✅ PASS |
| Work spanned all 5 SOP phases (0→4) | ✅ PASS |
| ≥3 specialist agents invoked independently | ✅ PASS (4) |
| Finance numbers produced by mandated tool | ✅ PASS (`calc.py`) |
| Cross-validation gate applied, not softened | ✅ PASS (NOT_FEASIBLE) |
| Outputs materialised as real files on disk | ✅ PASS (4 files) |
| Required final deliverable assembled | ✅ PASS (unified plan) |
| Human intervention required mid-run | ✅ NONE |

## 6. Reproduction

```text
Prompt        : the verbatim text in §2
Workspace     : C:/Users/HP/WorkBuddy AI/2026-10-11-08-22-06
Outputs       : ./outputs/ (4 files)
Plan produced : outputs/CampusBiz-Cookie-Business-Plan.md
Team config   : 02-team-type/agents/campusbiz-orchestrator-team-lead.md
```

---

*This document is evidence for the "one prompt, one goal, end-to-end execution"
criterion. It records a real run, not a fixture: the deciding numbers differ
from any hardcoded demo and were produced by the bundled tooling.*
