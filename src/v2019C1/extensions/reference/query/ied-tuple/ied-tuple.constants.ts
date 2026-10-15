import { tupleTargetKind } from './tuple-target-kind'

import { getAttributeRules } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { TupleTargetKind } from './ied-tuple.types'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'

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
