"""Tab 1 step 04 + temporary activity mode + friend-feedback UX (static guards; the behaviour itself is proven in tests/e2e/step04_journey.mjs).
python -m unittest discover -s tests -v"""
import re
import unittest
from pathlib import Path

JS = Path(__file__).resolve().parent.parent / "public" / "js"
DEMO = (JS / "demo.js").read_text(encoding="utf-8")
UI = (JS / "notifyui.js").read_text(encoding="utf-8")


def block(src, start, end):
    a = src.index(start)
    return src[a:src.index(end, a)]


STEP4 = block(DEMO, "function step4()", "function eventsBlock")
CONTINUE = block(DEMO, "continueWith:", "mountChrome();")
MAIN_CARDS = DEMO[DEMO.index("function step5()"):DEMO.index("function startNewRound")]
MODAL = DEMO[DEMO.index("function openPlace"):] if "function openPlace" in DEMO else ""


class Step04Layout(unittest.TestCase):
    def test_no_dropdown(self):
        self.assertNotIn("'select'", STEP4)
        self.assertNotIn("topicSelect", STEP4)
        self.assertNotIn("optgroup", STEP4)

    def test_new_wording(self):
        for text in ("สำรวจความเชื่อมโยงของเรื่องที่คุณสนใจ",
                     "เลือกการ์ดเพื่อดูคำแนะนำเบื้องต้นแต่ละเรื่อง โดยสถานที่ Top 5 ในขั้นตอนถัดไปจะพิจารณาจากทุกเรื่องที่คุณเลือกไว้",
                     "เปลี่ยนความสนใจ", "ดูทุกเรื่อง"):
            self.assertIn(text, STEP4, text)

    def test_see_all_card_only_for_more_than_one_interest(self):
        self.assertRegex(STEP4, r"S\.wishes\.length > 1\)\s*cards\.unshift")

    def test_cards_never_recompute(self):
        # the only handler on the cards is setFocus: it sets presentation state and redraws
        self.assertIn("const setFocus = (v) => { S.focus = v; draw(); };", STEP4)
        for forbidden in ("invalidate(", "ensureResult(", "S.topic =", "S.wishes ="):
            self.assertNotIn(forbidden, block(STEP4, "const setFocus", "const list"), forbidden)
            self.assertNotIn(forbidden, STEP4.replace("S.focus = mode ? 'ALL'", ""), forbidden)


class SeeAllPreview(unittest.TestCase):
    def test_see_all_shows_one_place_per_interest_from_the_computed_top5(self):
        self.assertIn("const many = focus === 'ALL' && activeWishes().length > 1;", STEP4)
        self.assertIn("R.top5.find((x) => x.matched_wish_ids.includes(w))", STEP4)
        self.assertIn("data-missing-wishes", STEP4)                           # an interest with no place in the Top 5 is named, not hidden
        self.assertNotIn("ensureResult(", STEP4)


class ActivityMode(unittest.TestCase):
    def test_continue_with_never_writes_step02_interests(self):
        self.assertNotIn("S.wishes =", CONTINUE)
        self.assertNotIn("S.wishes.push", CONTINUE)
        self.assertIn("S.topic =", CONTINUE)

    def test_banner_on_steps_04_to_07_and_restore_button(self):
        self.assertEqual(len(re.findall(r"modeBanner\(\)", DEMO)), 4)         # one call in each of steps 4, 5, 6, 7
        self.assertIn("กำลังดูคำแนะนำตามกิจกรรม:", DEMO)
        self.assertIn("กลับไปความสนใจเดิม", DEMO)
        self.assertIn("ไม่ใช่จากความสนใจที่คุณเลือกไว้ในขั้น 02", DEMO)

    def test_restore_clears_mode_and_goes_to_step02_without_interests(self):
        fn = block(DEMO, "function backToInterests()", "const modeBanner")
        for part in ("S.topic = null", "S.eventContext = null", "invalidate()", "go(2)"):
            self.assertIn(part, fn, part)
        self.assertNotIn("S.wishes =", fn)

    def test_step02_change_leaves_the_mode(self):
        self.assertIn("S.topic = null; S.eventContext = null; invalidate(); paint();", DEMO)

    def test_offers_follow_the_active_topic(self):
        self.assertIn("activeWishes())", block(DEMO, "API.offers(", ".then"))


class FriendFeedback(unittest.TestCase):
    def test_no_technical_chips_on_main_cards(self):
        main = MAIN_CARDS.split("function openFeedback")[0].split("function openPlace")[0]
        self.assertNotIn("statusChip(", main)

    def test_chips_remain_in_the_detail_modal(self):
        self.assertIn("statusChip(P.hours.status", DEMO)
        self.assertIn("statusChip(e.place_link_status", DEMO)

    # Superseded 2026-11-25 (proactive bell): the user no longer follows items or ticks reminder offsets in Tab 1.
    def test_no_offset_checkboxes_follow_button_or_bottom_bar_in_tab1(self):
        fixed = (JS / "fixedcal.js").read_text(encoding="utf-8")
        for src in (UI, fixed, DEMO):
            for gone in ("offsetControls", "'＋ ติดตาม'", "nbar", "เตือนล่วงหน้า:"):
                self.assertNotIn(gone, src, gone)
        self.assertNotIn("type: 'checkbox'", UI)
        self.assertNotIn("runCheck(", UI)                      # Tab 1 creates no reminder records and pushes nothing
        self.assertNotIn("setOffsets(", UI + fixed + DEMO)

    def test_saving_is_the_only_stored_action(self):
        for text in ("'＋ บันทึกไว้'", "'✓ บันทึกไว้แล้ว'", "'เลิกบันทึก'", "ไม่มีวันเตือนล่วงหน้า เพราะกำหนดการยังไม่ยืนยันกับผู้จัด"):
            self.assertIn(text, UI)
        self.assertIn("saveButton(parentFromFixed(day))", (JS / "fixedcal.js").read_text(encoding="utf-8"))

    def test_bell_lists_real_data_only_and_keeps_the_unconfirmed_label(self):
        inbox = (JS / "inbox.js").read_text(encoding="utf-8")
        for banned in ("calendar_demo", "simulation_events", "localStorage", "fetch(", "notify.js"):
            self.assertNotIn(banned, inbox, banned)
        self.assertIn("กิจกรรมที่อาจเกี่ยวข้อง (${UNCONFIRMED})", UI)
        self.assertIn("if (child.synthetic) continue" if False else "child.synthetic) continue", inbox)


if __name__ == "__main__":
    unittest.main(verbosity=2)
