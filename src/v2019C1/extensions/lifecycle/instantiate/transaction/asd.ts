import { resolveTargetStructure } from './resolve-target-structure'

import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { cloneApplicationContent } from '@/v2019C1/extensions/lifecycle/layers/application'

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
 * The clone's uuid references are remapped by the `afterDeepClone` hook; SET policy
 * (naming, `ApplicationSclRef` provenance, assign-to-application) is applied by
 * consumer-registered hooks, not here.
 */
export async function asd(tx: Core.Transaction<Config>, params: AsdParams): Promise<void> {
	const { sourceQuery, applicationRef, targetParent } = params

	const structure = await resolveTargetStructure(tx, targetParent)
	const mappings = await cloneApplicationContent(tx, {
		sourceQuery,
		applicationRef,
		structure,
	})

	await writeIdentity(tx, { mappings, mode: 'stamp-template' })
}
