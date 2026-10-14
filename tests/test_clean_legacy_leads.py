"""Automated tests for scripts/clean_legacy_leads.py.

Covers the real edge cases found while inspecting data/legacy_leads.csv:
  * '98480 22 431'        -> spaces inside the phone
  * '+91-9000012345'      -> country code + hyphen
  * '+91 9633021001'      -> country code + space (duplicate of L1010)
  * '12345'               -> too short
  * '9166838090'          -> starts with 91 but must NOT be cut to 8 digits
  * '5000'                -> 4-digit pincode (must not be sliced to prefix 500)
  * '110001'              -> valid pincode, no dealer prefix -> In-house Sales
  * '31/09/2026'          -> impossible date
  * 'converted '/'website'-> casing/whitespace fixes
  * 'Pure power 5 kwh'    -> non-standard product name
  * missing name (L1026)
  * 5 duplicate mobile pairs and the duplicated lead_id L1033

Plus synthetic rule tests for behaviour that does not appear in the real file
(duplicate lead_id for a different person, merge fill-gaps, action priority).

Run with:  python -m unittest discover -s tests -v
"""

from __future__ import annotations

import csv
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import clean_legacy_leads as cl  # noqa: E402

DEALERS = ROOT / "data" / "dealers.csv"
LEADS = ROOT / "data" / "legacy_leads.csv"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PhoneTests(unittest.TestCase):
    def test_strips_spaces(self):
        self.assertEqual(cl.normalize_phone("98480 22 431")[0], "9848022431")

    def test_strips_plus91_hyphen(self):
        self.assertEqual(cl.normalize_phone("+91-9000012345")[0], "9000012345")

    def test_strips_plus91_space(self):
        self.assertEqual(cl.normalize_phone("+91 9633021001")[0], "9633021001")

    def test_keeps_ten_digit_number_starting_91(self):
        self.assertEqual(cl.normalize_phone("9166838090")[0], "9166838090")

    def test_rejects_short_number(self):
        value, note, _ = cl.normalize_phone("12345")
        self.assertIsNone(value)
        self.assertIn("5 digits", note)

    def test_rejects_wrong_prefix(self):
        self.assertIsNone(cl.normalize_phone("1234567890")[0])

    def test_strips_trunk_zero(self):
        self.assertEqual(cl.normalize_phone("09166838090")[0], "9166838090")

    def test_rejects_twelve_digits_not_country_code(self):
        self.assertIsNone(cl.normalize_phone("981234567890")[0])

    def test_unchanged_number_is_not_marked_fixed(self):
        value, note, changed = cl.normalize_phone("9447712782")
        self.assertEqual(value, "9447712782")
        self.assertIsNone(note)
        self.assertFalse(changed)


class PincodeTests(unittest.TestCase):
    def setUp(self):
        self.prefix_map, _ = cl.load_dealers(DEALERS)

    def test_four_digit_pincode_is_invalid(self):
        value, note, _ = cl.normalize_pincode("5000")
        self.assertIsNone(value)
        self.assertIn("4 digits", note)

    def test_valid_pincode_unchanged(self):
        value, _, changed = cl.normalize_pincode("502285")
        self.assertEqual(value, "502285")
        self.assertFalse(changed)

    def test_assign_by_prefix(self):
        self.assertEqual(cl.assign_dealer("502285", self.prefix_map)["dealer_id"], "D02")

    def test_multi_prefix_dealer(self):
        self.assertEqual(cl.assign_dealer("531001", self.prefix_map)["dealer_id"], "D05")

    def test_unmatched_prefix_returns_none(self):
        self.assertIsNone(cl.assign_dealer("110001", self.prefix_map))

    def test_invalid_pincode_never_matched_by_slicing(self):
        # blind [:3] on '5000' would wrongly match D01 (prefix 500)
        self.assertIsNone(cl.assign_dealer("5000", self.prefix_map))


