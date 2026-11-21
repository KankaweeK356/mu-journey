"""Automated checks: python -m unittest -v test_network_phase1.py"""
import unittest
import network_phase1 as m

class MUPhase1Tests(unittest.TestCase):
 def test_graph_ids(self):
  q=m.qa_data();self.assertTrue(q['passed']);self.assertEqual(m.G.number_of_nodes(),101);self.assertEqual(m.G.number_of_edges(),114)
 def test_three_wishes(self):
  r=m.place_recommendation({'wish_ids':['W01','W02','W03'],'birthdate':'2000-05-15'})
  self.assertLessEqual(len(r['top5']),5)
  self.assertTrue(all(x['evidence_paths'] for x in r['top5']))
 def test_no_hindu_ever(self):
  r=m.place_recommendation({'wish_ids':['W01','W02','W03'],'exclusions':{'tradition_groups':['ฮินดู']}})
  for p in r['top5']:
   for e in p['evidence_paths']:self.assertNotEqual(m.E[e['deity_id']]['tradition'],'ฮินดู')
 def test_only_concert_no_hindu(self):
  pr={'wish_ids':['W05'],'exclusions':{'tradition_groups':['ฮินดู']}}
  self.assertEqual(m.place_recommendation(pr)['top5'],[])
  self.assertIsNone(m.match_trip(pr)['matched_trip'])
 def test_forbid_place_and_deity(self):
  r=m.place_recommendation({'wish_ids':['W01','W02'],'exclusions':{'place_ids':['P001'],'deity_ids':['D_GANESHA']}})
  for p in r['top5']:
   self.assertNotEqual(p['place_id'],'P001')
   self.assertNotIn('D_GANESHA',[e['deity_id'] for e in p['evidence_paths']])
 def test_fixed_trip_and_ritual_contract(self):
  self.assertEqual(len(m.CATALOG),3)
  for tid,t in m.CATALOG.items():
   self.assertEqual(t['stop_count'],4)
   self.assertEqual([z['place_id'] for z in t['featured_rituals']],t['place_ids'])
   self.assertEqual([z['deity_id'] for z in t['featured_rituals']],[d for p,d,w in m.LOCKED_FEATURED[tid]])
  x=m.match_trip({'wish_ids':['W02','W04']})
  self.assertFalse(x['route_reoptimized_per_user'])
  if x['matched_trip']:
   self.assertEqual(x['matched_trip']['place_ids_fixed'],m.CATALOG[x['matched_trip']['trip_id']]['place_ids'])
 def test_buddhist_era(self):
  self.assertEqual(m.weekday_from_dob('2543-05-15'),m.weekday_from_dob('2000-05-15'))
 def test_prevent_invalid_input(self):
  with self.assertRaises(ValueError):m.place_recommendation({'wish_ids':['WXX']})
  with self.assertRaises(ValueError):m.place_recommendation({'wish_ids':['W01','W02','W03','W04']})
  with self.assertRaises(ValueError):m.place_recommendation({'wish_ids':['W01'],'birthdate':'2030-01-01'})
 def test_eval_determinism(self):
  a=m.place_recommendation({'wish_ids':['W01','W02','W03']})
  b=m.place_recommendation({'wish_ids':['W01','W02','W03']})
  self.assertEqual(a['top5'],b['top5'])

if __name__=='__main__': unittest.main(verbosity=2)
