# MUMU — MU Journey (MADT7202 Network Analysis)

ระบบสาธิตแนะนำ **สถานที่สายมูและทริป** ด้วย Network Analysis: Personalized PageRank บน Knowledge Graph 3 ชั้น (เรื่องที่ขอ → สิ่งศักดิ์สิทธิ์ → สถานที่) พร้อมจับคู่ทริปบริษัทแบบคงที่ 1 จาก 3 เส้นทาง และชั้นกิจกรรม/ปฏิทินที่ใช้เครือข่ายเดียวกัน

- **เว็บจริง:** https://mu-journey-newja.vercel.app
- **Repo:** https://github.com/KankaweeK356/mu-journey
- **รายงาน:** [`docs/REPORT_TH_Network_Phase1.md`](docs/REPORT_TH_Network_Phase1.md) · **ภาคผนวกสถิติ:** [`docs/RIGOR_ADDENDUM_TH.md`](docs/RIGOR_ADDENDUM_TH.md) · **เตรียม Defend:** [`docs/DEFEND_QA_TH.md`](docs/DEFEND_QA_TH.md) · **แหล่งข้อมูล:** [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)
- **Network Analysis:** [Graph Design](docs/GRAPH_DESIGN_TH.md) · [วิธีคำนวณและผล](docs/NETWORK_ANALYSIS_METHOD_TH.md) · [ผลกระทบของวันเกิด 7 วัน](docs/BIRTHDAY_IMPACT_ANALYSIS_TH.md) · **ส่งมอบรอบ Final:** [`docs/DEV_FINAL_HANDOFF_TH.md`](docs/DEV_FINAL_HANDOFF_TH.md)

> ระบบสาธิตเชิงวิเคราะห์ ไม่ใช่บริการจริง: ความเชื่อคือ claim จากแหล่งอ้างอิง ไม่ใช่การรับรองความศักดิ์สิทธิ์ · ทริป ราคา ฝากมู คอนเสิร์ต และรอบสอบเป็นข้อมูลจำลอง · ไม่มีการจองหรือชำระเงิน

## ทำอะไรได้
เว็บมี 2 Main Tabs ใช้เอนจิน ข้อมูล และเวอร์ชันโมเดลเดียวกัน

**Tab 1 · Demo ผู้ใช้ (7 ขั้น)**

| ขั้น | ทำอะไร |
|---|---|
| 01 เริ่มต้น | วันเกิด (ไม่บังคับ) |
| 02 ความสนใจ | เลือก 1–3 จาก 10 เรื่อง |
| 03 ข้อจำกัด | กลุ่มความเชื่อ สิ่งศักดิ์สิทธิ์ และสถานที่ที่ไม่ต้องการ |
| 04 เรื่องที่แนะนำ | ตัวอย่างเส้นทาง เรื่อง→เทพ→สถานที่ ผลของวันเกิด การ์ดกิจกรรม และวันสำคัญ (วาเลนไทน์) พร้อมวันที่แจ้งเตือน |
| 05 สถานที่ | สูงสุด 5 แห่งพร้อมเส้นทาง รายละเอียดสถานที่ สถานี BTS/MRT และคำอธิบายสถานะข้อมูล |
| 06 ทริป | ทริปบริษัท 1 จาก 3 พร้อมช่วงรถไฟฟ้า เวลาเดินทาง และเวลาเข้าถึงสถานที่แยกกัน · ถ้าไม่มีทริปที่ตรง บอกเหตุผล แล้วพาไปบริการอื่นหรือกลับไปแก้ความสนใจ/ข้อจำกัด |
| 07 บริการ | ไปมูเอง / ทริปบริษัท (กดได้เมื่อมีทริปที่ตรง) / ฝากมู (Demo) + ปฏิทินมูของฉัน + feedback |

**Tab 2 · Network Analytics (5 หัวข้อ)**

| หัวข้อ | ทำอะไร |
|---|---|
| 01 Network Explorer | กราฟและตัวกรอง, Degree แยกตามประเภทโหนด, ส่วนประกอบและความคงที่ของ Community, เทียบกราฟสุ่ม |
| 02 MU Recommendation Lab | คำนวณ PPR ทีละขั้น, สถานะ `birth_signal` และ Seed ก่อน/หลัง Normalize, Event Trace, Calendar v3 Simulation |
| 03 Signature Trip Designer | วิธีออกแบบ 3 ทริปคงที่ล่วงหน้า |
| 04 Trip Matching | คะแนนและเหตุผลของการเลือกทริป |
| 05 Model Evaluation | ผลทดสอบพร้อมข้อจำกัด |

