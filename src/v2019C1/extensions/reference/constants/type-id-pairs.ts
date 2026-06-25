import type { TypeIdReferencePairsShape } from './types'

/**
 * Type-id references — the DataTypeTemplates linkage that uses single
 * **id-string** attributes (not the `{path, uuid}` pairs of
 * {@link UUID_REFERENCE_PAIRS}). Registered here so all reference tooling (find,
 * remap) treats both reference systems uniformly.
 *
 *   LN / LN0 / LNode.lnType → LNodeType
 *   DO / SDO.type           → DOType
 *   DA / BDA.type           → EnumType (bType=Enum) | DAType (bType=Struct)
 */
export const TYPE_ID_REFERENCE_PAIRS = {
	LN: [{ attribute: 'lnType', target: 'LNodeType' }],
	LN0: [{ attribute: 'lnType', target: 'LNodeType' }],
	LNode: [{ attribute: 'lnType', target: 'LNodeType' }],
	DO: [{ attribute: 'type', target: 'DOType' }],
	SDO: [{ attribute: 'type', target: 'DOType' }],
	DA: [
		{ attribute: 'type', target: 'EnumType', when: { attribute: 'bType', equals: 'Enum' } },
		{ attribute: 'type', target: 'DAType', when: { attribute: 'bType', equals: 'Struct' } },
	],
	BDA: [
		{ attribute: 'type', target: 'EnumType', when: { attribute: 'bType', equals: 'Enum' } },
		{ attribute: 'type', target: 'DAType', when: { attribute: 'bType', equals: 'Struct' } },
	],
} as const satisfies TypeIdReferencePairsShape
