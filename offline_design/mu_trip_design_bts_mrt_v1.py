"""MU Journey BTS/MRT + walking: Offline Signature Trip Design v1 (reproducible).

All route travel times and opening hours in this demo are estimates, candidates,
or synthetic. Not for actual navigation/booking. 3 tour products are precomputed
once for the company; online users match to one of these fixed products.

Input: user-specific Drive Baseline v2 exported JSON 2026-11-21.
Output: /mnt/data/MU_Journey_Signature_Trip_Design_v1.json
"""
import json, itertools, math, collections
from pathlib import Path
import networkx as nx
from mu_network_models import TABLE, P, W, D, WD, DP, PLACE_DEITIES, DEITY_WISH, PLACE_WISH, ppr_with_seeds, direct_two_hop_scores

ROOT=Path(__file__).resolve().parent
ST={r['station_id']:r for r in TABLE['stations']}
allowed_stations={s for s,info in ST.items() if info['system'] in {'BTS','MRT'}}
allowed_modes={'walk','skywalk'}
G=nx.Graph();G.add_nodes_from(allowed_stations)
for r in TABLE['transit_edges']:
 a,b=r['from_station_id'],r['to_station_id']
 if a not in allowed_stations or b not in allowed_stations:continue
 t=float(r['time_min']);
 if t<=0:continue
 if not G.has_edge(a,b) or G[a][b]['weight']>t:G.add_edge(a,b,weight=t,kind=r['edge_type'],line=r['line'])
origin='CEN'
reachable=nx.node_connected_component(G,origin)
ACCESS=collections.defaultdict(list)
for row in TABLE['place_station']:
 p,s=row['place_id'],row['station_id']
 if row['access_mode'] not in allowed_modes or s not in reachable:continue
 ACCESS[p].append({'station':s,'access_min':float(row.get('access_min') or 0),'access_mode':row['access_mode'],
    'quality':row['quality_flags'],'walk_m':row.get('walk_m')})
for p in ACCESS:ACCESS[p].sort(key=lambda v:(v['access_min'],v['station']))
TRANSIT={s:nx.single_source_dijkstra_path_length(G,s,weight='weight') for s in reachable}

def leg(from_p,to_p):
 """Travel from last venue to next venue; no non-rail modes.
 Travel via station access estimates. Direct venue-to-venue walking links absent.
 """
 from_stations=([{'station':origin,'access_min':0}] if from_p is None else ACCESS[from_p])
 possibles=[]
 for a in from_stations:
  for b in ACCESS[to_p]:
   rail=TRANSIT[a['station']].get(b['station'])
   if rail is None:continue
   boarding=5. if rail>0 else 0.
   total=a['access_min']+rail+b['access_min']+boarding
   possibles.append((total,a['access_min']+b['access_min'],rail,boarding,a['station'],b['station']))
 return min(possibles) if possibles else None

def mins(v):
 try:
  a,b=str(v).split(':');return 60*int(a)+int(b)
 except:return None

def hhmm(v):
 m=int(round(v));return f'{m//60:02d}:{m%60:02d}'

LIMITS={
 'start_station_id':'CEN', 'start_station':'สยาม', 'start_min':9*60,
 'max_end_min':15*60, 'max_total_minutes':360, 'stops':4,
 'site_dwell_min':25, 'on_site_group_buffer_min':5,
 'group_briefing_min':15, 'midday_break_min':30,
 'max_station_walk_min':75, 'max_rail_and_access_min':185,
 'boarding_wait_assumed_min':5,'end_at_nearest_station':True,
 'allowed_station_systems':['BTS','MRT'],'allowed_access_modes':['walk','skywalk'],
 'access_exclusions':'No bus, boat, taxi, motorbike taxi, SRT, ARL or mixed/feeder access links',
 'caveat':'Track times estimated; station-to-venue access estimated/unverified; venue real coords missing; many hours synthetic'
}

