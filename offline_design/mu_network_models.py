"""MU Journey | Network Models & Evaluation — reproducible academic demo.

Reads MU_Journey_Network_Demo_Data_v2.json exported from the user's Drive GOLD v2.
All data labeled SYNTHETIC remains synthetic; source BELIEF_CLAIM_* edges are claims,
not validated religious truths or evidence of wish fulfilment.

Models:
  * Heterogeneous graph EDA (knowledge vs operational networks)
  * Personalized PageRank on Wish-Deity-Place (degree-aware scoring)
  * Direct two-hop and degree-popularity baselines
  * Time-ordered mock feedback holdout for next visited place
  * Station-network shortest path + exact small-scale Orienteering with time windows
  * Provider/Offer graph matching under simulated budget constraints
  * Structural edge holdout for graph link recovery (fixed random splits)
"""
import json, math, random, heapq, itertools, statistics
from collections import Counter, defaultdict
from pathlib import Path
import networkx as nx

BASE=Path(__file__).resolve().parent
DATA_FILE=BASE/'MU_Journey_Network_Demo_Data_v2.json'
OUT=BASE/'MU_Journey_Network_Model_Results_v1.json'
TABLE=json.loads(DATA_FILE.read_text(encoding='utf-8'))['tables']
P={x['place_id']:x for x in TABLE['places']}
D={x['deity_id']:x for x in TABLE['deities']}
W={x['wish_id']:x for x in TABLE['wishes']}
U={x['user_id']:x for x in TABLE['users']}
T={x['trip_id'] for x in TABLE['trips']}
O={x['offer_id']:x for x in TABLE['offers']}
PROV={x['provider_id']:x for x in TABLE['providers']}
ORDER={x['order_id']:x for x in TABLE['orders']}
WD=TABLE['wish_deity'];DP=TABLE['deity_place']
DEITY_WISH=defaultdict(set); PLACE_DEITIES=defaultdict(set); PLACE_WISH=defaultdict(set)
for e in WD: DEITY_WISH[e['deity_id']].add(e['wish_id'])
for e in DP: PLACE_DEITIES[e['place_id']].add(e['deity_id'])
for pid in P:
 for d in PLACE_DEITIES[pid]: PLACE_WISH[pid].update(DEITY_WISH[d])


def validate_inputs():
 checks={}; bad={}
 def unique(name,key):
  a=TABLE[name];checks[f'{name}_unique']=(len(a)==len({r[key] for r in a}));bad[f'{name}_dup']=len(a)-len({r[key] for r in a})
 for name,key in [('places','place_id'),('deities','deity_id'),('wishes','wish_id'),('users','user_id'),('offers','offer_id'),('providers','provider_id'),('orders','order_id'),('proxy_feedback','proxy_feedback_id'),('events','event_id')]:unique(name,key)
 def missing(name,table_name,fn):bad[name]=sum(not fn(r) for r in TABLE[table_name]);checks[name]=bad[name]==0
 missing('wish_deity_FK','wish_deity',lambda r:r['wish_id'] in W and r['deity_id'] in D)
 missing('deity_place_FK','deity_place',lambda r:r['deity_id'] in D and r['place_id'] in P)
 missing('provider_FK','providers',lambda r:r['provider_id'] in PROV)
 missing('offer_FK','offers',lambda r:r['provider_id'] in PROV and r['wish_id'] in W and r['place_id'] in P)
 missing('offer_wish_place_metapath','offers',lambda r:r['wish_id'] in PLACE_WISH[r['place_id']])
 missing('order_FK','orders',lambda r:r['user_id'] in U and r['provider_id'] in PROV and r['offer_id'] in O and r['place_id'] in P and r['wish_id'] in W)
 missing('order_matching_offer','orders',lambda r:r['provider_id']==O[r['offer_id']]['provider_id'] and r['place_id']==O[r['offer_id']]['place_id'] and r['wish_id']==O[r['offer_id']]['wish_id'])
 missing('order_budget','orders',lambda r: float(r['total_thb'])<=float(U[r['user_id']]['budget_thb']))
 missing('proxy_feedback_completed','proxy_feedback',lambda r: r['order_id'] in ORDER and ORDER[r['order_id']]['order_status']=='COMPLETED' and r['feedback_date']>=ORDER[r['order_id']]['completed_date'])
 missing('trip_stop_FK','trips',lambda r:r['place_id'] in P)
 missing('user_feedback_FK','feedback',lambda r:r['user_id'] in U and r['trip_id'] in T and (not r.get('visited_place_id') or r['visited_place_id'] in P))
 missing('calendar_FK','events',lambda r:r['wish_id'] in W)
 return {'all_structural_checks_pass':all(checks.values()),'checks':checks,'issues':{k:v for k,v in bad.items() if v},'counts':{k:len(v) for k,v in TABLE.items()}}


