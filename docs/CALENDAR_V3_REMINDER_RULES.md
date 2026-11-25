# Calendar v3 — reminder rules (REMINDER_POLICY_V3) and known limitation

> **Calendar v3 เป็นระบบ In-app Reminder แบบ On-open ไม่สามารถแจ้งเตือนขณะปิดเว็บ และจำกัด Catch-up สูงสุด 1 ครั้งต่อ Occurrence**
> (Calendar v3 is an in-app, on-open reminder system: it cannot notify while the site is closed, and catch-up is limited to 1 per occurrence.)

There is no background timer, no polling and no push notification.

## Tab 1 ตั้งแต่ 2026-11-25: กระดิ่งเชิงรุก (แทนการกดติดตามและติ๊กช่วงเตือน)

| เรื่อง | กติกา |
|---|---|
| สิ่งที่กระดิ่งแสดง | **รายการที่เกี่ยวข้อง** ไม่ใช่การรับประกันการเตือน: วันสำคัญตามปฏิทิน กิจกรรมจากเครือข่ายตามความสนใจ (ผ่านข้อจำกัดแล้ว) และรายการที่ผู้ใช้บันทึกไว้ |
| เมื่อไร | หลังเลือกความสนใจและไปถึงขั้น 04 (รายการที่บันทึกไว้แสดงได้ตั้งแต่เปิดเว็บ) |
| จำกัด | ภายใน 90 วัน ไม่เกิน 5 รายการ (บันทึกไว้ → วันสำคัญ → กิจกรรม) ไม่ซ้ำ |
| ตัวเลข | นับรายการที่ยังไม่ได้เปิดดู เปิดกระดิ่งแล้วหาย วันสำคัญนับใหม่เมื่อเหลือ 7 วันและ 1 วัน (ป้าย "ใกล้ถึง") |
| กิจกรรมจริง | ติดป้าย "กำหนดการยังไม่ยืนยัน" **ไม่มีวันเตือนล่วงหน้า** (ยังคงตามการตัดสินของผู้เชี่ยวชาญทาง ก) |
| ข้อมูลจำลอง | คอนเสิร์ตและวันสอบไม่ขึ้นใน Tab 1 |
| การเก็บข้อมูล | เก็บเฉพาะรายการที่กด "บันทึกไว้" ในเบราว์เซอร์ สถานะอ่าน/ปิดรายการอยู่ในหน่วยความจำของหน้า |
| ถอดออก | ช่องติ๊กช่วงเตือน ปุ่มติดตาม แถบเตือนล่างจอ และการสร้างบันทึกแจ้งเตือนใน Tab 1 |

**การเปลี่ยนจากกติกาเดิม (ต้องให้ผู้ตรวจรับทราบ):** การ์ดกิจกรรมเดิมกำหนดว่าไม่แตะตัวเลขกระดิ่ง ตอนนี้กระดิ่งนับกิจกรรมที่เกี่ยวข้องด้วย (ตัวการ์ดเองยังไม่สร้างอะไร)
กติกา `REMINDER_POLICY_V3` ข้างล่างยังใช้กับ **การจำลองใน Tab 2 ส่วน I** และชุดตรวจใน Model Evaluation โดยไม่เปลี่ยน
ส่วน I มีมุมมองย่อ: ระบบเสนอรายการจากความสนใจ → ผู้ใช้กด "ให้เตือนฉัน" → เห็นกำหนดวันเตือนที่เอนจินจริงคำนวณ

## Final catch-up rule (expert decision "Catch-up Final Rule")
1. Every notification found **after the due time and before expiry** is a *catch-up*, whatever the reason (reminder switched on late, or the site was closed at the due time).
2. At most **one catch-up per user + occurrence**. Other overdue offsets of that occurrence become `SUPERSEDED_BY_CATCHUP` and never come back.
3. A check that lands **exactly on the due time** is a *scheduled* reminder (`CREATED`); it notifies normally, even after an earlier catch-up.
4. Catch-up history and delivery history (`catchups`, `sent`) survive unfollow / follow and are cleared by "ล้างข้อมูลของฉัน".
5. Offsets that are still in the future are unaffected until their own due time.

**Consequence accepted by the expert:** because checks happen only on open / on change, a real user will usually receive a catch-up, so usually **one** reminder per occurrence.
Exact-on-time delivery is realistic only in the Tab 2 simulation (virtual clock).

## Business Rule Changes (not regressions)
| Before | Now |
|---|---|
| Following / enabling after the due time: no alert ("no retro") | One catch-up while still useful (REMINDER_POLICY_V3) |
| An offset that became due while the app was closed still notified normally after a catch-up | It is a catch-up too; blocked if the occurrence already used its catch-up |
| Unfollow removed the memory of sent alerts | Delivery history survives unfollow / follow |

Tests changed accordingly: `tests/js/reminder.test.mjs` (the old "catch-up 5" is replaced by the three expert cases + final-rule tests).
The 60 fixtures of `GD_REMINDER_TEST_CASES` are unchanged and still pass 60/60 (each offset is evaluated on its own, so they do not depend on the catch-up ledger).
