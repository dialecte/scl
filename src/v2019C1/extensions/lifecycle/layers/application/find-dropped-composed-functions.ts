import { toRef } from '@dialecte/core/helpers'

import { classifyUnmatched } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import {
	carriesOwnProvenance,
	collectComposedFunctionUuids,
	isLastReferrer,
} from '@/v2019C1/extensions/lifecycle/instance'

import type { FindDroppedComposedFunctionsParams } from './find-dropped-composed-functions.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { DroppedElement } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type * as Core from '@dialecte/core'

/**
 * The functions the instances of an application compose that the newer application no longer does: each dropped by
 * it, or the project's own (`classifyUnmatched`), by the instance it is listed for — once, for the first instance
 * composing it. Read before the update removes any instance's references to them. Left out: a function with no
 * lineage under the scenario's key, one placed from a function file of its own (it records it), and one an
 * application the update does not go through still composes — a function may be shared by several applications.
 */
export async function findDroppedComposedFunctions(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: FindDroppedComposedFunctionsParams,
): Promise<Map<string, DroppedElement[]>> {
	const { sourceQuery, applicationRef, instances, matchKey, removalBase } = params

	const composed = await collectComposedFunctionUuids(sourceQuery, applicationRef)
	const leavingIds = new Set(instances.map((instance) => instance.id ?? ''))
	const listed = new Set<string>()
	const droppedByInstance = new Map<string, DroppedElement[]>()
	for (const instance of instances) {
		const instanceRef = toRef(instance) as Scl.Ref<'Application'>
		const referred = await collectComposedFunctionUuids(reader, instanceRef)
		const dropped: DroppedElement[] = []
		for (const functionUuid of referred) {
			const [composedFunction] = await reader.any.findByAttributes({
				tagName: 'Function',
				attributes: { uuid: functionUuid },
			})
			if (!composedFunction || listed.has(composedFunction.id)) continue
			const lineage = await reader.any.getAttribute(composedFunction, { name: matchKey })
			if (!lineage) continue
			const change = classifyUnmatched({ lineage, inSource: composed.has(lineage), removalBase })
			if (change === 'still-held') continue
			if (await carriesOwnProvenance(reader, composedFunction)) continue
			const lastReferred = await isLastReferrer(reader, {
				target: toRef(composedFunction) as Scl.Ref<Scl.ElementsOf>,
				containerTagName: 'Application',
				leavingIds,
			})
			if (!lastReferred) continue
			listed.add(composedFunction.id)
			dropped.push({ element: composedFunction, change })
		}
		droppedByInstance.set(instance.id ?? '', dropped)
	}
	return droppedByInstance
}
