#!/usr/bin/env python3
"""Launch-kit generator: business_plan -> three artifacts.

Pure standard-library Python. Reads a ``business_plan`` JSON object and writes:

    1. landing-page.html        mobile-first landing page
    2. marketing-calendar.md    7-day marketing calendar
    3. operations-checklist.md  daily prep / cutoff / fulfilment checklist

into ``~/campusbiz-output/`` (overridable with ``--out-dir``).

Usage:
    python generate.py --plan-file business_plan.json
    echo '{"brand_name":"...","product_name":"...","target_customer":"...","price":15}' \\
        | python generate.py
    python generate.py --plan-file plan.json --out-dir ./out

Exit codes:
    0  success
    2  invalid input (missing required fields, bad JSON, etc.)
"""

from __future__ import annotations

import argparse
import html
import json
import os
import sys
from pathlib import Path

REQUIRED_FIELDS = ("brand_name", "product_name", "target_customer", "price")

DEFAULT_OUT_DIR = Path.home() / "campusbiz-output"

# Supported output languages. Keys are the canonical tags accepted via the
# ``language`` field / ``--lang`` flag.
SUPPORTED_LANGS = ("zh", "ms", "en")

_DAY_LABELS = {
    "zh": ["第 1 天", "第 2 天", "第 3 天", "第 4 天", "第 5 天", "第 6 天", "第 7 天"],
    "ms": ["Hari 1", "Hari 2", "Hari 3", "Hari 4", "Hari 5", "Hari 6", "Hari 7"],
    "en": ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
}

WEEKDAYS = _DAY_LABELS["zh"]  # default/back-compat

# --------------------------------------------------------------------------- #
# UI strings per language (labels, headings, platform names, boilerplate)
# --------------------------------------------------------------------------- #

