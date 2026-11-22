# Calendar v3 — reminder rules (REMINDER_POLICY_V3) and known limitation

> **Calendar v3 เป็นระบบ In-app Reminder แบบ On-open ไม่สามารถแจ้งเตือนขณะปิดเว็บ และจำกัด Catch-up สูงสุด 1 ครั้งต่อ Occurrence**
> (Calendar v3 is an in-app, on-open reminder system: it cannot notify while the site is closed, and catch-up is limited to 1 per occurrence.)

There is no background timer, no polling and no push notification. A check runs when the page is opened and when the user changes a follow / reminder choice.

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
