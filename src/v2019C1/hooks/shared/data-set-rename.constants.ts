import { ATTRIBUTES, CHILDREN } from '@/v2019C1/definition'

/** The elements naming a DataSet of their logical node by its name (`datSet`): its control blocks. */
export const DATA_SET_USER_TAGS: ReadonlySet<string> = new Set(
	[...CHILDREN.LN0, ...CHILDREN.LN].filter(
		(tagName) => 'datSet' in (ATTRIBUTES.byTag as Record<string, object>)[tagName],
	),
)
