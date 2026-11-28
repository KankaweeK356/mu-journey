# ไฟล์สำหรับ Neo4j

**สถานะ: เตรียมไฟล์ไว้ ยังไม่เคยรันบน Neo4j จริง**

| ไฟล์ | เนื้อหา | sha256 |
|---|---|---|
| `neo4j_nodes.csv` | 101 โหนด: `node_id`, `node_type` (Wish, SacredEntity, Place), `label`, `data_status`, `tradition` | `942bad33d6be` |
| `neo4j_edges.csv` | 114 เส้น: `from_id`, `to_id`, `relationship_type` (BELIEVED_FOR, REPORTED_AT), `data_status` | `1e6a6d333023` |
| `neo4j_queries.cypher` | คำสั่งตัวอย่าง 5 ข้อ: สถานที่ตามเรื่อง, สิ่งศักดิ์สิทธิ์ที่มีเส้นมาก, เส้นทางอธิบาย, ช่องว่างข้อมูล, การตัดกลุ่มความเชื่อ | — |

**ตรวจเมื่อ 2026-11-28:** รหัสโหนด ชื่อ และเส้นในไฟล์ CSV ตรงกับกราฟที่ `model/network_phase1.py` สร้าง

## นำเข้า (ยังไม่ได้ทดสอบ)
ใช้ Neo4j Data Importer: กำหนด `node_id` เป็นตัวระบุ ใช้ `node_type` เป็น label และ `relationship_type` เป็นชนิดความสัมพันธ์ แล้วรันคำสั่งในไฟล์ `.cypher`
ความสัมพันธ์ทุกเส้นเป็นข้อกล่าวอ้างที่ยังรอตรวจ ดูคอลัมน์ `data_status`
