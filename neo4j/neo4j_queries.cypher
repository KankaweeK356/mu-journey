// OPTIONAL: tested conceptually against the exported graph schema; NOT executed on a live Neo4j instance.
// Import nodes and edges via Neo4j Data Importer using neo4j/neo4j_nodes.csv & neo4j/neo4j_edges.csv.
// Map node_id as identifier; Wish, SacredEntity, Place as labels; preserve edge types.

// Q1: Place options for a selected wish
MATCH (w:Wish {node_id:'W:W01'})-[:BELIEVED_FOR]->(d:SacredEntity)-[:REPORTED_AT]->(p:Place)
RETURN p.node_id AS place_id,p.label AS place_name,count(DISTINCT d) AS related_entities
ORDER BY related_entities DESC,place_id LIMIT 10;

// Q2: Sacred-entity hub degree
MATCH (d:SacredEntity)-[r]-()
RETURN d.label AS name,count(r) AS degree ORDER BY degree DESC LIMIT 10;

// Q3: Explainability: named paths for one place
MATCH path=(w:Wish)-[:BELIEVED_FOR]->(d:SacredEntity)-[:REPORTED_AT]->(p:Place {node_id:'P:P001'})
RETURN w.label,d.label,p.label LIMIT 20;

// Q4: Data gaps: places with no reported sacred entity
MATCH (p:Place) WHERE NOT (p)<-[:REPORTED_AT]-(:SacredEntity)
RETURN p.node_id,p.label;

// Q5: Exclusion example — Hindu omitted
MATCH (w:Wish {node_id:'W:W01'})-[:BELIEVED_FOR]->(d:SacredEntity)-[:REPORTED_AT]->(p:Place)
WHERE d.tradition <> 'ฮินดู'  // requires tradition from master in Neo4j import
RETURN DISTINCT p.node_id,p.label ORDER BY p.node_id;
