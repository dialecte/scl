import { SIGNAL_PAIRS } from '../constants/signal-pairs.constants'
import { extCtrlState } from './ext-ctrl-state'
import { extRefState } from './ext-ref-state'
import { findDanglingLinks } from './find-dangling-links'
import { namesTarget } from './names-target'
import { readElementLinks } from './read-element-links'
import { resolveControlBlock } from './resolve-control-block'
import { resolveImplementation } from './resolve-implementation'
import { resolveRegistration } from './resolve-registration'

import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { readRawAttributes } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { ExtCtrlState, ExtRefState, SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'
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

	const controlBlock =
		element?.record.tagName === 'ExtRef'
			? await resolveControlBlock({ extRef: element as IedNode<'ExtRef'>, context })
			: undefined

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
	const elementLinks = element
		? await readElementLinks({
				element,
				controlBlockFound: controlBlock !== undefined,
				context,
			})
		: []
	const elementDangling = element
		? findDanglingLinks({
				element: element.ref,
				attributes: readRawAttributes(element.record),
				links: elementLinks,
			})
		: []

	return {
		state: namesTarget({ pairs, resolution: RESOLUTION_TYPE.iedAddress, attributes })
			? 'implemented'
			: 'unimplemented',
		element: element?.ref,
		binding: element && bindingOf(element),
		ln: element?.ln,
		ied: element?.ied,
		controlBlock: controlBlock?.ref,
		publisher: controlBlock?.ied,
		registration:
			controlBlock && resolveRegistration({ controlBlock, extRef: element as IedNode<'ExtRef'> }),
		dangling: [...signalDangling, ...elementDangling],
	}
}

/** How completely an ExtRef / ExtCtrl is written, by the ladder of its kind. */
function bindingOf(element: IedNode<'ExtRef' | 'ExtCtrl'>): ExtRefState | ExtCtrlState {
	const attributes = readRawAttributes(element.record)
	return element.record.tagName === 'ExtCtrl'
		? extCtrlState({ attributes })
		: extRefState({ attributes })
}

/** The attribute a signal names a target by: its uuid when written (it wins), else its path. */
function namedBy(params: {
	pairs: { uuid: string; path: string }
	attributes: Readonly<Record<string, string>>
}): string {
	const { pairs, attributes } = params
	return attributes[pairs.uuid] ? pairs.uuid : pairs.path
}
