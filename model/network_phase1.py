#!/usr/bin/env python3
"""MU Journey Phase 1 — typed knowledge graph, audited recommendations, fixed company trips.
Run: python network_phase1.py
Input is an exported Drive v2 snapshot; output remains demo / hypothesis, not live advice.
No optimization at request time: the 3 company trips are fixed in offline_signature_trip_v1.json.
"""
from __future__ import annotations
import csv, itertools, json, math, statistics
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
import networkx as nx

ROOT=Path(__file__).resolve().parent
D=json.loads((ROOT/'input_drive_v2_snapshot.json').read_text(encoding='utf-8'))['tables']
TRIP_DATA=json.loads((ROOT/'offline_signature_trip_v1.json').read_text(encoding='utf-8'))
W={r['wish_id']:r for r in D['wishes']}
E={r['deity_id']:r for r in D['deities']}
P={r['place_id']:r for r in D['places']}
WD={(r['wish_id'],r['deity_id']) for r in D['wish_deity']}
DP={(r['deity_id'],r['place_id']) for r in D['deity_place']}
WISH_DEITIES=defaultdict(set);DEITY_PLACES=defaultdict(set);PLACE_DEITIES=defaultdict(set)
for w,e in WD:WISH_DEITIES[w].add(e)
for e,p in DP:DEITY_PLACES[e].add(p);PLACE_DEITIES[p].add(e)
TRIPS={t['trip_id']:t for t in TRIP_DATA['company_trips']}
THEMES={t['trip_id']:t for t in TRIP_DATA['themes']}
assert set(TRIPS)=={'TRIP_LOVE','TRIP_CAREER','TRIP_WEALTH'}
G=nx.Graph()
G.add_nodes_from([('W:'+w,{'type':'wish'}) for w in W])
G.add_nodes_from([('D:'+e,{'type':'sacred_entity'}) for e in E])
G.add_nodes_from([('P:'+p,{'type':'place'}) for p in P])
G.add_edges_from(('W:'+w,'D:'+e,{'type':'BELIEVED_FOR'}) for w,e in WD)
G.add_edges_from(('D:'+e,'P:'+p,{'type':'REPORTED_AT'}) for e,p in DP)

TRADITION_GROUPS={
 'ฮินดู':lambda t:t=='ฮินดู',
 'จีนและกลุ่มผสมจีน':lambda t:t.startswith('จีน'),
 'พุทธและความเชื่อไทย':lambda t:t.startswith('พุทธ') or t=='ไทย',
 'พราหมณ์/โหราศาสตร์':lambda t:t.startswith('พราหมณ์')}

def blocked_deities(exclusions):
    blocked=set(exclusions.get('deity_ids',[]))
    for group in exclusions.get('tradition_groups',[]):
        if group not in TRADITION_GROUPS:raise ValueError('Unknown exclusion group: '+group)
        blocked|={e for e,obj in E.items() if TRADITION_GROUPS[group](obj['tradition'])}
    if not blocked<=E.keys():raise ValueError('Unknown deity ID in exclusions')
    return blocked

def weekday_from_dob(birthdate):
    if not birthdate:return None
    parts=str(birthdate).split('-')
    if len(parts)!=3:raise ValueError('Use YYYY-MM-DD for date of birth')
    yr,mo,day=map(int,parts)
    if yr>=2400:yr-=543  # Support Thai Buddhist Era YYYY
    d=date(yr,mo,day)
    if d>date(2026,11,21):raise ValueError('Future DOB')
    return ['วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสบดี','วันศุกร์','วันเสาร์','วันอาทิตย์'][d.weekday()]

def normalize_profile(pr):
    wishes=list(dict.fromkeys(pr.get('wish_ids',[])))
    if not 1<=len(wishes)<=3:raise ValueError('Choose 1–3 unique wishes')
    if any(w not in W for w in wishes):raise ValueError('Unknown wish ID')
    exc=pr.get('exclusions') or {}
    if not set(exc.get('place_ids',[]))<=P.keys():raise ValueError('Unknown place exclusion')
    d=blocked_deities(exc)
    return {'profile_id':pr.get('profile_id','DEMO'), 'wish_ids':wishes,
            'birthdate':pr.get('birthdate'), 'weekday':weekday_from_dob(pr.get('birthdate')),
            'exclusions':exc,'blocked_deity_ids':d,'blocked_place_ids':set(exc.get('place_ids',[]))}

