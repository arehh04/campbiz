---
name: artifact-generator
description: "Generate a complete launch kit from a business plan: a mobile-friendly landing page (landing-page.html), a 7-day marketing calendar (marketing-calendar.md), and an operations checklist (operations-checklist.md). Takes a business_plan object (product name, target customer, price, brand name, plus optional tone/contact/delivery fields) and writes all three files into ~/campusbiz-output/. Triggers: landing page, marketing calendar, operations checklist, launch kit, business plan artifacts, 落地页, 营销日历, 运营清单, 校园创业, 启动物料."
description_zh: "根据商业计划一键生成落地页、7天营销日历、运营清单三件套"
description_en: "Generate landing page, 7-day marketing calendar and operations checklist from a business plan"
version: 1.0.0
license: MIT
metadata:
  version: "1.0"
  category: marketing
display_name: "artifact-generator"
display_name_en: "artifact-generator"
visibility: "public"
---

# Artifact Generator

Turns a single `business_plan` object into a **three-file launch kit**:

| # | File | Purpose |
|---|------|---------|
| 1 | `landing-page.html` | Mobile-first landing page: brand, product description, price, order button |
| 2 | `marketing-calendar.md` | 7-day calendar: platform + content theme + copy for each day |
| 3 | `operations-checklist.md` | Daily prep steps, order cutoff time, fulfilment checklist |

Everything is written by `scripts/generate.py` (pure Python standard library) into
`~/campusbiz-output/`.

## Input: `business_plan`

Pass it as JSON (stdin or `--plan-file`). Required and optional fields:

| Field | Required | Meaning |
|-------|----------|---------|
| `brand_name` | yes | Brand shown on the landing page |
| `product_name` | yes | Product being sold |
| `target_customer` | yes | Who the product is for |
| `price` | yes | Price (number or string; a currency symbol is added if absent) |
| `description` | no | Product description; auto-generated if omitted |
| `tone` | no | Copy tone, e.g. `playful`, `warm`, `professional` (default `warm`) |
| `contact` | no | Contact handle / group / phone shown on the CTA |
| `order_cutoff` | no | Daily order cutoff, e.g. `20:00` (default `20:00`) |
| `currency` | no | Currency symbol (default `¥`) |
| `delivery_window` | no | When orders are delivered (default `次日午间`) |
| `language` | no | Output language: `zh` (default), `ms` (Bahasa Melayu), `en` |

### Example input

```json
{
  "brand_name": "夜宵研究所",
  "product_name": "宿舍夜宵拼单套餐",
  "target_customer": "晚上赶作业、复习到深夜的在校学生",
  "price": 15,
  "description": "一份管饱的夜宵拼单：主食 + 小食 + 饮品，30 分钟内送到宿舍楼下。",
  "tone": "playful",
  "contact": "微信 nightowl-helper",
  "order_cutoff": "21:30",
  "delivery_window": "每晚 22:00-23:30"
}
```

## Output location

All three files are written to `~/campusbiz-output/` (`%USERPROFILE%\campusbiz-output\`
on Windows). Override with `--out-dir` if needed. The directory is created if missing.

```
~/campusbiz-output/
├── landing-page.html
├── marketing-calendar.md
└── operations-checklist.md
```

## Usage

```bash
# From a plan file
python scripts/generate.py --plan-file business_plan.json

# From stdin
echo '{"brand_name":"...","product_name":"...","target_customer":"...","price":15}' \
  | python scripts/generate.py

# Force a language regardless of the plan
python scripts/generate.py --plan-file business_plan.json --lang ms

# Custom output directory
python scripts/generate.py --plan-file business_plan.json --out-dir ./out
```

The script prints a JSON manifest listing the written file paths. Report those
paths to the user; do not paste the full file contents back into chat.

## Languages

Set `language` in the plan (`zh` | `ms` | `en`) or pass `--lang ms`. The flag
wins over the plan field. All UI labels, section headings, platform names, marketing
copy and checklist items are localised — content you supply in the plan
(`description`, `product_name`, `contact`, etc.) is used verbatim, so supply it in
the target language too. Unsupported language tags return an `INVALID_INPUT` error.

## Behaviour notes

- Missing optional fields are filled with sensible defaults, so a minimal plan
  (the four required fields) still produces a complete, usable kit.
- `price` may be given as a number (`15`) or a pre-formatted string (`"¥15"`).
- The landing page is self-contained: inline CSS, no external assets, safe to
  open offline or upload anywhere.
- Re-running overwrites the three files in place. Backup before overwriting
  an existing directory you care about.
