"""Pure-logic tests for leaderboard v3 (privacy, ranges, ranking rules)."""
import json
import unittest
from datetime import date, datetime

from admin import leaderboard_core as core


def entry(**kw):
    base = {
        "id": 1, "is_active": True, "verification_status": "pending", "is_verified": False,
        "monthly_visitors": 12345, "monthly_pageviews": 40000, "engagement_rate": 61.2,
        "bounce_rate": 38.8, "avg_session_duration": 95, "visitor_trend": 12.5, "looking_for": None,
    }
    base.update(kw)
    return base


class RangeLabelTests(unittest.TestCase):
    def test_bands(self):
        self.assertEqual(core.range_label(0), "0")
        self.assertEqual(core.range_label(42), "Under 100")
        self.assertEqual(core.range_label(100), "100–500")
        self.assertEqual(core.range_label(499), "100–500")
        self.assertEqual(core.range_label(1_000), "1K–5K")
        self.assertEqual(core.range_label(12_345), "10K–50K")
        self.assertEqual(core.range_label(87_000), "50K–100K")
        self.assertEqual(core.range_label(2_300_000), "1M–5M")
        self.assertEqual(core.range_label(40_000_000), "10M+")
        self.assertIsNone(core.range_label(None))

    def test_band_never_contains_the_exact_number(self):
        for v in (101, 777, 1234, 54321, 987654):
            self.assertNotIn(str(v), core.range_label(v))


class PublicMetricTests(unittest.TestCase):
    def test_modes(self):
        self.assertIsNone(core.public_metric("hidden", 100, 50))
        self.assertEqual(core.public_metric("exact", 150, 100), {"mode": "exact", "value": 150, "delta_pct": 50.0})
        r = core.public_metric("range", 12_000, 10_000)
        self.assertEqual(r["mode"], "range")
        self.assertNotIn("value", r)
        self.assertEqual(r["label"], "10K–50K")
        self.assertEqual(r["delta_pct"], 20.0)

    def test_delta_needs_a_previous_period(self):
        self.assertIsNone(core.delta_pct(10, 0))
        self.assertIsNone(core.delta_pct(10, None))
        self.assertEqual(core.delta_pct(50, 100), -50.0)

    def test_engagement_range_is_a_ten_point_band(self):
        r = core.public_engagement("range", 61.2, 38.8, 95)
        self.assertEqual(r, {"mode": "range", "label": "60–70%"})
        self.assertIsNone(core.public_engagement("hidden", 61.2, 38.8, 95))


class PrivacyNormalizationTests(unittest.TestCase):
    def test_defaults_are_conservative(self):
        p = core.normalize_privacy({})
        self.assertEqual(p["metrics"]["visitors"], "exact")
        self.assertEqual(p["metrics"]["clicks"], "exact")
        for m in ("pageviews", "impressions", "engagement"):
            self.assertEqual(p["metrics"][m], "hidden")
        self.assertTrue(all(v is False for v in p["sections"].values()))
        self.assertFalse(p["live"])

    def test_unknown_and_invalid_values_are_ignored(self):
        p = core.normalize_privacy({"metrics": {"visitors": "everything", "bogus": "exact", "clicks": "range"},
                                    "sections": {"queries": "yes", "pages": True}, "live": "true"})
        self.assertEqual(p["metrics"]["visitors"], "exact")
        self.assertEqual(p["metrics"]["clicks"], "range")
        self.assertFalse(p["sections"]["queries"])
        self.assertTrue(p["sections"]["pages"])
        self.assertFalse(p["live"])
        self.assertNotIn("bogus", p["metrics"])

    def test_json_string_and_garbage(self):
        self.assertEqual(core.normalize_privacy("{not json")["metrics"]["visitors"], "exact")
        p = core.normalize_privacy(json.dumps({"metrics": {"visitors": "hidden"}}))
        self.assertEqual(p["metrics"]["visitors"], "hidden")

    def test_open_to_is_whitelisted(self):
        self.assertEqual(core.normalize_open_to(["sponsorships", "x", "acquisition", "sponsorships"]), ["sponsorships", "acquisition"])
        self.assertEqual(core.legacy_open_to(json.dumps(["partner", "buyer", "visibility"])), ["partnerships", "acquisition"])


