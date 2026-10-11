---
name: finance-calculator
description: "Breakeven and target-profit calculator for unit-economics planning. Given price, variableCost, fixedCost, targetProfit, operatingDays and capacity, it computes unit contribution margin, required monthly/daily sales volume, monthly revenue and monthly profit, then returns a JSON result with a feasibility verdict. Triggers: breakeven, break-even, contribution margin, target profit, unit economics, feasibility, 盈亏平衡, 保本销量, 单位贡献, 目标利润, 可行性."
description_zh: "盈亏平衡与目标利润测算：单位贡献、所需月销量/日销量、月收入、月利润与可行性判断"
description_en: "Breakeven and target-profit calculator with feasibility verdict"
version: 1.0.0
license: MIT
metadata:
  version: "1.0"
  category: finance
display_name: "finance-calculator"
display_name_en: "finance-calculator"
visibility: "public"
---

# Finance Calculator

Breakeven and target-profit calculator for a single-product (or average-unit) operation.
All math is done in **pure Python** (standard library only) by `scripts/calc.py`.

## Inputs

| Field | Meaning | Unit |
|-------|---------|------|
| `price` | Selling price per unit | currency |
| `variableCost` | Variable cost per unit | currency |
| `fixedCost` | Fixed cost per month | currency |
| `targetProfit` | Target profit per month | currency |
| `operatingDays` | Operating days per month | days |
| `capacity` | Daily production/sales capacity | units/day |

## Formulas

```
unitContribution = price - variableCost
requiredMonthlySales = ceil((targetProfit + fixedCost) / unitContribution)
requiredDailySales  = ceil(requiredMonthlySales / operatingDays)
monthlyRevenue = requiredMonthlySales * price
monthlyProfit  = requiredMonthlySales * unitContribution - fixedCost
```

If `unitContribution <= 0`, the operation can never cover fixed cost — the script
**returns an error** instead of computing sales targets.

## Output

A single JSON object containing every computed value plus a `feasibility`
verdict and a plain-language `explanation`.

### Feasibility rules

| Verdict | Condition |
|---------|-----------|
| `FEASIBLE` | `requiredDailySales <= capacity` — the daily target fits within capacity |
| `AT_RISK` | `requiredDailySales <= capacity * 1.2` — target is achievable but exceeds capacity by up to 20%, little headroom |
| `NOT_FEASIBLE` | `requiredDailySales > capacity * 1.2` — target is well beyond capacity |

## Usage

Run the script directly with the six inputs:

```bash
python scripts/calc.py \
  --price 50 --variable-cost 30 --fixed-cost 20000 \
  --target-profit 10000 --operating-days 26 --capacity 100
```

Or pipe JSON on stdin:

```bash
echo '{"price":50,"variableCost":30,"fixedCost":20000,"targetProfit":10000,"operatingDays":26,"capacity":100}' \
  | python scripts/calc.py
```

Read the JSON from stdout and report it to the user. Do not re-do the arithmetic
in natural language — always run the script so the numbers are exact.

## Example

Input:
```json
{"price": 50, "variableCost": 30, "fixedCost": 20000,
 "targetProfit": 10000, "operatingDays": 26, "capacity": 100}
```

Output:
```json
{
  "inputs": {"price": 50.0, "variableCost": 30.0, "fixedCost": 20000.0,
             "targetProfit": 10000.0, "operatingDays": 26.0, "capacity": 100.0},
  "unitContribution": 20.0,
  "requiredMonthlySales": 1500,
  "requiredDailySales": 58,
  "monthlyRevenue": 75000.0,
  "monthlyProfit": 10000.0,
  "feasibility": "FEASIBLE",
  "explanation": "Unit contribution is 20.00. To hit a monthly target profit of 10000.00 on fixed costs of 20000.00 you must sell 1500 units/month (58/day over 26 operating days). That is within your capacity of 100/day, so the target is FEASIBLE."
}
```

## Error case

When `unitContribution <= 0`:

```json
{
  "error": "INVALID_UNIT_CONTRIBUTION",
  "message": "Unit contribution (price - variableCost) must be > 0; got -5.00. Each unit sold does not cover its variable cost, so no sales volume can ever reach the target profit.",
  "unitContribution": -5.0
}
```

The script exits with code `2` on this error and `0` on success.
