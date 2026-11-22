# MU Journey — Network Analytics & Model Evaluation (Phase 1)
**สถานะ: พร้อมส่งต่อทีมพัฒนาเพื่อทำ Demo แต่ยังไม่ผ่านเงื่อนไขเปิดขายทัวร์จริง**  |  วันที่ 21 พฤศจิกายน 2569

## 1. Business decision ที่ Model ตอบ
ผู้ใช้ให้วันเกิด (ประกอบถ้ามีความเชื่อเชื่อมได้), เลือกความสนใจ 1–3 จาก 10 หมวด และสิ่งที่ไม่ต้องการ → ระบบแสดงสถานที่ที่มีเส้นทาง Wish→Deity→Place รองรับได้สูงสุด 5 แห่ง พร้อมเหตุผล → เลือกทริปบริษัท 1 จาก 3 แบบคงที่ หรือยอมรับว่าไม่มีทริปที่ผ่านข้อจำกัด

## 2. Network Architecture และ Data Quality
- Knowledge Graph: **101 nodes, 114 edges**; Wishes 10, Sacred entities 39, Places 52
- Density undirected ทั้งกราฟ **0.02257**; เนื่องจากข้อมูลเป็น graph ต่างชนิด ค่าความหนาแน่นที่มีความหมายเชิงชนิดคือ Wish–Deity **0.1231** และ Deity–Place **0.0325**
- 19 connected components; 16 isolated nodes; Place ที่ไม่มีเส้นเชื่อม **16 แห่ง**
- Greedy modularity communities **25** ชุมชน; modularity **0.5864** (ไม่ใช่ 25 กลุ่มลูกค้าหรือ 25 ธีมขายได้)
- วิเคราะห์ Degree/Betweenness/Closeness เพื่อระบุจุดเชื่อมและโหนดที่เครือข่ายพึ่งพา แต่จะไม่ตีความจำนวนเส้นเชื่อมเป็นความนิยมจริง
- สถานที่ทั้ง 52 แห่งไม่มีพิกัดสถานที่ที่ยืนยันแล้ว; ชั่วโมงเปิดบางแห่งเป็น Synthetic/Candidate; ความเชื่อเป็น Candidate Claims ไม่ใช่หลักฐานว่าคำขอพรสัมฤทธิ์ผล

![Graph](figures/01_knowledge_graph.png)

## 3. Core Algorithm
**3.1 MU Place Recommendation.** ลบ Deity/Place ที่ไม่ผ่าน Hard Constraints ออกจาก Knowledge Graph; restart Personalized PageRank จาก Wish ที่เลือก (น้ำหนักเท่ากัน); ใช้ birthday-to-deity เพียงรายการที่มีรหัส master ยืนยันใน source mapping เป็นสัญญาณรอง; จำกัด Candidate ให้มีเส้นทางจริง Wish→Deity→Place แล้ว greedy re-rank ให้ครอบคลุม 1–3 เรื่องที่เลือก (75% PPR normalized +25% ความสนใจที่ยังไม่ถูกครอบคลุม) ส่งกลับได้ไม่เกิน 5 แห่งโดยไม่แต่งเพิ่มหากมีน้อยกว่า 5
**3.2 Offline Signature Trip Design.** ยืนยันผลที่บริษัทล็อกจาก Network model รอบก่อน ใช้ธีม Love / Career / Wealth, จำนวน 4 จุดแวะ, BTS/MRT + walk/skywalk, จุดนัดพบสยาม 09:00 (สมมติ), max 6 ชั่วโมง, ไม่มีสถานที่ซ้ำ 3 ทริป, จำกัด candidate pool ไม่เกิน 15/ธีม. ใช้ PPR + Dijkstra + permutation-based orienteering ภายใน candidate pool; ไม่อ้าง global optimum หรือเวลาเดินจริง
**3.3 Online Trip Matching.** คำนวณความเกี่ยวข้องของ user กับ Place ใน 3 ทริปคงที่; กรอง forbidden places และ featured deity จาก `SD_TRIP_RITUALS`; ต้องครอบคลุมอย่างน้อย 30% ของจำนวน Wish ที่ผู้ใช้เลือก; Trip Score =75% mean normalized PPR of tour stops +25% fraction of selected wishes covered; เลือกสูงสุด 1 ทริป หากไม่ผ่านเงื่อนไขให้ Abstain; ไม่คำนวณ route ใหม่