class SettingsAndLevelTests(unittest.TestCase):
    def test_entry_without_profile_keeps_what_it_shows_today(self):
        s = core.settings_for(None, entry())
        self.assertTrue(s["legacy"])
        self.assertEqual(s["privacy"]["metrics"]["pageviews"], "exact")
        self.assertTrue(s["privacy"]["sections"]["queries"])

    def test_new_profile_is_conservative(self):
        s = core.settings_for({"privacy_json": None, "open_to_json": None, "is_paused": False}, entry())
        self.assertFalse(s["legacy"])
        self.assertEqual(s["privacy"]["metrics"]["pageviews"], "hidden")

    def test_legacy_verified_entry_stays_ranked_until_first_check(self):
        e = entry(verification_status="verified", is_verified=True)
        lvl = core.effective_level(e, None)
        self.assertTrue(core.is_ranked(lvl))
        self.assertTrue(lvl["grace"])
        # first v3 check says GA4 only -> no longer ranked
        lvl = core.effective_level(e, {"verification_level": "ga4", "verification_checked_at": datetime(2026, 10, 26)})
        self.assertFalse(core.is_ranked(lvl))
        lvl = core.effective_level(e, {"verification_level": "owner", "verification_checked_at": datetime(2026, 10, 26)})
        self.assertTrue(core.is_ranked(lvl))

    def test_unverified_never_ranks(self):
        self.assertFalse(core.is_ranked(core.effective_level(entry(), None)))
        prof = {"verification_level": "owner", "verification_checked_at": None}
        self.assertFalse(core.is_ranked(core.effective_level(entry(), prof)))

    def test_paused_and_inactive_are_not_listed(self):
        self.assertFalse(core.is_listed(entry(is_active=False), None))
        self.assertFalse(core.is_listed(entry(), {"is_paused": True}))
        self.assertTrue(core.is_listed(entry(), {"is_paused": False}))

    def test_public_levels(self):
        pub = core.level_public({"level": "owner", "checked_at": datetime(2026, 10, 26, 8, 0), "grace": False},
                                {"ga4": {"ok": True}})
        self.assertEqual(pub["label"], "Verified owner (Search Console)")
        self.assertTrue(pub["ga4_connected"])
        self.assertEqual(pub["checked_at"], "2026-10-26T08:00:00Z")
        self.assertEqual(core.level_public({"level": "none"})["label"], "Pending verification")
        self.assertEqual(core.level_public({"level": "ga4"})["label"], "GA4 connected")


class SeriesTests(unittest.TestCase):
    def test_range_mode_series_leaks_shape_only(self):
        pts = [{"d": f"2026-10-0{i+1}", "v": v} for i, v in enumerate([1000, 2000, 1500, None, 3000])]
        s = core.public_series("range", pts)
        values = [p["v"] for p in s["points"]]
        self.assertEqual(values, [0.0, 50.0, 25.0, None, 100.0])
        self.assertIsNone(core.public_series("hidden", pts))
        exact = core.public_series("exact", pts)
        self.assertEqual(exact["points"][0]["v"], 1000)

    def test_flat_series_and_all_none(self):
        self.assertEqual(core.shape_only([5, 5, 5]), [50.0, 50.0, 50.0])
        self.assertIsNone(core.public_series("exact", [{"d": "2026-10-01", "v": None}]))

    def test_downsample(self):
        vals = list(range(90))
        out = core.downsample(vals, 30)
        self.assertEqual(len(out), 30)
        self.assertAlmostEqual(out[0], 1.0)

    def test_windows_and_sums(self):
        w = core.window(7, date(2026, 10, 26))
        self.assertEqual(w["cur_start"], date(2026, 10, 20))
        self.assertEqual(w["prev_end"], date(2026, 10, 19))
        self.assertEqual(w["prev_start"], date(2026, 10, 13))
        rows = {date(2026, 10, 20): 5, date(2026, 10, 21): 7}
        self.assertEqual(core.sum_days(rows, w["cur_start"], w["cur_end"]), 12)
        self.assertIsNone(core.sum_days(rows, w["prev_start"], w["prev_end"]))
        self.assertEqual(core.parse_day("20261026"), date(2026, 10, 26))
        self.assertEqual(core.parse_day("2026-10-26"), date(2026, 10, 26))
        self.assertIsNone(core.parse_day("nope"))