class DateTests(unittest.TestCase):
    def test_impossible_slash_date_rejected(self):
        value, note, _ = cl.normalize_date("31/09/2026")
        self.assertIsNone(value)
        self.assertIn("impossible", note)

    def test_unambiguous_slash_date_converted(self):
        value, note, changed = cl.normalize_date("31/10/2026")
        self.assertEqual(value, "2026-10-31")
        self.assertTrue(changed)

    def test_ambiguous_slash_date_rejected(self):
        value, note, _ = cl.normalize_date("05/09/2026")
        self.assertIsNone(value)
        self.assertIn("ambiguous", note)

    def test_impossible_iso_date_rejected(self):
        self.assertIsNone(cl.normalize_date("2026-09-31")[0])

    def test_valid_iso_date_unchanged(self):
        value, note, changed = cl.normalize_date("2026-09-03")
        self.assertEqual(value, "2026-09-03")
        self.assertIsNone(note)
        self.assertFalse(changed)


class VocabularyTests(unittest.TestCase):
    def setUp(self):
        rows = cl.read_csv(LEADS)
        self.status_vocab = cl.build_vocab(r["status"] for r in rows)
        self.source_vocab = cl.build_vocab(r["source"] for r in rows)
        self.products = cl.build_product_canon(r["product"] for r in rows)

    def test_status_trailing_space_and_case_fixed(self):
        value, note, changed = cl.normalize_status("converted ", self.status_vocab)
        self.assertEqual(value, "Converted")
        self.assertTrue(changed)

    def test_unknown_status_rejected(self):
        self.assertIsNone(cl.normalize_status("Pendingish", self.status_vocab)[0])

    def test_source_case_fixed(self):
        value, _, changed = cl.normalize_source("website", self.source_vocab)
        self.assertEqual(value, "Website")
        self.assertTrue(changed)

    def test_unknown_source_kept_verbatim(self):
        value, note, changed = cl.normalize_source("Referral Fair", self.source_vocab)
        self.assertEqual(value, "Referral Fair")
        self.assertFalse(changed)

    def test_nonstandard_product_resolved_by_rating(self):
        value, note, changed = cl.normalize_product("Pure power 5 kwh", self.products)
        self.assertEqual(value, "PuREPower Home 5kWh")
        self.assertTrue(changed)

    def test_standard_product_unchanged(self):
        value, note, changed = cl.normalize_product("PuREPower Home 3kWh", self.products)
        self.assertEqual(value, "PuREPower Home 3kWh")
        self.assertFalse(changed)


