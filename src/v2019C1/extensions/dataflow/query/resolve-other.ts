import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { parseReferencePath } from '@/v2019C1/extensions/reference/query/resolve/parse-path'

import type { SignalPairs, SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { SectionNode } from './section-node.types'

/**
 * The LNode a signal is linked to, and the data it names there: the LNode its uuid names, else the
 * one its path names (the last of a path, as when a file is imported). The data comes from the
 * signal's own data attributes when written, else from the qualifier its path carries. A signal
 * that names a data attribute (a SourceRef) reads `DO.DA` as the data object up to the first dot and
 * the rest as the data attribute, so a path through a sub data object reads that sub data object
 * into `daName`; a signal that does not (a ControlRef) reads the whole qualifier as the data object.
 * `undefined` while the signal names no LNode, or the one it names is not in the document.
 */
export async function resolveOther(params: {
	pairs: SignalPairs['specification']
	attributes: Readonly<Record<string, string>>
	context: DataflowContext
}): Promise<
	| {
			lnode: SectionNode<'LNode'>
			data: Pick<NonNullable<SpecifiedDataflow['specification']['other']>, 'doName' | 'daName'>
	  }
	| undefined
> {
	const { pairs, attributes, context } = params
	const { lnodeByUuid, lnodeByPath } = await context.processSection()

	const uuid = attributes[pairs.uuid]
	const path = attributes[pairs.path]
	const parsed = path
		? parseReferencePath({
				resolution: RESOLUTION_TYPE.lnode,
				pathAttribute: pairs.path,
				pathValue: path,
			})
		: null

	const lnode = uuid
		? lnodeByUuid.get(uuid)
		: parsed
			? lnodeByPath.get(parsed.lookupKey)
			: undefined
	if (!lnode) return undefined

	const fromPath = splitQualifier({
		qualifier: parsed?.qualifier,
		namesDataAttribute: Boolean(pairs.daName),
	})
	const doName = (pairs.doName && attributes[pairs.doName]) || fromPath.doName
	const daName = (pairs.daName && attributes[pairs.daName]) || fromPath.daName
	return {
		lnode,
		data: { ...(doName ? { doName } : {}), ...(daName ? { daName } : {}) },
	}
}

/** The data object, and the data attribute, a path qualifier carries. */
function splitQualifier(params: { qualifier: string | undefined; namesDataAttribute: boolean }): {
	doName?: string
	daName?: string
} {
	const { qualifier, namesDataAttribute } = params
	if (!qualifier) return {}
	if (!namesDataAttribute) return { doName: qualifier }
	const [doName, ...rest] = qualifier.split('.')
	return { doName, ...(rest.length > 0 ? { daName: rest.join('.') } : {}) }
}