def allowed_paths(profile):
    # A permitted recommendation requires an EXPLICIT two-hop edge path for a selected Wish.
    out=defaultdict(list)
    banned=profile['blocked_deity_ids'];places=profile['blocked_place_ids']
    for w in profile['wish_ids']:
        for e in sorted(WISH_DEITIES[w]-banned):
            for p in sorted(DEITY_PLACES[e]-places):
                out[p].append((w,e))
    return dict(out)

def birth_seed(profile):
    # Supplement only from the SAME registered belief system + strictly existing master ID.
    # Do not use alias-candidate or unresolved birth links, even if source says verified-web-claim.
    weekday=profile['weekday']
    if not weekday:return [],[]
    linked=[r for r in D['birth_belief'] if r.get('birth_dimension')=='weekday' and
            r.get('birth_value')==weekday and r.get('resolution_method')=='EXISTING_MASTER_ID' and
            r.get('resolved_deity_id_candidate') in E and r['resolved_deity_id_candidate'] not in profile['blocked_deity_ids']]
    source_systems=sorted(set(r['belief_system'] for r in linked))
    if not source_systems:return [],[]
    selected=[r['resolved_deity_id_candidate'] for r in linked if r['belief_system']==source_systems[0]]
    return sorted(set(selected)),[r['raw_id'] for r in linked if r['belief_system']==source_systems[0]]

def get_rankings(pr,birth_strength=0.05,alpha=.85):
    profile=normalize_profile(pr);pathmap=allowed_paths(profile)
    graph=G.copy()
    graph.remove_nodes_from('D:'+d for d in profile['blocked_deity_ids'])
    graph.remove_nodes_from('P:'+p for p in profile['blocked_place_ids'])
    seeds={'W:'+w:1/len(profile['wish_ids']) for w in profile['wish_ids']}
    birthids,birthrefs=birth_seed(profile)
    for d in birthids:seeds['D:'+d]=birth_strength/len(birthids)
    seeds={x:val for x,val in seeds.items() if x in graph}
    norm=sum(seeds.values()); pers={n:seeds.get(n,0.0)/norm for n in graph}
    pagerank=nx.pagerank(graph,alpha=alpha,personalization=pers,tol=1e-11,max_iter=1000)
    base={p:float(pagerank['P:'+p])/(graph.degree('P:'+p)+1)**.5 for p in pathmap}
    mx=max(base.values(),default=0)
    normalized={p:(v/mx if mx else 0) for p,v in base.items()}
    # Score counterfactual methods in the SAME allowed graph; all exclusion rules remain hard constraints.
    direct={p:float(len(paths)) for p,paths in pathmap.items()}
    popularity={p:float(graph.degree('P:'+p)) for p in pathmap}
    # Equal-interest selection (the UI has no primary order).
    full={'ppr':normalized,'direct':direct,'popularity':popularity}
    ranked={k:sorted(v,key=lambda p:(-v[p],p)) for k,v in full.items()}
    # Greedy coverage re-ranking: PPR relevance vs number of previously uncovered selected wishes.
    # Explainable and deterministic; never add a Place with no valid permitted path.
    remaining=set(pathmap);selected=[];covered=set()
    while remaining and len(selected)<5:
        def utility(p):
            path_wishes={w for w,e in pathmap[p]}
            new=len(path_wishes-covered)/len(profile['wish_ids'])
            return .75*normalized.get(p,0)+.25*new
        choice=max(remaining,key=lambda p:(utility(p),normalized.get(p,0),-int(p[1:]) if p[1:].isdigit() else 0))
        selected.append(choice);covered.update(w for w,e in pathmap[choice]);remaining.remove(choice)
    ranked['ppr_coverage']=selected+sorted(remaining,key=lambda p:(-normalized.get(p,0),p))
    return {'profile':profile,'paths':pathmap,'scores':full,'ranked':ranked,
            'birth_claim_ids_used':birthrefs,'birth_deity_ids_used':birthids}

