# ส่งมอบรอบ Final Improvement — MU Journey (ถึงผู้ตรวจรับ: ส้มส้ม)

**สถานะ:** แก้และทดสอบในเครื่องแล้ว คอมมิตบน `main` แล้ว **ยังไม่ Push และยังไม่ Deploy**
เว็บจริง https://mu-journey-newja.vercel.app ยังเป็นโค้ดเดิม (`2d3eadd`)

## 1. สถานะงาน #1–13 ก่อนและหลังแก้

ก่อนแก้: `ALREADY_DONE` ทำงานถูกอยู่แล้ว · `NEED_FIX` ต้องแก้ · `BLOCKED` ทำไม่ได้ในขอบเขตนี้

| # | งาน | ก่อนแก้ | หลังแก้ | สิ่งที่ทำ / หลักฐาน |
|---|---|---|---|---|
| 1 | `null` ในรายละเอียด Node | NEED_FIX | DONE | พบเพิ่มที่ขั้น 01, Trip Matching และ Event Trace (สาเหตุเดียวกัน) แก้ด้วย `put()` · E2E คลิกครบ 101 โหนด |
| 2 | Wish Filter | NEED_FIX (เดิมแสดงเรื่องอื่นติดมาด้วย) | DONE | `wishNetwork()` · เทสต์ครบ 10 เรื่อง (Node + เบราว์เซอร์) |
| 3 | อธิบาย SOURCE / CANDIDATE / UNVERIFIED | NEED_FIX | DONE | คำอธิบายใต้กราฟและในหน้ารายละเอียดสถานที่ · เปลี่ยนคำว่า "มีแหล่งอ้างอิงทางการ" เป็น "มีแหล่งอ้างอิง" เพราะสถานะต้นทางคือ `SOURCE_PRESENT_REVIEW` (ยังรอตรวจ) |
| 4 | ซ่อนข้อความตรวจข้อมูลภายใน | NEED_FIX | DONE | แปลงที่ชั้นแสดงผล (`public/js/usertext.js`) ไม่แก้ไฟล์ข้อมูล คำเตือนข้อมูลจำลอง/ไม่ยืนยัน/ขัดกันยังอยู่ · Tab 2 (มุมมองผู้วิเคราะห์) และ API ยังเป็นข้อความต้นทาง |
| 5 | BTS/MRT และเวลาเดินทาง | NEED_FIX (มีแค่ชื่อสถานี) | DONE | ขั้น 06–07 แสดงรายช่วง: เวลารถไฟ, รอรถ (สมมติ), เวลาเข้าถึงสถานที่ แยกกัน · ค่าที่ไม่มีข้อมูลเขียนว่าไม่มี ไม่เติมเอง |
| 6 | วันที่แจ้งเตือน | NEED_FIX | DONE | แสดงวันที่ครบกำหนดข้างแต่ละช่วง · กิจกรรมที่ยังไม่ยืนยันบอกว่าไม่มีวันแจ้งเตือนและเพราะอะไร · ระบบเตือนตอนเปิดเว็บเท่านั้น |
| 7 | Attribution OpenStreetMap | NEED_FIX | DONE (มีข้อค้างทางกฎหมายในข้อ 7) | ใช้จริง 185/202 เส้นรถไฟ · เครดิตที่ขั้น 06, 07, Trip Designer, README, DATA_SOURCES §6.2 |
| 8 | Community Validation | NEED_FIX | DONE — ผลคือ **ไม่ผ่านเกณฑ์ตั้งชื่อ** | ใช้หมายเลข Community ทุกกลุ่ม · หน้า Explorer อธิบายส่วนประกอบและความคงที่ |
| 9 | กราฟจริงเทียบกราฟสุ่ม | NEED_FIX | DONE | 1,000 ชุด รักษา Wish–Deity / Deity–Place และ Degree รายชนิด |
| 10 | Degree แยกประเภท | NEED_FIX | DONE | 4 ตาราง (Wish, Place, Deity→Wish, Deity→Place) และ CSV ครบ 101 โหนด |
| 11 | Graph Design | NEED_FIX | DONE (มีส่วน DRAFT) | [`GRAPH_DESIGN_TH.md`](GRAPH_DESIGN_TH.md) |
| 12 | ตรวจ Production | NEED_RUN | DONE แบบอ่านอย่างเดียว — **พบข้อบกพร่องเดิมบนเว็บจริง** | ดูข้อ 5.2 |
| 13 | Birthday signal + Impact | NEED_FIX | DONE | 4 สถานะ, ขั้น 04–05, Lab, Seed ก่อน/หลัง Normalize, ผล 7 วัน |