หลักการสำคัญ:
- ข้อจำกัดของผู้ใช้เป็น **hard exclusion** ตัดเส้นออกจากกราฟก่อนคำนวณ ไม่ใช่ซ่อนผลทีหลัง
- ระบบไม่เติมผลให้ครบ ถ้าไม่มีเส้นทางที่ผ่านเงื่อนไข จะตอบว่าไม่มี และไม่ฝืนเลือกทริปที่ไม่ผ่านเกณฑ์ (`NO_ELIGIBLE_SIGNATURE_TRIP`)
- ทุกคำแนะนำอธิบายด้วยเส้นทางจริงในกราฟ
- กิจกรรมสายมูใช้โมเดลเดิมไม่แก้สูตร (`EVENT_RANKING_V1`) วันสำคัญ/คอนเสิร์ต/สอบ **ไม่ผ่านเครือข่าย** (จับคู่ตรงจากเรื่องที่ขอ)
- แจ้งเตือนเป็นแบบ in-app เมื่อเปิดเว็บ ไม่เตือนขณะปิดเว็บ ([กติกา](docs/CALENDAR_V3_REMINDER_RULES.md))
- วันเกิดไม่ถูกบันทึก อยู่ในหน่วยความจำของหน้าเว็บและส่งไปคำนวณคำแนะนำเท่านั้น
- วันเกิดใช้เฉพาะ **วันในสัปดาห์** เป็นสัญญาณรอง (ไม่ใช้เดือนเกิด ราศี หรือปีนักษัตร) ระบบบอกสถานะ `birth_signal`: ไม่ได้ระบุ / ใช้ / ไม่มีข้อมูลที่ผ่านเกณฑ์ (พุธ อาทิตย์) / ถูกตัดด้วยข้อจำกัด

## ผลทดสอบและข้อจำกัด (ตัวเลขจริง)
| เรื่อง | ผล |
|---|---|
| Acceptance 75 โปรไฟล์จำลอง | ละเมิดข้อจำกัด 0 · เส้นทางอธิบายครบ · ไม่มีทริปที่เหมาะ 6 ราย |
| Fixtures 15 โปรไฟล์ (NDCG@5 คิดได้ 14) | PPR 0.7622 · Popularity 0.6880 · Direct 0.6831 — ผลต่าง PPR−Popularity +0.074 ช่วงความเชื่อมั่น 95% **[−0.010, +0.196]** ยังสรุปว่าดีกว่าไม่ได้ |
| Holdout เส้นเทพ–สถานที่ (ซ่อนทีละเส้น 28 เส้น) | PPR 78.6% เทียบ Degree 82.1% ต่างกันเส้นเดียว (p = 1.0) ไม่มีความต่างที่มีนัย |
| Coverage re-ranking | เลือก 3 เรื่อง เพิ่มความครอบคลุม 8/120 ชุด ไม่เคยลดลง |
| ชั้นกิจกรรม | เส้นทางใช้ได้จริง 1,040/1,040 · ละเมิด 0 · คะแนนเสมอกันมาก (อันดับ 1 เสมอใน 46/75 โปรไฟล์) |
| Community เทียบกราฟสุ่ม 1,000 ชุด | Modularity อยู่ที่ขอบเกณฑ์ (กราฟสุ่มได้ ≥ กราฟจริง 4.2% แบบ Greedy, 5.4% แบบ Louvain) ยังไม่อ้างว่ามีโครงสร้างกลุ่มที่มีนัยสำคัญ จึงใช้หมายเลข Community ไม่ตั้งชื่อ |
| ผลของวันเกิด (175 ชุดความสนใจ × 7 วัน, ไม่มีข้อจำกัด) | อันดับ Top 5 เปลี่ยน 423 จาก 875 กรณีที่มีสัญญาณ · พุธและอาทิตย์ไม่มีสัญญาณ · เป็นการวัดการเปลี่ยนแปลง ไม่ใช่ความแม่นยำ |

