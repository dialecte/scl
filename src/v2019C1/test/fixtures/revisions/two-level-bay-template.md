# Two-level bay template: the repair

`Transformer Bay template v0r1.xml` and `v0r2.xml` (SSD, Header `0ae06797-9948-4068-a2e7-21dfa87e700b`) hold six uuid
references that name elements of the files the template was built from, not of the template itself: an earlier tool
copied them from the application files without repointing them. Both revisions hold the same six. The twin is copied
from the pair once these six point at the template's own elements, each at the element made from the one it named:

| Where (both revisions)                         | Reference                                  | Named (an element of another file)                           | Repointed at (the template's own)                                                                      |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `TEMPLATE_HV` bay, allocation role `PIU`       | `FunctionRef@functionUuid`                 | `083104fd-…` the application file's `Conditioner for TRIP`   | `afd0ec25-…`, the high-voltage `CB_Light_Fn/Conditioner for TRIP` (its `templateUuid` is `083104fd-…`) |
| `TEMPLATE_HV` bay, allocation role `PIU`       | `FunctionRef@functionUuid`                 | `c72eae30-…` the application file's `TRIP`                   | `c8553eee-…`, the high-voltage `CB_Light_Fn/TRIP`                                                      |
| `TEMPLATE_HV` bay, `P51_App` role content      | `FunctionCategoryRef@functionCategoryUuid` | `e23e9ddb-…` the overcurrent file's `APPLICATION MANAGEMENT` | `86273580-…`, the template's `APPLICATION MANAGEMENT` (the one category of that name)                  |
| `TEMPLATE_MV` bay, `CB_Light_App` role content | `FunctionCategoryRef@functionCategoryUuid` | `ba1ffa76-…`                                                 | `93efd3bb-…`, `HV SWITCHGEAR INTERFACE` (its `templateUuid` is `ba1ffa76-…`)                           |
| `TEMPLATE_MV` bay, `CB_Light_App` role content | `FunctionCategoryRef@functionCategoryUuid` | `334c261c-…`                                                 | `5e7f7410-…`, `PHYSICAL IED INTERFACE`                                                                 |
| `TEMPLATE_MV` bay, `CB_Light_App` role content | `FunctionCategoryRef@functionCategoryUuid` | `faad4660-…`                                                 | `86273580-…`, `APPLICATION MANAGEMENT`                                                                 |

Nothing else changes in the repair: the paths beside the six uuids already named the template's elements.

What the twin keeps of the repaired pair:

- both named levels (`TEMPLATE_HV`, `TEMPLATE_MV`), one bay each, the breaker application and its function on each,
  the overcurrent application and its function on the high-voltage one, one shared function category;
- the allocation role `PIU` of each level with its two function references, repointed as above;
- the change of the second revision, the same on both levels: two `SourceRef` (`input="Trip"`) in the breaker's
  logical node, naming the high-voltage overcurrent function's trip, and a signal role of the breaker application
  referring to them — six elements in all, as in the real pair.

What it leaves out: the `BCU` and `PROT` allocation roles, the other categories, the signal roles and inputs of the
first revision but one per application, the descriptions and data object settings, the history items but one per
revision, and the types but one data object each.
