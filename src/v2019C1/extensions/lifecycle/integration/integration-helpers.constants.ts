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