def itinerary(order):
 """Station arrival 09:00, group briefing then rail + foot. End at station after stop 4.
 Stop start obeys demo opening window. 30-minute rest after second stop.
 """
 if len(order)!=4 or len(set(order))!=4:return None
 clock=LIMITS['start_min']+LIMITS['group_briefing_min'];prev=None
 details=[];tot_rail=tot_walk=tot_board=tot_wait=0.;legs=[]
 for i,pid in enumerate(order):
  if pid not in ACCESS:return None
  l=leg(prev,pid)
  if l is None:return None
  total,walk,rail,boarding,from_station,to_station=l
  arrival=clock+total
  op,cl=mins(P[pid]['demo_open']),mins(P[pid]['demo_close'])
  if op is None or cl is None:return None
  if cl<=op or op<0 or cl>24*60:return None
  service_start=max(arrival,op)
  finish=service_start+LIMITS['site_dwell_min']
  if finish>cl:return None
  wait=service_start-arrival;tot_wait+=wait;tot_rail+=rail;tot_walk+=walk;tot_board+=boarding
  details.append({'order':i+1,'place_id':pid,'name':P[pid]['place_name'],'arrival_clock':hhmm(arrival),
   'start_clock':hhmm(service_start),'finish_clock':hhmm(finish),
   'venue_hours_origin':P[pid]['hours_origin'],'station_id':to_station,'station_name':ST[to_station]['name_th'],
   'entry_access_mode':next((x['access_mode'] for x in ACCESS[pid] if x['station']==to_station),''),
   'approximate_leg_total_min':round(total,1),'wait_open_min':round(wait,1)})
  station_path=nx.shortest_path(G,from_station,to_station,weight='weight')
  legs.append({'from':from_station,'to':to_station,'rail_min_est':round(rail,1),'access_walk_min_est':round(walk,1), 'boarding_wait_assumption_min':boarding,
    'station_path':station_path,'transfer_count_in_data':sum(G[station_path[k]][station_path[k+1]].get('kind')=='transfer' for k in range(len(station_path)-1))})
  clock=finish+LIMITS['on_site_group_buffer_min']
  if i==1:clock+=LIMITS['midday_break_min']
  prev=pid
 # return to a nearest walking-connected rail station (tour ends there)
 post=min(ACCESS[prev],key=lambda x:(x['access_min'],x['station']))
 clock+=post['access_min'];tot_walk+=post['access_min']
 if clock>LIMITS['max_end_min'] or clock-LIMITS['start_min']>LIMITS['max_total_minutes']:return None
 if tot_walk>LIMITS['max_station_walk_min']:return None
 if tot_rail+tot_walk+tot_board>LIMITS['max_rail_and_access_min']:return None
 return {'place_ids':list(order),'stops':details,'legs':legs,'last_station_id':post['station'],
  'last_station_name':ST[post['station']]['name_th'],'finish_clock':hhmm(clock),
  'duration_min':round(clock-LIMITS['start_min'],1), 'rail_min_est':round(tot_rail,1),
  'station_walk_min_est':round(tot_walk,1),'train_wait_min_assumed':round(tot_board,1),
  'opening_wait_min':round(tot_wait,1),'group_briefing_min':15,'midday_break_min':30,
  'dwell_and_group_buffer_min':120,'source_data_quality':sorted(set(P[p]['hours_origin'] for p in order))}

THEMES=[
 {'trip_id':'TRIP_LOVE','theme':'Love & Blessings','wish_weights':{'W01':.8,'W03':.2}},
 {'trip_id':'TRIP_CAREER','theme':'Career & Success','wish_weights':{'W02':.7,'W04':.25,'W05':.05}},
 {'trip_id':'TRIP_WEALTH','theme':'Wealth & Protection','wish_weights':{'W03':.65,'W06':.25,'W08':.10}},
]
# Score is an explicit product preference, NOT fitted and not evidence of real-world outcomes.
OBJECTIVE={'ppr_mean':.45,'theme_wish_coverage':.30,'journey_efficiency':.15,'deity_diversity':.10}

