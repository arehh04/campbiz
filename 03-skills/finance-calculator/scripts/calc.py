#!/usr/bin/env python3
"""Breakeven / target-profit calculator.

Pure standard-library Python. Computes unit contribution, required monthly and
daily sales, monthly revenue and monthly profit, then emits a JSON result with a
feasibility verdict.

Usage:
    python calc.py --price 50 --variable-cost 30 --fixed-cost 20000 \
                   --target-profit 10000 --operating-days 26 --capacity 100
    echo '{"price":50,...}' | python calc.py

Exit codes:
    0  success
    2  invalid input (unit contribution <= 0, or bad/missing fields)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import stat
import sys

# Capacity headroom (as a multiple of capacity) tolerated before a target is
# declared NOT_FEASIBLE. 1.2 means "up to 20% over capacity is AT_RISK".
HEADROOM = 1.2

REQUIRED_FIELDS = (
    "price",
    "variableCost",
    "fixedCost",
    "targetProfit",
    "operatingDays",
    "capacity",
)

# Maps the CLI kebab-case flag to the canonical camelCase field name.
CLI_TO_FIELD = {
    "price": "price",
    "variable_cost": "variableCost",
    "fixed_cost": "fixedCost",
    "target_profit": "targetProfit",
    "operating_days": "operatingDays",
    "capacity": "capacity",
}


class InvalidInput(Exception):
    """Raised when the inputs cannot produce a meaningful calculation."""

    def __init__(self, code: str, message: str, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra

    def to_dict(self) -> dict:
        return {"error": self.code, "message": self.message, **self.extra}


def _as_number(value, field: str) -> float:
    if isinstance(value, bool) or value is None:
        raise InvalidInput(
            "INVALID_INPUT", f"Field '{field}' must be a number; got {value!r}."
        )
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise InvalidInput(
            "INVALID_INPUT", f"Field '{field}' must be a number; got {value!r}."
        )
    if math.isnan(number) or math.isinf(number):
        raise InvalidInput(
            "INVALID_INPUT", f"Field '{field}' must be a finite number; got {value!r}."
        )
    return number


def parse_inputs(raw: dict) -> dict:
    """Validate and normalise the six required inputs."""
    missing = [f for f in REQUIRED_FIELDS if f not in raw]
    if missing:
        raise InvalidInput(
            "INVALID_INPUT",
            f"Missing required field(s): {', '.join(missing)}.",
        )

    inputs = {f: _as_number(raw[f], f) for f in REQUIRED_FIELDS}

    if inputs["operatingDays"] <= 0:
        raise InvalidInput(
            "INVALID_INPUT",
            f"'operatingDays' must be > 0; got {inputs['operatingDays']:.2f}.",
        )
    if inputs["capacity"] <= 0:
        raise InvalidInput(
            "INVALID_INPUT",
            f"'capacity' must be > 0; got {inputs['capacity']:.2f}.",
        )
    return inputs


def calculate(inputs: dict) -> dict:
    """Run the breakeven / target-profit math and build the result payload."""
    price = inputs["price"]
    variable_cost = inputs["variableCost"]
    fixed_cost = inputs["fixedCost"]
    target_profit = inputs["targetProfit"]
    operating_days = inputs["operatingDays"]
    capacity = inputs["capacity"]

    unit_contribution = price - variable_cost

    # Each unit sold fails to cover its own variable cost: profit can never
    # improve with volume, so there is no achievable sales target.
    if unit_contribution <= 0:
        raise InvalidInput(
            "INVALID_UNIT_CONTRIBUTION",
            (
                f"Unit contribution (price - variableCost) must be > 0; "
                f"got {unit_contribution:.2f}. Each unit sold does not cover its "
                f"variable cost, so no sales volume can ever reach the target profit."
            ),
            unitContribution=unit_contribution,
        )

    required_monthly_sales = math.ceil((target_profit + fixed_cost) / unit_contribution)
    required_daily_sales = math.ceil(required_monthly_sales / operating_days)
    monthly_revenue = required_monthly_sales * price
    monthly_profit = required_monthly_sales * unit_contribution - fixed_cost

    if required_daily_sales <= capacity:
        feasibility = "FEASIBLE"
    elif required_daily_sales <= capacity * HEADROOM:
        feasibility = "AT_RISK"
    else:
        feasibility = "NOT_FEASIBLE"

    headroom_pct = (required_daily_sales / capacity - 1) * 100

    if feasibility == "FEASIBLE":
        explanation = (
            f"Unit contribution is {unit_contribution:.2f}. To hit a monthly target "
            f"profit of {target_profit:.2f} on fixed costs of {fixed_cost:.2f} you must "
            f"sell {required_monthly_sales} units/month "
            f"({required_daily_sales}/day over {operating_days:.0f} operating days). "
            f"That is within your capacity of {capacity:.0f}/day, so the target is "
            f"FEASIBLE."
        )
    elif feasibility == "AT_RISK":
        explanation = (
            f"Unit contribution is {unit_contribution:.2f}. Reaching the target requires "
            f"{required_monthly_sales} units/month ({required_daily_sales}/day), which is "
            f"{headroom_pct:.1f}% above your capacity of {capacity:.0f}/day. The target is "
            f"mathematically achievable but leaves almost no headroom — any downtime, "
            f"spoilage or demand shortfall breaks it. Treat as AT_RISK."
        )
    else:
        explanation = (
            f"Unit contribution is {unit_contribution:.2f}. Reaching the target requires "
            f"{required_monthly_sales} units/month ({required_daily_sales}/day), which is "
            f"{headroom_pct:.1f}% above your capacity of {capacity:.0f}/day. The target "
            f"exceeds what you can produce, so it is NOT_FEASIBLE: either raise "
            f"price/lower variable cost, cut fixed cost or refine the target profit."
        )

    return {
        "inputs": inputs,
        "unitContribution": round(unit_contribution, 2),
        "requiredMonthlySales": required_monthly_sales,
        "requiredDailySales": required_daily_sales,
        "monthlyRevenue": round(monthly_revenue, 2),
        "monthlyProfit": round(monthly_profit, 2),
        "feasibility": feasibility,
        "explanation": explanation,
    }


def _stdin_has_data() -> bool:
    """Best-effort, non-blocking check for piped stdin data.

    On Windows/Git Bash a bare terminal can leave stdin non-TTY yet never
    deliver bytes. We detect a real pipe/file via ``st_mode`` and, when the
    platform allows it, use ``select`` with a zero timeout.
    """
    if sys.stdin is None or sys.stdin.isatty():
        return False

    # A regular file or a pipe/FIFO is a genuine redirect; a character device
    # (the console) is not.
    try:
        mode = os.fstat(sys.stdin.fileno()).st_mode
    except (OSError, ValueError, AttributeError):
        return False
    if not (stat.S_ISFIFO(mode) or stat.S_ISREG(mode)):
        return False

    try:
        import select

        ready, _, _ = select.select([sys.stdin], [], [], 0)
        return bool(ready)
    except (OSError, ValueError):
        # select() cannot watch this handle — assume data is available and
        # let read() return whatever is there.
        return True


def _read_stdin() -> dict | None:
    """Read a JSON object from stdin when data is piped in, never blocking."""
    if not _stdin_has_data():
        return None
    data = sys.stdin.read().strip()
    if not data:
        return None
    try:
        parsed = json.loads(data)
    except json.JSONDecodeError as exc:
        raise InvalidInput("INVALID_INPUT", f"stdin is not valid JSON: {exc}.")
    if not isinstance(parsed, dict):
        raise InvalidInput("INVALID_INPUT", "stdin JSON must be an object.")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Breakeven / target-profit calculator (outputs JSON)."
    )
    for flag, field in CLI_TO_FIELD.items():
        parser.add_argument(
            "--" + flag.replace("_", "-"),
            dest=field,
            type=float,
            help=f"{field}",
        )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    raw = {f: getattr(args, f) for f in REQUIRED_FIELDS if getattr(args, f) is not None}

    piped = _read_stdin()
    if piped is not None:
        for field in REQUIRED_FIELDS:
            if field not in raw and field in piped:
                raw[field] = piped[field]

    try:
        result = calculate(parse_inputs(raw))
    except InvalidInput as exc:
        print(json.dumps(exc.to_dict(), ensure_ascii=False, indent=2))
        return 2

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