## 4. Network EDA → Business Findings
1. **Coverage gap:** มี Place ไม่มีความสัมพันธ์กับเทพ **16 แห่ง** → ควรให้ทีม Data Review ตรวจแหล่งอ้างอิงก่อนจัดอันดับ ไม่เพิ่ม Edge ด้วยการเดา
2. **Hub ≠ popularity:** Degree สูงจากแหล่งข้อมูลหรือระบบสกัดข้อมูลที่ครอบคลุมมากได้ → ใช้ Graph Relevance ร่วมกับความหลากหลายและอธิบายเส้นทาง ไม่กล่าวว่าเป็นวัดยอดนิยม
3. **Communities ≠ Trip:** ชุมชนจาก Graph บอกกลุ่มความสัมพันธ์ แต่จะเอาไปทำทริปต้องผ่านเงื่อนไขเดินทาง BTS/MRT, ความแตกต่างของแพ็กเกจ, เวลาเปิดและข้อจำกัดของบริษัท
4. **Exclusions change viable subgraph:** ตัวอย่างผู้ใช้เลือก W05 และไม่ต้องการเทพฮินดูไม่เหลือ candidate จึงต้องตอบว่าไม่มีรายการ ไม่แอบแนะนำเทพที่ขัดข้อกำหนด

## 5. Model Evaluation (จำแนกความหมายของผลให้ตรง)
- **Structural acceptance fixtures จำนวน 15 โปรไฟล์ (NDCG คิดได้ 14 โปรไฟล์; 13 จาก 15 เลือกเรื่องเดียว)** (label ที่ผู้จัดทำเลือกจาก SAME knowledge graph; *ไม่ใช่ independent user ground truth*). NDCG@5: Popularity **0.6880**, Direct Two-hop **0.6831**, PPR **0.7622**, PPR+Coverage **0.7622**. คะแนนเฉลี่ยนี้คิดเฉพาะ fixture ที่มี labels ผ่านเงื่อนไข; ไม่ใช่ accuracy จากผู้ใช้จริง
- **Graph edge holdout test จำนวน 48 ตัวอย่าง**: PPR Hit@5 **66.67%** และ Degree Hit@5 **81.25%** → Degree ชนะในโจทย์ทำนาย Edge ที่ซ่อน; จึงอ้างว่า PPR เหนือกว่าเทคนิคทั่วไปทุกกรณีไม่ได้
- **Acceptance 75 โปรไฟล์จำลอง:** exclusion violations = **0**; explanation paths ไม่ขาด; เลือกทริปเดิมโดยไม่มี re-route. แนะนำ Trip Love 26, Career 21, Wealth 22 และ Abstain **6** ราย
- **Sensitivity:** ลองเปลี่ยนสัดส่วน PPR 0.50/0.75/0.90 สำหรับ fixture 15 ราย ผล Top-1 ยังเหมือนเดิมในชุดนี้; ไม่สามารถอ้าง robustness ทั่วไปจากตัวอย่างเล็กได้
- **Trip transport scenario:** จำลองเวลาเดินทางเพิ่ม 0/15/30/50% จากเวลาองค์ประกอบ rail/walk/wait ในตาราง โดยยังไม่เปลี่ยนเส้นทาง; ใช้ประเมินความเสี่ยงเบื้องต้นเท่านั้น

![Baseline](figures/02_structural_baseline.png)

## 6. Three fixed company trips
| Trip | Stops | Finish estimate | Duration | Source path |
|---|---|---:|---:|---|
| TRIP_LOVE | P030 → P023 → P001 → P047 | 13:01 | 240.8 min | Source Claims + Rail Estimate |
| TRIP_CAREER | P026 → P014 → P012 → P005 | 13:40 | 279.9 min | Source Claims + Rail Estimate |
| TRIP_WEALTH | P018 → P017 → P044 → P015 | 13:00 | 239.6 min | Source Claims + Rail Estimate |

