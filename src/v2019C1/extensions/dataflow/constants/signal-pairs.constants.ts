import { invariant } from '@dialecte/core/utils'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { dataCompanionsOf } from '@/v2019C1/extensions/reference/query/build/data-companions'

import type { SignalPairs, SpecifiedDataflow } from '../dataflow.types'
import type { Scl } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference'

// How the signals name their two links, read from the reference pairs: the pair resolved as an
// `lnode` names the logical node the signal is linked to, the pair resolved as an `ied-address`
// names the element implementing it.

/**
 * The attribute through which a SourceRef and the ExtRef implementing it name the data attribute they
 * carry: what tells ExtRefs sharing one internal address apart. It is a data attribute, not a
 * reference attribute, so it is the one name written here.
 */
export const SIGNAL_DATA_ATTRIBUTE = 'pDA' satisfies Scl.AttributesOf<'ExtRef'> &
	Scl.AttributesOf<'SourceRef'>

/** The attribute of a SourceRef holding the service it asks for. */
export const SOURCE_REF_SERVICE_ATTRIBUTE = 'service' satisfies Scl.AttributesOf<'SourceRef'>

/** The direction of a signal, by tag: a SourceRef is an input of its LNode, a ControlRef an output. */
export const SIGNAL_DIRECTION: Readonly<
	Record<'SourceRef' | 'ControlRef', SpecifiedDataflow['direction']>
> = { SourceRef: 'input', ControlRef: 'output' }

/** The signals of the specification, by tag. */
export const SIGNAL_PAIRS: Readonly<Record<'SourceRef' | 'ControlRef', SignalPairs>> = {
	SourceRef: signalPairsOf(UUID_REFERENCE_PAIRS.SourceRef),
	ControlRef: signalPairsOf(UUID_REFERENCE_PAIRS.ControlRef),
}

function signalPairsOf(pairs: readonly ReferencePair[]): SignalPairs {
	const specification = pairs.find((pair) => pair.resolution === RESOLUTION_TYPE.lnode)
	const implementation = pairs.find((pair) => pair.resolution === RESOLUTION_TYPE.iedAddress)
	invariant(specification && implementation, {
		key: 'ASSERTION_FAILED',
		detail: 'a signal names a logical node and the element implementing it',
	})
	const { doAttribute, daAttribute } = dataCompanionsOf(specification)
	return {
		specification: {
			uuid: specification.attribute.uuid,
			path: specification.attribute.path,
			doName: doAttribute,
			daName: daAttribute,
		},
		implementation: {
			uuid: implementation.attribute.uuid,
			path: implementation.attribute.path,
			resolution: implementation.resolution,
			targets: implementation.target,
		},
		further: pairs
			.filter((pair) => pair !== specification && pair !== implementation)
			.map((pair) => ({ uuid: pair.attribute.uuid, targets: pair.target })),
	}
}

/** The elements the further references of the signals name: their uuids are read to tell a reference naming nothing. */
export const SIGNAL_FURTHER_TARGET_TAGS: ReadonlySet<string> = new Set(
	Object.values(SIGNAL_PAIRS).flatMap((signalPairs) =>
		signalPairs.further.flatMap((pair) => pair.targets),
	),
)