def make_knowledge_graph(remove_dp=None):
 G=nx.Graph()
 for k in W:G.add_node('W:'+k,kind='WISH')
 for k in D:G.add_node('D:'+k,kind='DEITY')
 for k in P:G.add_node('P:'+k,kind='PLACE')
 for e in WD:G.add_edge('W:'+e['wish_id'],'D:'+e['deity_id'],kind='BELIEF_CLAIM',weight=1.)
 for e in DP:
  if remove_dp and (e['deity_id'],e['place_id']) in remove_dp:continue
  G.add_edge('D:'+e['deity_id'],'P:'+e['place_id'],kind='SOURCE_CANDIDATE',weight=1.)
 return G
G=make_knowledge_graph()


def make_full_graph():
 H=nx.MultiDiGraph()
 def node(t,k,**attrs):H.add_node(f'{t}:{k}',type=t,**attrs)
 def edge(t1,id1,t2,id2,rel,**attrs):H.add_edge(f'{t1}:{id1}',f'{t2}:{id2}',key=rel,type=rel,**attrs)
 for id in W:node('Wish',id,origin='SOURCE_CANDIDATE')
 for id in D:node('Deity',id,origin='SOURCE_CANDIDATE')
 for id in P:node('Place',id,origin='SOURCE_CANDIDATE')
 for e in WD:edge('Wish',e['wish_id'],'Deity',e['deity_id'],'BELIEVED_FOR',origin='BELIEF_CLAIM_UNVERIFIED')
 for e in DP:edge('Deity',e['deity_id'],'Place',e['place_id'],'REPORTED_AT',origin=e['relationship_status'])
 for e in TABLE['stations']:node('Station',e['station_id'],origin='SOURCE')
 for e in TABLE['transit_edges']:edge('Station',e['from_station_id'],'Station',e['to_station_id'],'TRANSIT_LINK',origin='ESTIMATED_TRAVEL_TIME',time_min=e['time_min'])
 for e in TABLE['place_station']:edge('Place',e['place_id'],'Station',e['station_id'],'ACCESSED_FROM',origin='SOURCE_CANDIDATE')
 for id in T:node('Trip',id,origin='SYNTHETIC_TEMPLATE')
 for e in TABLE['trips']:edge('Trip',e['trip_id'],'Place',e['place_id'],'STOPS_AT',origin='SYNTHETIC_TEMPLATE')
 for id in U:node('User',id,origin='SYNTHETIC')
 for r in U.values():
  for j,c in enumerate(['wish_primary','wish_secondary']):
   if r[c] in W:edge('User',r['user_id'],'Wish',r[c],'INTERESTED_IN',origin='SYNTHETIC',strength=1. if j==0 else .25)
 for row in TABLE['birth_belief']:
  b='BF:'+row['raw_id'];H.add_node(b,type='BirthClaim',origin='CLAIM');
  did=row.get('resolved_deity_id_candidate')
  if did in D:H.add_edge(b,'Deity:'+did,key='CLAIMS_LINK',type='CLAIMS_LINK',origin='BELIEF_CLAIM')
 for e in TABLE['events']:
  node('Event',e['event_id'],origin='SYNTHETIC');edge('Event',e['event_id'],'Wish',e['wish_id'],'TRIGGERS',origin='SYNTHETIC')
 for e in TABLE['event_follows']:edge('User',e['user_id'],'Event',e['event_id'],'FOLLOWS',origin='SYNTHETIC')
 for e in TABLE['feedback']:
  node('TripFeedback',e['feedback_id'],origin='SYNTHETIC',event_date=e['event_date'])
  edge('User',e['user_id'],'TripFeedback',e['feedback_id'],'REPORTED_FEEDBACK',origin='SYNTHETIC')
  edge('TripFeedback',e['feedback_id'],'Trip',e['trip_id'],'ABOUT_TRIP',origin='SYNTHETIC')
  if e.get('visited_place_id'):edge('User',e['user_id'],'Place',e['visited_place_id'],'VISITED',origin='SYNTHETIC',event_date=e['event_date'])
 for e in TABLE['providers']:node('Provider',e['provider_id'],origin='SYNTHETIC')
 for e in TABLE['offers']:
  node('Offer',e['offer_id'],origin='SYNTHETIC');edge('Provider',e['provider_id'],'Offer',e['offer_id'],'PROVIDES',origin='SYNTHETIC');edge('Offer',e['offer_id'],'Place',e['place_id'],'SERVES_PLACE',origin='SYNTHETIC');edge('Offer',e['offer_id'],'Wish',e['wish_id'],'SERVES_WISH',origin='SYNTHETIC')
 for e in TABLE['orders']:
  node('ProxyOrder',e['order_id'],origin='SYNTHETIC',status=e['order_status']);edge('User',e['user_id'],'ProxyOrder',e['order_id'],'PLACED',origin='SYNTHETIC');edge('ProxyOrder',e['order_id'],'Offer',e['offer_id'],'BOOKED_OFFER',origin='SYNTHETIC')
 for e in TABLE['proxy_feedback']:
  node('ProxyFeedback',e['proxy_feedback_id'],origin='SYNTHETIC');edge('ProxyOrder',e['order_id'],'ProxyFeedback',e['proxy_feedback_id'],'HAS_REVIEW',origin='SYNTHETIC')
 return H