def rank_and_profile(theme):
 weights=theme['wish_weights'];seed={'W:'+w:v for w,v in weights.items()}
 ppr,_=ppr_with_seeds(seed)
 eligible=sorted(ACCESS)
 mx=max(ppr[p] for p in eligible)
 normalized={p:ppr[p]/mx if mx else 0 for p in eligible}
 primary=max(weights,key=weights.get)
 def connected_deities(p):return set(d for d in PLACE_DEITIES[p] if DEITY_WISH[d]&weights.keys())
 def pcover(p):return set(PLACE_WISH[p])&set(weights)
 def score(route):
  ids=route['place_ids'];cover=set().union(*(pcover(p) for p in ids))
  cov=sum(weights[w] for w in cover)
  theme_deities=set().union(*(connected_deities(p) for p in ids))
  avg=sum(normalized[p] for p in ids)/len(ids)
  transit=route['rail_min_est']+route['station_walk_min_est']+route['train_wait_min_assumed']
  eff=max(0,1-transit/185)
  dd=min(len(theme_deities),8)/8
  total=100*(.45*avg+.30*cov+.15*eff+.10*dd)
  return {'objective_score':round(total,5),'ppr_mean_norm':round(avg,5),'wish_coverage_weighted':round(cov,5),
   'travel_efficiency_norm':round(eff,5),'deity_diversity_norm':round(dd,5),
   'covered_wish_ids':sorted(cover),'theme_deity_count':len(theme_deities),
   'main_wish_relevant_places':sum(primary in pcover(p) for p in ids)}
 # candidate universe: first 11 PPR, first 5 two-hop + original signature 4; capped at 15 by PPR.
 original=[r['place_id'] for r in sorted(TABLE['trips'],key=lambda x:int(x['stop_sequence'])) if r['trip_id']==theme['trip_id']]
 direct=direct_two_hop_scores(weights)
 pp=sorted(eligible,key=lambda pid:(-ppr[pid],pid));dd=sorted(eligible,key=lambda pid:(-direct[pid],pid))
 pool=list(dict.fromkeys(pp[:12]+dd[:6]+[p for p in original if p in ACCESS]))
 pool=sorted(pool,key=lambda p:(-ppr[p],p))[:15]
 # do not accidentally drop original trip identity on candidate restriction
 for p in original:
  if p in ACCESS and p not in pool:
   pool[-1]=p;pool=list(dict.fromkeys(pool))
 pool=sorted(pool,key=lambda x:(-ppr[x],x))
 best_by_set={};feasible_permutations=0;checked=0
 for perm in itertools.permutations(pool,4):
  checked+=1
  if sum(primary in pcover(p) for p in perm)<2:continue
  route=itinerary(perm)
  if route is None:continue
  feasible_permutations+=1
  eval=score(route)
  key=tuple(sorted(perm));val=(eval['objective_score'],route,eval)
  if key not in best_by_set or val[0]>best_by_set[key][0]:best_by_set[key]=val
 candidates=sorted(best_by_set.values(),key=lambda v:(-v[0],v[1]['duration_min'],v[1]['place_ids']))
 # baseline for same constraints: direct two-hop choose top 4 then shortest possible permutation
 baseline_set=dd[:4]
 baselines=[itinerary(perm) for perm in itertools.permutations(baseline_set,4)]
 baselines=[r for r in baselines if r]
 baseline=min(baselines,key=lambda r:(r['rail_min_est']+r['station_walk_min_est']+r['train_wait_min_assumed'],r['duration_min'])) if baselines else None
 baseline_score=score(baseline) if baseline else None
 template_route=itinerary(original);template_score=score(template_route) if template_route else None
 return {'trip_id':theme['trip_id'],'theme':theme['theme'],'wish_weights':weights,
  'candidate_pool':pool,'candidate_places':len(pool),'permutations_checked':checked,
  'feasible_permutations':feasible_permutations,'unique_feasible_sets':len(candidates),
  'initial_template':{'route':template_route,'metrics':template_score},
  'direct_match_baseline':{'route':baseline,'metrics':baseline_score},
  'top_routes':[{'route':r,'metrics':e} for _,r,e in candidates[:350]],
  'available_any':len(candidates)>0}


