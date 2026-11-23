import { VALUE_TAGS } from '@/v2019C1/extensions/data-model/query/read-value-types.constants'

/** The logical nodes whose data instances a type gives the data of. */
export const DATA_REFERRER_LOGICAL_NODE_TAGS: ReadonlySet<string> = new Set(['LN', 'LN0'])

/**
 * The kind of member each data instance names: a `DOI` a data object, a `DAI` a data attribute, an `SDI` either (a sub
 * data object, or a data attribute of a constructed type).
 */
export const MEMBER_KIND_BY_TAG: ReadonlyMap<string, 'object' | 'attribute' | 'either'> = new Map([
	[VALUE_TAGS.object, 'object'],
	[VALUE_TAGS.attribute, 'attribute'],
	[VALUE_TAGS.subInstance, 'either'],
])
