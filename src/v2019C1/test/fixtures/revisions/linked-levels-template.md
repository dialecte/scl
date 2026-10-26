# Linked levels template

A copy of `SLD_TFO_Bay v0r1.xml` (SSD template files of the corpus): a transformer bay drawn across two voltage levels.
The first named level of the template holds two voltage levels, `TEMPLATE_HV` and `TEMPLATE_MV`, one `TEMPLATE` bay
each; the breaker of the medium-voltage bay has its terminal on a connectivity node of the high-voltage bay. The two
levels are linked by that reference: they are one element to instantiate.

What the twin keeps: the levels, the transformer and its two windings, the breakers, the two connectivity nodes, the
terminals named by their path only (as in the real file: the uuid of the node they name is read on import), the
withdrawable mechanism of the medium-voltage breaker. What it leaves out: the drawing attributes and the drawing
`Private` of the nodes (another tool's data). Names are the real file's; uuids are readable
(`00000000-0000-4000-8000-0000000005xx`).

The second revision describes the medium-voltage breaker (`desc="rev2"`); nothing else changes.
