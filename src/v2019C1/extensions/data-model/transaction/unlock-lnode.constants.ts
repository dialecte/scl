import { VALUE_TAGS } from '@/v2019C1/extensions/data-model/query/read-value-types.constants'

/** The specification of a data attribute's value an LNode holds: an unlock reads each one's `DAI`. */
export const SPECIFIED_VALUE_TAG = 'DAS'

/** The attribute of a `Val` naming the setting group it belongs to. */
export const SETTING_GROUP_ATTRIBUTE = 'sGroup'

/** No child counted as gone: a data instance must hold no child at all to be left with nothing. */
export const NOTHING_GONE: ReadonlySet<string> = new Set()

/** The attributes naming a data instance: a `DOI` / `SDI` / `DAI` holding none other has nothing of its own left. */
export const DATA_INSTANCE_NAMING_ATTRIBUTES: ReadonlySet<string> = new Set(['name', 'ix'])

/** The data an IED instantiates in an LN. */
export const DATA_INSTANCE_TAGS: ReadonlySet<string> = new Set([
	VALUE_TAGS.object,
	VALUE_TAGS.subInstance,
	VALUE_TAGS.attribute,
])

/**
 * Why an unlock keeps a value: its effective `valImport` is false (`not-imported`), the `DAI` holds no or several
 * `Val` (`not-one-value`), its `Val` belongs to a setting group (`setting-group`), no single plain value is specified
 * - the `DAS` holds several, blank or setting-group `Val`, or none and its type gives no single plain one
 * (`no-specified-value`) -, or its `Val` is another than that value (`value-changed`).
 */
export const KEPT_VALUE_REASONS = [
	'not-imported',
	'not-one-value',
	'setting-group',
	'no-specified-value',
	'value-changed',
] as const