**ต้องบอกเสมอ:** ป้ายผลลัพธ์ที่ใช้ทดสอบมาจากกราฟเดียวกัน ไม่ใช่ความแม่นยำกับผู้ใช้จริง · เส้นเรื่อง–เทพทั้ง 48 เส้น UNVERIFIED · สถานที่ 16 จาก 52 แห่งไม่มีเส้นเชื่อม · ยังไม่ตรวจสิทธิ์/ToS ของแหล่งข้อมูลภายนอกอย่างเป็นทางการ · กิจกรรมจริง 37 รายการยังไม่ยืนยันกำหนดการกับผู้จัด จึงติดตามได้แต่ไม่เตือน

## โครงสร้าง repo
```
model/     โมเดลอ้างอิง (network_phase1.py ไม่แก้) + snapshot ข้อมูล + ทริปที่ล็อก + ผลบันทึก + ปฏิทินจันทรคติ (HKO) + Calendar v3
data/      ไฟล์ต้นทางจาก Google Drive Baseline v2 (5 ไฟล์ .xlsx) — ดู docs/DATA_SOURCES.md
api/       Vercel Python Functions: catalog, recommendations, place, trip, trace, offers, feedback
public/    หน้าเว็บ (HTML/CSS/JS ล้วน ไม่มี build step) + data/ (JSON ที่หน้าเว็บโหลด)
scripts/   dev_server.py, build_*.py (สร้างไฟล์ที่ได้มา), evaluate_rigor.py (ภาคผนวกสถิติ), network_analysis.py, birthday_impact.py
tests/     ทดสอบ Python + Node (รวมชุดทดสอบ Reminder 60 แถว)
docs/      รายงาน เอกสารเตรียม Defend กติกาแจ้งเตือน แหล่งข้อมูล และตั้งค่า feedback → Google Sheet
```
แนวคิด: **Google Sheets เป็นที่แก้ข้อมูล แต่โมเดลรันจาก snapshot JSON** (`model/input_drive_v2_snapshot.json`) เพื่อให้ผลซ้ำได้และตรงกับ Python Reference โดยไม่เรียก Sheets ทุก request

## รันในเครื่อง
```powershell
pip install -r requirements.txt
python scripts/dev_server.py          # http://localhost:3000
python -m unittest discover -s tests -v
node --test tests/js/*.test.mjs       # ต้องมี Node 20+
python scripts/network_analysis.py --check   # คำนวณผล Network Analysis ซ้ำแล้วเทียบ
python scripts/birthday_impact.py --check    # คำนวณผลกระทบวันเกิดซ้ำแล้วเทียบ
```
**Windows:** ให้ clone ด้วยคำสั่งข้างล่าง ถ้า Git แปลงบรรทัดเป็น CRLF แฮชของ snapshot จะเปลี่ยน และ `birthday_impact.py --check` จะรายงาน `DIFFERENT`
```powershell
git clone --config core.autocrlf=false --config core.eol=lf https://github.com/KankaweeK356/mu-journey
```

**ทดสอบในเบราว์เซอร์** (ต้องมี Node 22+ และ Microsoft Edge) เปิด `python scripts/dev_server.py` ค้างไว้ในอีกหน้าต่าง
```powershell
node tests/e2e/step04_journey.mjs
node tests/e2e/round3_journey.mjs http://localhost:3000 all
node tests/e2e/matching_strict.mjs http://localhost:3000
node tests/e2e/final_round.mjs http://localhost:3000 full
```
ตรวจเว็บจริงใช้เฉพาะ `matching_strict.mjs`, `round3_journey.mjs <URL> tab2` และ `final_round.mjs <URL> full` (บล็อกคำขอ feedback ในหน้าเว็บ) ห้ามใช้โหมดอื่นของ `round3_journey.mjs` กับเว็บจริง
ถ้าชุดทดสอบหยุดกลางทาง ให้ปิด Edge แบบ headless ที่ค้างอยู่แล้วรันใหม่

**ผลล่าสุด**

| ชุด | ในเครื่อง | เว็บจริง (`d519ad7`) |
|---|---|---|
| Python | 173/173 | — |
| Node | 69/69 | — |
| `step04_journey` | 46/46 | — |
| `round3_journey` | 57/57 (all) | 10/10 (tab2) |
| `matching_strict` | 71/71 | 71/71 |
| `final_round` (1366px และ 375px) | 199/199 | 199/199 |