STRINGS = {
    "zh": {
        "lang_attr": "zh-CN",
        "hero_tagline": "{audience} 的专属选择",
        "section_intro": "产品介绍",
        "section_price": "价格",
        "price_note": "下单即享",
        "k_cutoff": "下单截止",
        "k_delivery": "交付时间",
        "k_contact": "联系方式",
        "contact_fallback": "见文末联系方式",
        "footer": "© {brand} · 本页面由 artifact-generator 生成",
        "btn": "立即下单 · {price}",
        "btn_note": "每天 {cutoff} 截止，{delivery}",
        "default_description": "{product}，专为{audience}准备，现在只需 {price} 即可下单。",
        "default_delivery": "下单后每日 {cutoff} 截止，次日安排交付",
        # calendar
        "cal_title": "{brand} · 7 天营销日历",
        "lbl_product": "产品",
        "lbl_audience": "目标客户",
        "lbl_price": "价格",
        "lbl_cutoff": "下单截止",
        "lbl_tone": "语气",
        "cal_intro": "每天按「平台 → 内容主题 → 文案」执行；文案可直接复制使用，按实际渠道微调。",
        "lbl_platform": "平台",
        "lbl_theme": "内容主题",
        "lbl_copy": "文案",
        "cal_rhythm_title": "发布节奏建议",
        "th_time": "时段",
        "th_action": "动作",
        "rhythm": [
            ("07:30–08:30", "发布当日主文案（朋友圈 / 小红书）"),
            ("12:00–13:00", "社群接龙提醒，回复咨询"),
            ("17:30–18:30", "二次触达，推送限时信息"),
            ("{cutoff} 前 1 小时", "最后一次催单提醒"),
        ],
        "platforms": [
            "朋友圈 / 微信状态",
            "小红书",
            "微信群 / QQ 群",
            "朋友圈",
            "抖音 / 视频号",
            "微信群 + 朋友圈",
            "多平台复盘 + 预告",
        ],
        # checklist
        "ck_title": "{brand} · 运营清单",
        "lbl_cutoff2": "接单截止",
        "lbl_delivery": "交付安排",
        "ck_intro": "按时间顺序逐项打勾，避免漏单、错单。",
        "ck_s1": "一、每日准备步骤（开门前）",
        "ck_s2": "二、订单截止时间",
        "ck_s3": "三、履约清单（截止后）",
        "ck_s4": "四、每日收尾",
        "ck_risk": "风险提示",
        "ck_cutoff_line": "**接单截止**：每天 **{cutoff}**（过时下单顺延至次日）",
        "ck_s1_items": [
            "07:30 检查库存与原料，确认可支撑今日预估单量",
            "08:00 发布当日营销文案（参考 marketing-calendar.md）",
            "08:30 开启接单入口，置顶价格与截止时间",
            "12:00 统计上午订单，回复所有咨询，确认特殊需求（口味/忌口/地址）",
            "{cutoff} 前 1 小时发布催单提醒",
        ],
        "ck_s2_items": [
            "{cutoff} 准时关闭接单，导出/汇总订单表",
            "逐单核对：昵称、数量、金额、联系方式、备注",
            "计算应收总额，标记已付款 / 待付款",
        ],
        "ck_s3_items": [
            "汇总总单量与分项数量，生成采购/备货清单",
            "按交付顺序分批打包，标注昵称与联系方式",
            "核对地址与交付时间，规划路线",
            "按 **{delivery}** 完成交付/配送",
            "逐单送达确认，请客户签收或回复「已收到」",
            "处理售后：漏单、错单、退换，24 小时内响应",
        ],
        "ck_s4_items": [
            "记录当日实收、退款、结余",
            "收集反馈与买家秀素材（供次日营销使用）",
            "更新库存与资金台账",
            "复盘：哪条文案转化最好？明天要改什么？",
            "预告次日产品与福利，保持社群活跃",
        ],
        "ck_risks": [
            "截止时间后不再接单，避免履约节奏被打乱。",
            "超量接单前先确认产能与人力，宁可少接不可漏单。",
            "涉及食品的，注意卫生与保温，履约前再检查一次包装。",
        ],
    },
    "ms": {
        "lang_attr": "ms",
        "hero_tagline": "Pilihan istimewa untuk {audience}",
        "section_intro": "Pengenalan Produk",
        "section_price": "Harga",
        "price_note": "Terus boleh order",
        "k_cutoff": "Tutup tempahan",
        "k_delivery": "Masa penghantaran",
        "k_contact": "Hubungi",
        "contact_fallback": "Lihat maklumat hubungi di bawah",
        "footer": "© {brand} · Halaman ini dijana oleh artifact-generator",
        "btn": "Order Sekarang · {price}",
        "btn_note": "Tutup setiap {cutoff} · {delivery}",
        "default_description": "{product}, khas untuk {audience}. Kini hanya {price} sahaja untuk tempah.",
        "default_delivery": "Tempahan tutup pada {cutoff}, penghantaran diatur hari berikutnya",
        # calendar
        "cal_title": "{brand} · Kalendar Pemasaran 7 Hari",
        "lbl_product": "Produk",
        "lbl_audience": "Pelanggan sasaran",
        "lbl_price": "Harga",
        "lbl_cutoff": "Tempahan tutup",
        "lbl_tone": "Nada",
        "cal_intro": "Ikut setiap hari mengikut「Platform → Tema kandungan → Teks salinan」; teks boleh disalin terus dan disesuaikan mengikut saluran sebenar.",
        "lbl_platform": "Platform",
        "lbl_theme": "Tema kandungan",
        "lbl_copy": "Teks salinan",
        "cal_rhythm_title": "Cadangan jadual penerbitan",
        "th_time": "Masa",
        "th_action": "Tindakan",
        "rhythm": [
            ("07:30–08:30", "Terbit teks utama hari ini (Momen / Xiaohongshu)"),
            ("12:00–13:00", "Peringatan tempahan kumpulan, balas pertanyaan"),
            ("17:30–18:30", "Sentuhan kedua, hantar info tawaran terhad"),
            ("1 jam sebelum {cutoff}", "Peringatan terakhir sebelum tutup"),
        ],
        "platforms": [
            "Momen WeChat / Status",
            "Xiaohongshu (RED)",
            "Kumpulan WeChat / QQ",
            "Momen WeChat",
            "TikTok / Video Channel",
            "Kumpulan WeChat + Momen",
            "Semua platform — semak & pratonton",
        ],
        # checklist
        "ck_title": "{brand} · Senarai Semak Operasi",
        "lbl_cutoff2": "Tempahan tutup",
        "lbl_delivery": "Penyusunan penghantaran",
        "ck_intro": "Tanda setiap item mengikut urutan masa untuk elak pesanan tertinggal atau tersalah.",
        "ck_s1": "1. Langkah persediaan harian (sebelum mula)",
        "ck_s2": "2. Masa tutup tempahan",
        "ck_s3": "3. Senarai semak penghantaran (selepas tutup)",
        "ck_s4": "4. Penutup harian",
        "ck_risk": "Amaran risiko",
        "ck_cutoff_line": "**Tempahan tutup**: setiap hari **{cutoff}** (pesanan lewat dibawa ke hari berikutnya)",
        "ck_s1_items": [
            "07:30 Semak stok dan bahan mentah, pastikan cukup untuk jangkaan tempahan hari ini",
            "08:00 Terbit teks pemasaran hari ini (rujuk marketing-calendar.md)",
            "08:30 Buka saluran tempahan, sematkan harga dan masa tutup",
            "12:00 Kira tempahan pagi, balas semua pertanyaan, sahkan permintaan khas (rasa/pantang/alamat)",
            "Terbit peringatan tempahan 1 jam sebelum {cutoff}",
        ],
        "ck_s2_items": [
            "Tutup tempahan tepat pada {cutoff}, eksport/ringkas jadual tempahan",
            "Semak setiap tempahan: nama, kuantiti, jumlah, cara hubungi, catatan",
            "Kira jumlah perlu bayar, tandakan sudah bayar / belum bayar",
        ],
        "ck_s3_items": [
            "Kumpulkan jumlah keseluruhan dan pecahan item, hasilkan senarai belian/stok",
            "Bungkus mengikut urutan penghantaran, labelkan nama dan cara hubungi",
            "Semak alamat dan masa penghantaran, rancang laluan",
            "Selesaikan penghantaran mengikut **{delivery}**",
            "Sahkan penghantaran setiap pesanan, minta pelanggan tanda terima atau balas「Diterima」",
            "Urus selepas jualan: pesanan tertinggal, tersalah, pulangan — balas dalam 24 jam",
        ],
        "ck_s4_items": [
            "Rekod jualan diterima, bayaran balik dan baki hari ini",
            "Kumpul maklum balas dan bahan foto pelanggan (untuk pemasaran esok)",
            "Kemas kini stok dan buku akaun",
            "Semak semula: teks mana paling berkesan? Apa nak ubah esok?",
            "Pratonton produk dan tawaran esok, kekalkan keceriaan kumpulan",
        ],
        "ck_risks": [
            "Jangan terima tempahan selepas masa tutup, elak irama penghantaran terganggu.",
            "Sahkan kapasiti dan tenaga kerja sebelum terima tempahan berlebihan — lebih baik terima kurang daripada tertinggal pesanan.",
            "Bagi produk makanan, jaga kebersihan dan suhu, semak bungkusan sekali lagi sebelum penghantaran.",
        ],
    },
    "en": {
        "lang_attr": "en",
        "hero_tagline": "Made especially for {audience}",
        "section_intro": "About the Product",
        "section_price": "Price",
        "price_note": "Order now to enjoy",
        "k_cutoff": "Order cutoff",
        "k_delivery": "Delivery",
        "k_contact": "Contact",
        "contact_fallback": "See contact details below",
        "footer": "© {brand} · Generated by artifact-generator",
        "btn": "Order Now · {price}",
        "btn_note": "Closes daily at {cutoff} · {delivery}",
        "default_description": "{product}, crafted for {audience}. Order yours today for just {price}.",
        "default_delivery": "Orders close at {cutoff} daily; delivery arranged the next day",
        "cal_title": "{brand} · 7-Day Marketing Calendar",
        "lbl_product": "Product",
        "lbl_audience": "Target customer",
        "lbl_price": "Price",
        "lbl_cutoff": "Order cutoff",
        "lbl_tone": "Tone",
        "cal_intro": "Each day follows「Platform → Content theme → Copy」; copy is ready to paste and can be tuned to each channel.",
        "lbl_platform": "Platform",
        "lbl_theme": "Content theme",
        "lbl_copy": "Copy",
        "cal_rhythm_title": "Posting rhythm",
        "th_time": "Time",
        "th_action": "Action",
        "rhythm": [
            ("07:30–08:30", "Publish the day's main copy (Moments / Xiaohongshu)"),
            ("12:00–13:00", "Group ordering reminder; reply to enquiries"),
            ("17:30–18:30", "Second touchpoint; push the limited-time offer"),
            ("1 hour before {cutoff}", "Final order reminder"),
        ],
        "platforms": [
            "WeChat Moments / Status",
            "Xiaohongshu (RED)",
            "WeChat / QQ Group",
            "WeChat Moments",
            "TikTok / Video Channel",
            "WeChat Group + Moments",
            "All platforms — recap & preview",
        ],
        "ck_title": "{brand} · Operations Checklist",
        "lbl_cutoff2": "Order cutoff",
        "lbl_delivery": "Delivery arrangement",
        "ck_intro": "Tick each item in time order to avoid missed or wrong orders.",
        "ck_s1": "1. Daily prep steps (before opening)",
        "ck_s2": "2. Order cutoff",
        "ck_s3": "3. Fulfilment checklist (after cutoff)",
        "ck_s4": "4. Daily wrap-up",
        "ck_risk": "Risk notes",
        "ck_cutoff_line": "**Order cutoff**: daily at **{cutoff}** (later orders roll to the next day)",
        "ck_s1_items": [
            "07:30 Check stock and ingredients to cover today's expected orders",
            "08:00 Publish today's marketing copy (see marketing-calendar.md)",
            "08:30 Open the order channel; pin price and cutoff time",
            "12:00 Tally morning orders, reply to all enquiries, confirm special requests (flavour/allergy/address)",
            "Publish the order reminder 1 hour before {cutoff}",
        ],
        "ck_s2_items": [
            "Close orders exactly at {cutoff}; export/summarise the order sheet",
            "Verify each order: name, quantity, amount, contact, notes",
            "Compute total due; mark paid / unpaid",
        ],
        "ck_s3_items": [
            "Aggregate total volume and item breakdown; produce a purchase/stock list",
            "Pack in delivery order; label name and contact",
            "Verify addresses and delivery times; plan the route",
            "Complete delivery around **{delivery}**",
            "Confirm each delivery; ask customers to sign or reply「Received」",
            "Handle after-sales: missed, wrong, or returned orders within 24 hours",
        ],
        "ck_s4_items": [
            "Record today's revenue, refunds and balance",
            "Collect feedback and buyer-photo material (for tomorrow's marketing)",
            "Update stock and cash ledger",
            "Review: which copy converted best? What to change tomorrow?",
            "Preview tomorrow's product and offers; keep the group active",
        ],
        "ck_risks": [
            "Stop taking orders after the cutoff to keep fulfilment on track.",
            "Confirm capacity and manpower before accepting excess orders — better to take fewer than to miss one.",
            "For food products, mind hygiene and temperature; re-check packaging before delivery.",
        ],
    },
}


