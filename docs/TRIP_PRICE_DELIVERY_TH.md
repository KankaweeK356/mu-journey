# ส่งมอบ: ราคาและรอบเดินทางบน MU Journey Demo

สถานะ: ทำและทดสอบในเครื่องแล้ว (2026-11-25) **ยังไม่ Push / Deploy**
ขอบเขต: ชั้นแสดงผลเท่านั้น ไม่มีระบบจองหรือชำระเงิน

## Acceptance Criteria

| ข้อ | ผล | หลักฐาน |
|---|---|---|
| AC01 ราคาถูกต้อง 3 ทริป | PASS: 899 / 1,099 / 999 บาท | `price_bell.mjs` จอคอมและมือถือ, `tests/test_trip_products.py` |
| AC02 รอบเสาร์–อาทิตย์ตาม Master Data | PASS: 8 วันต่อทริป (5–27 ธ.ค. 2569) รวม 24 รอบ | เทสต์ข้อมูลและเบราว์เซอร์ |
| AC03 เลือกวันเดินทางได้ | PASS: เลือกที่ขั้น 06 แสดงต่อที่ขั้น 07 | เบราว์เซอร์ |
| AC04 ความจุสูงสุด 10 คน | PASS | เบราว์เซอร์ |
| AC05 ผลแนะนำและ Trip Matching ตรงกับ `a04c459` | PASS: 342 โปรไฟล์ ต่าง 0 (Top 5, คะแนน, ทริป ทั้งชั้นโมเดลและ Service) | `scripts/regression_snapshot.py` รันบน `a04c459` เทียบกับโค้ดปัจจุบัน |
| AC06 กรณีไม่มีทริปเหมือนเดิม | PASS: ไม่แสดงราคาหรือรอบ | เบราว์เซอร์ |
| AC07 จอคอมและมือถือ (375px) | PASS: ไม่มีแถบเลื่อนแนวนอน ใช้ Design System เดิม | เบราว์เซอร์ (Edge จำลองมือถือ ไม่ใช่เครื่องจริง) |
| AC08 ไม่ส่งข้อมูลจองหรือ Feedback ทดสอบลง Sheet | PASS: บล็อกคำขอในหน้าทดสอบ และไม่มีคำขอออกจากเบราว์เซอร์ | เบราว์เซอร์ |

ข้อกำหนดอื่น: รอบถัดไปแสดงชัด · เวลาเริ่ม–สิ้นสุด · จุดนัดพบ BTS สยาม · ปุ่มแสดงความสนใจเดิม · ป้าย "ราคาและรอบเดินทางเป็นข้อมูลจำลอง ยังไม่เปิดรับจองจริง" · ไม่มีรอบในอนาคตจะแจ้งผู้ใช้และไม่สร้างวันเอง

## ข้อมูลและการเชื่อม

- `public/data/trip_products.json` สำเนาจาก `Trip_Catalog` และ `Trip_Schedule` เชื่อมกับผลจับคู่ด้วย `trip_id`
- ไม่นำแท็บต้นทุน ไฟล์ Excel หรือลิงก์ของไฟล์ขึ้น repo หรือเว็บ
- ราคาและวันที่ไม่เข้าการคำนวณคะแนน โมเดล Dataset V2 เส้นทาง และลำดับจุดแวะไม่เปลี่ยน

## ค่าที่ Dev เลือกเอง (รอเจ้าของงานยืนยัน)

1. วันที่ลูกค้าเลือก **ไม่ถูกส่งหรือบันทึก** เพราะไม่แก้โครงสร้าง Google Sheet
2. รอบของ **วันนี้** ยังแสดง (ยังไม่ผ่านวันเดินทาง) แม้เลยเวลา 09:00
3. ไม่แสดงรายการที่รวมในราคา
4. หน้าเดิม "ประมาณ … นาที · จบ ~13:01" บนการ์ดทริปเปลี่ยนเป็นเวลาให้บริการ 09:00–13:15 พร้อมบอกเวลาเผื่อ · Tab 2 (Trip Designer) ยังแสดงเวลาตามแบบจำลองเหมือนเดิม

## ข้อควรระวัง

- ตารางมีรอบถึง **27 ธ.ค. 2569** และไม่มี 28–29 พ.ย. หลังรอบสุดท้ายต้องเพิ่มข้อมูลใน JSON
- ตารางสมมติให้เปิดพร้อมกันทุกทริป ซึ่งเรื่องกำลังคนเป็นการตัดสินใจทางธุรกิจ

## Screenshot

โฟลเดอร์ [`screenshots/2026-11-25/`](screenshots/2026-11-25/) (ถ่ายโดยตรึงนาฬิกาในหน้าทดสอบ)

| หน้าจอ | จอคอม | มือถือ |
|---|---|---|
| ขั้น 06 Love | [ดู](screenshots/2026-11-25/desktop_step06_TRIP_LOVE.png) | [ดู](screenshots/2026-11-25/mobile_step06_TRIP_LOVE.png) |
| ขั้น 06 Career | [ดู](screenshots/2026-11-25/desktop_step06_TRIP_CAREER.png) | [ดู](screenshots/2026-11-25/mobile_step06_TRIP_CAREER.png) |
| ขั้น 06 Wealth | [ดู](screenshots/2026-11-25/desktop_step06_TRIP_WEALTH.png) | [ดู](screenshots/2026-11-25/mobile_step06_TRIP_WEALTH.png) |
| ขั้น 07 (Love) | [ดู](screenshots/2026-11-25/desktop_step07_TRIP_LOVE.png) | [ดู](screenshots/2026-11-25/mobile_step07_TRIP_LOVE.png) |
| ไม่มีทริป | [ดู](screenshots/2026-11-25/desktop_step06_no_trip.png) | [ดู](screenshots/2026-11-25/mobile_step06_no_trip.png) |
| ไม่มีรอบในอนาคต | [ดู](screenshots/2026-11-25/desktop_step06_no_round.png) | [ดู](screenshots/2026-11-25/mobile_step06_no_round.png) |
| กระดิ่ง Tab 1 | [ดู](screenshots/2026-11-25/desktop_bell.png) | [ดู](screenshots/2026-11-25/mobile_bell.png) |
| Tab 2 ส่วน I | [ดู](screenshots/2026-11-25/desktop_tab2_proactive.png) | [ดู](screenshots/2026-11-25/mobile_tab2_proactive.png) |

## ผลทดสอบหลังแก้ (ในเครื่อง)

| ชุด | คำสั่ง | ผล |
|---|---|---|
| Python (รวม Regression 342 โปรไฟล์) | `python -m unittest discover -s tests` | PASS 182/182 |
| Node | `node --test tests/js/*.test.mjs` | PASS 77/77 |
| E2E ขั้น 04 | `step04_journey.mjs` | PASS 46/46 |
| E2E รอบ 3 | `round3_journey.mjs <URL> all` | PASS 57/57 |
| Trip Matching เข้มงวด | `matching_strict.mjs <URL>` | PASS 71/71 |
| E2E ทุกหน้า | `final_round.mjs <URL> full` | PASS 197/197 |
| E2E ราคาและกระดิ่ง | `price_bell.mjs <URL>` | PASS 56/56 |
| คำนวณซ้ำ Network / Birthday | `--check` | PASS |