class RealDataTests(unittest.TestCase):
    """End-to-end assertions against the real assignment files."""

    @classmethod
    def setUpClass(cls):
        cls.hash_before = (sha256(DEALERS), sha256(LEADS))
        cls.result = cl.run_pipeline(DEALERS, LEADS)
        cls.cleaned = cls.result["cleaned"]
        cls.recon = cls.result["reconciliation"]
        cls.stats = cls.result["stats"]
        cls.by_index = {i + 1: row for i, row in enumerate(cls.recon)}  # input row -> recon

    def test_original_files_untouched(self):
        self.assertEqual(self.hash_before, (sha256(DEALERS), sha256(LEADS)))

    def test_reconciliation_has_one_row_per_input_row(self):
        input_rows = len(cl.read_csv(LEADS))
        self.assertEqual(len(self.recon), input_rows)
        self.assertEqual(self.result["input_rows"], 40)

    def test_reconciliation_columns_exact_order(self):
        with open(ROOT / "reports" / "reconciliation.csv", encoding="utf-8", newline="") as fh:
            header = next(csv.reader(fh))
        self.assertEqual(header, ["lead_id", "action", "reason"])

    def test_only_allowed_actions_used(self):
        self.assertTrue(set(self.stats) <= set(cl.ACTIONS), set(self.stats))

    def test_action_counts(self):
        self.assertEqual(
            dict(self.stats),
            {
                "imported": 25,
                "fixed": 5,
                "merged": 5,
                "rejected": 4,
                "assigned_inhouse": 1,
            },
        )
        self.assertEqual(len(self.cleaned), 31)

    def test_rejected_rows(self):
        cases = {
            9: "12345",        # L1009 short phone
            12: "5000",        # L1012 short pincode
            18: "31/09/2026",  # L1018 impossible date
            26: "missing name"  # L1026 blank name
        }
        for row_no, needle in cases.items():
            entry = self.by_index[row_no]
            self.assertEqual(entry["action"], "rejected", entry)
            self.assertIn(needle, entry["reason"])

    def test_merged_rows_point_at_canonical_lead(self):
        merged_rows = [36, 37, 38, 39, 40]
        for row_no in merged_rows:
            entry = self.by_index[row_no]
            self.assertEqual(entry["action"], "merged", entry)
            self.assertIn("duplicate mobile", entry["reason"])
        self.assertIn("input row 13", self.by_index[40]["reason"])  # Kiran merged into L1013

    def test_duplicate_lead_id_not_overwritten(self):
        l1033 = [e for e in self.recon if e["lead_id"] == "L1033"]
        self.assertEqual(len(l1033), 2)                     # both input rows reported
        kept = [r for r in self.cleaned if r["lead_id"] == "L1033"]
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["name"], "Mohan Rao")       # different person preserved
        self.assertTrue(
            any(r["lead_id"] == "L1013" and r["name"] == "Kiran Kumar" for r in self.cleaned)
        )

    def test_fixed_rows(self):
        for row_no in (4, 6, 20, 23, 28):
            self.assertEqual(self.by_index[row_no]["action"], "fixed", self.by_index[row_no])
        self.assertIn("normalized", self.by_index[4]["reason"])   # phone spaces
        self.assertIn("normalized", self.by_index[20]["reason"])  # status
        self.assertIn("normalized", self.by_index[23]["reason"])  # product
        self.assertIn("normalized", self.by_index[28]["reason"])  # source

    def test_inhouse_row(self):
        entry = self.by_index[15]  # L1015 pincode 110001
        self.assertEqual(entry["action"], "assigned_inhouse")
        self.assertIn("In-house Sales", entry["reason"])

    def test_cleaned_output_quality(self):
        phones = [r["phone"] for r in self.cleaned]
        self.assertEqual(len(phones), len(set(phones)), "duplicate mobile in output")
        ids = [r["lead_id"] for r in self.cleaned]
        self.assertEqual(len(ids), len(set(ids)), "duplicate lead_id in output")
        for row in self.cleaned:
            self.assertRegex(row["phone"], r"^[6-9]\d{9}$")
            self.assertRegex(row["pincode"], r"^[1-9]\d{5}$")
        inhouse = [r for r in self.cleaned if r["dealer_name"] == "In-house Sales"]
        self.assertEqual(len(inhouse), 1)
        self.assertEqual(inhouse[0]["lead_id"], "L1015")
        self.assertEqual(inhouse[0]["dealer_id"], "")

    def test_output_files_written_with_correct_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            out, reports = Path(tmp) / "out", Path(tmp) / "rep"
            cl.write_outputs(self.result, out, reports)
            with open(out / "cleaned_leads.csv", encoding="utf-8", newline="") as fh:
                reader = csv.DictReader(fh)
                header = reader.fieldnames
                rows = list(reader)
            self.assertEqual(header, list(cl.CLEANED_COLUMNS))
            self.assertEqual(len(rows), 31)
            with open(reports / "reconciliation.csv", encoding="utf-8", newline="") as fh:
                reader = csv.DictReader(fh)
                self.assertEqual(reader.fieldnames, ["lead_id", "action", "reason"])
                recon_rows = list(reader)
            self.assertEqual(len(recon_rows), 40)
            self.assertTrue((out / "dealers.json").exists())


