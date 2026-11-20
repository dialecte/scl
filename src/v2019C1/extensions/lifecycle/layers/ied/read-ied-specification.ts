import { resolveSpecificationInstance } from './resolve-specification-instance'

import {
	resolveSsdScope,
	resolveTopologyReconcilables,
} from '@/v2019C1/extensions/lifecycle/layers/topology'

import type { IedSpecification, ReadIedSpecificationParams } from './read-ied-specification.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The specification an ISD carries beside its IED (its substation section, see `resolveSsdScope`) and what the project
 * holds of it for one IED (`resolveSpecificationInstance`), read before the IED is updated: what binds to the IED then
 * tells its specification. An application or function of it whose instance is not told apart, or of which only another
 * placement's is there, is left out of the scope: neither reported nor written. `undefined` for another file, or an ISD carrying none. Read alike by the report and the
 * apply.
 */
export async function readIedSpecification(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: ReadIedSpecificationParams,
): Promise<IedSpecification | undefined> {
	const { sourceQuery, fileType, iedRef, matchKey } = params
	if (fileType !== 'ISD') return undefined
	const scope = await resolveSsdScope(sourceQuery, {})
	if (!scope) return undefined
	const reconcilables = await resolveTopologyReconcilables(sourceQuery, {
		scopeRef: scope.root,
		leftOut: scope.leftOut,
	})
	const instance = await resolveSpecificationInstance(reader, {
		sourceQuery,
		iedRef,
		scope,
		reconcilables,
		matchKey,
	})
	const leftOut = instance?.leftOut
	if (!leftOut?.size) return { scope, reconcilables, instance }
	return {
		scope: { ...scope, leftOut: new Set([...scope.leftOut, ...leftOut]) },
		reconcilables: {
			applications: reconcilables.applications.filter((primary) => !leftOut.has(primary.id)),
			standaloneFunctions: reconcilables.standaloneFunctions.filter(
				(primary) => !leftOut.has(primary.id),
			),
		},
		instance,
	}
}
