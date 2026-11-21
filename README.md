# MU Journey — Phase 1 demo (MADT7202 Network Analysis)

เว็บสาธิตระบบแนะนำสถานที่สายมูด้วย Network Analysis (Personalized PageRank บน Knowledge Graph) และจับคู่ทริปบริษัทแบบคงที่ 1 จาก 3 ทริป

เว็บมี 2 Main Tabs ใช้ Header, Design System, Backend, Dataset และ Model Version เดียวกัน

- **Tab 1 Demo ผู้ใช้ (7 ขั้น):** 01 วันเกิด (พ.ศ./ค.ศ., ไม่บังคับ) → 02 เลือกความสนใจ 1–3 จาก 10 หมวด → 03 สิ่งที่ไม่ต้องการ (กลุ่มความเชื่อ/สิ่งศักดิ์สิทธิ์/สถานที่) → 04 เลือกโฟกัส + Preview จากเครือข่าย → 05 สถานที่ ≤5 แห่งพร้อมเส้นทาง Wish→Deity→Place → 06 ทริปบริษัท 1 จาก 3 (หรือ `NO_ELIGIBLE_SIGNATURE_TRIP`) → 07 ไปเอง/ทริป/ฝากมู (Demo) + feedback
- **Tab 2 Network Analytics (5 หัวข้อ):** 01 Network Explorer · 02 MU Recommendation Lab (Step A–F, ปุ่ม "ใช้โปรไฟล์จาก Demo ผู้ใช้", ตรวจสอดคล้องกับ Tab 1) · 03 Signature Trip Designer (Offline) · 04 Trip Matching · 05 Model Evaluation (รวม Cross-tab Acceptance Test Case A/B/C)

`focus_wish_id` (ขั้น 04) เป็น UI presentation state เท่านั้น ไม่ถูกส่งเข้าโมเดล ไม่เปลี่ยน PPR seeds, Top 5 หรือการจับคู่ทริป

> ระบบสาธิตเชิงวิเคราะห์ ไม่ใช่บริการจริง: ความเชื่อคือ claim จากแหล่งอ้างอิง ไม่ใช่การรับรอง · ทริป ราคา และฝากมูเป็นข้อมูลจำลอง · ไม่มีการจองหรือชำระเงิน

## โครงสร้าง

```
model/    โมเดลต้นฉบับ (network_phase1.py ไม่แก้) + snapshot จาก Drive Baseline v2 + ทริปที่ล็อกไว้ + ผลบันทึก
api/      Vercel Python Functions: catalog, recommendations, place, trip, trace, offers, feedback
public/   หน้าเว็บ (HTML/CSS/JS ล้วน ไม่มี build step) + data/ (graph.json, results.json, trips_design.json)
scripts/  dev_server.py (รันในเครื่อง), build_public_data.py (สร้าง graph.json จากโมเดล)
tests/    ทดสอบว่าผล API ตรงกับผลที่โมเดลบันทึกไว้ + กฎความปลอดภัย
docs/     ขั้นตอนตั้งค่า feedback → Google Sheet (Apps Script)
```

แนวคิดสำคัญ: **Google Sheets เป็นที่แก้ข้อมูล แต่โมเดลรันจาก snapshot JSON** (`model/input_drive_v2_snapshot.json`) เพื่อให้ผลซ้ำได้และตรงกับ Python Reference โดยไม่เรียก Sheets ทุก request

## API

ชื่อ endpoint ที่ Tab 1 ใช้คือ `/api/mumu/*` (`catalog`, `recommendations`, `places/:id`, `trips/:id`, `proxy-offers`, `demo-feedback`) ซึ่งเป็น alias ของ endpoint ด้านล่าง (ดู `rewrites` ใน `vercel.json`) ทุก response มี `versions` (model, dataset, snapshot hash, trip design) และ Tab 2 ใช้ `/api/trace` ซึ่งเรียกโมเดลตัวเดียวกัน

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/catalog` | 10 เรื่องที่ขอ, สิ่งศักดิ์สิทธิ์, กลุ่มความเชื่อ, สถานที่, ทริป |
| POST | `/api/recommendations` | `wish_ids`, `birthdate`, `exclusions{tradition_groups,deity_ids,place_ids}` → Top≤5 + ทริปที่เหมาะที่สุด/`NO_ELIGIBLE_SIGNATURE_TRIP` |
| GET | `/api/places/:id` | รายละเอียดสถานที่และข้อมูลวิธีมู (พร้อมแหล่งอ้างอิง) |
| GET | `/api/trips/:id` | ทริปคงที่ จุดแวะ ลำดับ ข้อจำกัด |
| POST | `/api/trace` | ค่ากลางทุกขั้นของการคำนวณ (ใช้ในแท็บ ลองถาม) |
| POST | `/api/offers` | รายการฝากมูจำลอง |
| POST | `/api/feedback` | บันทึก feedback ลง Google Sheet ผ่าน Apps Script (ถ้าตั้งค่าไว้) |

วันเกิดใช้ในหน่วยความจำเท่านั้น ไม่บันทึกและไม่ส่งออกใน response

## รันในเครื่อง

```powershell
pip install -r requirements.txt
python scripts/dev_server.py        # http://localhost:3000
python -m unittest discover -s tests -v
```

ทดสอบ 10 ข้อ: ผลของ 15 โปรไฟล์ตรงกับ `model/results/network_phase1_results.json`, trace ตรงกับโมเดลบน 75 โปรไฟล์, ไม่ละเมิด exclusion, ทริปเป็น 1 ใน 3 ที่ล็อกไว้หรือ abstain, input ผิดถูกปฏิเสธ, วันเกิดไม่รั่ว

## Deploy บน Vercel

1. Push repo ขึ้น GitHub แล้ว Import เข้า Vercel (Framework: Other — `vercel.json` ตั้งค่าไว้แล้ว)
2. (ไม่บังคับ) ตั้ง Environment Variables เพื่อให้ feedback เขียนลง Sheet: `FEEDBACK_WEBHOOK_URL`, `FEEDBACK_TOKEN` (ดู `docs/feedback_apps_script.gs`) — ถ้าไม่ตั้ง ระบบรันโหมดสาธิตและไม่บันทึก

## อัปเดตข้อมูลจาก Google Sheets

Drive Baseline v2 → export snapshot ใหม่ทับ `model/input_drive_v2_snapshot.json` → `python scripts/build_public_data.py` → รันเทสต์ ถ้าผลที่บันทึกไว้เปลี่ยนต้องรัน `python model/network_phase1.py` เพื่อสร้าง `model/results/` ใหม่ และคัดลอกไป `public/data/results.json`
`model/ritual_claims.json` ส่งออกจากแท็บ `CL_RITUAL_CLAIMS` ของไฟล์ 01 เมื่อ 2026-11-21

## ข้อจำกัดที่ต้องบอกเสมอ

- label ที่ใช้ทดสอบมาจากกราฟเดียวกัน ไม่ใช่ความแม่นยำกับผู้ใช้จริง; PPR แพ้ Degree ใน edge holdout (66.67% เทียบ 81.25%)
- ไม่มีพิกัดสถานที่จริง (ใช้พิกัดสถานีเท่านั้น) เวลาเปิดบางแห่งเป็นข้อมูลจำลอง
- ก่อนเผยแพร่เชิงพาณิชย์ต้องตรวจสิทธิ์/ToS ของแหล่งข้อมูล, ราคา ที่นั่ง สิทธิ์จากสถานที่ และความยินยอมตาม PDPA