def place_recommendation(pr,k=5):
    data=get_rankings(pr);profile=data['profile'];out=[]
    for rank,p in enumerate(data['ranked']['ppr_coverage'][:k],1):
        evidence=[{'wish_id':w,'wish_name':W[w]['wish_th'],
                   'deity_id':e,'deity_name':E[e]['name_th'],'place_id':p,
                   'path':W[w]['wish_th']+' → '+E[e]['name_th']+' → '+P[p]['place_name']}
                  for w,e in data['paths'][p]]
        out.append({'rank':rank,'place_id':p,'place_name':P[p]['place_name'],
                    'ppr_normalized_score':round(data['scores']['ppr'][p],6),
                    'matched_wish_ids':sorted({z['wish_id'] for z in evidence}),
                    'evidence_paths':evidence,'data_quality':P[p]['routing_status'],
                    'note':'BELIEF_CLAIM_NOT_CAUSAL_PROOF'})
    return {'profile_id':profile['profile_id'],'wish_ids':profile['wish_ids'],
            'applied_exclusions':{'deity_ids':sorted(profile['blocked_deity_ids']),
                                  'place_ids':sorted(profile['blocked_place_ids'])},
            'weekday_from_dob':profile['weekday'],'birth_claim_ids_used':data['birth_claim_ids_used'],
            'candidate_places':len(data['paths']),'top5':out,
            'limited_results':len(out)<5,'limited_reason':'No more source-backed permissible paths' if len(out)<5 else None}

def trip_catalog():
    out={}
    for tid,trip in TRIPS.items():
        places=trip['route']['place_ids']
        featured=[]
        weights=THEMES[tid]['wish_weights']
        for pid in places:
            ds=sorted([e for e in PLACE_DEITIES[pid] if any((w,e) in WD for w in weights)],
                      key=lambda e:(-sum(v for w,v in weights.items() if (w,e) in WD),e))
            if not ds:raise AssertionError('Trip stop has no supported theme deity '+pid)
            e=ds[0]
            featured.append({'place_id':pid,'deity_id':e,'tradition':E[e]['tradition'],
                            'wish_ids':sorted(w for w in weights if (w,e) in WD)})
        out[tid]={'trip_id':tid,'title':trip['theme'],'place_ids':places,
                  'featured_rituals':featured,'wish_weights':weights,
                  'stop_count':len(places),'finish_clock_est':trip['route']['finish_clock'],
                  'duration_min_est':trip['route']['duration_min'],
                  'rail_min_est':trip['route']['rail_min_est'],
                  'walk_min_est':trip['route']['station_walk_min_est'],
                  'hours_qualifiers':trip['route']['source_data_quality'],
                  'status':'SIMULATED_COMPANY_TRIP_NOT_BOOKABLE'}
    return out

# Locked featured rituals copied and verified from Drive File 02 / SD_TRIP_RITUALS.
# These, not a recomputed high-score deity, govern cultural exclusions for a paid tour.
LOCKED_FEATURED = {
 'TRIP_LOVE':[('P030','D_TRIMURTI','W01'),('P023','D_LAKSHMI','W01'),('P001','D_UMA','W01'),('P047','D_MAE_FAENG','W01')],
 'TRIP_CAREER':[('P026','D_HANUMAN_MONKEY','W02'),('P014','D_GANESHA','W04'),('P012','D_CITYPILLAR','W02'),('P005','D_SOMDET_TO','W02')],
 'TRIP_WEALTH':[('P018','D_LP_THONGKHAM','W03'),('P017','D_TAISUI','W08'),('P044','D_GUANYIN','W06'),('P015','D_WESSUWAN','W03')]
}
CATALOG=trip_catalog()
for tid,rituals in LOCKED_FEATURED.items():
    assert [p for p,e,w in rituals]==CATALOG[tid]["place_ids"],tid
    for p,e,w in rituals:
        assert (w,e) in WD and (e,p) in DP,(tid,p,e,w)
    CATALOG[tid]["featured_rituals"]=[{'place_id':p,'deity_id':e,'tradition':E[e]['tradition'],'wish_ids':[w]} for p,e,w in rituals]