## 2. Commit และไฟล์ที่เปลี่ยน

| Commit | เนื้อหา |
|---|---|
| `13e14877abb7c441c460068f25382cbd0e09ae3b` | โค้ด เทสต์ สคริปต์ ผลวิเคราะห์ และเอกสารวิธีคำนวณทั้งหมดของรอบนี้ |
| คอมมิตถัดจากนั้น | เอกสารฉบับนี้ (ใส่ SHA ของตัวเองไม่ได้ ดูด้วย `git log --oneline -3`) |

ฐานก่อนรอบนี้: `2d3eadd` · ดูรายการไฟล์: `git diff --name-status 2d3eadd HEAD`

| กลุ่ม | ไฟล์ |
|---|---|
| Service (เพิ่มฟิลด์แสดงผลเท่านั้น) | `api/_engine.py` — `birth_signal`, `seeds_sum`, `seeds_normalized`, ชื่อสถานี/ระบบรถในช่วงทริปและสถานที่ |
| หน้าเว็บ (แก้) | `public/js/` : `demo.js`, `explorer.js`, `graphview.js`, `lab.js`, `matching.js`, `eventlab.js`, `designer.js`, `notifyui.js`, `util.js` · `public/mumu.css` |
| หน้าเว็บ (ใหม่) | `public/js/usertext.js`, `netstats.js`, `osm.js` · `public/data/network_analysis.json` |
| สคริปต์ (ใหม่) | `scripts/network_analysis.py`, `scripts/birthday_impact.py` |
| ผล (ใหม่) | `model/results/network_analysis_v1.json`, `network_analysis/*.csv`, `birthday_impact_v1.json`, `birthday_impact_profiles.csv` |
| เทสต์ | ใหม่ `tests/test_final_round.py`, `tests/js/usertext.test.mjs`, `netstats.test.mjs`, `tests/e2e/final_round.mjs` · แก้ `tests/test_friend2_ux.py` 1 เคส (ข้อความสถานีย้ายไปฟังก์ชันใหม่) · ไฟล์ผล E2E อัปเดต |
| เอกสาร | `README.md`, `docs/DATA_SOURCES.md`, `GRAPH_DESIGN_TH.md`, `NETWORK_ANALYSIS_METHOD_TH.md`, `BIRTHDAY_IMPACT_ANALYSIS_TH.md`, ฉบับนี้ |
| Deploy | `.vercelignore` — ไม่แพ็ก CSV หลักฐานเข้า Functions (เพิ่ม 2 บรรทัดแบบอ้างจากราก) |

## 3. ผล Network Analysis

ไฟล์: [`network_analysis_v1.json`](../model/results/network_analysis_v1.json) · [`communities.csv`](../model/results/network_analysis/communities.csv) · [`community_members.csv`](../model/results/network_analysis/community_members.csv) · [`null_model_samples.csv`](../model/results/network_analysis/null_model_samples.csv) · [`degree_by_type.csv`](../model/results/network_analysis/degree_by_type.csv)
วิธีและข้อจำกัด: [`NETWORK_ANALYSIS_METHOD_TH.md`](NETWORK_ANALYSIS_METHOD_TH.md)

| ค่า | กราฟจริง | กราฟสุ่มเฉลี่ย | กราฟสุ่มที่ ≥ ค่าจริง |
|---|---|---|---|
| Components | 19 | 20.53 | 942/1000 |
| Component ใหญ่สุด | 81 | 77.42 | 190/1000 |
| Modularity (Greedy) | 0.5864 | 0.5650 | 42/1000 |
| Modularity (Louvain ดีสุดจาก 10) | 0.5874 | 0.5700 | 54/1000 |

**ข้อสรุป (DRAFT รอส้มส้มตีความ):** ยังอ้างไม่ได้ว่าพบโครงสร้างกลุ่มที่มีนัยสำคัญ เกณฑ์ที่กำหนดก่อนรันคือต้องผ่านทั้งสองวิธีที่ไม่เกิน 5% — Greedy ผ่านฉิวเฉียด Louvain ไม่ผ่าน
ความคงที่ 100 Seed: กลุ่ม 5, 7, 8, 9 สมาชิกคงที่ครบ กลุ่ม 1–4 และ 6 มีสมาชิกต่ำกว่า 0.80 · **ไม่มีกลุ่มใดได้ชื่อ**