H=make_full_graph()


def graph_eda():
 components=sorted((len(x) for x in nx.connected_components(G)),reverse=True)
 deg=sorted(G.degree(),key=lambda kv:kv[1],reverse=True)
 place_hubs=sorted(((id,int(G.degree('P:'+id))) for id in P),key=lambda x:(-x[1],x[0]))[:8]
 comm=list(nx.community.greedy_modularity_communities(G))
 return {'knowledge_nodes':G.number_of_nodes(),'knowledge_edges':G.number_of_edges(),
  'knowledge_components':len(components),'component_sizes':components,'isolates':nx.number_of_isolates(G),
  'largest_component_pct':round(100*components[0]/G.number_of_nodes(),1),
  'knowledge_density':round(nx.density(G),5),'top_degree_nodes':deg[:10],
  'top_place_hubs':place_hubs,'communities':len(comm),
  'modularity':round(nx.community.modularity(G,comm),4),
  'full_network_nodes':H.number_of_nodes(),'full_network_edges':H.number_of_edges(),
  'full_node_type_counts':dict(Counter(d['type'] for n,d in H.nodes(data=True))),
  'full_edge_type_counts':dict(Counter(d['type'] for a,b,k,d in H.edges(keys=True,data=True))) }


def ppr_with_seeds(seed,graph=G,degree_correction=.5):
 src={n:float(w) for n,w in seed.items() if n in graph and float(w)>0}
 if not src:raise ValueError('Missing valid graph seeds')
 total=sum(src.values());norm={k:v/total for k,v in src.items()}
 v={n:norm.get(n,0.) for n in graph.nodes}
 scores=nx.pagerank(graph,alpha=.85,personalization=v,weight='weight',tol=1e-10,max_iter=1000)
 place={p:float(scores['P:'+p])/(graph.degree('P:'+p)+1)**degree_correction for p in P}
 return place,scores


def user_seeds(user,primary_override=None,include_birth=True):
 p=primary_override or user['wish_primary'];sec=user['wish_secondary'];weights=defaultdict(float)
 if p in W:weights['W:'+p]+=.8
 if sec in W:weights['W:'+sec]+=.2
 if include_birth:
  birth_matches=[b for b in TABLE['birth_belief']
   if b.get('birth_dimension')=='weekday' and b.get('birth_value')==user['weekday'] and b.get('resolved_deity_id_candidate') in D]
  # Use only one explicit belief source system; birth weights are scenario assumptions, not fact.
  system_order=sorted({b['belief_system'] for b in birth_matches})
  if system_order:
   sys=system_order[0]
   for b in birth_matches:
    if b['belief_system']==sys:weights['D:'+b['resolved_deity_id_candidate']]+=.10
 return dict(weights)


