import { LNODE_TYPE_ATTRIBUTE } from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { splitDataPath } from '@/v2019C1/extensions/data-model/query/split-data-path'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { parseReferencePath } from '@/v2019C1/extensions/reference/query/resolve/parse-path'

import type { SignalPairs, SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { SectionNode } from './section-node.types'

/**
 * The LNode a signal is linked to, and the data it names there: the LNode its uuid names, else the
 * one its path names (the last of a path, as when a file is imported). The data comes from the
 * signal's own data attributes when written. Else it comes from the qualifier its path carries
 * (`PhV.phsA.cVal.mag.f`), which is returned as written (`dataPath`) and split between the data
 * object and the data attribute against the data model of the LNode's logical node type: never at
 * the first dot, a sub data object and a nested data attribute have dots too. When the data model
 * cannot be followed (no type, a name it lacks) nothing is split: `doName` and `daName` stay absent.
 * A signal that names no data attribute (a ControlRef) carries a data object only. `undefined`
 * while the signal names no LNode, or the one it names is not in the document.
 */
export async function resolveOther(params: {
	pairs: SignalPairs['specification']
	attributes: Readonly<Record<string, string>>
	context: DataflowContext
}): Promise<
	| {
			lnode: SectionNode<'LNode'>
			data: Pick<
				NonNullable<SpecifiedDataflow['specification']['other']>,
				'doName' | 'daName' | 'dataPath'
			>
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

	const doName = pairs.doName && attributes[pairs.doName]
	if (doName) {
		const daName = pairs.daName && attributes[pairs.daName]
		return { lnode, data: { doName, ...(daName ? { daName } : {}) } }
	}
	return { lnode, data: await dataOfPath({ qualifier: parsed?.qualifier, lnode, pairs, context }) }
}

/** The data a path qualifier names: the qualifier as written, and its split when the data model gives one. */
async function dataOfPath(params: {
	qualifier: string | undefined
	lnode: SectionNode<'LNode'>
	pairs: SignalPairs['specification']
	context: DataflowContext
}): Promise<{ doName?: string; daName?: string; dataPath?: string }> {
	const { qualifier, lnode, pairs, context } = params
	if (!qualifier) return {}
	const lnType = await context.query.any.getAttribute(lnode.record, { name: LNODE_TYPE_ATTRIBUTE })
	const types = lnType ? await context.dataTypes() : undefined
	const split =
		lnType && types
			? splitDataPath({ qualifier, lnType, types, dataObjectOnly: !pairs.daName })
			: undefined
	return { ...split, dataPath: qualifier }
}