## 4. Birthday Impact ทั้ง 7 วัน (ไม่มีข้อจำกัด, 175 ชุดความสนใจต่อวัน)

| วันเกิด | สถานะ | อันดับไม่เปลี่ยน | อันดับเปลี่ยน | สมาชิกเปลี่ยน | เปลี่ยนแค่ลำดับ | ต่าง >1e-9 | ต่าง ≥0.01 | ทริปเปลี่ยน |
|---|---|---|---|---|---|---|---|---|
| จันทร์ | APPLIED | 98 | 77 | 36 | 41 | 174 | 162 | 5 |
| อังคาร | APPLIED | 74 | 101 | 46 | 55 | 174 | 162 | 7 |
| พุธ | NO_ELIGIBLE_DATA | — (No Signal 175) | 0 | 0 | 0 | 0 | 0 | 0 |
| พฤหัสบดี | APPLIED | 91 | 84 | 45 | 39 | 174 | 167 | 5 |
| ศุกร์ | APPLIED | 87 | 88 | 36 | 52 | 174 | 168 | 4 |
| เสาร์ | APPLIED | 102 | 73 | 36 | 37 | 173 | 164 | 4 |
| อาทิตย์ | NO_ELIGIBLE_DATA | — (No Signal 175) | 0 | 0 | 0 | 0 | 0 | 0 |
| **รวม 1,225** | No Signal 350 | **452** | **423** | 199 | 224 | 869 | 823 | 25 |

กรณีมีข้อจำกัด (4,900 กรณี): No Signal 2,275 · ไม่เปลี่ยน 1,537 · เปลี่ยน 1,088 · ตัดกลุ่ม "ฮินดู" ทำให้ทุกวันที่เคยมีสัญญาณเป็น `EXCLUDED`
ตัวเลขทั้งหมด: [`BIRTHDAY_IMPACT_ANALYSIS_TH.md`](BIRTHDAY_IMPACT_ANALYSIS_TH.md) · เกณฑ์ >1e-9 และ ≥0.01 เป็นเกณฑ์วิเคราะห์ **ไม่ใช่ Accuracy** และไม่ได้บอกว่าอันดับใหม่ดีกว่า

## 5. ผลทดสอบ

### 5.1 โค้ดใหม่ (ในเครื่อง, คอมมิต `13e1487`)

เปิดเซิร์ฟเวอร์ก่อนรัน E2E: `python scripts/dev_server.py 3100` (รันจากโฟลเดอร์ repo)

| ชุด | คำสั่ง | ผล |
|---|---|---|
| Python | `python -m unittest discover -s tests` | PASS 173/173, SKIP 0 |
| Node | `node --test tests/js/*.test.mjs` | PASS 68/68, SKIP 0 |
| E2E ขั้น 04 | `$env:BASE='http://localhost:3100/'; node tests/e2e/step04_journey.mjs` | PASS 46/46 |
| E2E รอบ 3 | `node tests/e2e/round3_journey.mjs http://localhost:3100 all` | PASS 57/57 |
| Trip Matching เข้มงวด (มีทริป และ NO_ELIGIBLE) | `node tests/e2e/matching_strict.mjs http://localhost:3100` | PASS 71/71 |
| E2E รอบนี้ (1366px และ 375px) | `node tests/e2e/final_round.mjs http://localhost:3100 full` | PASS 153/153 |
| คำนวณซ้ำ Network | `python scripts/network_analysis.py --check` | PASS ตรงทุกไฟล์ |
| คำนวณซ้ำ Birthday | `python scripts/birthday_impact.py --check` | PASS ตรงทุกไฟล์ |

ชุด `final_round.mjs` ครอบคลุม: ไม่มี `null`/`undefined`, ไม่มีแถบเลื่อนแนวนอน, ปุ่ม/ช่องกรอก/รูปมีชื่อ, ID ไม่ซ้ำ, หน้าประกาศภาษา, ไม่มี Console Error หรือคำขอล้มเหลว และกันคำขอ feedback ไว้