def rank_places(score_map,excluded=None):
 excluded=set(excluded or ())
 return sorted([p for p in P if p not in excluded],key=lambda p:(-score_map.get(p,0.),p))


def direct_two_hop_scores(wish_weight):
 scores=defaultdict(float)
 for place,ds in PLACE_DEITIES.items():
  for d in ds:
   for w in DEITY_WISH[d]:scores[place]+=wish_weight.get(w,0.)
 return {p:float(scores[p]) for p in P}


def popularity_scores():return {p:float(G.degree('P:'+p)) for p in P}


def scores_for_user(u,primary_override=None):
 ws={u['wish_primary']:.8,u['wish_secondary']:.2}
 if primary_override:
  ws={primary_override:.8,u['wish_secondary']:.2}
 ppr,_=ppr_with_seeds(user_seeds(u,primary_override=primary_override))
 return ppr,direct_two_hop_scores(ws),popularity_scores()


def rank_examples():
 examples=[]
 for uid in ['U_DEMO_001','U_DEMO_002','U_DEMO_003','U_DEMO_010']:
  u=U[uid];ps,ds,po=scores_for_user(u)
  ranked=rank_places(ps)
  rec=[]
  for pid in ranked[:5]:
   evidence=[]
   for w in [u['wish_primary'],u['wish_secondary']]:
    for d in sorted(PLACE_DEITIES[pid]):
     if w in DEITY_WISH[d]:evidence.append(f'{W[w]["wish_th"]} → {D[d]["name_th"]} → {P[pid]["place_name"]}')
   rec.append({'place_id':pid,'place_name':P[pid]['place_name'],'ppr_score':round(ps[pid],8),'explanation_paths':evidence[:3],
               'hours_origin':P[pid]['hours_origin'],'routing_status':P[pid]['routing_status']})
  examples.append({'user_id':uid,'primary_wish':u['wish_primary'],'secondary_wish':u['wish_secondary'],
                   'top5_ppr':rec,'top5_direct':rank_places(ds)[:5],'top5_degree':rank_places(po)[:5]})
 return examples


def recall_metrics(ranked,relevant,k=5):
 rel=set(relevant)
 hits=[p for p in ranked[:k] if p in rel]
 pos=next((i+1 for i,p in enumerate(ranked[:k]) if p in rel),None)
 return {'hit5':float(bool(hits)),'ndcg5':1./math.log2(pos+1) if pos else 0.,'reciprocal_rank5':1./pos if pos else 0.}


def temporal_evaluation():
 by_user=defaultdict(list)
 for fb in TABLE['feedback']:by_user[fb['user_id']].append(fb)
 metrics=defaultdict(list);detail=[]
 for uid,feedback in by_user.items():
  u=U[uid]
  past=sorted([f for f in feedback if f['event_date']<'2026-11-01'],key=lambda x:x['event_date'])
  future=[f for f in feedback if f['event_date'].startswith('2026-11') and f['participation_status']=='VISITED' and f.get('visited_place_id')]
  if not past or not future:continue
  truth=future[0]['visited_place_id']
  visited={f['visited_place_id'] for f in past if f['participation_status']=='VISITED' and f.get('visited_place_id')}
  next_goal=past[-1]['next_wish_id'] if past[-1].get('next_wish_id') in W else u['wish_primary']
  pp0,dd0,degree=scores_for_user(u)
  pp1,dd1,_=scores_for_user(u,primary_override=next_goal)
  # If the explicitly recorded preference is not to repeat, suppress visited places;
  # suppression is a hard business constraint, NOT PPR learning.
  suppress=visited if past[-1]['repeat_preference']=='NO_REPEAT_SOON' else set()
  variants={
    'degree_popularity':rank_places(degree),
    'two_hop_static':rank_places(dd0),
    'ppr_static':rank_places(pp0),
    'two_hop_feedback':rank_places(dd1,suppress),
    'ppr_feedback':rank_places(pp1,suppress),
  }
  for name,rank in variants.items():metrics[name].append(recall_metrics(rank,{truth}))
  if uid in {'U_DEMO_001','U_DEMO_002','U_DEMO_003'}:
   detail.append({'user_id':uid,'held_out_month':'2026-11','true_visited_place':truth,'feedback_derived_primary_wish':next_goal,'past_visited':sorted(visited),
                  'suppress_repeats':bool(suppress),'rank_lists':{k:v[:5] for k,v in variants.items()}})
 agg={k:{m:round(statistics.mean(x[m] for x in arr),4) for m in ['hit5','ndcg5','reciprocal_rank5']}|{'n':len(arr)} for k,arr in metrics.items()}
 return {'definition':'Held out NOV 2026 next VISITED place. Only SEPT/OCT feedback available for adaptive models. Synthetic outcomes generated by mock fixture, NOT genuine user preference labels.',
         'evaluated_user_count':len(next(iter(metrics.values()))) if metrics else 0,
         'by_model':agg,'examples':detail}