![Trip duration](figures/03_fixed_trip_duration.png)
เปิดขายไม่ได้จนกว่าจะยืนยันเวลาเข้า, ตำแหน่งทางเดิน, สถานที่อนุญาต, ความจุกรุ๊ป, ราคาและกำไรจริง

## 7. Scope & Study-Rubric Evidence
| Rubric | มีหลักฐานแล้ว | สิ่งที่ยังต้องทำภายนอก Demo |
|---|---|---|
| Problem Framing & Business Relevance | User→Wish→Deity→Place; Fixed-trip top-1 decision; no rerouting | สาธิตและยืนยัน business ownership |
| Data Collection & Graph Construction | Master IDs, 114 source edges, QA, provenance, alias links | Audit source rights/ToS, sample-check unsupported claims and venue info |
| Network Analysis & Analytical Rigor | Degree, Betweenness, Closeness, Density, Components, Community, PPR, routing, baselines, sensitivity; **ภาคผนวก: bootstrap CI, leave-one-edge-out 28 เส้น, วัดผล Coverage 175 ชุด (ภาคผนวก §11)** | Independent expert/real-user labels |
| Technology & AI Integration | NetworkX runnable; Neo4j-compatible CSV and sample Cypher included | Neo4j code not yet executed on a running DB; no real LLM GraphRAG deployed |
| Business Impact & Responsible Use | 3 fixed mock products, Top-5/Top-1 rules, exclusion zero in tests, abstention | Paid-tour operations, actual prices, cost savings/conversion validation |

## 8. ชัดเจนว่าอะไรคือ “สมบูรณ์”
**สมบูรณ์ระดับ Phase 1 analytical demo:** Network model, baseline comparison, 3 fixed products, user input 1–3 wishes, forbidden deity/place, explainable output, deterministic acceptance tests และ repeatable Python/Notebook พร้อมแล้ว
**ยังไม่สมบูรณ์สำหรับการอ้างความแม่นยำกับผู้ใช้จริงหรือเปิดขาย:** ต้องมีคำตัดสินจากผู้ใช้/ผู้เชี่ยวชาญที่ไม่อิงชุด Graph เดิม, แหล่งจริงตรวจสอบ, ตำแหน่งและเวลาเดินจริง, ราคา/จำนวนคน/นโยบายการจอง และการ deploy app

## 9. คำตอบสำหรับ Defend อาจารย์
- **ทำไม relational join อย่างเดียวไม่พอ?** Join สร้าง candidate paths ได้ (จึงเป็น Baseline ที่ถูกต้อง) แต่ระบบเครือข่ายใช้การเชื่อมหลายทางและตำแหน่งเชิงโครงสร้างเพื่อ rank, explain, จัด portfolio ที่คำนึงถึงการเดินทาง และวิเคราะห์ช่องว่างของข้อมูลได้พร้อมกัน
- **มีข้อพิสูจน์หรือยังว่า PPR เหนือกว่า Filter?** ยังไม่มีหลักฐานจากผู้ใช้จริง และ PPR แพ้ Degree ใน edge holdout; อ้างตามที่มีเท่านั้น
- **ทำไม Trip ไม่เปลี่ยนรายคน?** บริษัทเลือกผล Offline แล้วล็อก Trip Version; ออนไลน์เลือก 1 ใน 3 ตาม Wish + Exclusion; สื่อสารอย่างไม่สับสนว่า trip fixed
- **ทำไมไม่ทำ GNN/Diffusion/GraphRAG ตอนนี้?** Rubric เน้นเลือกวิธีที่ตรง decision; การเสริม algorithm โดยไม่มี supervised ground truth หรือกรณีใช้จริงไม่เพิ่ม analytical rigor
- **AI กับคนรับผิดชอบอะไร?** AI ช่วยพัฒนาความสอดคล้องของ candidate และ code; มนุษย์ต้องอนุมัติหลักฐานความเชื่อ กฎสิทธิผู้ใช้ นโยบายสถานที่ และการเปิดขาย

