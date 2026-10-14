#!/usr/bin/env python3
"""Clean and reconcile the legacy lead CSV for the Dealer Lead Router assignment.

WHAT THIS SCRIPT DOES (plain language)
---------------------------------------
It reads two ORIGINAL files (never writes to them):

    data/dealers.csv        -> which dealer owns which 3-digit pincode prefix
    data/legacy_leads.csv   -> 40 messy legacy leads

and produces three NEW files:

    data-out/cleaned_leads.csv     -> validated, deduplicated, dealer-assigned leads
    reports/reconciliation.csv     -> exactly one row per ORIGINAL input row
                                      with columns: lead_id, action, reason
    data-out/dealers.json          -> prefix -> dealer lookup used by the app later

ACTION PRIORITY (a row receives EXACTLY ONE action)
---------------------------------------------------
Every treatment the row needed is still listed inside `reason`, so nothing is
hidden. Priority, highest first:

    1. rejected         Any required field is invalid/missing:
                        lead_id, name, phone, pincode, created_on, status.
                        Rejected rows are NOT written to cleaned_leads.csv,
                        but they always appear in reconciliation.csv.
    2. merged           Row is valid, but its NORMALIZED mobile already belongs
                        to an earlier kept row => same person. Its useful,
                        non-empty fields are merged into that canonical record
                        and the row itself is not written out again.
    3. assigned_inhouse Row is valid and kept, pincode is a real 6-digit pincode,
                        but no dealer in dealers.csv owns its first 3 digits
                        => routed to "In-house Sales".
    4. fixed            Row is valid, kept, dealer-matched, and needed at least
                        one normalization (phone/date/status/source/product/...).
    5. imported         Row was already clean, kept and dealer-matched.

KEY RULES
---------
* Phones: spaces/hyphens/dots/brackets removed, leading '+' removed, a leading
  "91" removed only when it makes 12 digits, a leading "0" only when it makes
  11 digits. Result must be exactly 10 digits starting with 6/7/8/9.
* Duplicates: two rows with the same normalized mobile are the same person.
  The CANONICAL record is the first valid occurrence in file order
  (deterministic). Non-empty canonical values always win; a field is only
  filled from a duplicate when the canonical value is empty.
* Duplicate lead_ids are handled separately from duplicate mobiles:
  if a valid row needs an lead_id already used by a DIFFERENT person it gets a
  deterministic new id (L1033 -> L1033-2). A different person's record is
  never overwritten, and no input row is ever dropped from reconciliation.
* Pincodes: must match ^[1-9][0-9]{5}$ BEFORE the first three digits are used.
  Invalid pincodes are rejected - they are never sliced and never guessed.
* Dates: YYYY-MM-DD must be a real calendar date. Slash dates are converted
  only when unambiguous (day > 12, e.g. 31/10/2026). Impossible dates such as
  31/09/2026 and ambiguous ones such as 05/09/2026 are rejected, not guessed.
* Status/source: corrected only through majority spelling per case-insensitive
  key (e.g. 'converted ' -> 'Converted', 'website' -> 'Website'); unknown
  status is rejected, unknown source is kept verbatim and flagged.
* Products: corrected only when the power rating (e.g. 5kWh) matches exactly
  one canonical product from the file (e.g. 'Pure power 5 kwh' ->
  'PuREPower Home 5kWh'); otherwise kept verbatim and flagged.

USAGE
-----
    python scripts/clean_legacy_leads.py
    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEALERS = ROOT / "data" / "dealers.csv"
DEFAULT_LEADS = ROOT / "data" / "legacy_leads.csv"
DEFAULT_OUT_DIR = ROOT / "data-out"
DEFAULT_REPORTS_DIR = ROOT / "reports"

ACTIONS = ("imported", "fixed", "merged", "rejected", "assigned_inhouse")
RECON_COLUMNS = ("lead_id", "action", "reason")
CLEANED_COLUMNS = (
    "lead_id",
    "name",
    "phone",
    "pincode",
    "dealer_id",
    "dealer_name",
    "city",
    "product",
    "source",
    "created_on",
    "status",
)
REQUIRED_FIELDS = ("lead_id", "name", "phone", "pincode", "created_on", "status")

MOBILE_FIRST_DIGITS = "6789"
PINCODE_RE = re.compile(r"^[1-9][0-9]{5}$")
ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
SLASH_DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
PRODUCT_RE = re.compile(r"^PuREPower (?:Home|Commercial) \d{1,3}kWh$")
RATING_RE = re.compile(r"(\d{1,3})\s*kwh", re.IGNORECASE)


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------

def sha256_of(path: Path) -> str:
    """Return the SHA-256 fingerprint of a file (used to prove originals are untouched)."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_csv(path: Path) -> list[dict[str, str]]:
    """Read a CSV file in read-only mode and return its rows as dictionaries."""
    with open(path, "r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def build_vocab(values: Iterable[str]) -> dict[str, str]:
    """Build a spelling vocabulary: lower/trimmed key -> most common exact spelling.

    Ties are broken by whichever spelling appeared first in the file, so the
    result is deterministic. This is how 'converted ' becomes 'Converted' and
    'website' becomes 'Website' without hardcoding business data.
    """
    counts: dict[str, Counter[str]] = {}
    first_seen: dict[str, dict[str, int]] = {}
    for index, raw in enumerate(values):
        key = (raw or "").strip().lower()
        if not key:
            continue
        counts.setdefault(key, Counter())[raw] += 1
        first_seen.setdefault(key, {}).setdefault(raw, index)
    vocab: dict[str, str] = {}
    for key, counter in counts.items():
        vocab[key] = sorted(
            counter, key=lambda value: (-counter[value], first_seen[key][value])
        )[0]
    return vocab


# ---------------------------------------------------------------------------
# field-level normalizers: each returns (value, note, changed)
#   value is None  -> the field is invalid (note explains why, row is rejected)
#   note not None  -> a human-readable explanation for the reconciliation report
# ---------------------------------------------------------------------------

def normalize_phone(raw: str | None) -> tuple[str | None, str | None, bool]:
    """Normalize an Indian mobile number.

    Removes spaces, hyphens, dots, brackets and a leading '+', then removes a
    country/trunk prefix only when the remaining length is exactly 10.
    Returns (number, note, changed) or (None, problem, False).
    """
    original = raw or ""
    cleaned = re.sub(r"[\s\-.()]", "", original)
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if cleaned.isdigit():
        if len(cleaned) == 12 and cleaned.startswith("91"):
            cleaned = cleaned[2:]          # +91 country code
        elif len(cleaned) == 11 and cleaned.startswith("0"):
            cleaned = cleaned[1:]          # 0 trunk prefix
    if not cleaned.isdigit():
        return None, f"phone {original!r} contains non-digit characters", False
    if len(cleaned) != 10:
        return None, f"phone {original!r} has {len(cleaned)} digits, need exactly 10", False
    if cleaned[0] not in MOBILE_FIRST_DIGITS:
        return (
            None,
            f"phone {original!r} must start with 6/7/8/9 (Indian mobile prefix)",
            False,
        )
    if cleaned == original:
        return cleaned, None, False
    return cleaned, f"phone {original!r} normalized to {cleaned!r}", True


def normalize_pincode(raw: str | None) -> tuple[str | None, str | None, bool]:
    """Validate a pincode: exactly 6 digits, first digit 1-9. No slicing of short values."""
    original = raw or ""
    stripped = original.strip()
    if not PINCODE_RE.fullmatch(stripped):
        if stripped.isdigit():
            problem = f"pincode {original!r} has {len(stripped)} digits, need exactly 6"
        else:
            problem = f"pincode {original!r} is not 6 digits"
        return None, problem, False
    if stripped == original:
        return stripped, None, False
    return stripped, f"pincode {original!r} trimmed to {stripped!r}", True


def normalize_date(raw: str | None) -> tuple[str | None, str | None, bool]:
    """Validate/normalize a date.

    YYYY-MM-DD must be a real calendar date. DD/MM/YYYY is converted only when
    the day is > 12 (then the order cannot be ambiguous). Impossible dates
    (31/09/2026) and ambiguous ones (05/09/2026) are rejected, never guessed.
    """
    original = raw or ""
    text = original.strip()
    iso_match = ISO_DATE_RE.fullmatch(text)
    if iso_match:
        year, month, day = (int(part) for part in iso_match.groups())
        try:
            date(year, month, day)           # raises ValueError if impossible
        except ValueError:
            return None, f"date {original!r} is not a real calendar date", False
        if text == original:
            return text, None, False
        return text, f"date {original!r} trimmed to {text!r}", True
    slash_match = SLASH_DATE_RE.fullmatch(text)
    if slash_match:
        day, month, year = (int(part) for part in slash_match.groups())
        if day <= 12:
            return (
                None,
                f"date {original!r} is ambiguous (day/month vs month/day), not guessed",
                False,
            )
        try:
            normalized = date(year, month, day).isoformat()
        except ValueError:
            return None, f"date {original!r} is impossible (no such day/month)", False
        if normalized == original:
            return normalized, None, False
        return normalized, f"date {original!r} normalized to {normalized!r}", True
    return None, f"date {original!r} has an unrecognized format", False


def normalize_status(raw: str | None, vocab: Mapping[str, str]) -> tuple[str | None, str | None, bool]:
    """Status must exist in the vocabulary (case-insensitive); unknown status -> reject."""
    original = raw or ""
    key = original.strip().lower()
    if key not in vocab:
        return None, f"status {original!r} is not one of the known values", False
    canonical = vocab[key]
    if original == canonical:
        return canonical, None, False
    return canonical, f"status {original!r} normalized to {canonical!r}", True


def normalize_source(raw: str | None, vocab: Mapping[str, str]) -> tuple[str, str | None, bool]:
    """Source spelling is fixed when it matches a known value; unknown sources are kept."""
    original = raw or ""
    key = original.strip().lower()
    if key not in vocab:
        kept = original.strip()
        if kept == original:
            return kept, None, False
        return kept, f"source {original!r} trimmed to {kept!r}", True
    canonical = vocab[key]
    if original == canonical:
        return canonical, None, False
    return canonical, f"source {original!r} normalized to {canonical!r}", True


def build_product_canon(values: Iterable[str]) -> dict[str, str]:
    """Canonical products = values already written in the standard format
    'PuREPower Home/Commercial NkWh' (the dominant spelling in the file)."""
    canon: dict[str, str] = {}
    for raw in values:
        value = (raw or "").strip()
        if PRODUCT_RE.fullmatch(value):
            canon.setdefault(value.lower(), value)
    return canon


def normalize_product(
    raw: str | None, canon: Mapping[str, str]
) -> tuple[str, str | None, bool]:
    """Fix a product name only when unambiguous:
    exact/insensitive match to a canonical product, or a power rating (5kWh)
    that occurs in exactly one canonical product."""
    original = raw or ""
    text = original.strip()
    key = text.lower()
    if key in canon:
        canonical = canon[key]
        if original == canonical:
            return canonical, None, False
        return canonical, f"product {original!r} normalized to {canonical!r}", True
    rating_match = RATING_RE.search(text)
    if rating_match:
        rating = rating_match.group(1)
        pattern = re.compile(rf"(?<!\d){re.escape(rating)}kwh")
        candidates = [value for value in canon.values() if pattern.search(value.lower())]
        if len(candidates) == 1:
            canonical = candidates[0]
            return canonical, f"product {original!r} normalized to {canonical!r}", True
        if len(candidates) > 1:
            return (
                text,
                f"product {original!r} matches {len(candidates)} canonical products, kept verbatim",
                False,
            )
    if text == original:
        return text, None, False
    return text, f"product {original!r} trimmed to {text!r}", True


# ---------------------------------------------------------------------------
# dealer lookup
# ---------------------------------------------------------------------------

def load_dealers(path: Path) -> tuple[dict[str, dict[str, str]], list[dict[str, Any]]]:
    """Read dealers.csv and build prefix -> dealer lookup.

    '530|531' becomes two entries: '500'-style keys map to the dealer dict.
    """
    rows = read_csv(path)
    prefix_map: dict[str, dict[str, str]] = {}
    dealers: list[dict[str, Any]] = []
    for row in rows:
        prefixes = [p.strip() for p in (row.get("pincode_prefixes") or "").split("|") if p.strip()]
        for prefix in prefixes:
            if not re.fullmatch(r"\d{3}", prefix):
                raise ValueError(f"dealer {row.get('dealer_id')} has invalid prefix {prefix!r}")
            if prefix in prefix_map:
                raise ValueError(f"pincode prefix {prefix} claimed by two dealers")
            prefix_map[prefix] = {
                "dealer_id": row["dealer_id"],
                "dealer_name": row["dealer_name"],
                "city": row["city"],
            }
        dealers.append(
            {
                "dealer_id": row["dealer_id"],
                "dealer_name": row["dealer_name"],
                "city": row["city"],
                "pincode_prefixes": prefixes,
                "contact_email": row.get("contact_email", ""),
            }
        )
    return prefix_map, dealers


def assign_dealer(pincode: str, prefix_map: Mapping[str, Mapping[str, str]]) -> dict[str, str] | None:
    """Return the dealer for a VALID 6-digit pincode, else None.

    Defense in depth: even if someone passes a bad pincode here, it is
    rejected instead of being sliced (so '5000' can never match prefix '500').
    """
    if not PINCODE_RE.fullmatch(pincode or ""):
        return None
    dealer = prefix_map.get(pincode[:3])
    return dict(dealer) if dealer else None


# ---------------------------------------------------------------------------
# core pipeline (pure: no file writes) so tests can exercise it directly
# ---------------------------------------------------------------------------

def merge_missing_fields(canonical: dict[str, Any], duplicate: Mapping[str, Any], duplicate_row: int) -> list[str]:
    """Copy useful, non-empty values from a duplicate into the canonical record.

    Only empty fields are filled - a non-empty canonical value always wins,
    which keeps the outcome deterministic.
    """
    notes: list[str] = []
    for field in ("name", "product", "source", "created_on", "status"):
        if not str(canonical.get(field) or "").strip() and str(duplicate.get(field) or "").strip():
            canonical[field] = duplicate[field]
            notes.append(f"filled {field} from input row {duplicate_row}")
    return notes


def clean_lead_rows(
    lead_rows: list[dict[str, str]],
    prefix_map: Mapping[str, Mapping[str, str]],
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Clean every lead row.

    Returns (cleaned_rows, reconciliation_rows). The reconciliation list has
    exactly one entry per input row, in input order. Row identity is tracked
    internally by position, so repeated lead_ids cannot overwrite entries.
    """
    status_vocab = build_vocab(row.get("status", "") for row in lead_rows)
    source_vocab = build_vocab(row.get("source", "") for row in lead_rows)
    product_canon = build_product_canon(row.get("product", "") for row in lead_rows)

    cleaned: list[dict[str, str]] = []
    reconciliation: list[dict[str, str]] = []
    cleaned_by_id: dict[str, dict[str, str]] = {}
    phone_owner: dict[str, tuple[str, int]] = {}     # phone -> (final lead_id, row number)
    used_ids: dict[str, int] = {}                    # lead_id -> row number

    for row_number, row in enumerate(lead_rows, start=1):
        raw_id = (row.get("lead_id") or "").strip()
        problems: list[str] = []
        fixes: list[str] = []
        cautions: list[str] = []

        def take(value: Any, note: Any, changed: bool, label: str) -> None:
            if value is None:
                problems.append(note)
            elif note and changed:
                fixes.append(note)
            elif note:
                cautions.append(note)

        phone, note, changed = normalize_phone(row.get("phone"))
        take(phone, note, changed, "phone")

        pincode, note, changed = normalize_pincode(row.get("pincode"))
        take(pincode, note, changed, "pincode")

        if not raw_id:
            problems.append("missing lead_id")
        raw_name = row.get("name") or ""
        name = re.sub(r"\s+", " ", raw_name).strip()
        if not name:
            problems.append(f"missing name (input row {row_number}, lead {raw_id or 'unknown'})")
        elif name != raw_name:
            fixes.append(f"name {raw_name!r} whitespace normalized to {name!r}")

        created_on, note, changed = normalize_date(row.get("created_on"))
        take(created_on, note, changed, "created_on")

        status, note, changed = normalize_status(row.get("status"), status_vocab)
        take(status, note, changed, "status")

        product, note, changed = normalize_product(row.get("product"), product_canon)
        take(product, note, changed, "product")

        source, note, changed = normalize_source(row.get("source"), source_vocab)
        take(source, note, changed, "source")

        # --- priority 1: rejected ------------------------------------------
        if problems:
            reconciliation.append(
                {"lead_id": raw_id, "action": "rejected", "reason": "; ".join(problems)}
            )
            continue

        assert phone is not None and pincode is not None

        # --- priority 2: merged (duplicate mobile) -------------------------
        if phone in phone_owner:
            owner_id, owner_row = phone_owner[phone]
            parts = [
                f"duplicate mobile {phone} already used by lead {owner_id} "
                f"(input row {owner_row}); merged into {owner_id}"
            ]
            if raw_id in used_ids and used_ids[raw_id] != owner_row:
                parts.append(
                    f"lead_id {raw_id!r} also used by input row {used_ids[raw_id]}; "
                    "different record, not overwritten"
                )
            duplicate_values = {
                "name": name,
                "product": product,
                "source": source,
                "created_on": created_on,
                "status": status,
            }
            parts.extend(merge_missing_fields(cleaned_by_id[owner_id], duplicate_values, row_number))
            parts.extend(fixes)
            parts.extend(cautions)
            reconciliation.append(
                {"lead_id": raw_id, "action": "merged", "reason": "; ".join(parts)}
            )
            continue

        # --- duplicate lead_id with a DIFFERENT person -> new id ------------
        final_id = raw_id
        if final_id in used_ids:
            suffix = 2
            while f"{raw_id}-{suffix}" in used_ids:
                suffix += 1
            final_id = f"{raw_id}-{suffix}"
            fixes.append(
                f"lead_id {raw_id!r} already used by input row {used_ids[raw_id]}; "
                f"reassigned to {final_id!r}"
            )
        used_ids[final_id] = row_number
        phone_owner[phone] = (final_id, row_number)

        dealer = assign_dealer(pincode, prefix_map)
        if dealer is None:
            # --- priority 3: assigned_inhouse ------------------------------
            action = "assigned_inhouse"
            parts = fixes + cautions + [
                f"no dealer matches pincode prefix {pincode[:3]}; routed to In-house Sales"
            ]
        else:
            assignment = (
                f"assigned to {dealer['dealer_id']} {dealer['dealer_name']} "
                f"(prefix {pincode[:3]})"
            )
            # --- priority 4/5: fixed vs imported ---------------------------
            action = "fixed" if fixes else "imported"
            parts = fixes + cautions + [assignment]

        record = {
            "lead_id": final_id,
            "name": name,
            "phone": phone,
            "pincode": pincode,
            "dealer_id": dealer["dealer_id"] if dealer else "",
            "dealer_name": dealer["dealer_name"] if dealer else "In-house Sales",
            "city": dealer["city"] if dealer else "",
            "product": product,
            "source": source,
            "created_on": created_on,
            "status": status,
        }
        cleaned.append(record)
        cleaned_by_id[final_id] = record
        reconciliation.append({"lead_id": raw_id, "action": action, "reason": "; ".join(parts)})

    return cleaned, reconciliation


def run_pipeline(dealers_path: Path, leads_path: Path) -> dict[str, Any]:
    """Read both originals read-only, clean, and return everything needed to write."""
    hash_before = {str(path): sha256_of(path) for path in (dealers_path, leads_path)}
    prefix_map, dealers = load_dealers(dealers_path)
    lead_rows = read_csv(leads_path)
    cleaned, reconciliation = clean_lead_rows(lead_rows, prefix_map)
    hash_after = {str(path): sha256_of(path) for path in (dealers_path, leads_path)}
    if hash_before != hash_after:
        raise RuntimeError("original CSV files changed during processing - aborting")
    stats = Counter(entry["action"] for entry in reconciliation)
    return {
        "input_rows": len(lead_rows),
        "cleaned": cleaned,
        "reconciliation": reconciliation,
        "stats": stats,
        "dealers": dealers,
        "prefix_map": prefix_map,
        "hashes": hash_after,
        "dealers_path": dealers_path,
        "leads_path": leads_path,
    }


def write_outputs(result: Mapping[str, Any], out_dir: Path, reports_dir: Path) -> None:
    """Write cleaned_leads.csv, reconciliation.csv and dealers.json."""
    out_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    with open(out_dir / "cleaned_leads.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(CLEANED_COLUMNS))
        writer.writeheader()
        writer.writerows(result["cleaned"])

    with open(reports_dir / "reconciliation.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(RECON_COLUMNS))
        writer.writeheader()
        writer.writerows(result["reconciliation"])

    prefix_map = result["prefix_map"]
    payload = {
        "source": result["dealers_path"].name,
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dealers": result["dealers"],
        "prefix_map": {
            prefix: dict(prefix_map[prefix]) for prefix in sorted(prefix_map)
        },
    }
    with open(out_dir / "dealers.json", "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def print_summary(result: Mapping[str, Any]) -> None:
    """Print input/output row counts and action counts."""
    stats: Counter = result["stats"]
    print("=== Legacy lead cleaning summary ===")
    print(f"Input rows  ({result['leads_path'].name}): {result['input_rows']}")
    print(f"Output rows (data-out/cleaned_leads.csv): {len(result['cleaned'])}")
    print(f"Reconciliation rows (reports/reconciliation.csv): {len(result['reconciliation'])}")
    print("Actions:")
    for action in ACTIONS:
        print(f"  {action:<18} {stats.get(action, 0)}")
    unchanged = all(len(digest) == 64 for digest in result["hashes"].values())
    print(f"Original files unchanged: {'sha256 verified OK' if unchanged else 'CHANGED!'}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Clean legacy dealer leads (read-only on originals).")
    parser.add_argument("--dealers", type=Path, default=DEFAULT_DEALERS)
    parser.add_argument("--leads", type=Path, default=DEFAULT_LEADS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--reports", type=Path, default=DEFAULT_REPORTS_DIR)
    args = parser.parse_args(argv)

    for path in (args.dealers, args.leads):
        if not path.exists():
            print(f"ERROR: missing input file {path}", file=sys.stderr)
            return 1

    result = run_pipeline(args.dealers, args.leads)
    write_outputs(result, args.out, args.reports)
    print_summary(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