**SKIP (ไม่ได้ทำ):** ตรวจ Accessibility เต็มมาตรฐาน (contrast, screen reader) · อุปกรณ์มือถือจริง · เบราว์เซอร์อื่นนอกจาก Edge headless · ส่ง feedback ลง Google Sheet จริง (ห้าม) · โค้ดใหม่บน Vercel (ยังไม่ Deploy)

### 5.2 Production ปัจจุบัน (โค้ดเดิม อ่านอย่างเดียว)

ตรวจว่าไฟล์ `js/demo.js`, `js/lab.js`, `data/graph.json` บนเว็บจริงตรงกับ `2d3eadd`

| ชุด | คำสั่ง (`$P` = URL เว็บจริง) | ผล |
|---|---|---|
| ตรวจสุขภาพทั่วไป | `node tests/e2e/final_round.mjs $P readonly` | **FAIL 6 จาก 88** (ผ่าน 82) |
| Tab 2 | `node tests/e2e/round3_journey.mjs $P tab2` | PASS 10/10 |
| Trip Matching | `node tests/e2e/matching_strict.mjs $P` | PASS 71/71 |

6 ข้อที่ไม่ผ่านคือคำว่า `null` บนหน้าจอ (ขั้น 01 และ Tab 2 หัวข้อ 04–05 ทั้งจอใหญ่และมือถือ โดยการสแกนหัวข้อ 05 รวมข้อความของหัวข้อที่ซ่อนอยู่ด้วย) แก้แล้วในโค้ดใหม่ แต่ **ยังอยู่บนเว็บจริงจนกว่าจะ Deploy** ไม่พบ Console Error หรือคำขอล้มเหลว

## 6. Regression เทียบ Baseline เดิม

Baseline `tests/golden/model_outputs_286c485.json` (ไม่ได้เขียนทับ) · `python scripts/regression_snapshot.py . <ไฟล์ชั่วคราว>`

| รายการ | โปรไฟล์ | ต่างจาก Baseline |
|---|---|---|
| Top 5 + คะแนน PPR + เรื่องที่ตรง (โมเดล) | 342 | 0 |
| Trip Matching (โมเดล) | 342 | 0 |
| Top 5 และทริป (Service) | 342 | 0 |

ในชุดนี้ 12 โปรไฟล์ได้ `NO_ELIGIBLE_SIGNATURE_TRIP` (เหมือนเดิม)
ไม่เปลี่ยนจาก `2d3eadd`: `model/network_phase1.py`, snapshot, ทริปที่ล็อก, `ritual_claims.json`, `graph.json`, `api/feedback.py`, Apps Script และโฟลเดอร์ golden

## 7. สิ่งที่ยัง BLOCKED / ค้าง

| รายการ | สถานะ | เหตุผล | ผู้รับผิดชอบ |
|---|---|---|---|
| ตั้งชื่อ Community | BLOCKED | หลักฐานไม่ผ่านเกณฑ์ (ข้อ 3) | ส้มส้ม (ตีความ) |
| ปุ่มบันทึกกิจกรรม / บันทึกสถานที่ / เข้าร่วม / บันทึก-ส่งคำขอฝากมู (ความเห็นต่อ Demo ข้อ 1, 2, 5, 6) | BLOCKED | เป็นฟีเจอร์นอกขอบเขต หรือขัดกติกาไม่จอง ไม่เก็บคำขอจริง | เจ้าของงาน |
| ข้อมูลวันพุธและอาทิตย์ | BLOCKED | ไม่มีข้อมูลที่ผ่านเกณฑ์ และห้ามเพิ่มความสัมพันธ์ใหม่ | ส้มส้ม (Data Quality) |
| สถานี P030 ไม่ตรงกัน: ข้อมูลสถานที่ระบุ E1 แต่ทริป Love แวะจากสถานี CEN | พบใหม่ ยังไม่แก้ | เป็นข้อมูลต้นทางและทริปที่ล็อก | ส้มส้ม |
| สถานที่ 4 แห่ง (P038, P039, P046, P048) ไม่มีเวลาเข้าถึง · 16 แห่งไม่มีเส้นเชื่อม · เทพ 9 องค์ไม่มีเรื่องที่ขอ · เวลาเปิดขัดกัน 2 แห่ง | ค้าง | ต้องหาแหล่งอ้างอิงก่อน | ส้มส้ม |
| OSM: ไม่ได้บันทึกวันที่ดึงข้อมูล และยังไม่ประเมินหน้าที่ share-alike ของ ODbL · ที่มาพิกัดสถานี/เวลาเดินไม่ได้บันทึก | ค้าง | ไม่มีหลักฐานใน repo | เจ้าของข้อมูล |
| ข้อสรุปป้าย DRAFT (Business Question, เหตุผล, Business Value, การตีความ Network) | รอยืนยัน | ต้องให้เจ้าของงานตัดสิน | ส้มส้ม |
| บันทึกการใช้ AI เทียบคนตรวจ, รายงานการสร้างกราฟตามบทที่ 6, ใบอนุญาต repo, ลิงก์ตรงรายหน้า (hash routing) | ยังไม่ได้ทำ | ไม่อยู่ในคำสั่งรอบนี้ | เจ้าของงานมอบหมาย |
| สไลด์, PDPA, ทดสอบกับผู้ใช้จริง | ไม่ใช่งาน Dev | — | ทีม |

