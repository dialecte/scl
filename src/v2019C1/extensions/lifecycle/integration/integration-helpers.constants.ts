import { CUSTOM_RECORD_ID_ATTRIBUTE_NAME } from '@dialecte/core/helpers'

/** The tags whose names place an element in its bay. */
export const BAY_PATH_TAGS: ReadonlySet<string> = new Set(['Bay', 'Function'])

/** The tags of what a variable or a behaviour description of a test applies to. */
export const DESCRIBED_TARGET_TAGS = [
	'Bay',
	'ConductingEquipment',
	'EqFunction',
	'Function',
	'LNode',
] as const

/** What the attributes holding a record id end with: the one a test writes, the one an export adds. */
export const RECORD_ID_SUFFIX = CUSTOM_RECORD_ID_ATTRIBUTE_NAME
