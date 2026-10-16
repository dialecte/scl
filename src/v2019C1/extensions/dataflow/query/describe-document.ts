import { EXT_REF_CONTROL_BLOCK } from '../constants/ext-ref-state.constants'
import { describeElement } from './describe-element'
import { describeSignal } from './describe-signal'
import { extRefDataflowKey } from './ext-ref-dataflow-key'

import type { Dataflow, ImplementationOnlyDataflow, SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'

/**
 * Every dataflow of the document, read through one context: each signal of the process section
 * (templates included) in document order, described as `ofSourceRef` / `ofControlRef` describe it,
 * then, in document order, each ExtRef naming a control block that no signal resolved to.
 */
export async function describeDocument(params: { context: DataflowContext }): Promise<Dataflow[]> {
	const { context } = params
	const { signals } = await context.processSection()
	const specified = await Promise.all(
		[...signals.values()].map(({ ref }) => describeSignal({ ref, context })),
	)
	const implementationOnly = await describeImplementationOnly({ specified, context })
	return [...specified, ...implementationOnly]
}

/**
 * The ExtRefs naming a control block that none of the described signals resolved to, each as a
 * dataflow of its own. An ExtRef of the same control block and signal as one a signal resolved to
 * (the ExtRefs of the data attributes of one data object) belongs to that dataflow.
 */
async function describeImplementationOnly(params: {
	specified: readonly SpecifiedDataflow[]
	context: DataflowContext
}): Promise<ImplementationOnlyDataflow[]> {
	const { specified, context } = params
	const { extRefs } = await context.iedSection()
	const resolvedElementIds = new Set(
		specified.flatMap(({ implementation }) =>
			implementation.element ? [implementation.element.id] : [],
		),
	)
	const resolved = await withKeys({
		extRefs: extRefs.filter((extRef) => resolvedElementIds.has(extRef.record.id)),
		context,
	})
	const resolvedKeys = new Set(resolved.map(({ key }) => key))

	const naming = await extRefsNamingControlBlock({
		extRefs: extRefs.filter((extRef) => !resolvedElementIds.has(extRef.record.id)),
		context,
	})
	const named = await withKeys({ extRefs: naming, context })
	const unresolved = named.filter(({ key }) => key === undefined || !resolvedKeys.has(key))
	return Promise.all(
		unresolved.map(({ extRef }) => describeExtRefAlone({ element: extRef, context })),
	)
}

/** Each ExtRef with its dataflow key (see `extRefDataflowKey`). */
function withKeys(params: {
	extRefs: readonly IedNode<'ExtRef'>[]
	context: DataflowContext
}): Promise<{ extRef: IedNode<'ExtRef'>; key: string | undefined }[]> {
	const { extRefs, context } = params
	return Promise.all(
		extRefs.map(async (extRef) => ({ extRef, key: await extRefDataflowKey({ extRef, context }) })),
	)
}

/** An ExtRef no signal links to: implemented, as the element it is. */
async function describeExtRefAlone(params: {
	element: IedNode<'ExtRef'>
	context: DataflowContext
}): Promise<ImplementationOnlyDataflow> {
	const { element, context } = params
	const facts = await describeElement({ element, context })
	return {
		kind: 'implementation-only',
		element: element.ref,
		implementation: { state: 'implemented', ...facts },
	}
}

/** The ExtRefs naming their control block, by its uuid or by its names, in the order given. */
async function extRefsNamingControlBlock(params: {
	extRefs: readonly IedNode<'ExtRef'>[]
	context: DataflowContext
}): Promise<IedNode<'ExtRef'>[]> {
	const { extRefs, context } = params
	const naming: IedNode<'ExtRef'>[] = []
	for (const extRef of extRefs) {
		if (await namesControlBlock({ extRef, context })) naming.push(extRef)
	}
	return naming
}

/** Whether an ExtRef names its control block, by its uuid or by its names. */
async function namesControlBlock(params: {
	extRef: IedNode<'ExtRef'>
	context: DataflowContext
}): Promise<boolean> {
	const { extRef, context } = params
	for (const name of EXT_REF_CONTROL_BLOCK.names) {
		if (await context.query.any.getAttribute(extRef.record, { name })) return true
	}
	return false
}