## 8. ความเสี่ยงก่อน Deploy

1. **ยังไม่เคยรันบน Vercel** — มีไฟล์หน้าเว็บใหม่ 4 ไฟล์ และ `.vercelignore` เปลี่ยน (รอบก่อนเคยพังเพราะไฟล์นี้) หลัง Deploy ให้รัน `node tests/e2e/final_round.mjs <URL จริง> full` (บล็อก feedback ในหน้าไว้ ไม่เขียน Sheet) และ `matching_strict.mjs`
2. เบราว์เซอร์ที่แคชไฟล์เก่าควรรีเฟรชแบบล้างแคชก่อนตรวจ
3. หน้า Explorer เปลี่ยนมาก: แผนภูมิโดนัทและข้อความ "Density แสดงว่าเครือข่ายค่อนข้างกระจายตัว" ถูกถอดออกเพราะไม่มีค่าเปรียบเทียบรองรับ
4. ผล Modularity อยู่ที่ขอบเกณฑ์ เวลานำเสนอต้องบอกทั้งสองค่า (4.2% และ 5.4%) ห้ามเลือกพูดค่าเดียว
5. ผล Louvain ขึ้นกับเวอร์ชัน `networkx` (ตรึงไว้ 3.7)
6. ประโยคและคำแปลภาษาไทยที่เพิ่มยังไม่ผ่านการอ่านทวนโดยคน

## 9. หลักฐานที่ผู้เชี่ยวชาญตรวจและคำนวณซ้ำได้

```
pip install -r requirements.txt
python -m unittest discover -s tests
node --test tests/js/*.test.mjs
python scripts/network_analysis.py --check
python scripts/birthday_impact.py --check
```

| คำกล่าวอ้าง | ตรวจที่ |
|---|---|
| กราฟสุ่มรักษา Schema และ Degree | `tests/test_final_round.py::NetworkAnalysisResults`, ฟังก์ชัน `rewire` |
| ตั้งชื่อเฉพาะกลุ่มที่ผ่านครบ | เทสต์ `test_no_name_without_passing_every_criterion` |
| `birth_signal` ไม่เลือกเทพเอง | `api/_engine.py::birth_signal` เรียก `m.birth_seed` · เทสต์ 7 วัน × ทุกชุดข้อจำกัด |
| Seed หลัง Normalize ให้ PageRank เดียวกับโมเดล | เทสต์ `test_trace_seeds_before_and_after_normalisation_reproduce_pagerank` |
| วันที่ต่างกันแต่วันในสัปดาห์เดียวกันได้ผลเดียวกัน | `birthday_impact_v1.json` → `same_weekday_different_date_identical` (1,225/1,225) |
| เวลาทริปเป็นค่าที่เก็บไว้ ไม่ได้สร้างใหม่ | เทสต์ `TransitDisplayFields` |
| ข้อความภายในถูกซ่อนเฉพาะการแสดงผล | `tests/js/usertext.test.mjs` และเทสต์ `SourceDataKeptAndHiddenOnlyOnScreen` |
| โมเดลไม่เปลี่ยน | `tests/test_regression_model_outputs.py` |

ข้อควรรู้: ผลคำนวณซ้ำได้ ยืนยันว่า **โค้ดทำตามที่อธิบาย** ไม่ได้ยืนยันว่าข้อมูลความเชื่อถูกต้อง