def match_trip(pr,ppr_share=.75,require_coverage=.30):
    r=get_rankings(pr)
    profile=r['profile'];wanted=set(profile['wish_ids']);paths=r['paths']
    options=[]
    for tid,trip in CATALOG.items():
        reasons=[]
        bad_deities=[z['deity_id'] for z in trip['featured_rituals'] if z['deity_id'] in profile['blocked_deity_ids']]
        if bad_deities:reasons.append('FEATURED_RITUAL_EXCLUSION:'+','.join(sorted(set(bad_deities))))
        if any(p in profile['blocked_place_ids'] for p in trip['place_ids']):reasons.append('PLACE_EXCLUSION')
        # Coverage only counts source-backed, permitted paths along the fixed 4-stop itinerary.
        cover=set(w for p in trip['place_ids'] for w,e in paths.get(p,[])) & wanted
        weighted=len(cover)/len(wanted)
        if weighted<require_coverage:reasons.append('INSUFFICIENT_USER_WISH_COVERAGE')
        rel=statistics.mean(r['scores']['ppr'].get(p,0) for p in trip['place_ids'])
        score=ppr_share*rel+(1-ppr_share)*weighted
        options.append({'trip_id':tid,'trip_name':trip['title'],'eligible':not reasons,
                        'reason_codes':reasons,'user_wishes_covered':sorted(cover),
                        'coverage_fraction':round(weighted,4),'graph_relevance':round(rel,6),
                        'matching_score':round(score,6),
                        'place_ids_fixed':trip['place_ids'],
                        'commercial_status':'PRICE_AND_CAPACITY_TBD'})
    ranked=sorted(options,key=lambda x:(not x['eligible'],-x['matching_score'],x['trip_id']))
    winners=[x for x in ranked if x['eligible']]
    return {'profile_id':profile['profile_id'],'matched_trip':winners[0] if winners else None,
            'decision':'PROVISIONAL_MATCH_NOT_BOOKABLE' if winners else 'NO_ELIGIBLE_SIGNATURE_TRIP',
            'all_trip_scores':ranked,'route_reoptimized_per_user':False}

def graph_eda():
    components=sorted(nx.connected_components(G),key=len,reverse=True)
    com=list(nx.community.greedy_modularity_communities(G))
    bet=nx.betweenness_centrality(G,normalized=True)
    clos=nx.closeness_centrality(G)
    def desc(node):
        t,key=node.split(':',1)
        return {'node_id':node,'name':(W[key]['wish_th'] if t=='W' else E[key]['name_th'] if t=='D' else P[key]['place_name']),
                'type':t,'degree':G.degree(node)}
    top=sorted(G,key=lambda n:(-G.degree(n),n))[:12]
    cc=[]
    for c in sorted(com,key=len,reverse=True)[:8]:
        cc.append({'node_count':len(c),'wishes':[W[n[2:]]['wish_th'] for n in sorted(c) if n.startswith('W:')],
                   'example_places':[P[n[2:]]['place_name'] for n in sorted(c) if n.startswith('P:')][:4]})
    place_isolates=[p for p in P if G.degree('P:'+p)==0]
    return {'nodes':G.number_of_nodes(),'edges':G.number_of_edges(),'by_type':{'wish':len(W),'deity':len(E),'place':len(P)},
            'edge_types':{'wish_deity':len(WD),'deity_place':len(DP)},
            'density_full':round(nx.density(G),6),'density_wish_deity':round(len(WD)/(len(W)*len(E)),6),
            'density_deity_place':round(len(DP)/(len(E)*len(P)),6),
            'components':len(components),'component_sizes':[len(c) for c in components],
            'isolates':nx.number_of_isolates(G),'isolated_place_ids':place_isolates,
            'communities':len(com),'modularity':round(nx.community.modularity(G,com),6),
            'largest_community_summaries':cc,'degree_hubs':[desc(n) for n in top],
            'betweenness_hubs':[dict(desc(n),betweenness=round(bet[n],6)) for n in sorted(G,key=lambda n:(-bet[n],n))[:8]],
            'closeness_hubs':[dict(desc(n),closeness=round(clos[n],6)) for n in sorted(G,key=lambda n:(-clos[n],n))[:8]],
            'analysis_caveat':'Typed graph density cannot be interpreted like an all-to-all social network; 16 orphaned Place nodes missing recommendation paths.'}

