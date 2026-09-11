import type { TOPOLOGY_STRUCTURAL_TAGS, TOPOLOGY_EQUIPMENT_TAGS } from './topology-tags'

/** A structural-level tag: `Substation` | `VoltageLevel` | `Bay`. */
export type TopologyStructuralTag = (typeof TOPOLOGY_STRUCTURAL_TAGS)[number]

/** A carried physical/topology content tag (equipment or `ConnectivityNode`). */
export type TopologyEquipmentTag = (typeof TOPOLOGY_EQUIPMENT_TAGS)[number]
