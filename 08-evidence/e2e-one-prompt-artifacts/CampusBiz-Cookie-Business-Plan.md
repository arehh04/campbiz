# CampusBiz Unified Execution Plan
## Homemade Cookies — Campus Micro-Business

**Prepared by:** Bryan Zheng (CampusBiz Orchestrator)
**Team:** Finance Specialist (算得清) · Demand Analyst (丘知本) · Operations Planner (运转安) · Growth Marketer (张声艺)
**Date:** 11 October 2026

---

## 1. ONE-PAGE VERDICT

> # 🔴 NOT_FEASIBLE
> **The RM6,000/month profit target cannot be reached at RM5/box within a 40-box/day capacity.**

**One-line conclusion:** To earn RM6,000/month you would need to sell **89 boxes/day**, but you can only produce **40/day** — the target is **2.23× your capacity**. The honest, achievable ceiling at full capacity is **RM2,460/month profit**.

### Key numbers

| Metric | Value | Notes |
|---|---|---|
| Target daily sales (for RM6k) | **89 boxes/day** | from finance-calculator |
| Hard daily capacity | **40 boxes/day** | user-confirmed |
| Capacity gap | **2.23×** | target needs 122.5% more than possible |
| Unit contribution | **RM2.80/box** | RM5.00 − RM2.20 variable cost |
| Estimated daily demand (SIMULATED) | **11 boxes/day** | band 5–22 |
| **Realistic max monthly profit** | **RM2,460** | at 40/day × 26 days = 1,040 boxes |
| Monthly break-even (cover fixed cost) | 161 boxes/month (~7/day) | RM450 ÷ RM2.80 |

---

## 2. GOAL & ASSUMPTIONS

### User's original goal (confirmed)
| Parameter | Value | Status |
|---|---|---|
| Product | Homemade cookies, 1 box/unit | ✅ confirmed |
| Price | RM5.00 per box | ✅ confirmed |
| Target monthly profit | RM6,000 | ✅ confirmed |
| Daily capacity (hard cap) | 40 boxes/day | ✅ confirmed |
| Operating days | 26/month | ✅ confirmed |

### Assumptions adopted (user could not supply)
| Parameter | Value | Basis | Status |
|---|---|---|---|
| Variable cost / box | **RM2.20** | ingredients ~RM1.40 + packaging ~RM0.45 + delivery/gas ~RM0.35 | ⚠️ **assumed** |
| Fixed cost / month | **RM450** | oven depreciation + electricity RM150, shared kitchen/rental RM150, marketing RM100, misc RM50 | ⚠️ **assumed** |

> These two figures drive every result below. If your real costs differ, the verdict changes — see §7 for sensitivity.

---

## 3. FINANCIAL CALCULATION — *by Finance Specialist (算得清)*

All arithmetic produced by the **finance-calculator** skill (`scripts/calc.py`, pure Python). No manual computation.

```json
{
  "inputs": {"price": 5.0, "variableCost": 2.2, "fixedCost": 450.0,
             "targetProfit": 6000.0, "operatingDays": 26.0, "capacity": 40.0},
  "unitContribution": 2.8,
  "requiredMonthlySales": 2304,
  "requiredDailySales": 89,
  "monthlyRevenue": 11520.0,
  "monthlyProfit": 6001.2,
  "feasibility_status": "NOT_FEASIBLE",
  "reason": "At RM2.80 unit contribution, reaching RM6,000 profit on RM450 fixed cost requires 2,304 boxes/month = 89 boxes/day over 26 days. Capacity is only 40/day, so the target is 122.5% above production capability. NOT_FEASIBLE on capacity grounds alone."
}
```

**Interpretation:** Each box earns RM2.80 after variable cost. The RM6,000 target implies RM11,520 in monthly revenue — more than double what 40 boxes/day can generate (RM5,200).

---

## 4. MARKET DEMAND — *by Demand Analyst (丘知本)*

