import { cloneProcessSection, settleProcessSection } from './process-section'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { resolveSsdScope } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { SsdParams, SsdResult } from './ssd.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the process-section content carried by an SSD into a target project.
 *
 * The topology layer OWNS its frame: `cloneTopologyContent` REPRODUCES the source structural
 * skeleton (Substation/VoltageLevel/Bay + BayType + equipment) by name under `targetParent`, then
 * consumes the application/function layers to place the Applications + their composed Functions +
 * standalone Functions (with the type closure) under the name-correct level. Cross-cutting satellites
 * travel too; then the identity the scenario places with applies (a new instance, for bay-typical reuse = fresh
 * uuid + templateUuid; a fork, for a project base = preserved uuids). The placement is recorded once as a
 * document-level `SclFileReference` under the target `Header > SourceFiles`, in every scenario.
 *
 * The scope is the element the consumer names; the `TEMPLATE` scaffolding, named or read from the file when
 * nothing is, is walked down `Substation -> VoltageLevel -> Bay` to the unit it holds (see `resolveSsdScope`).
 *
 * @intent instantiate an SSD into a project, add a bay typical or process section from a template, use an SSD as a project base
 */
export async function ssd(tx: Core.Transaction<Config>, params: SsdParams): Promise<SsdResult> {
	const { sourceQuery, scopeRef, targetParent, overrides, decisionMappings } = params
	const policy = scenarioPolicy({ scenario: params.scenario ?? 'instantiate' })

	const scope = await resolveSsdScope(sourceQuery, { ref: scopeRef })
	if (!scope) {
		throwDialecteError(SCL_ERRORS.TEMPLATE_ROOT_NOT_FOUND, {
			detail: 'instantiate.ssd: no instantiable root found in the SSD',
		})
	}
	const cloned = await cloneProcessSection(tx, {
		sourceQuery,
		scope,
		targetParent,
		policy,
		decisionMappings,
		leftOut: params.leftOut,
	})
	// the consumer left everything out: nothing is written, not even where it came from
	if (!cloned) return { scopeRef: scope.root, cloneMappings: [] }

	// Stamp/keep lineage + fix up refs (remap for stamp, restore for keep) in one seam.
	await finalizeClonedIdentity(tx, {
		cloneMappings: cloned.cloneMappings,
		mode: policy.placementIdentity,
		redirectMappings: cloned.redirectMappings,
	})
	await settleProcessSection(tx, {
		sourceQuery,
		cloned,
		targetParent,
		policy,
		overrides,
		decisionMappings,
		cloneMappings: cloned.cloneMappings,
	})

	// One document-level provenance link back to the source SSD.
	await writeProvenance(tx, { sourceQuery, target: { anchor: 'document', fileType: 'SSD' } })

	return { scopeRef: scope.root, cloneMappings: cloned.cloneMappings }
}
