/**
 * Shared SCL topology tag sets for the process section.
 *
 * Single source of truth for the structural chain and the physical/topology content carried
 * with it, so extract/instantiate/root-selection do not re-declare these lists per file.
 */

/** Structural levels of a process section, ordered outermost -> innermost. */
export const TOPOLOGY_STRUCTURAL_TAGS = ['Substation', 'VoltageLevel', 'Bay'] as const

/**
 * Physical + topology content placed directly under a structural level and carried as subtrees.
 * `ConnectivityNode` is included: it holds the electrical connectivity referenced by equipment
 * `Terminal`s (`connectivityNode` / `cNodeName`), so dropping it would dangle those references.
 */
export const TOPOLOGY_EQUIPMENT_TAGS = [
	'ConductingEquipment',
	'PowerTransformer',
	'GeneralEquipment',
	'ConnectivityNode',
] as const