### ⚠️ DATA PROVENANCE: **SIMULATED** — no real sales history was provided.

```json
{
  "estimated_daily_demand": 11,
  "demand_uncertainty": {"low": 5, "high": 22,
    "note": "Driven by penetration uncertainty (0.7–3% of a ~1,200-resident hostel cluster), exam/allowance seasonality, and competition from canteens/stores/vending."},
  "data_provenance": "SIMULATED — no real sales history provided"
}
```

**Reasoning basis:** ~1,200 hostel residents × ~2% daily penetration for a discretionary RM5 treat ≈ 24 interested buyers/day. One small, part-time seller (no stall, WhatsApp + door-to-door) captures ~40–50% → **~11 boxes/day**. RM5 is roughly one-third of a student's daily food budget, so cookies are an occasional impulse buy, not a staple — this caps volume.

> **Do NOT treat the 40/day production cap as a demand signal.** Market demand for one small seller is the binding constraint, and it is well below capacity.

---

## 5. OPERATIONS PLAN — *by Operations Planner (运转安)*

**Hard capacity ceiling: 40 boxes/day (never exceeded).** Plan uses two modes.

```json
{
  "daily_capacity": 40,
  "ramp_mode":  {"prep_quantity": 12, "order_cutoff_time": "20:00 (previous night)", "fulfillment_window": "12:00-14:00 next day"},
  "scale_mode": {"prep_quantity": 40, "order_cutoff_time": "20:00 (previous night)", "fulfillment_window": "11:30-14:30 next day", "max_monthly_boxes_at_full_capacity": 1040},
  "notes": "One student on a shared oven works in ~20-box batches, ~45 min each. 40/day = 2 back-to-back batches (07:15-08:45) — achievable only on no-early-class days. 40/day is a hard ceiling, NOT a normal rate for one student with studies. Ramp start at 12/day to match ~11/day demand and avoid spoilage; step up 12→20→30→40 only after a 5-day sell-out streak."
}
```

**Daily task skeleton (both modes):**
| Time | Task |
|---|---|
| 07:00 | Confirm overnight pre-orders; set bake count = confirmed + 10% buffer (capped) |
| 07:15 | Batch 1 into oven; mix next dough |
| 08:00 | Pull/cool Batch 1; load Batch 2 (scale mode only) |
| 08:45 | Cool all; quality/spoilage check |
| 09:00 | Pack & label; message order channel with pickup window |
| 09:30 | Classes (baking done — no oven work during class hours) |
| 11:30–14:30 | Pickup slots (2 staggered in scale mode) |
| 14:30 | Close fulfillment; log sold vs. unsold |
| 16:00 | Update tracker; adjust tomorrow's prep within mode limits |
| 20:00 | Close next-day order intake; check inventory |

---

## 6. CROSS-VALIDATION CONCLUSION — *by Orchestrator*

```
required_sales   = 89   (finance.required_daily_sales)
capacity         = 40   (operations.daily_capacity, hard cap)
estimated_demand = 11   (demand.estimated_daily_demand, SIMULATED)
```

**Gate check:**

| Condition | Result | Applied? |
|---|---|---|
| `required_sales (89) > capacity (40)` | **TRUE** | ✅ → **NOT_FEASIBLE** |
| `required_sales ≤ capacity` & `> demand` | n/a | overridden by above |
| `required_sales ≤ capacity` & `≤ demand` | n/a | — |

**Ruling: NOT_FEASIBLE.** The target fails at the very first gate — capacity — before demand even becomes the deciding factor. The gap is **2.23×** (49 boxes/day short).

Second-order finding: even the *realistic ceiling* (RM2,460/month) is **demand-limited**. Ramp demand (~11/day) supports only ~RM800/month profit — the seller would need to roughly **3–4× demand** to fill capacity.

---

## 7. CORRECTION PATHS — *quantified, all via finance-calculator*

