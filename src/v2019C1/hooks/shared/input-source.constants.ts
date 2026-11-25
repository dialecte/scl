import { namesControlBlock } from './control-block-reference'

import { ATTRIBUTES } from '@/v2019C1/definition/constants.generated'
import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'

import type { ReferenceUuid } from '@/v2019C1/extensions/reference/constants/reference-uuids.types'

/**
 * The attribute holding an input's or output's address inside its own IED: without it, an input or output whose source
 * goes holds nothing of its own and goes too.
 */
export const INTERNAL_ADDRESS_ATTRIBUTE = 'intAddr'

/** The attributes of an input or output naming the data within the logical node it names, when the tag has them. */
const DATA_NAME_ATTRIBUTES = ['doName', 'daName'] as const

/**
 * The attribute naming the service a bound input receives its data by: set with the binding (not in a template), so
 * cleared with it.
 */
export const SERVICE_ATTRIBUTE = 'serviceType'

/**
 * The references naming another IED's data that hold content of their own, an internal address above all: an input
 * (`ExtRef`) and an output (`ExtCtrl`). Each is a tuple referrer with an identity (`uuid`) and a data name: kept when
 * what it names goes, its source cleared.
 */
export const SOURCED_REFERRER_TAGS: ReadonlySet<string> = new Set(
	[...REFERENCE_UUIDS_BY_TAG].flatMap(([tagName, references]) =>
		references.some((reference) => reference.form === 'tuple' && !reference.followsOnly) &&
		'uuid' in attributesOf(tagName) &&
		DATA_NAME_ATTRIBUTES.some((name) => name in attributesOf(tagName))
			? [tagName]
			: [],
	),
)

/**
 * Per sourced referrer, every attribute naming its source, the data and the control block sending it alike, and the
 * service it is received by: cleared, it is unbound, offered for a later binding, its internal address, description and
 * expected data (`pXxx`) kept.
 */
export const SOURCE_ATTRIBUTES_BY_TAG: ReadonlyMap<string, readonly string[]> = new Map(
	[...SOURCED_REFERRER_TAGS].map((tagName): [string, readonly string[]] => [
		tagName,
		[
			...new Set([
				...referencesOf(tagName).flatMap(namingAttributes),
				...DATA_NAME_ATTRIBUTES.filter((name) => name in attributesOf(tagName)),
				...(SERVICE_ATTRIBUTE in attributesOf(tagName) ? [SERVICE_ATTRIBUTE] : []),
			]),
		],
	]),
)

/**
 * Per sourced referrer naming a control block (an input), the attributes naming only that control block: those it does
 * not share with the data it names. Cleared, the data source is kept.
 */
export const CONTROL_BLOCK_ATTRIBUTES_BY_TAG: ReadonlyMap<string, readonly string[]> = new Map(
	[...SOURCED_REFERRER_TAGS].flatMap((tagName): [string, readonly string[]][] => {
		const references = referencesOf(tagName)
		const ofData = new Set(
			references.filter((reference) => !namesControlBlock(reference)).flatMap(namingAttributes),
		)
		const ofBlock = [
			...new Set(references.filter(namesControlBlock).flatMap(namingAttributes)),
		].filter((name) => !ofData.has(name))
		return ofBlock.length > 0 ? [[tagName, ofBlock]] : []
	}),
)

function referencesOf(tagName: string): readonly ReferenceUuid[] {
	return (REFERENCE_UUIDS_BY_TAG.get(tagName) ?? []).filter(
		(reference) => reference.form === 'tuple',
	)
}

function namingAttributes(reference: ReferenceUuid): string[] {
	return [reference.uuid, ...reference.names]
}

function attributesOf(tagName: string): object {
	return (ATTRIBUTES.byTag as Record<string, object>)[tagName] ?? {}
}