def select_company_portfolio(profiles):
 """Select three distinct signature products; no duplicated venue across themes."""
 a,b,c=[p['top_routes'][:350] for p in profiles]
 best=None; checked=0
 for r1 in a:
  p1=set(r1['route']['place_ids']);s1=r1['metrics']['objective_score']
  for r2 in b:
   p2=set(r2['route']['place_ids']);
   if p1 & p2:continue
   # c is pre-sorted by objective; first nonoverlap is optimal for this r1/r2 pair
   for r3 in c:
    checked+=1
    if (p1 | p2)&set(r3['route']['place_ids']):continue
    score=s1+r2['metrics']['objective_score']+r3['metrics']['objective_score']
    if best is None or score>best[0]:best=(score,[r1,r2,r3])
    break
 if best:return [{'trip_id':p['trip_id'],'theme':p['theme'],**route} for p,route in zip(profiles,best[1])],0,'NO_OVERLAP',checked
 return [],None,'NO_FEASIBLE_NONOVERLAP_PORTFOLIO_IN_SHORTLIST',checked


def main():
 profiles=[rank_and_profile(t) for t in THEMES]
 recommended,overlap,mode,combos=select_company_portfolio(profiles)
 out={'version':'OFFLINE_SIGNATURE_V1_2026-11-21','source':'MU_Journey_Network_Demo_Data_v2.json',
  'status':'SIMULATION_DESIGN_NOT_OPERATIONAL_ROUTE','business_constraints':LIMITS,
  'themes':THEMES,'objective_weights':OBJECTIVE,
  'transit_graph':{'eligible_BTS_MRT_stations':len(allowed_stations),'rail_edges':G.number_of_edges(),
   'connected_component_sizes':sorted((len(s) for s in nx.connected_components(G)),reverse=True),
   'eligible_places_with_rail_walk_access':len(ACCESS),'excluded_places':[p for p in P if p not in ACCESS]},
  'model':'Weighted Wish -> Meta-path -> degree corrected PPR + exact-route candidate permutation search constrained by BTS/MRT and walk/skywalk only; joint three-tour no-overlap portfolio selection on top candidate sets.',
  'per_theme_search':[{k:v for k,v in p.items() if k!='top_routes'} for p in profiles],
  'company_trips':recommended,'company_overlap_count':overlap,'portfolio_mode':mode,'portfolio_evaluated_combinations':combos,
  'limitations':[
   'This is an OFFLINE company package construction calculation, not an on-demand personalized itinerary.',
   'Opening hours unverified and in part synthetic: routes are NOT actual visitation itineraries.',
   'Station-to-venue walking/access times are source candidates and some missing walk distances.',
   'Rail network travel times are OSM-derived estimates, not operator journey times; transfer and board waiting estimated.',
   'Direct walking between venues is not in source graph: station-mediated route may overestimate travel within an area.',
   'CEN = BTS Siam chosen as common assumed group meeting point, not a confirmed business decision.',
   'Route optimizer searches restricted candidate pools (max 15), exact within this pool only; not a provable global optimum.',
   'Candidate belief claims not official religious endorsements or proof of outcomes.',
   'Business prices, group capacity, operating days, guide, booking and permission still require validation.'
  ]}
 dest=ROOT/'MU_Journey_Signature_Trip_Design_v1.json'
 dest.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
 print('FILE',dest,'TRIPS',len(recommended),'TRANSIT',out['transit_graph'])
 for p in profiles:
  print('THEME',p['trip_id'],'POOL',len(p['candidate_pool']),'EXACT',p['permutations_checked'],'FEASIBLE',p['feasible_permutations'],'TOP',p['unique_feasible_sets'])
  t=p['initial_template'];bl=p['direct_match_baseline'];
  print('  TEMPLATE',t['route'] and t['route']['place_ids'],t['metrics'] and t['metrics']['objective_score'])
  print('  BASELINE',bl['route'] and bl['route']['place_ids'],bl['metrics'] and bl['metrics']['objective_score'])
 for t in recommended:
  r=t['route'];print('CHOSEN',t['trip_id'],r['place_ids'],'SCORE',t['metrics']['objective_score'],'DURATION',r['duration_min'],'TRAVEL',r['rail_min_est'],r['station_walk_min_est'],r['finish_clock'],'COVERAGE',t['metrics']['covered_wish_ids'])
 print('PORTFOLIO',mode,'OVERLAPS',overlap)
if __name__=='__main__':main()
