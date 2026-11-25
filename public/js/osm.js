// Attribution for the data that really comes from OpenStreetMap: rail segment lengths used to ESTIMATE train travel time
// (model/input_drive_v2_snapshot.json, table transit_edges, field method_note). No map tiles are used.
import { h } from './util.js';

export const OSM_URL = 'https://www.openstreetmap.org/copyright';
export const osmCredit = () => h('div', { class: 'small faint', 'data-osm-credit': 'true' },
  'เวลาเดินทางด้วยรถไฟฟ้าเป็นค่าประมาณจากระยะทางตามแนวเส้นทาง (ไม่ใช่ตารางเดินรถ) ข้อมูลแนวเส้นทาง ',
  h('a', { href: OSM_URL, target: '_blank', rel: 'noopener noreferrer' }, '© OpenStreetMap contributors'), ' ภายใต้สัญญาอนุญาต ODbL');