def structural_holdout(trials=8,seed=7202):
 rnd=random.Random(seed);edges=[(e['deity_id'],e['place_id']) for e in DP]
 baseG=make_knowledge_graph();results=defaultdict(list);details=[]
 eligible=[e for e in edges if baseG.degree('D:'+e[0])>=2 and baseG.degree('P:'+e[1])>=2]
 for t in range(trials):
  candidate=eligible[:];rnd.shuffle(candidate)
  withheld=set()
  for d,p in candidate:
   if len(withheld)>=min(10,len(eligible)//3):break
   if baseG.degree('D:'+d)-sum(x[0]==d for x in withheld)>1 and baseG.degree('P:'+p)-sum(x[1]==p for x in withheld)>1:
    withheld.add((d,p))
  small=make_knowledge_graph(withheld)
  for d,p in withheld:
   scores,pprraw=ppr_with_seeds({'D:'+d:1.},graph=small,degree_correction=.5)
   # All degree correction is computed on the TRAIN graph, not the withheld links.
   neighbors={x[2:] for x in small.neighbors('D:'+d) if x.startswith('P:')}
   ranked=rank_places(scores,neighbors)
   degree_train={x:float(small.degree('P:'+x)) for x in P}
   baseline=rank_places(degree_train,neighbors)
   for model,rank in [('ppr_holdout',ranked),('place_degree_holdout',baseline)]:
    results[model].append(recall_metrics(rank,{p}))
   if t==0 and len(details)<5:details.append({'deity_id':d,'hidden_place_id':p,'ppr_rank':(ranked.index(p)+1),'degree_rank':(baseline.index(p)+1)})
 agg={k:{m:round(statistics.mean(x[m] for x in v),4) for m in ['hit5','ndcg5','reciprocal_rank5']}|{'n':len(v)} for k,v in results.items()}
 return {'evaluated_deity_place_edge_samples':len(results['ppr_holdout']),'eligible_edges':len(eligible),
  'method':'Repeated random withholding of deity-to-place edges; degree constraints keep endpoints connected. Evaluation ranks unseen places only. Synthetic-free topology test, but source relations are unverified candidate claims.',
  'by_model':agg,'examples':details}


# Station routing / small-scale orienteering
SG=nx.Graph(); ST={r['station_id']:r for r in TABLE['stations']}
for sid in ST:SG.add_node(sid)
for e in TABLE['transit_edges']:
 try:minutes=float(e['time_min'])
 except:continue
 if minutes<=0:continue
 a=e['from_station_id'];b=e['to_station_id']
 if a not in ST or b not in ST:continue
 # Source lists a network link once. Both directions are a DEMO assumption.
 if SG.has_edge(a,b):SG[a][b]['weight']=min(minutes,SG[a][b]['weight'])
 else:SG.add_edge(a,b,weight=minutes)
access=defaultdict(list)
for r in TABLE['place_station']:
 if r['station_id'] not in ST or r['place_id'] not in P:continue
 try:m=float(r['access_min'])
 except:(m:=0.)
 access[r['place_id']].append((r['station_id'],max(0.,m)))
# Some station connections are by bus/taxi; the demo uses the given access estimate as a generic connector.
# Do not present travel estimates as physical walking-only routing.
for k in access:access[k].sort(key=lambda pair:pair[1])
STATION_DIST={s:nx.single_source_dijkstra_path_length(SG,s,weight='weight') for s in SG}


def origin_to_place(origin,pid):
 opts=[(STATION_DIST[origin][station]+m,station,m) for station,m in access.get(pid,[]) if origin in STATION_DIST and station in STATION_DIST[origin]]
 return min(opts,key=lambda x:x[0]) if opts else None


def place_to_place(a,b):
 opts=[]
 for sa,ma in access.get(a,[]):
  for sb,mb in access.get(b,[]):
   if sb in STATION_DIST.get(sa,{}):opts.append((ma+STATION_DIST[sa][sb]+mb,sa,sb,ma,mb))
 return min(opts,key=lambda x:x[0]) if opts else None


def minutes(x):
 if x is None:return None
 parts=str(x).split(':')
 if len(parts)!=2:return None
 return int(parts[0])*60+int(parts[1])


def itinerary(order,origin='S2',start_at=9*60,dwell=25,deadline=17*60,budget_min=420):
 current=start_at;prev=None;legs=[];travel=0.;waiting=0.;stop_details=[]
 for pid in order:
  if prev is None:
   conn=origin_to_place(origin,pid)
   if not conn:return None
   journey=conn[0];leg={'from_station':origin,'to_place':pid,'travel_min':round(journey,2)}
  else:
   conn=place_to_place(prev,pid)
   if not conn:return None
   journey=conn[0];leg={'from_place':prev,'to_place':pid,'travel_min':round(journey,2)}
  arrive=current+journey;opening=minutes(P[pid]['demo_open']);closing=minutes(P[pid]['demo_close'])
  if opening is None or closing is None:return None
  start=max(arrive,opening);finish=start+dwell
  if finish>closing or finish>deadline or finish-start_at>budget_min:return None
  travel+=journey;waiting+=start-arrive
  stop_details.append({'place_id':pid,'arrival_min_from_midnight':round(arrive,1),
                       'service_start_clock':f'{int(start//60):02d}:{int(start%60):02d}',
                       'service_finish_clock':f'{int(finish//60):02d}:{int(finish%60):02d}',
                       'hours_origin':P[pid]['hours_origin']})
  legs.append(leg);current=finish;prev=pid
 return {'route':list(order),'travel_min':round(travel,2),'waiting_min':round(waiting,2),
         'duration_min':round(current-start_at,2),'stops':stop_details,'legs':legs,
         'finish_clock':f'{int(current//60):02d}:{int(current%60):02d}'}


def route_optimization():
 outputs=[]
 GROUPS=[('LOVE','Love & Blessings',['W01','W03']),('CAREER','Career & Success',['W02','W04','W05']),('WEALTH','Wealth & Protection',['W03','W06','W08'])]
 template_map=defaultdict(list)
 for row in sorted(TABLE['trips'],key=lambda x:int(x['stop_sequence'])):
  template_map[row['trip_id']].append(row['place_id'])
 for code,title,wishes in GROUPS:
  original=template_map['TRIP_'+code];origin=P[original[0]]['routing_station_id']
  template=itinerary(original,origin=origin)
  # Same 4 places: exact 4! permutations, respecting demo time windows.
  same_candidates=[itinerary(perm,origin=origin) for perm in itertools.permutations(original,4)]
  same_candidates=[c for c in same_candidates if c]
  same_best=min(same_candidates,key=lambda c:(c['travel_min'],c['duration_min'])) if same_candidates else None
  seed={'W:'+w:1.0 for w in wishes}
  rank,_=ppr_with_seeds(seed)
  candidate_pool=list(dict.fromkeys([p for p in rank_places(rank) if p in access][:10]+original))
  candidate_pool=list(dict.fromkeys([p for p in candidate_pool if p in access]))[:14]
  maxscore=max(rank.values()) or 1.0
  best=None;checked=0;feasible=0
  for perm in itertools.permutations(candidate_pool,4):
   checked+=1
   # Preserve recognizable Signature Trip identity; exactly this constraint is a product rule.
   if len(set(perm)&set(original))<2:continue
   covered=set().union(*(PLACE_WISH[x] for x in perm)) & set(wishes)
   if len(covered)!=len(wishes):continue
   r=itinerary(perm,origin=origin)
   if not r:continue
   feasible+=1
   unique_deities=set().union(*(PLACE_DEITIES[x] for x in perm))
   relev=sum(rank[x]/maxscore for x in perm)
   # Explicit DEMO utility weights (not fitted to user data):
   # reward personal graph relevance, wish coverage and deity diversity, penalize travel and waiting.
   utility=(2*relev+3*len(covered)+0.10*min(8,len(unique_deities))
           -0.025*r['travel_min']-0.005*r['waiting_min'])
   if best is None or utility>best[0]:best=(utility,r,covered,relev,len(unique_deities))
  def route_utility(r):
   if not r:return None
   wanted=set().union(*(PLACE_WISH[x] for x in r['route'])) & set(wishes)
   deity_count=len(set().union(*(PLACE_DEITIES[x] for x in r['route'])))
   rel=sum(rank[x]/maxscore for x in r['route'])
   return round(2*rel+3*len(wanted)+0.10*min(8,deity_count)-0.025*r['travel_min']-0.005*r['waiting_min'],4)
  result={'trip_id':'TRIP_'+code,'theme':title,'wish_ids':wishes,'start_station_id':origin,'start_clock':'09:00',
          'source_template_order':original,'source_template':template,'template_utility':route_utility(template),
          'same_stops_route_optimized':same_best,'same_stops_utility':route_utility(same_best),
          'same_stops_feasible_orders':len(same_candidates),'orienteering_candidate_pool':candidate_pool,'min_signature_stops':2,
          'permutations_checked':checked,'feasible_permutations_covering_goals':feasible,
          'orienteering_result':None}
  if best:
   utility,r,covered,relev,ddiv=best
   result['orienteering_result']={'route':r,'utility':round(utility,4),'wish_covered':sorted(covered),
           'wish_coverage_fraction':round(len(covered)/len(wishes),3),
           'distinct_deity_count':ddiv,'normalized_graph_relevance_sum':round(relev,4)}
  if template and same_best:
   result['same_stops_travel_saved_min']=round(template['travel_min']-same_best['travel_min'],2)
  if template and best:
   result['orienteering_utility_uplift']=round(best[0]-route_utility(template),4)
  outputs.append(result)
 return {'method':'Exact permutation search for up to 4 stops, candidate pool limited to high-PPR places + template places. Network estimated transit travel and demo opening hours; no real venue coordinates. User-provided 3 signature routes are templates only.',
         'max_stops':4,'demo_start':'09:00','dwell_min_per_place':25,'latest_finish':'17:00',
         'estimated_time_budget_min':420,'objective':'2 * sum(normalized degree-adjusted PPR) + 3 * wish coverage count + 0.1*diversity - 0.025*transit time - 0.005*waiting time; require >=2 original signature stops',
         'trips':outputs}


def proxy_matching():
 reviews=defaultdict(list)
 for r in TABLE['proxy_feedback']:reviews[r['provider_id']].append(float(r['rating_1_5']))
 provider_averages={p:round(statistics.mean(reviews[p]),3) if reviews[p] else None for p in PROV}
 examples=[]
 for uid in ['U_DEMO_001','U_DEMO_002','U_DEMO_003','U_DEMO_005']:
  u=U[uid];score_ppr,_,_=scores_for_user(u)
  budget=float(u['budget_thb']);wishes={u['wish_primary'],u['wish_secondary']}
  matches=[]
  for offer in O.values():
   if offer['wish_id'] not in wishes or float(offer['price_thb'])>budget:continue
   pid=offer['place_id'];provider=offer['provider_id'];sample=reviews[provider]
   # shrink noisy sample ratings toward neutral 3.0, with pseudo-count 3
   reputation=(sum(sample)+3*3.)/(len(sample)+3.)
   utility=3*(score_ppr[pid]/max(score_ppr.values()))+reputation*0.3-(float(offer['price_thb'])/max(1,budget))*0.5
   matches.append((utility,offer,round(reputation,3)))
  matches.sort(key=lambda e:(-e[0],e[1]['offer_id']))
  examples.append({'user_id':uid,'wish_ids':sorted(wishes),'budget_thb':budget,
    'eligible_offers':len(matches),'top_matches':[{'offer_id':x[1]['offer_id'],'provider_id':x[1]['provider_id'],'place_id':x[1]['place_id'],'wish_id':x[1]['wish_id'],'price_thb':x[1]['price_thb'],'smoothed_provider_score':x[2],
                 'demo_utility':round(x[0],3)} for x in matches[:5]]})
 return {'provider_count':len(PROV),'offer_count':len(O),'order_status_counts':dict(Counter(o['order_status'] for o in ORDER.values())),
         'provider_feedback_averages':provider_averages,'matching_examples':examples,
         'warning':'Provider, offers, status and ratings are entirely SYNTHETIC; provider reputation is estimated from mock service feedback, NOT proof that worship works. Sparse one-provider-per-place limits comparative provider ranking.'}


def feedback_sensitivity():
 user=U['U_DEMO_001'];past=[f for f in TABLE['feedback'] if f['user_id']==user['user_id'] and f['event_date']<'2026-11-01']
 past=sorted(past,key=lambda x:x['event_date']);new_goal=past[-1]['next_wish_id']
 before,_=ppr_with_seeds(user_seeds(user));after,_=ppr_with_seeds(user_seeds(user,primary_override=new_goal))
 b=rank_places(before);a=rank_places(after)
 return {'user_id':user['user_id'],'initial_primary_wish':user['wish_primary'],'next_primary_wish_from_oct_feedback':new_goal,
         'before_top5':b[:5],'after_top5':a[:5],
         'top5_changed_count':len(set(b[:5])^set(a[:5]))//2,
         'note':'Demonstrates adaptation of personalization SEEDS, not fitted ML or evidence of preference improvement'}


def main():
 checks=validate_inputs()
 if not checks['all_structural_checks_pass']:raise RuntimeError('Broken cross-file FK; reject model: '+repr(checks['issues']))
 data={'run_date':'2026-11-21','version':'MU_NET_MODEL_2026_11_21_v1','qa':checks,
       'graph_eda':graph_eda(),'top5_examples':rank_examples(),
       'temporal_holdout':temporal_evaluation(),
       'structural_holdout':structural_holdout(),
       'trip_optimization':route_optimization(),
       'proxy_matching':proxy_matching(),
       'feedback_sensitivity':feedback_sensitivity(),
       'limitations':[
        'All Wish-Deity and Deity-Place relationships are source candidates, not independently verified assertions or scientific outcomes.',
        'Synthetic users/visits/ratings and external event dates cannot validate real user preference or forecast accuracy.',
        'Place real latitude/longitude unknown; station anchors are NOT actual venue coordinates; transit link times are estimates.',
        'Opening-hour windows may be synthetic or unverified; routes are simulation only.',
        'Utility weights and PPR degree correction are manually chosen demo hyperparameters, not trained or optimized.',
        'No real payment, provider, proxy-ritual service or verified permission is represented.',
        'A regular SQL solution could reproduce some paths; the graph offers flexible multi-hop exploration and network ranking, not mathematical exclusivity.'
       ]}
 OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
 print('MODEL JSON:',OUT)
 print('QA:',checks['all_structural_checks_pass'], 'records:',checks['counts'])
 e=data['graph_eda'];print('GRAPH:',{k:e[k] for k in ['knowledge_nodes','knowledge_edges','knowledge_components','isolates','communities','modularity','full_network_nodes','full_network_edges']})
 print('TEMPORAL:',data['temporal_holdout']['by_model'])
 print('STRUCTURAL:',data['structural_holdout']['by_model'])
 print('TRIP:')
 for t in data['trip_optimization']['trips']:
  print(t['trip_id'],'source:',None if t['source_template'] is None else t['source_template']['travel_min'],'same_stop_best:',None if t['same_stops_route_optimized'] is None else t['same_stops_route_optimized']['travel_min'],
        'orienteering:',None if not t['orienteering_result'] else(t['orienteering_result']['route']['travel_min'],t['orienteering_result']['route']['route']))
 print('LEARNING DEMO:',data['feedback_sensitivity'])
 print('PROXY:',data['proxy_matching']['matching_examples'][:2])
 return data

if __name__=='__main__': main()
