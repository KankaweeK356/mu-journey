# การออกแบบทริปคงที่ 3 ทริป (Offline)

สคริปต์และข้อมูลต้นฉบับที่ใช้สร้าง `model/offline_signature_trip_v1.json` นำมาจากชุดไฟล์ Phase 1 โดยไม่แก้เนื้อหา

| ไฟล์ | หน้าที่ | sha256 |
|---|---|---|
| `mu_trip_design_bts_mrt_v1.py` | สร้างกราฟรถไฟฟ้า หาเวลาสั้นสุด (Dijkstra) ลองทุกลำดับ 4 จุด และเลือก 3 ทริปที่ไม่ใช้สถานที่ซ้ำ | `c89d3f86551d` |
| `mu_network_models.py` | ฟังก์ชัน PPR และ baseline ที่สคริปต์ข้างบนเรียกใช้ | `e63ac584e3de` |
| `MU_Journey_Network_Demo_Data_v2.json` | ข้อมูลนำเข้าของการออกแบบ (ตารางผู้ใช้ feedback ออเดอร์ในไฟล์เป็นข้อมูลสมมติ) | `60aa9984217a` |

## รัน

```powershell
python offline_design/mu_trip_design_bts_mrt_v1.py
```

ผลถูกเขียนเป็น `offline_design/MU_Journey_Signature_Trip_Design_v1.json` (ไม่เก็บใน Git) ใช้ `networkx==3.7`

**ตรวจเมื่อ 2026-11-28:** รันซ้ำด้วย Python 3.12 และ networkx 3.7 ได้เนื้อหา JSON ตรงกับ `model/offline_signature_trip_v1.json` ทุกค่า

ข้อมูลนำเข้านี้ต่างจาก `model/input_drive_v2_snapshot.json` เฉพาะตารางข้อเสนอฝากมู (20 แถว เทียบ 21 แถว) ซึ่งการออกแบบทริปไม่ได้ใช้
เวลาเดินทางและเวลาเปิดเป็นค่าประมาณหรือจำลอง ใช้นำทางจริงไม่ได้ และคะแนนเส้นทางไม่ใช่การประเมินที่เป็นอิสระ

`mu_network_models.py` มีส่วนวิเคราะห์ของรอบ Phase 1 ที่ระบบปัจจุบันไม่ได้ใช้ ตัวเลขอ้างอิงของโครงการให้ใช้จาก `model/results/`
