# Switch controller type clash

Cut from the function library of the corpus (FSD files): the switch controller exists twice, a baseline file and an
"in use" file, two files with two `Header` uuids whose types share their ids but not their content. The logical node
type of the baseline holds four data objects (name plate, behaviour, mode, position); the one of the "in use" file,
under the same id, holds others (name plate, behaviour, position, local control; the real file holds twelve).

- `switch-controller-type-clash.r1.fsd`: the "in use" switch controller, four of its data objects kept.
- `switch-controller-type-clash.r2.fsd`: a second revision made from it: its type gains the station-level control
  authority (`LocSta`) under the same id; nothing else changes.
- `switch-controller-type-clash.instance.ssd`: a project holding an instance of the baseline switch controller in bay
  `B1` (its types as the baseline file has them), and an empty bay `B2`.

What the twin keeps: the function placed in the `TEMPLATE` bay (the real files place it at the substation), its
logical node and specification naming, the types it names. What it leaves out: the function category, the long
descriptions, the values of the name plate. Type ids end in `-LibTool` (the library's tool name replaced); uuids are
readable (`00000000-0000-4000-8000-0000000007xx`, the baseline's lineage `...0800` / `...0801`).