def qa_data():
    problems=[]
    for w,e in WD:
        if w not in W or e not in E:problems.append('invalid Wish-Deity FK')
    for e,p in DP:
        if e not in E or p not in P:problems.append('invalid Deity-Place FK')
    for tid,trip in TRIPS.items():
        if len(trip['route']['place_ids'])!=4:problems.append('not four stops:'+tid)
        if trip['route']['duration_min']>360:problems.append('route exceeds duration:'+tid)
        if not set(trip['route']['place_ids'])<=P.keys():problems.append('invalid stop FK:'+tid)
        if len(trip['route']['place_ids'])!=len(set(trip['route']['place_ids'])):problems.append('repeat stop:'+tid)
        if not trip['route']['source_data_quality']:problems.append('no hours source:'+tid)
    if len(set(itertools.chain.from_iterable(t['route']['place_ids'] for t in TRIPS.values())))!=12:problems.append('overlapping tour places')
    return {'passed':not problems,'issues':problems,'unverified_place_coordinates':sum(not x.get('real_lat_unverified') for x in P.values()),
            'source_claims_unverified':True,'mock_user_feedback_used_for_training':False,
            'distinct_trips':len(TRIPS),'source_snapshot_offers':len(D['offers'])}

# Precommitted acceptance examples. These ARE NOT independent real user preference labels.
FIXTURES=[
 {'profile_id':'CASE_LOVE','wish_ids':['W01'],'birthdate':'2000-05-15','expected_relevant':['P030','P023','P001']},
 {'profile_id':'CASE_CAREER','wish_ids':['W02'],'birthdate':'1999-01-10','expected_relevant':['P012','P026','P021']},
 {'profile_id':'CASE_WEALTH','wish_ids':['W03'],'birthdate':'1996-09-30','expected_relevant':['P018','P017','P015']},
 {'profile_id':'CASE_EXAM','wish_ids':['W04'],'birthdate':'2002-08-20','expected_relevant':['P017','P014','P001']},
 {'profile_id':'CASE_FAN','wish_ids':['W05'],'birthdate':'2001-06-15','expected_relevant':['P021','P001','P002']},
 {'profile_id':'CASE_HEALTH','wish_ids':['W06'],'birthdate':'1998-07-11','expected_relevant':['P044','P015','P003']},
 {'profile_id':'CASE_HOUSE','wish_ids':['W07'],'birthdate':'1995-11-18','expected_relevant':['P007','P051']},
 {'profile_id':'CASE_CHONG','wish_ids':['W08'],'birthdate':'1995-12-10','expected_relevant':['P017','P042','P013']},
 {'profile_id':'CASE_LOTTERY','wish_ids':['W09'],'birthdate':'1995-12-10','expected_relevant':['P016']},
 {'profile_id':'CASE_DEBT','wish_ids':['W10'],'birthdate':'1995-12-10','expected_relevant':['P003','P015']},
 {'profile_id':'CASE_3TOPICS','wish_ids':['W01','W02','W03'],'birthdate':'2000-05-15','expected_relevant':['P001','P014','P022']},
 {'profile_id':'CASE_NO_HINDU_LOVE','wish_ids':['W01'],'birthdate':'2000-05-15',
  'exclusions':{'tradition_groups':['ฮินดู']},'expected_relevant':['P019','P029','P047']},
 {'profile_id':'CASE_NO_HINDU_FAN','wish_ids':['W05'],'birthdate':'2000-05-15',
  'exclusions':{'tradition_groups':['ฮินดู']},'expected_relevant':[]},
 {'profile_id':'CASE_NO_GANESHA_EXAM','wish_ids':['W04'],'birthdate':'2000-05-15',
  'exclusions':{'deity_ids':['D_GANESHA']},'expected_relevant':['P017','P001']},
 {'profile_id':'CASE_HIDE_PLACE','wish_ids':['W01','W03'],'birthdate':'2000-05-15',
  'exclusions':{'place_ids':['P001','P023']},'expected_relevant':['P030','P022','P018']},
]

