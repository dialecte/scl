import { tupleTargetKind } from './tuple-target-kind'

import { getAttributeRules } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { TupleTargetKind } from './ied-tuple.types'
import type { TupleReferencePair, TupleRole } from '@/v2019C1/constants/reference-pairs.types'

/** The IED-section elements a tuple reference names, and what each is: read from the registry. */
export const TUPLE_TARGET_KINDS: ReadonlyMap<string, TupleTargetKind> = new Map(
	Object.values(TUPLE_REFERENCE_PAIRS).flatMap((pairs) =>
		(pairs as readonly TupleReferencePair[]).flatMap((pair) =>
			pair.target.map((tagName): [string, TupleTargetKind] => [
				tagName,
				tupleTargetKind(pair.tuple),
			]),
		),
	),
)

/** The tags of each kind of tuple target (`ln`: LN and LN0): read from `TUPLE_TARGET_KINDS`. */
export const TUPLE_TARGET_TAGS_BY_KIND: ReadonlyMap<TupleTargetKind, readonly string[]> = new Map(
	[...new Set(TUPLE_TARGET_KINDS.values())].map((kind) => [
		kind,
		[...TUPLE_TARGET_KINDS].flatMap(([tagName, tagKind]) => (tagKind === kind ? [tagName] : [])),
	]),
)

/**
 * The class of LN0, fixed by the schema: the logical node of a control block named without one (GOOSE
 * and sampled value control blocks are held by LN0 only).
 */
export const LN0_LN_CLASS: string =
	getAttributeRules({
		dialecteConfig: SCL_DIALECTE_CONFIG,
		record: { tagName: 'LN0', parent: null, attributes: [] },
		attributeName: 'lnClass',
	}).fixed ?? ''

/** The parts of an address the tuple references name beside their IED: read from the registry. */
export const TUPLE_ROLES: readonly TupleRole[] = [
	...new Set(
		Object.values(TUPLE_REFERENCE_PAIRS).flatMap((pairs) =>
			(pairs as readonly TupleReferencePair[]).flatMap(
				(pair) => Object.keys(pair.tuple).filter((role) => role !== 'ied') as TupleRole[],
			),
		),
	),
]
