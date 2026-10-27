# Two-application bay: the cut

`SSD3/SUBSTATION_v1rA.ssd` (corpus `5 - SSD system files`, Header `6df5eed2-8746-4325-8fa5-feed3e37daf0`) places two
applications in each of its bays `BAY1` and `BAY2` of the voltage level `150kV`: `P21_App` (protection) and
`CBR1_App` (breaker), each composing a function of its own (`P21_Fn`, `CBR1_Fn`) and standing on roles of the bay
(`PROT`, `BCU`); both bays' functions are classified by categories of the substation, among them
`APPLICATION MANAGEMENT` and `GENERIC FUNCTION`. The file is one revision: the twin is the template of that shape,
in two revisions.

What the twin keeps of it:

- the voltage level `150kV` and its two bays, each with the two applications (their function role `APPLICATION ROOT`, with its uuid), their function, the subfunction
  `Application Management` of each function, the roles `PROT` (allocating `P21_Fn`) and `BCU` (allocating
  `CBR1_Fn/Application Management`);
- the categories `APPLICATION MANAGEMENT` (the four `Application Management` subfunctions) and `GENERIC FUNCTION` (the
  four functions), at the substation level.

What it leaves out: the other bays and voltage levels, the roles `PIU CH1` and `PIU CH2`, the other categories, the
logical nodes, the signal roles and inputs, the behaviour descriptions, the process resources, the types, the IEDs.

The second revision is made: no function of `SSD3` is composed by two applications. In it, `CBR1_App` of each bay
composes `P21_Fn` too, and its role `BCU` allocates it: one function two applications share.
