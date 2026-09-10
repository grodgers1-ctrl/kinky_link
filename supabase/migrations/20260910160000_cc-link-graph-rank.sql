-- Phase 3c: rank CC link-graph sources by harmonic centrality so query time
-- resolves the most authoritative linkers first, not alphabetical junk.
ALTER TABLE cc_link_graph ADD COLUMN source_rank REAL;

CREATE INDEX idx_cc_link_graph_rank
  ON cc_link_graph(target_domain, source_rank DESC NULLS LAST);