class RuleTests(unittest.TestCase):
    """Synthetic rows proving documented rules that the real file does not exercise."""

    def setUp(self):
        self.prefix_map, _ = cl.load_dealers(DEALERS)

    @staticmethod
    def lead(**overrides):
        row = {
            "lead_id": "L1",
            "name": "Test Person",
            "phone": "9447712782",
            "pincode": "502285",
            "product": "PuREPower Home 5kWh",
            "source": "Website",
            "created_on": "2026-09-03",
            "status": "New",
        }
        row.update(overrides)
        return row

    def test_different_person_with_same_lead_id_gets_new_id(self):
        rows = [
            self.lead(lead_id="L1033", phone="9708579269", name="Person One"),
            self.lead(lead_id="L1033", phone="9876543210", name="Person Two"),
        ]
        cleaned, recon = cl.clean_lead_rows(rows, self.prefix_map)
        self.assertEqual(len(cleaned), 2)
        self.assertEqual([r["lead_id"] for r in cleaned], ["L1033", "L1033-2"])
        self.assertEqual([r["action"] for r in recon], ["imported", "fixed"])
        self.assertIn("reassigned", recon[1]["reason"])

    def test_merge_fills_empty_field_from_duplicate(self):
        rows = [
            self.lead(lead_id="L1", phone="9447712782", product=""),
            self.lead(lead_id="L2", phone="9447712782", product="PuREPower Home 5kWh"),
        ]
        cleaned, recon = cl.clean_lead_rows(rows, self.prefix_map)
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(cleaned[0]["product"], "PuREPower Home 5kWh")
        self.assertEqual(recon[1]["action"], "merged")
        self.assertIn("filled product", recon[1]["reason"])

    def test_action_priority_rejected_beats_merged(self):
        rows = [
            self.lead(lead_id="L1", phone="9447712782"),
            self.lead(lead_id="L2", phone="9447712782", pincode="5000"),
        ]
        _, recon = cl.clean_lead_rows(rows, self.prefix_map)
        self.assertEqual(recon[1]["action"], "rejected")
        self.assertIn("pincode", recon[1]["reason"])

    def test_action_priority_inhouse_beats_fixed(self):
        rows = [
            self.lead(lead_id="L0", status="Converted"),                 # vocabulary anchor
            self.lead(lead_id="L1", phone="9123456789", status="converted ", pincode="110001"),
        ]
        cleaned, recon = cl.clean_lead_rows(rows, self.prefix_map)
        self.assertEqual(recon[1]["action"], "assigned_inhouse")
        self.assertIn("normalized", recon[1]["reason"])          # fix still reported
        self.assertIn("In-house Sales", recon[1]["reason"])
        self.assertEqual(cleaned[1]["dealer_name"], "In-house Sales")

    def test_action_priority_merged_beats_fixed(self):
        rows = [
            self.lead(lead_id="L1", phone="9447712782"),
            self.lead(lead_id="L2", phone="+91-9447712782", status="converted "),
        ]
        _, recon = cl.clean_lead_rows(rows, self.prefix_map)
        self.assertEqual(recon[1]["action"], "merged")
        self.assertIn("duplicate mobile", recon[1]["reason"])
        self.assertIn("normalized", recon[1]["reason"])          # both treatments visible

    def test_canonical_is_first_valid_occurrence(self):
        rows = [
            self.lead(lead_id="L9", phone="9447712782", name="First Person"),
            self.lead(lead_id="L8", phone="9447712782", name="Second Person"),
        ]
        cleaned, _ = cl.clean_lead_rows(rows, self.prefix_map)
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(cleaned[0]["lead_id"], "L9")
        self.assertEqual(cleaned[0]["name"], "First Person")


class OutputFileTests(unittest.TestCase):
    def test_real_outputs_exist_on_disk(self):
        self.assertTrue((ROOT / "data-out" / "cleaned_leads.csv").exists())
        self.assertTrue((ROOT / "data-out" / "dealers.json").exists())
        self.assertTrue((ROOT / "reports" / "reconciliation.csv").exists())


if __name__ == "__main__":
    unittest.main()
