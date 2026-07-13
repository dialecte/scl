import { resolveTargetStructure } from './resolve-target-structure'

import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { cloneApplicationContent } from '@/v2019C1/extensions/lifecycle/layers/application'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/satellites/clone-applied-satellites'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { AsdParams } from './asd.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the Application carried by an ASD into a target document.
 *
 * Clones the application-layer content (Application + its Functions, categories and
 * satellites, with type closure) under the structure resolved from `targetParent`
 * (`layers/application`), then stamps instance lineage (`identity.writeIdentity` in
 * `stamp-template` mode) on every cloned element.
 *
 * The clone's uuid references are remapped by the `afterDeepClone` hook. The
 * instantiation provenance link (`ApplicationSclRef` -> `SclFileReference` back to
 * the ASD) is written on the cloned root by `reference.writeProvenance`; SET policy
 * (naming, assign-to-application) is applied by consumer hooks, not here.
 */
export async function asd(tx: Core.Transaction<Config>, params: AsdParams): Promise<void> {
	const { sourceQuery, applicationRef, targetParent } = params

	const structure = await resolveTargetStructure(tx, targetParent)
	const mappings = await cloneApplicationContent(tx, {
		sourceQuery,
		applicationRef,
		structure,
	})

	// external cross-cutting satellites (Variable / BehaviorDescription) applying to
	// any element in the Application subtree travel with it
	const appliedMappings = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: applicationRef,
		structure,
		strip: false,
	})

	await writeIdentity(tx, { mappings: [...mappings, ...appliedMappings], mode: 'stamp-template' })

	const rootMapping = mappings.find((mapping) => mapping.source.id === applicationRef.id)
	if (rootMapping) {
		await writeProvenance(tx, {
			sourceQuery,
			targetRoot: rootMapping.target,
			fileType: 'ASD',
		})
	}
}