def _s(lang: str, key: str, **fmt) -> str:
    """Look up a string in the given language and format placeholders."""
    value = STRINGS[lang][key]
    return value.format(**fmt) if fmt else value


class InvalidInput(Exception):
    """Raised when the business plan cannot be used."""

    def __init__(self, code: str, message: str, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra

    def to_dict(self) -> dict:
        return {"error": self.code, "message": self.message, **self.extra}


# --------------------------------------------------------------------------- #
# Input handling
# --------------------------------------------------------------------------- #

def _stdin_has_data() -> bool:
    """Non-blocking check for piped stdin (Git-Bash-safe)."""
    if sys.stdin is None or sys.stdin.isatty():
        return False
    try:
        import stat as _stat

        mode = os.fstat(sys.stdin.fileno()).st_mode
    except (OSError, ValueError, AttributeError):
        return False
    if not (_stat.S_ISFIFO(mode) or _stat.S_ISREG(mode)):
        return False
    try:
        import select

        ready, _, _ = select.select([sys.stdin], [], [], 0)
        return bool(ready)
    except (OSError, ValueError):
        return True


def read_plan(args) -> dict:
    if args.plan_file:
        path = Path(args.plan_file)
        if not path.is_file():
            raise InvalidInput("INVALID_INPUT", f"Plan file not found: {path}")
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise InvalidInput("INVALID_INPUT", f"Plan file is not valid JSON: {exc}")
    elif _stdin_has_data():
        data = sys.stdin.read().strip()
        if not data:
            raise InvalidInput("INVALID_INPUT", "stdin was empty.")
        try:
            raw = json.loads(data)
        except json.JSONDecodeError as exc:
            raise InvalidInput("INVALID_INPUT", f"stdin is not valid JSON: {exc}")
    else:
        raise InvalidInput(
            "INVALID_INPUT",
            "No business_plan provided. Use --plan-file or pipe JSON on stdin.",
        )
    if not isinstance(raw, dict):
        raise InvalidInput("INVALID_INPUT", "business_plan must be a JSON object.")
    return raw


def _require_text(raw: dict, field: str) -> str:
    value = raw.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        raise InvalidInput(
            "INVALID_INPUT", f"Missing required field '{field}' in business_plan."
        )
    return str(value).strip()


def _format_price(price, currency: str) -> str:
    if isinstance(price, str):
        text = price.strip()
        if not text:
            raise InvalidInput("INVALID_INPUT", "'price' must not be empty.")
        # Already carries a currency symbol/number-ish text -> keep as-is.
        return text
    if isinstance(price, bool) or price is None:
        raise InvalidInput("INVALID_INPUT", f"'price' must be a number or string; got {price!r}.")
    try:
        number = float(price)
    except (TypeError, ValueError):
        raise InvalidInput("INVALID_INPUT", f"'price' must be a number or string; got {price!r}.")

    # Render integers without a trailing .0
    rendered = str(int(number)) if number == int(number) else f"{number:g}"
    return f"{currency}{rendered}"


def normalise_plan(raw: dict) -> dict:
    for field in REQUIRED_FIELDS:
        _require_text(raw, field)

    currency = str(raw.get("currency", "¥")).strip() or "¥"

    lang = str(raw.get("language", "zh")).strip().lower() or "zh"
    if lang not in SUPPORTED_LANGS:
        raise InvalidInput(
            "INVALID_INPUT",
            f"Unsupported language '{lang}'. Use one of: {', '.join(SUPPORTED_LANGS)}.",
        )

    plan = {
        "brand_name": _require_text(raw, "brand_name"),
        "product_name": _require_text(raw, "product_name"),
        "target_customer": _require_text(raw, "target_customer"),
        "price_display": _format_price(raw.get("price"), currency),
        "description": str(raw.get("description", "")).strip(),
        "tone": str(raw.get("tone", "warm")).strip() or "warm",
        "contact": str(raw.get("contact", "")).strip(),
        "order_cutoff": str(raw.get("order_cutoff", "20:00")).strip() or "20:00",
        "currency": currency,
        "delivery_window": str(raw.get("delivery_window", "")).strip(),
        "language": lang,
    }

    if not plan["description"]:
        plan["description"] = _s(
            lang,
            "default_description",
            product=plan["product_name"],
            audience=plan["target_customer"],
            price=plan["price_display"],
        )
    if not plan["delivery_window"]:
        plan["delivery_window"] = _s(
            lang, "default_delivery", cutoff=plan["order_cutoff"]
        )
    return plan


# --------------------------------------------------------------------------- #
# Artifact 1: landing page
# --------------------------------------------------------------------------- #

LANDING_TEMPLATE = """<!DOCTYPE html>
<html lang="{lang_attr}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{brand_name} · {product_name}</title>
<style>
  :root {{
    --bg: #f7f7fb;
    --card: #ffffff;
    --ink: #1a1a24;
    --muted: #6b6b7b;
    --brand: #ff5a5f;
    --brand-dark: #e04347;
    --line: #e8e8f0;
    --radius: 18px;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html {{ -webkit-text-size-adjust: 100%; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: var(--bg);
    color: var(--ink);
    line-height: 1.6;
    padding: 0 0 env(safe-area-inset-bottom);
  }}
  .wrap {{ max-width: 520px; margin: 0 auto; padding: 20px 18px 120px; }}
  .hero {{
    background: linear-gradient(135deg, var(--brand) 0%, #ff8a5b 100%);
    border-radius: var(--radius);
    padding: 28px 22px;
    color: #fff;
    box-shadow: 0 12px 30px rgba(255, 90, 95, .25);
  }}
  .brand {{ font-size: 13px; letter-spacing: .12em; text-transform: uppercase; opacity: .92; }}
  .hero h1 {{ font-size: 27px; line-height: 1.3; margin: 8px 0 10px; font-weight: 800; }}
  .hero p {{ font-size: 15px; opacity: .95; }}
  .card {{
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 20px;
    margin-top: 16px;
    box-shadow: 0 2px 10px rgba(20, 20, 40, .04);
  }}
  .card h2 {{ font-size: 16px; margin-bottom: 10px; }}
  .card p {{ color: var(--muted); font-size: 15px; }}
  .price-row {{ display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }}
  .price {{ font-size: 38px; font-weight: 800; color: var(--brand); }}
  .price-note {{ color: var(--muted); font-size: 13px; }}
  .meta {{ margin-top: 14px; display: grid; gap: 8px; }}
  .meta div {{ display: flex; gap: 10px; font-size: 14px; }}
  .meta .k {{ color: var(--muted); min-width: 84px; }}
  .meta .v {{ color: var(--ink); font-weight: 600; }}
  .cta {{
    position: fixed;
    left: 0; right: 0; bottom: 0;
    background: rgba(255, 255, 255, .92);
    backdrop-filter: blur(10px);
    border-top: 1px solid var(--line);
    padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
  }}
  .cta-inner {{ max-width: 520px; margin: 0 auto; }}
  .btn {{
    display: block;
    width: 100%;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 14px;
    padding: 16px;
    font-size: 17px;
    font-weight: 700;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: transform .12s ease, background .12s ease;
  }}
  .btn:active {{ transform: scale(.985); background: var(--brand-dark); }}
  .cta small {{ display: block; text-align: center; color: var(--muted); margin-top: 8px; font-size: 12px; }}
  footer {{ text-align: center; color: var(--muted); font-size: 12px; margin-top: 22px; }}
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="brand">{brand_name}</div>
      <h1>{product_name}</h1>
      <p>{hero_tagline}</p>
    </header>

    <section class="card">
      <h2>{section_intro}</h2>
      <p>{description}</p>
    </section>

    <section class="card">
      <h2>{section_price}</h2>
      <div class="price-row">
        <span class="price">{price_display}</span>
        <span class="price-note">{price_note}</span>
      </div>
      <div class="meta">
        <div><span class="k">{k_cutoff}</span><span class="v">{order_cutoff}</span></div>
        <div><span class="k">{k_delivery}</span><span class="v">{delivery_window}</span></div>
        <div><span class="k">{k_contact}</span><span class="v">{contact}</span></div>
      </div>
    </section>

    <footer>{footer}</footer>
  </div>

  <div class="cta">
    <div class="cta-inner">
      <a class="btn" href="{order_link}">{btn}</a>
      <small>{btn_note}</small>
    </div>
  </div>
</body>
</html>
"""


def render_landing(plan: dict) -> str:
    order_link = "#order"  # anchor fallback; contact shown on the page
    lang = plan["language"]
    contact = plan["contact"] or _s(lang, "contact_fallback")
    return LANDING_TEMPLATE.format(
        lang_attr=_s(lang, "lang_attr"),
        brand_name=html.escape(plan["brand_name"]),
        product_name=html.escape(plan["product_name"]),
        hero_tagline=html.escape(
            _s(lang, "hero_tagline", audience=plan["target_customer"])
        ),
        section_intro=html.escape(_s(lang, "section_intro")),
        description=html.escape(plan["description"]),
        section_price=html.escape(_s(lang, "section_price")),
        price_display=html.escape(plan["price_display"]),
        price_note=html.escape(_s(lang, "price_note")),
        k_cutoff=html.escape(_s(lang, "k_cutoff")),
        order_cutoff=html.escape(plan["order_cutoff"]),
        k_delivery=html.escape(_s(lang, "k_delivery")),
        delivery_window=html.escape(plan["delivery_window"]),
        k_contact=html.escape(_s(lang, "k_contact")),
        contact=html.escape(contact),
        footer=html.escape(_s(lang, "footer", brand=plan["brand_name"])),
        order_link=order_link,
        btn=html.escape(_s(lang, "btn", price=plan["price_display"])),
        btn_note=html.escape(
            _s(
                lang,
                "btn_note",
                cutoff=plan["order_cutoff"],
                delivery=plan["delivery_window"],
            )
        ),
    )


CALENDAR_COPY = {
    "zh": {
        "hook_playful": "别刷了，{product} 到点就没",
        "greet_playful": "今晚的快乐，交给 {brand} 😋",
        "hook_warm": "为{audience}准备的 {product}",
        "greet_warm": "{brand} · 用心做{audience}需要的{product}",
        "themes": [
            "开张预告 · 建立认知",
            "痛点种草 · 场景共鸣",
            "社群接龙 · 集中转化",
            "买家秀 · 信任背书",
            "短视频 · 扩大触达",
            "限时福利 · 制造紧迫感",
            "复盘沉淀 · 下周预售",
        ],
        "bodies": [
            (
                "{greet}\n"
                "新品上线：{product}，{price} 即可入手。\n"
                "适合：{audience}。\n"
                "今天先剧透，明天正式接单，位子有限先到先得～"
            ),
            (
                "{hook}｜{product} 实测\n"
                "如果你也是{audience}，这就是为你准备的。\n"
                "亮点：{description}\n"
                "价格：{price}；下单截止 {cutoff}。\n"
                "#校园生活 #{product_nospace} #今日份快乐"
            ),
            (
                "【{brand} 接龙】{product}\n"
                "价格 {price}／份，今日 {cutoff} 截止。\n"
                "要的下面接龙「昵称 + 数量」，我会逐个私信确认。\n"
                "满 10 份立刻开送 🚀"
            ),
            (
                "昨天的 {product} 反馈来啦 👇\n"
                "「{description}」——真实体验就在图里。\n"
                "还有想试的{audience}，今天 {cutoff} 前下单依旧 {price}。\n"
                "{brand}，感谢每一位捧场的朋友 🙏"
            ),
            (
                "15 秒看懂 {brand} 的 {product}：\n"
                "镜头1：痛点场景（{audience}的日常）\n"
                "镜头2：{product}出场 + 关键卖点\n"
                "镜头3：价格 {price} + 下单截止 {cutoff}\n"
                "文案：{hook} 戳主页找我们下单。"
            ),
            (
                "最后冲刺 ⏰ 今天 {cutoff} 前下单 {product}：\n"
                "· 单人份 {price}\n"
                "· 两人拼单立减，凑满 5 份再加赠小食\n"
                "{brand} 在此，{audience}别错过～"
            ),
            (
                "一周战报 📊 {brand}\n"
                "· 本周主推：{product}（{price}）\n"
                "· 最受欢迎时段：{cutoff} 前的下单高峰\n"
                "下周新品预告 + 老客户专属价，想留位的先回复「1」。\n"
                "感谢{audience}一路支持 💛"
            ),
        ],
    },
    "ms": {
        "hook_playful": "Jangan skrol lagi — {product} habis kalau lambat",
        "greet_playful": "Kegembiraan malam ini, serahkan pada {brand} 😋",
        "hook_warm": "{product} istimewa untuk {audience}",
        "greet_warm": "{brand} · Dibuat dengan teliti untuk {audience}",
        "themes": [
            "Teaser pembukaan · Bina kesedaran",
            "Pujuk masalah · Sama rasa",
            "Tempahan kumpulan · Tukar segera",
            "Foto pelanggan · Bukti kepercayaan",
            "Video pendek · Perluas capaian",
            "Tawaran terhad · Cipta rasa segera",
            "Semak & pratonton · Jualan minggu depan",
        ],
        "bodies": [
            (
                "{greet}\n"
                "Produk baru dilancarkan: {product}, hanya {price} sahaja.\n"
                "Sesuai untuk: {audience}.\n"
                "Hari ini teaser dulu, esok baru buka tempahan. Slot terhad, siapa cepat dia dapat～"
            ),
            (
                "{hook}｜Ulasan {product}\n"
                "Kalau anda juga {audience}, ini memang untuk anda.\n"
                "Kelebihan: {description}\n"
                "Harga: {price}; tempahan tutup {cutoff}.\n"
                "#KehidupanKampus #{product_nospace} #KegembiraanHariIni"
            ),
            (
                "【Tempahan {brand}】{product}\n"
                "Harga {price}/unit, tutup hari ini {cutoff}.\n"
                "Yang nak, sambung senarai「nama + kuantiti」, saya akan sahkan satu-satu.\n"
                "Cukup 10 unit terus hantar 🚀"
            ),
            (
                "Maklum balas {product} semalam 👇\n"
                "「{description}」— pengalaman sebenar ada dalam gambar.\n"
                "Yang masih nak cuba, order sebelum {cutoff} hari ini masih {price}.\n"
                "{brand}, terima kasih semua yang menyokong 🙏"
            ),
            (
                "Faham {product} oleh {brand} dalam 15 saat:\n"
                "Babak 1: Senario masalah (rutin {audience})\n"
                "Babak 2: {product} muncul + kelebihan utama\n"
                "Babak 3: Harga {price} + tempahan tutup {cutoff}\n"
                "Teks: {hook} Klik profil untuk order."
            ),
            (
                "Serangan akhir ⏰ Order {product} sebelum {cutoff} hari ini:\n"
                "· Seunit {price}\n"
                "· Beli berdua dapat potongan, cukup 5 unit dapat snek percuma\n"
                "{brand} di sini, {audience} jangan lepaskan peluang～"
            ),
            (
                "Laporan seminggu 📊 {brand}\n"
                "· Produk utama: {product}（{price}）\n"
                "· Waktu paling popular: puncak tempahan sebelum {cutoff}\n"
                "Pratonton produk baru minggu depan + harga khas pelanggan lama. Yang nak simpan slot, balas「1」dulu.\n"
                "Terima kasih {audience} kerana sentiasa menyokong 💛"
            ),
        ],
    },
    "en": {
        "hook_playful": "Stop scrolling — {product} sells out fast",
        "greet_playful": "Tonight's happiness, courtesy of {brand} 😋",
        "hook_warm": "{product}, made for {audience}",
        "greet_warm": "{brand} · Thoughtfully made for {audience}",
        "themes": [
            "Opening teaser · Build awareness",
            "Problem hook · Shared scenario",
            "Group ordering · Drive conversion",
            "Buyer photos · Social proof",
            "Short video · Expand reach",
            "Limited offer · Create urgency",
            "Recap & preview · Next-week presale",
        ],
        "bodies": [
            (
                "{greet}\n"
                "New drop: {product}, yours for just {price}.\n"
                "Perfect for: {audience}.\n"
                "Teaser today, orders open tomorrow. Limited slots — first come, first served."
            ),
            (
                "{hook} | {product} review\n"
                "If you're {audience}, this was made for you.\n"
                "Highlights: {description}\n"
                "Price: {price}; orders close at {cutoff}.\n"
                "#CampusLife #{product_nospace} #DailyJoy"
            ),
            (
                "[{brand} order list] {product}\n"
                "{price} each; closes today at {cutoff}.\n"
                "To order, reply with「name + quantity」and I'll confirm each one.\n"
                "Hit 10 units and we ship immediately 🚀"
            ),
            (
                "Feedback on yesterday's {product} is in 👇\n"
                "「{description}」— the real experience is in the photos.\n"
                "{audience} who still want to try: order before {cutoff} today, still {price}.\n"
                "{brand} — thanks to everyone who supported 🙏"
            ),
            (
                "Understand {brand}'s {product} in 15 seconds:\n"
                "Scene 1: The problem ({audience}'s daily routine)\n"
                "Scene 2: {product} reveal + key selling points\n"
                "Scene 3: Price {price} + orders close {cutoff}\n"
                "Caption: {hook} Tap our profile to order."
            ),
            (
                "Final push ⏰ Order {product} before {cutoff} today:\n"
                "· Single portion {price}\n"
                "· Buy two for a discount; five earns a free snack\n"
                "{brand} here — don't miss out, {audience}～"
            ),
            (
                "Weekly report 📊 {brand}\n"
                "· Main product: {product}（{price}）\n"
                "· Busiest window: the rush before {cutoff}\n"
                "Next week's drop + loyal-customer pricing. Reply「1」to hold a slot.\n"
                "Thank you {audience} for the continued support 💛"
            ),
        ],
    },
}


def _calendar_rows(plan: dict) -> list[dict]:
    lang = plan["language"]
    copy = CALENDAR_COPY[lang]
    days = _DAY_LABELS[lang]
    platforms = _s(lang, "platforms")

    product = plan["product_name"]
    brand = plan["brand_name"]
    price = plan["price_display"]
    audience = plan["target_customer"]
    cutoff = plan["order_cutoff"]

    playful = plan["tone"].lower() in {"playful", "fun", "casual", "活泼", "轻松"}

    hook = copy["hook_playful" if playful else "hook_warm"].format(
        product=product, audience=audience
    )
    greet = copy["greet_playful" if playful else "greet_warm"].format(
        brand=brand, product=product, audience=audience
    )

    fmt = {
        "greet": greet,
        "hook": hook,
        "brand": brand,
        "product": product,
        "product_nospace": product.replace(" ", ""),
        "price": price,
        "audience": audience,
        "cutoff": cutoff,
        "description": plan["description"],
    }

    return [
        {
            "day": days[i],
            "platform": platforms[i],
            "theme": copy["themes"][i],
            "copy": copy["bodies"][i].format(**fmt),
        }
        for i in range(7)
    ]


def render_calendar(plan: dict) -> str:
    lang = plan["language"]
    lines = [
        f"# {_s(lang, 'cal_title', brand=plan['brand_name'])}",
        "",
        f"- **{_s(lang, 'lbl_product')}**: {plan['product_name']}",
        f"- **{_s(lang, 'lbl_audience')}**: {plan['target_customer']}",
        f"- **{_s(lang, 'lbl_price')}**: {plan['price_display']}",
        f"- **{_s(lang, 'lbl_cutoff')}**: {plan['order_cutoff']}",
        f"- **{_s(lang, 'lbl_tone')}**: {plan['tone']}",
        "",
        f"> {_s(lang, 'cal_intro')}",
        "",
    ]
    for row in _calendar_rows(plan):
        lines += [
            f"## {row['day']}",
            "",
            f"- **{_s(lang, 'lbl_platform')}**: {row['platform']}",
            f"- **{_s(lang, 'lbl_theme')}**: {row['theme']}",
            f"- **{_s(lang, 'lbl_copy')}**:",
            "",
            "```text",
            row["copy"],
            "```",
            "",
        ]
    lines += [
        "---",
        "",
        f"## {_s(lang, 'cal_rhythm_title')}",
        "",
        f"| {_s(lang, 'th_time')} | {_s(lang, 'th_action')} |",
        "|------|------|",
    ]
    for time_label, action in _s(lang, "rhythm"):
        lines.append(f"| {time_label.format(cutoff=plan['order_cutoff'])} | {action} |")
    lines.append("")
    return "\n".join(lines)# --------------------------------------------------------------------------- #
# Artifact 3: operations checklist
# --------------------------------------------------------------------------- #

def render_checklist(plan: dict) -> str:
    lang = plan["language"]
    cutoff = plan["order_cutoff"]
    delivery = plan["delivery_window"]

    def items(key: str) -> list[str]:
        return [
            "- [ ] " + item.format(cutoff=cutoff, delivery=delivery)
            for item in _s(lang, key)
        ]

    lines = [
        f"# {_s(lang, 'ck_title', brand=plan['brand_name'])}",
        "",
        f"- **{_s(lang, 'lbl_product')}**: {plan['product_name']}",
        f"- **{_s(lang, 'lbl_audience')}**: {plan['target_customer']}",
        f"- **{_s(lang, 'lbl_price')}**: {plan['price_display']}",
        f"- **{_s(lang, 'lbl_cutoff2')}**: {plan['order_cutoff']}",
        f"- **{_s(lang, 'lbl_delivery')}**: {plan['delivery_window']}",
        "",
        _s(lang, "ck_intro"),
        "",
        f"## {_s(lang, 'ck_s1')}",
        "",
        *items("ck_s1_items"),
        "",
        f"## {_s(lang, 'ck_s2')}",
        "",
        "- " + _s(lang, "ck_cutoff_line", cutoff=cutoff),
        *items("ck_s2_items"),
        "",
        f"## {_s(lang, 'ck_s3')}",
        "",
        *items("ck_s3_items"),
        "",
        f"## {_s(lang, 'ck_s4')}",
        "",
        *items("ck_s4_items"),
        "",
        "---",
        "",
        f"## {_s(lang, 'ck_risk')}",
        "",
    ]
    lines += ["- " + r for r in _s(lang, "ck_risks")]
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Driver
# --------------------------------------------------------------------------- #

def generate(plan: dict, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)

    artifacts = {
        "landing-page.html": render_landing(plan),
        "marketing-calendar.md": render_calendar(plan),
        "operations-checklist.md": render_checklist(plan),
    }

    written = []
    for name, content in artifacts.items():
        path = out_dir / name
        path.write_text(content, encoding="utf-8")
        written.append(str(path))
    return {"out_dir": str(out_dir), "files": written}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate a launch kit (landing page + marketing calendar + ops checklist)."
    )
    parser.add_argument("--plan-file", help="Path to business_plan JSON file.")
    parser.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUT_DIR),
        help=f"Output directory (default: {DEFAULT_OUT_DIR}).",
    )
    parser.add_argument(
        "--lang",
        choices=SUPPORTED_LANGS,
        help="Output language; overrides the plan's 'language' field (default: zh).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        raw = read_plan(args)
        if args.lang:
            raw["language"] = args.lang
        plan = normalise_plan(raw)
        manifest = generate(plan, Path(args.out_dir).expanduser())
    except InvalidInput as exc:
        print(json.dumps(exc.to_dict(), ensure_ascii=False, indent=2))
        return 2

    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
