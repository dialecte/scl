import { SIGNAL_PAIRS } from '../constants/signal-pairs.constants'
import { UNRESOLVED_ELEMENT } from '../constants/unresolved-element.constants'
import { describeElement } from './describe-element'
import { findDanglingLinks } from './find-dangling-links'
import { namesTarget } from './names-target'
import { resolveImplementation } from './resolve-implementation'

import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

import type { SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { SectionNode } from './section-node.types'
import type { Scl } from '@/v2019C1/config'

/** What implements a signal: the element it names, where it sits, how completely it is written. */
export async function describeImplementation(params: {
	ref: Scl.Ref<'SourceRef' | 'ControlRef'>
	holder: SectionNode<'LNode'>
	/** Whether the logical node the signal is linked to was found. */
	otherFound: boolean
	attributes: Readonly<Record<string, string>>
	context: DataflowContext
}): Promise<SpecifiedDataflow['implementation']> {
	const { ref, holder, otherFound, attributes, context } = params
	const pairs = PAIRS_BY_REF.get(ref.tagName) ?? []
	const implementationPairs = SIGNAL_PAIRS[ref.tagName].implementation
	const { element, ambiguous } = await resolveImplementation({
		pairs: implementationPairs,
		attributes,
		holder,
		context,
	})

	const specificationPairs = SIGNAL_PAIRS[ref.tagName].specification
	const { uuidsByTag } = await context.processSection()
	const signalDangling = findDanglingLinks({
		element: ref,
		attributes,
		links: [
			{ attribute: namedBy({ pairs: specificationPairs, attributes }), found: otherFound },
			{
				attribute: namedBy({ pairs: implementationPairs, attributes }),
				// an address fitting several elements is not an address naming nothing
				found: element !== undefined || ambiguous,
			},
			...SIGNAL_PAIRS[ref.tagName].further.map((pair) => ({
				attribute: pair.uuid,
				found: pair.targets.some((tagName) => uuidsByTag.get(tagName)?.has(attributes[pair.uuid])),
			})),
		],
	})
	const elementFacts = element ? await describeElement({ element, context }) : UNRESOLVED_ELEMENT

	return {
		state: namesTarget({ pairs, resolution: RESOLUTION_TYPE.iedAddress, attributes })
			? 'implemented'
			: 'unimplemented',
		...elementFacts,
		dangling: [...signalDangling, ...elementFacts.dangling],
	}
}

/** The attribute a signal names a target by: its uuid when written (it wins), else its path. */
function namedBy(params: {
	pairs: { uuid: string; path: string }
	attributes: Readonly<Record<string, string>>
}): string {
	const { pairs, attributes } = params
	return attributes[pairs.uuid] ? pairs.uuid : pairs.path
}
