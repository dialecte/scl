import { NAMES_AMONG } from './path-extractors.constants'

import { getAttributeRules } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { SPECIFIED_NAMING_ATTRIBUTES } from '@/v2019C1/constants/lnode-spec-naming'
import { UNALLOCATED_IED_NAME } from '@/v2019C1/constants/naming'
import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { readAttribute } from '@/v2019C1/helpers'

import type { PathExtractor } from './path-segment.types'
import type {
	ExtractionStrategy,
	LNodeStrategy,
	SignalStrategy,
} from '@/v2019C1/extensions/reference/constants/path-extraction.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The extractor of each strategy of path segment (`PATH_EXTRACTION_CONFIG`): how an element of a tag gives the segment
 * it adds to a path, read from its record and, for a signal or an LNode, its context.
 */

// ── Extractor builders ───────────────────────────────────────────────

export function buildExtractor(strategy: ExtractionStrategy): PathExtractor {
	switch (strategy.type) {
		case 'transparent':
			return () => null
		case 'name': {
			const separator = strategy.separator ?? '/'
			return (record) => {
				const name = readAttribute({ record, name: 'name' })
				return name ? { segment: name, separator } : null
			}
		}
		case 'lnClass':
			return (record) => {
				const lnClass = readAttribute({ record, name: 'lnClass', defaults: 'none' })
				if (!lnClass) return null
				const prefix = readAttribute({ record, name: 'prefix', defaults: 'none' })
				const inst =
					readAttribute({ record, name: 'inst', defaults: 'none', fullObject: true })?.value ??
					readAttribute({ record, name: 'lnInst', defaults: 'none', fullObject: true })?.value ??
					''
				return { segment: logicalNodeName({ prefix, lnClass, inst }), separator: '/' }
			}
		case 'lnode':
			return (record, context) => {
				const segment = buildLNodeName({ strategy, record, specNaming: context?.specNaming })
				return segment ? { segment, separator: '/' } : null
			}
		case 'attribute':
			return (record) => {
				const val = readAttribute({ record, name: strategy.attr, defaults: 'none' })
				return val ? { segment: val, separator: strategy.separator } : null
			}
		case 'signal':
			return (record, context) => {
				const segment = buildSignalName({
					strategy,
					record,
					siblings: context?.siblings ?? [record],
				})
				return segment ? { segment, separator: '.' } : null
			}
	}
}

/**
 * The name of a signal among its siblings: the plain name while no
 * sibling of the same tag shares it; otherwise `name(instance)`, the instance read with its
 * schema default, then `.data` when that attribute is set.
 */
function buildSignalName(params: {
	strategy: SignalStrategy
	record: AnyRawRecord
	siblings: readonly AnyRawRecord[]
}): string | null {
	const { strategy, record, siblings } = params
	const name = readAttribute({ record, name: strategy.name, defaults: 'none' })
	if (!name) return null

	const sharing = namesAmong({ siblings }).get(`${record.tagName}\u0000${name}`) ?? 0
	if (sharing <= 1) return name
	return nameWithInstance({ strategy, record, name })
}

/**
 * How many signals of each tag among the siblings hold each name, each read as its tag names it. A frozen list (the
 * import's, one per parent) is counted once for every signal named among it; any other list is counted at each call,
 * as it may have changed since.
 */
function namesAmong(params: { siblings: readonly AnyRawRecord[] }): Map<string, number> {
	const { siblings } = params
	const known = NAMES_AMONG.get(siblings)
	if (known) return known
	const counts = new Map<string, number>()
	for (const sibling of siblings) {
		const strategy = PATH_EXTRACTION_CONFIG[sibling.tagName]
		if (strategy?.type !== 'signal') continue
		const name = readAttribute({ record: sibling, name: strategy.name, defaults: 'none' })
		const key = `${sibling.tagName}\u0000${name}`
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	if (Object.isFrozen(siblings)) NAMES_AMONG.set(siblings, counts)
	return counts
}

/**
 * The name of a signal with its instance, then `.data` when that attribute is set, whatever its
 * siblings: `Trip(1).general` for the only `Trip` of its LNode as for one of several. It names one
 * signal as the shorter name does, so a file may write it for the only signal of its name. `null` for
 * an element that is not a signal or has no name.
 */
export function fullSignalName(record: AnyRawRecord): string | null {
	const strategy = PATH_EXTRACTION_CONFIG[record.tagName]
	if (strategy?.type !== 'signal') return null
	const name = readAttribute({ record, name: strategy.name, defaults: 'none' })
	return name ? nameWithInstance({ strategy, record, name }) : null
}

/** `name(instance)`, the instance read with its schema default, then `.data` when that attribute is set. */
function nameWithInstance(params: {
	strategy: SignalStrategy
	record: AnyRawRecord
	name: string
}): string {
	const { strategy, record, name } = params
	const instance =
		readAttribute({ record, name: strategy.instance, defaults: 'none', fullObject: true })?.value ??
		schemaDefault(record, strategy.instance)
	const data = strategy.data
		? readAttribute({ record, name: strategy.data, defaults: 'none' })
		: undefined
	return `${name}${instance ? `(${instance})` : ''}${data ? `.${data}` : ''}`
}

/**
 * The name of an LNode: prefix, class and instance of its own attributes while no IED is assigned
 * to it; once one is, of the naming it was specified with when its `LNodeSpecNaming` is given (the
 * class read from the LNode when the naming has none).
 */
function buildLNodeName(params: {
	strategy: LNodeStrategy
	record: AnyRawRecord
	specNaming: AnyRawRecord | undefined
}): string | null {
	const { strategy, record, specNaming } = params
	const iedName = readAttribute({ record, name: strategy.ied, defaults: 'none' })
	const assigned = Boolean(iedName) && iedName !== UNALLOCATED_IED_NAME
	const named =
		assigned && specNaming
			? {
					prefix: readAttribute({
						record: specNaming,
						name: specifiedName(strategy.prefix),
						defaults: 'none',
					}),
					lnClass:
						readAttribute({
							record: specNaming,
							name: specifiedName(strategy.lnClass),
							defaults: 'none',
							fullObject: true,
						})?.value ?? readAttribute({ record, name: strategy.lnClass, defaults: 'none' }),
					inst: readAttribute({
						record: specNaming,
						name: specifiedName(strategy.inst),
						defaults: 'none',
					}),
				}
			: {
					prefix: readAttribute({ record, name: strategy.prefix, defaults: 'none' }),
					lnClass: readAttribute({ record, name: strategy.lnClass, defaults: 'none' }),
					inst: readAttribute({ record, name: strategy.inst, defaults: 'none' }),
				}
	if (!named.lnClass) return null
	return logicalNodeName({ prefix: named.prefix, lnClass: named.lnClass, inst: named.inst })
}

/** The `LNodeSpecNaming` attribute keeping an LNode attribute's specified value. */
function specifiedName(name: string): string {
	return SPECIFIED_NAMING_ATTRIBUTES.get(name) ?? name
}

function schemaDefault(record: AnyRawRecord, attributeName: string): string | undefined {
	return getAttributeRules({ dialecteConfig: SCL_DIALECTE_CONFIG, record, attributeName }).default
}

/** The name of a logical node: its prefix, class and instance, joined. */
export function logicalNodeName(params: {
	prefix: string | undefined
	lnClass: string
	inst: string | undefined
}): string {
	const { prefix, lnClass, inst } = params
	return `${prefix ?? ''}${lnClass}${inst ?? ''}`
}
