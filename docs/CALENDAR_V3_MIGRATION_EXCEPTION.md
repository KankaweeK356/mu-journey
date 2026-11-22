# Calendar v3 — browser-state migration v1 -> v2: recorded exception

**What migrates:** real network-event follows (with their reminder choice, days -> minutes) and the local user id.
**What is not migrated:** (1) follows of synthetic events, (2) follows already marked UNFOLLOWED, (3) stored v1 notifications.

**Why no real data is lost (checked against the code that was actually deployed, commit `a9950f6`, Vercel production `8um3k24br`):**
- The persisted (localStorage) store was the *real* store, `demo:false`, with policy `INFO_ONLY`. Nothing in the deployed Tab 1 ever set the hidden demo clock on or changed the policy
  (the clock UI existed only in commit `02ba3a0`, which was never deployed; `a4e8eda` removed it).
- Under `INFO_ONLY` a real event whose schedule is unverified cannot notify, and a synthetic event cannot notify outside the in-memory demo store.
- Replaying that deployed `notify.js` / `calendar.js` for 14 months (1 Nov 2026 - 30 Dec 2027, 425 daily checks x reminder 1/7/14 days x 5 event kinds:
  typed date, verified rule, no computable date, weekly rule, synthetic) produced **0 notifications** in the real store.
- Therefore no persisted v1 notification can exist in a user's browser; the ones dropped are none. Synthetic follows that are dropped were never able to alert.

**Decision:** recorded as a Migration Exception; no archive is built. Migration is idempotent (tested) and never recreates an alert.