### Path A — Reduce the income target (recommended, honest)
| Scenario | Required/day | Verdict | Monthly profit |
|---|---|---|---|
| **Realistic ceiling** (push to 40/day) | 40 | ✅ FEASIBLE | **RM2,460** |
| Ambitious but strained | 48 | ⚠️ AT_RISK | RM3,000 |

**→ Set a starting goal of RM2,000–2,500/month profit.** That is a genuine, reachable number.

### Path B — Raise price
| Price | Unit contribution | Required/day | Verdict |
|---|---|---|---|
| RM7.00 | RM4.80 | 52 | ❌ NOT_FEASIBLE (still 30% over) |
| **RM8.00** | **RM5.80** | **43** | ⚠️ **AT_RISK** (close) |
| RM8.60+ | RM6.40 | ≤40 | ✅ would fit |

**→ RM5 is too low to reach RM6k. A premium price band of RM8–9 would work — but risks cutting demand (cookies become a luxury, not an impulse buy).**

### Path C — Cut variable cost
At RM6 price + RM1.60 variable cost → required/day drops to **57** — still over capacity. **Cost-cutting alone cannot close a 2.23× gap.**

### Path D — Raise capacity
RM6,000 needs **89 boxes/day** — more than double. That means a second baker or a bigger oven, i.e. a different business, not a solo side hustle.

### Verdict on combinations
Even the **best realistic combination** (price RM8, tight costs, full capacity) only produces about **RM2,900–3,100/month** — roughly **half** the user's goal. **RM6,000/month is not achievable for a solo student at RM5/box.**

---

## 8. LAUNCH ASSETS — *by Growth Marketer (张声艺)*

All files written to `outputs/`, consistent with the verified baseline (RM5.00/box, up to 40 boxes/day, **no income claims**):

| File | Purpose | Channel |
|---|---|---|
| `campusbiz-landing-page.html` | Mobile-first order page (hero, RM5 price, flavours, WhatsApp + DuitNow checkout, 16:00–19:00 delivery) | IG bio link, Story link sticker, QR on posters |
| `campusbiz-7-day-marketing-calendar.md` | Day 1–7 launch calendar with ready-to-copy copy + compliance guardrails | Internal execution; posts to WhatsApp/IG |
| `campusbiz-poster.svg` | 900×1200 promo poster, large RM5.00/box | WhatsApp groups, hostel noticeboards, IG |

**Compliance check passed:** price consistent (RM5.00 everywhere), capacity stated as "up to 40 boxes/day", **zero earnings promises**.

---

## 9. RISKS & UNCERTAINTIES (minimum 3)

1. **Demand is entirely SIMULATED.** No real sales history exists. The 11/day estimate could be off by 2× either way (band 5–22). Actual demand must be measured during ramp mode before any scaling decision.
2. **Capacity is physically fragile.** 40/day = ~8+ hours of oven work for one student. Realistically, 25–30/day is a sustainable solo ceiling alongside classes; 40 is a rare best-case.
3. **Both cost inputs are assumptions.** If real variable cost exceeds RM3.20/box, unit contribution falls below RM1.80 and even break-even becomes hard. Verify ingredient + packaging costs before launch.
4. **Execution depends on shared-oven access** and study-time protection. Oven conflicts or exam weeks can collapse output to near zero.
5. **Seasonality risk.** Semester breaks can drop campus demand to almost nothing for weeks — 26 operating days/month may not be sustainable year-round.

---

## 10. FINAL RECOMMENDATION

**Do not pursue RM6,000/month at RM5/box — it is mathematically impossible within your capacity.** Instead:

1. **Re-target to RM2,000–2,500/month profit** (achievable, honest).
2. **Run ramp mode at 12 boxes/day** for 2 weeks; measure real demand.
3. **If you sell out 5 days straight,** step up 12→20→30→40 and log data.
4. **To genuinely approach RM6k**, you must change the model: raise price to RM8–9, add a second baker, or sell beyond one hostel cluster. After those changes, re-run this plan.

*Goal you can actually hit beats a goal that looks good on paper.*