AUDIENCE = {
    "countries": [{"name": "United States", "iso2": "US", "share": 60.0}],
    "channels": [{"name": "Organic Search", "share": 55.5}],
    "devices": [{"name": "mobile", "share": 70.0}],
    "top_pages": [{"path": "/secret-launch", "views": 4321, "share": 12.0}],
    "top_queries": [{"query": "my secret keyword", "clicks": 321, "impressions": 9876}],
    "topics": [{"label": "Secret topic", "share": 100, "evidence": ["my secret keyword"]}],
}


class BreakdownTests(unittest.TestCase):
    def test_everything_off_by_default(self):
        out = core.public_breakdowns(AUDIENCE, core.normalize_privacy({}))
        self.assertEqual(out, {})
        self.assertEqual(core.public_topics(AUDIENCE, core.normalize_privacy({})), [])

    def test_sections_follow_toggles_and_counts_follow_metrics(self):
        p = core.normalize_privacy({"sections": {"pages": True, "queries": True, "countries": True}})
        out = core.public_breakdowns(AUDIENCE, p)
        self.assertEqual(set(out), {"countries", "pages", "queries"})
        # pageviews / impressions hidden -> no absolute counts; clicks exact -> shown
        self.assertNotIn("views", out["pages"][0])
        self.assertEqual(out["queries"][0], {"query": "my secret keyword", "clicks": 321})
        p2 = core.normalize_privacy({"sections": {"pages": True, "queries": True},
                                     "metrics": {"pageviews": "exact", "clicks": "range", "impressions": "exact"}})
        out2 = core.public_breakdowns(AUDIENCE, p2)
        self.assertEqual(out2["pages"][0]["views"], 4321)
        self.assertNotIn("clicks", out2["queries"][0])
        self.assertEqual(out2["queries"][0]["impressions"], 9876)

    def test_topics_follow_query_or_page_toggle(self):
        p = core.normalize_privacy({"sections": {"queries": True}})
        self.assertEqual(core.public_topics(AUDIENCE, p), ["Secret topic"])

    def test_nothing_hidden_appears_in_the_serialised_payload(self):
        payload = json.dumps(core.public_breakdowns(AUDIENCE, core.normalize_privacy({"sections": {"countries": True}})))
        for needle in ("secret-launch", "secret keyword", "4321", "9876", "Organic Search"):
            self.assertNotIn(needle, payload)


class LegacyFieldsTests(unittest.TestCase):
    def test_legacy_numbers_follow_privacy(self):
        p = core.normalize_privacy({"metrics": {"visitors": "range", "pageviews": "hidden", "engagement": "hidden"}})
        out = core.legacy_public_fields(entry(), p)
        self.assertIsNone(out["monthly_visitors"])
        self.assertEqual(out["monthly_visitors_label"], "10K–50K")
        self.assertIsNone(out["monthly_pageviews"])
        self.assertIsNone(out["engagement_rate"])
        self.assertNotIn("12345", json.dumps(out))
        exact = core.legacy_public_fields(entry(), core.normalize_privacy({}))
        self.assertEqual(exact["monthly_visitors"], 12345)
        self.assertIsNone(exact["monthly_pageviews"])


if __name__ == "__main__":
    unittest.main()
