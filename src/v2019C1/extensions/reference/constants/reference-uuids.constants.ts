import {
	REFERENCE_TAG_NAMES,
	TUPLE_REFERENCE_PAIRS,
	UUID_REFERENCE_PAIRS,
} from '@/v2019C1/constants/reference-pairs'
import { ATTRIBUTES, CHILDREN } from '@/v2019C1/definition/constants.generated'

import type { ReferenceUuid, UuidReferrer } from './reference-uuids.types'
import type { ReferencePair } from './types'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'

/**
 * Per referrer tag, every uuid attribute it names a target by, from both registries (`UUID_REFERENCE_PAIRS`,
 * `TUPLE_REFERENCE_PAIRS`), with the tags it may point at and the attributes naming the same target beside it.
 */
export const REFERENCE_UUIDS_BY_TAG: ReadonlyMap<string, readonly ReferenceUuid[]> = new Map([
	...Object.entries(UUID_REFERENCE_PAIRS).map(([tagName, pairs]): [string, ReferenceUuid[]] => [
		tagName,
		(pairs as readonly ReferencePair[]).map(uuidPairReference),
	]),
	...Object.entries(TUPLE_REFERENCE_PAIRS).map(([tagName, pairs]): [string, ReferenceUuid[]] => [
		tagName,
		(pairs as readonly TupleReferencePair[]).map(tuplePairReference),
	]),
])

/**
 * Per referrer tag, every attribute naming what it references: the path and uuid of each uuid pair, the uuid and names
 * of each tuple pair. The project's to keep coherent, never an edit nor content to compare.
 */
export const REFERENCE_ATTRIBUTES_BY_TAG: ReadonlyMap<string, ReadonlySet<string>> = new Map(
	[...REFERENCE_UUIDS_BY_TAG].map(([tagName, references]): [string, ReadonlySet<string>] => [
		tagName,
		new Set(references.flatMap((reference) => [reference.uuid, ...reference.names])),
	]),
)

/** Per target tag, every referrer naming it by a uuid, from both registries. */
export const UUID_REFERRERS_BY_TARGET: ReadonlyMap<string, readonly UuidReferrer[]> =
	indexReferrersByTarget()

/** The children a bare reference may hold: its text and vendor data. */
const BARE_REFERENCE_CHILDREN: ReadonlySet<string> = new Set(['Text', 'Private'])

/**
 * The tags of the elements that are a reference and nothing else, dropped when what they name goes: every uuid pair's
 * referrer, and the tuple referrers with no identity of their own (no `uuid`) holding nothing but text or vendor data
 * (`FCDA`, `ClientLN`, `IEDName`, ...). A tuple referrer holding addresses or children of its own (`ConnectedAP`,
 * `GSE`, `SMV`) or carrying a uuid (`ExtRef`, `LNode`) is not one.
 */
export const DISPOSABLE_REFERENCE_TAGS: ReadonlySet<string> = new Set([
	...REFERENCE_TAG_NAMES,
	...Object.keys(TUPLE_REFERENCE_PAIRS).filter(isBareTupleReferrer),
])

function uuidPairReference(pair: ReferencePair): ReferenceUuid {
	return {
		uuid: pair.attribute.uuid,
		target: pair.target,
		names: [pair.attribute.path],
		form: 'path',
	}
}

function tuplePairReference(pair: TupleReferencePair): ReferenceUuid {
	return {
		uuid: pair.attribute.uuid,
		target: pair.target,
		names: tupleNamesOf(pair),
		form: 'tuple',
	}
}

/** The attributes of a tuple pair naming each part of its target's address, its IED among them when it names it. */
function tupleNamesOf(pair: TupleReferencePair): string[] {
	return Object.entries(pair.tuple).flatMap(([role, value]): string[] => {
		if (role !== 'ied') return typeof value === 'string' ? [value] : []
		return typeof value === 'object' && 'attribute' in value ? [value.attribute] : []
	})
}

function isBareTupleReferrer(tagName: string): boolean {
	const attributes = (ATTRIBUTES.byTag as Record<string, object>)[tagName] ?? {}
	const children = (CHILDREN as Record<string, readonly string[]>)[tagName] ?? []
	return !('uuid' in attributes) && children.every((child) => BARE_REFERENCE_CHILDREN.has(child))
}

function indexReferrersByTarget(): Map<string, UuidReferrer[]> {
	const referrersByTarget = new Map<string, UuidReferrer[]>()
	for (const [refTagName, references] of REFERENCE_UUIDS_BY_TAG) {
		for (const reference of references) {
			for (const target of reference.target) {
				const listed = referrersByTarget.get(target) ?? []
				const known = listed.some(
					(referrer) => referrer.refTagName === refTagName && referrer.uuidAttr === reference.uuid,
				)
				if (!known)
					referrersByTarget.set(target, [...listed, { refTagName, uuidAttr: reference.uuid }])
			}
		}
	}
	return referrersByTarget
}