ผ่านเทสต์แปลว่าโค้ดทำตามที่กำหนด ไม่ได้ยืนยันความถูกต้องของข้อมูลความเชื่อ และยังไม่ได้ตรวจบนมือถือเครื่องจริง
ทดสอบอัตโนมัติ: ผลของโปรไฟล์ตรงกับ `model/results/network_phase1_results.json`, trace ตรงกับโมเดลบน 75 โปรไฟล์, ไม่ละเมิดข้อจำกัด, Tab 1 กับ Tab 2 ตรงกัน, ข้อมูลสมมติไม่รั่วเข้า Tab 1, ชุดทดสอบ Reminder 60/60 (ไม่แก้ค่าที่คาด), ย้ายข้อมูลเบราว์เซอร์ v1→v2

## API
Tab 1 เรียก `/api/mumu/*` (alias ใน `vercel.json`) ทุก response มี `versions` (model, dataset, snapshot hash, trip design) Tab 2 ใช้ `/api/trace` ซึ่งเรียกโมเดลตัวเดียวกัน

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/catalog` | 10 เรื่องที่ขอ, สิ่งศักดิ์สิทธิ์, กลุ่มความเชื่อ, สถานที่, ทริป |
| POST | `/api/recommendations` | `wish_ids`, `birthdate`, `exclusions` → Top≤5 + ทริป + กิจกรรมจากเครือข่าย + `birth_signal` |
| GET | `/api/places/:id` | รายละเอียดสถานที่และข้อมูลวิธีมู (พร้อมแหล่งอ้างอิง) |
| GET | `/api/trips/:id` | ทริปคงที่ จุดแวะ ลำดับ ข้อจำกัด |
| POST | `/api/trace` | ค่ากลางทุกขั้นของการคำนวณ (Tab 2) |
| POST | `/api/offers` | รายการฝากมูจำลอง |
| POST | `/api/feedback` | บันทึก feedback ลง Google Sheet ผ่าน Apps Script (ถ้าตั้งค่าไว้) ต้องติ๊กยินยอมก่อนส่ง |

## Deploy บน Vercel
1. Import repo เข้า Vercel (Framework: Other — `vercel.json` ตั้งค่าไว้แล้ว)
2. (ไม่บังคับ) Environment Variables: `FEEDBACK_WEBHOOK_URL` (และ `FEEDBACK_TOKEN` ถ้า Apps Script ตรวจ token — ดู `docs/feedback_apps_script.gs`) ถ้าไม่ตั้ง ระบบรันโหมดสาธิตและไม่บันทึก
3. หมายเหตุ: ฟังก์ชัน Python แต่ละตัวแพ็กไลบรารีวิทยาศาสตร์ซ้ำ จึงกินพื้นที่ Functions Storage มาก ควรลบ deployment เก่าเป็นระยะ

## อัปเดตข้อมูล
Drive Baseline v2 → ส่งออก snapshot ใหม่ทับ `model/input_drive_v2_snapshot.json` → `python scripts/build_public_data.py` → รันเทสต์ ถ้าผลที่บันทึกไว้เปลี่ยน ต้องรัน `python model/network_phase1.py` และคัดลอกผลไป `public/data/results.json` รายละเอียดคำสั่งสร้างไฟล์ที่ได้มาทั้งหมดอยู่ใน [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)

## แหล่งข้อมูลและความเป็นส่วนตัว
- ข้อมูลทุกชุดที่ระบบใช้อยู่ใน repo นี้ พร้อมที่มา สถานะ (SOURCE/CANDIDATE/UNVERIFIED/SYNTHETIC) และรหัสตรวจไฟล์ใน [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)
- ตารางผู้ใช้ feedback ออเดอร์ ฯลฯ ใน repo เป็นข้อมูลสมมติทั้งหมด **ไม่มีข้อมูลผู้ใช้จริง**
- ที่มาของข้อมูลภายนอก: ปฏิทินจันทรคติจาก Hong Kong Observatory ผ่าน DATA.GOV.HK (ใช้ตามเงื่อนไขของ DATA.GOV.HK) · เวลาเดินทางรถไฟประมาณจากแนวเส้นทางของ [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL) · ส่วนข้อมูลความเชื่อมาจากเว็บอ้างอิงที่ระบุ URL ในข้อมูล (repo เก็บเฉพาะข้อความอ้างอิงสั้น ๆ)
- ยังไม่ได้ระบุใบอนุญาตของ repo (สงวนสิทธิ์ทั้งหมดโดยค่าเริ่มต้น) ดู `docs/DATA_SOURCES.md` ข้อ 8