def classification_metrics(pred,labels,k=5):
    top=pred[:k];pos={p:i+1 for i,p in enumerate(top)}
    hit=len(set(top)&set(labels));p_at=hit/k
    dcg=sum(1/math.log2(pos[p]+1) for p in labels if p in pos)
    ideal=sum(1/math.log2(i+2) for i in range(min(k,len(labels))))
    return {'precision_at5':p_at,'recall_at5':hit/max(1,len(labels)),
            'ndcg_at5':dcg/ideal if ideal else None,'hit_at5':float(hit>0)}

def structural_comparison():
    rows=[];fixture_samples=[]
    for fixture in FIXTURES:
        rr=get_rankings(fixture);labels=set(fixture['expected_relevant'])
        allowed=rr['paths'];relevant={p for p in labels if p in allowed}
        # Labels cannot be recommended when forbidden or absent. These cases test abstention separately.
        fixture_samples.append({'profile_id':fixture['profile_id'],'allowed_candidates':len(allowed),
                                'predeclared_labels':sorted(labels),'valid_predeclared_labels':sorted(relevant),
                                'ppr_top5':rr['ranked']['ppr_coverage'][:5],
                                'trip_match':match_trip(fixture)['decision']})
        for name in ['popularity','direct','ppr','ppr_coverage']:
            rank=rr['ranked'][name]
            metrics=classification_metrics(rank,relevant)
            coverage=len(set(w for p in rank[:5] for w,e in allowed.get(p,[])))/len(rr['profile']['wish_ids'])
            rows.append(dict(profile_id=fixture['profile_id'],method=name,candidate_count=len(allowed),
                             wished_topic_coverage_at5=coverage,violations=0,
                             top5=';'.join(rank[:5]),**metrics))
    by={}
    for name in ['popularity','direct','ppr','ppr_coverage']:
        arr=[x for x in rows if x['method']==name]
        by[name]={'n':len(arr),'mean_precision_at5':round(statistics.mean(x['precision_at5'] for x in arr),4),
                  'mean_recall_at5':round(statistics.mean(x['recall_at5'] for x in arr),4),
                  'mean_ndcg_at5_over_nonempty':round(statistics.mean(x['ndcg_at5'] for x in arr if x['ndcg_at5'] is not None),4),
                  'mean_covered_selected_wishes_at5':round(statistics.mean(x['wished_topic_coverage_at5'] for x in arr),4)}
    return {'source_aligned_fixture_results':by,'by_case':rows,'cases':fixture_samples,
            'limitation':'Labels chosen by researcher from the SAME candidate source graph; this is deterministic structural acceptance, not independent preference accuracy or measured network uplift.'}

def robustness_and_acceptance():
    cases=[]
    combos=list(itertools.combinations(sorted(W),3))
    for i,wishes in enumerate(combos[:60]):
        exclusions={}
        if i%5==0:exclusions={'tradition_groups':['ฮินดู']}
        if i%7==0:exclusions={'deity_ids':['D_GANESHA']}
        if i%11==0:exclusions={'place_ids':['P001']}
        if i%13==0:exclusions={'tradition_groups':['ฮินดู'],'place_ids':['P001']}
        cases.append({'profile_id':f'AUTO_{i+1:03d}','wish_ids':list(wishes),
                      'birthdate':'2000-05-15' if i%2 else '1997-01-02','exclusions':exclusions})
    cases+=FIXTURES
    test=[];matching=[]
    for pr in cases:
        profile=normalize_profile(pr);res=place_recommendation(pr)
        match=match_trip(pr)
        excl=profile['blocked_deity_ids'];excplace=profile['blocked_place_ids']
        viol=sum(any(z['deity_id'] in excl or z['place_id'] in excplace for z in r['evidence_paths']) for r in res['top5'])
        validall=all((z['wish_id'],z['deity_id']) in WD and (z['deity_id'],z['place_id']) in DP
                     for p in res['top5'] for z in p['evidence_paths'])
        matched=match['matched_trip']
        fixed=not matched or matched['place_ids_fixed']==CATALOG[matched['trip_id']]['place_ids']
        if matched and any(not a['eligible'] for a in match['all_trip_scores'] if a['trip_id']==matched['trip_id']):fixed=False
        assert viol==0 and validall and fixed,pr['profile_id']
        test.append({'profile_id':pr['profile_id'],'n_wishes':len(pr['wish_ids']),
                     'exclusion_count':len(excl)+len(excplace),'candidate_places':res['candidate_places'],
                     'returned_places':len(res['top5']),'verified_paths':validall,'violations':viol,
                     'trip_decision':match['decision'],'chosen_trip_id':matched['trip_id'] if matched else ''})
        matching.append(match)
    return {'n_profiles':len(cases),'zero_exclusion_violations':sum(x['violations'] for x in test)==0,
            'valid_explanation_paths':all(x['verified_paths'] for x in test),
            'trip_choice_distribution':dict(Counter(x['chosen_trip_id'] or 'ABSTAIN' for x in test)),
            'abstentions':sum(not x['chosen_trip_id'] for x in test),
            'limited_results':sum(x['returned_places']<5 for x in test),
            'all_trip_routes_fixed':True,'cases':test,'matching_examples':matching[:18]}