## 10. Reproducibility
```bash
pip install networkx matplotlib nbformat
python network_phase1.py
python -m unittest -v test_network_phase1.py
python make_deliverables.py
```
ใช้ JSON Snapshot ที่ export จาก Drive Baseline v2 และ file offline_signature_trip_v1.json ที่บันทึกเมื่อ 21 พฤศจิกายน 2569; ไม่ดึงข้อมูลออนไลน์ระหว่างรัน. Model “birth signal” ใช้เพียงบาง Claim ที่ match existing deity master เท่านั้น

**Data origin:**
- Knowledge Graph: https://docs.google.com/spreadsheets/d/1ojyLRW6cuM9fGUOg9UqU-ftoPVmumXts4XHYnkIgGPw/edit
- Trip Design: https://docs.google.com/spreadsheets/d/1Jqr6cf0J0LzsBcKI6u1RDQov-gHSywSj91nE6DAcD6Y/edit
- User mock: https://docs.google.com/spreadsheets/d/1hn4BL-DFqriKOJfdRAjtdMRgE3wQ4eL12SRQZAQPUDo/edit
- Course: Course Syllabus MADT7202 from supplied Network.zip

## 11. ภาคผนวก: ความเข้มงวดทางสถิติ (เพิ่มภายหลัง Phase 1, อ่านอย่างเดียว)
รายละเอียดเต็มใน `docs/RIGOR_ADDENDUM_TH.md` (`scripts/evaluate_rigor.py`, ผลใน `model/results/rigor_addendum_v1.json`) ไม่แก้โมเดลและไม่ทับผลเดิม
- **Fixtures:** PPR − Popularity = +0.074 NDCG@5 แต่ช่วงความเชื่อมั่น 95% [−0.010, +0.196] ครอบคลุมศูนย์ → ยังสรุปว่าดีกว่าไม่ได้
- **Holdout แบบ leave-one-edge-out (28 เส้น):** PPR 78.6% เทียบ Degree 82.1%, McNemar p = 1.0 → ไม่มีความต่างที่มีนัย (ผลเดิมที่ Degree นำ 14.6 จุดมาจากการสุ่มซ้ำ 6 รอบจาก 28 เส้น)
- **Coverage re-ranking:** ไม่เปลี่ยน Top 5 เมื่อเลือก 1–2 เรื่อง เมื่อเลือก 3 เรื่องเพิ่มความครอบคลุมใน 8/120 ชุด ไม่เคยลดลง (95.8% → 98.1%)
- **ข้อจำกัดคงเดิม:** ป้ายผลลัพธ์มาจากกราฟเดียวกัน

## 12. ส่วนขยายหลัง Phase 1 (เว็บแอปที่ deploy)
- **เว็บแอป 2 แท็บ** (Vercel + Google Sheets): Tab 1 เดินสาธิต 7 ขั้น, Tab 2 Network Analytics 5 หัวข้อ ใช้เอนจินเดียวกัน ตรวจความตรงกันอัตโนมัติ
- **ชั้นกิจกรรม (EVENT_RANKING_V1):** จัดอันดับกิจกรรมสายมู 37 รายการจากเครือข่ายเดิมโดยไม่แก้สูตร ทุกกิจกรรมมีเส้นทางจริง เรื่อง→เทพ→สถานที่→กิจกรรม รายงานความเสถียรของอันดับและความเสมอกันอย่างเปิดเผย
- **Calendar v3:** วันสำคัญที่ตรวจตามปฏิทิน (วาเลนไทน์) เตือนได้ ส่วนกิจกรรมจริงที่ยังไม่ยืนยันกำหนดการ ติดตามได้แต่ไม่เตือน ข้อมูลคอนเสิร์ต/สอบเป็นข้อมูลสมมติ ใช้เฉพาะโหมดจำลองใน Tab 2 ระบบเตือนเป็น in-app on-open (ดู `docs/CALENDAR_V3_REMINDER_RULES.md`)
- **ทดสอบอัตโนมัติ:** Python + Node รวมกว่า 120 ข้อ และชุดทดสอบ Reminder 60 แถว (ไม่แก้ค่าที่คาด)
- **ข้อมูลส่วนบุคคล:** วันเกิดอยู่ในหน่วยความจำของหน้าเท่านั้น feedback ต้องยินยอมก่อนส่ง