def link_prediction_holdout(trials=6,n_hide=8,seed=7202):
    """Leakage-controlled graph-only diagnostic for recovering HELD-OUT Deity--Place claims.
    Different question from personal Wish recommendation; no independent relevance labels.
    Graph split is per trial and each score is computed on the TRAIN graph only.
    """
    import random
    rng=random.Random(seed)
    edges=sorted(DP)
    eligible=[(e,p) for e,p in edges if G.degree('D:'+e)>2 and G.degree('P:'+p)>1]
    detail=[]
    for t in range(trials):
        shuffled=eligible[:];rng.shuffle(shuffled)
        hidden=[]
        counts_d=Counter();counts_p=Counter()
        for e,p in shuffled:
            if len(hidden)>=n_hide:break
            if G.degree('D:'+e)-counts_d[e]>2 and G.degree('P:'+p)-counts_p[p]>1:
                hidden.append((e,p));counts_d[e]+=1;counts_p[p]+=1
        train=G.copy();train.remove_edges_from(('D:'+e,'P:'+p) for e,p in hidden)
        for e,p in hidden:
            pers={n:(1.0 if n=='D:'+e else 0.0) for n in train.nodes}
            pr=nx.pagerank(train,alpha=.85,personalization=pers,max_iter=1000,tol=1e-10)
            known={n[2:] for n in train.neighbors('D:'+e) if n.startswith('P:')}
            candidates=[x for x in P if x not in known]
            ranks={
              'ppr':sorted(candidates,key=lambda x:(-pr['P:'+x]/(train.degree('P:'+x)+1)**.5,x)),
              'degree':sorted(candidates,key=lambda x:(-train.degree('P:'+x),x))}
            for method,items in ranks.items():
                rank=items.index(p)+1
                detail.append({'trial':t+1,'deity_id':e,'heldout_place':p,'method':method,
                               'rank':rank,'hit_at5':int(rank<=5),
                               'ndcg_at5':1/math.log2(rank+1) if rank<=5 else 0.0})
    agg={}
    for method in ('ppr','degree'):
        subset=[x for x in detail if x['method']==method]
        agg[method]={'samples':len(subset),'hit_rate_at5':round(statistics.mean(x['hit_at5'] for x in subset),4),
                    'mean_ndcg_at5':round(statistics.mean(x['ndcg_at5'] for x in subset),4)}
    return {'models':agg,'rows':detail,'number_source_edges_tested':len(eligible),
            'methodology':'Deity-Place edge hidden prior to all scoring; rank all unseen places except training neighbors; fixed six random trials',
            'warning':'This diagnoses topology-based hidden-edge recovery, not user relevance. True edges are still unverified source beliefs; no independence from input corpus.'}

def sensitivity():
    results=[]
    for a in [.5,.75,.9]:
        picks=[match_trip(c,ppr_share=a)['matched_trip'] for c in FIXTURES]
        results.append({'ppr_weight':a,'choice_by_case':{f['profile_id']:(p['trip_id'] if p else 'ABSTAIN') for f,p in zip(FIXTURES,picks)}})
    changed=sum(len({r['choice_by_case'][f['profile_id']] for r in results})>1 for f in FIXTURES)
    perturb=[]
    for trip in TRIPS.values():
        m=trip['route'];base=m['duration_min'];travel=m['rail_min_est']+m['station_walk_min_est']+m['train_wait_min_assumed']
        for increase in [0,.15,.30,.50]:
            approx=base+increase*travel
            perturb.append({'trip_id':trip['trip_id'],'travel_time_increase_pct':round(100*increase),
                            'duration_min_approx':round(approx,1),'under_360min':approx<=360,
                            'note':'Linear scenario on travel component, NOT rerouting or actual timetable'})
    return {'matching_sensitivity':results,'changed_trip_choice_count':changed,
            'travel_delay_scenarios':perturb,'caveat':'Designed uncertainty scenarios; no observed real-world travel-time distribution.'}

def evaluate_trip_design():
    by={}
    for t in TRIPS.values():
        tid=t['trip_id'];route=t['route'];met=t['metrics']
        by[tid]={'place_ids':route['place_ids'],'duration_min_est':route['duration_min'],
                 'rail_min_est':route['rail_min_est'],'walk_min_est':route['station_walk_min_est'],
                 'finish_est':route['finish_clock'],'source_candidate_objective':met['objective_score'],
                 'wish_coverage':met['covered_wish_ids'],
                 'main_wish_relevant_places':met['main_wish_relevant_places'],
                 'hours_quality':route['source_data_quality']}
    return {'algorithm':'Offline fixed-catalog design from prior v1 weighted PPR + Dijkstra + restricted candidate orienteering',
            'three_trips':by,'distinct_stop_sites':len(set(itertools.chain.from_iterable(x['route']['place_ids'] for x in TRIPS.values()))),
            'baseline_issue':'Custom objective is same as optimizer target; not an independent efficacy metric.',
            'live_gate':'Unverified venue hours / pedestrian coordinates / guide capacity / commercial price.'}

def write_csv(path,rows):
    if not rows:return
    with path.open('w',encoding='utf-8-sig',newline='') as f:
        wr=csv.DictWriter(f,fieldnames=list(rows[0]));wr.writeheader();wr.writerows(rows)

def main():
    eda=graph_eda();q=qa_data();struct=structural_comparison();robust=robustness_and_acceptance()
    sens=sensitivity();trip=evaluate_trip_design();holdout=link_prediction_holdout()
    samples={f['profile_id']:{'profile':f,'places':place_recommendation(f),'trip':match_trip(f)} for f in FIXTURES}
    report={'version':'NETWORK_PHASE1_V2_2026-11-21','as_of':'2026-11-21','environment':'SYNTHETIC_DEMO_AND_UNVERIFIED_BELIEF_CLAIMS',
            'qa':q,'graph_eda':eda,'structural_acceptance':{k:v for k,v in struct.items() if k!='by_case'},
            'acceptance':{k:v for k,v in robust.items() if k not in ['cases','matching_examples']},
            'model_sensitivity':sens,'graph_link_holdout':{k:v for k,v in holdout.items() if k!='rows'},'signature_trip':trip,'examples':samples,
            'exclusions_policy':'Graph removes blocked deity/place nodes. Trip matching rejects fixed product when featured ritual excludes any entity. No live booking.',
            'methodology':'Meta-path-aware PPR rank + hard exclusion + greedy coverage; 3 fixed offline Signature Trips; one online trip score, no rerouting.'}
    (ROOT/'results/network_phase1_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    write_csv(ROOT/'results/recommendation_baselines.csv',struct['by_case'])
    write_csv(ROOT/'results/profile_acceptance.csv',robust['cases'])
    write_csv(ROOT/'results/travel_sensitivity.csv',sens['travel_delay_scenarios'])
    write_csv(ROOT/'results/graph_edge_holdout.csv',holdout['rows'])
    write_csv(ROOT/'results/qa_trip_portfolio.csv',[dict(trip_id=k,**v) for k,v in trip['three_trips'].items()])
    print('Graph',eda['nodes'],eda['edges'],'components',eda['components'],'communities',eda['communities'])
    print('Evaluation',struct['source_aligned_fixture_results'])
    print('Acceptance',report['acceptance'])
    print('QA',q)
    print('Link prediction holdout',holdout['models'])
    print('Trip changes sensitivity',sens['changed_trip_choice_count'])
    return report
if __name__=='__main__':main()
