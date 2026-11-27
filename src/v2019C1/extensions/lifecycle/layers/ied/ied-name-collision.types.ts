import type { Config, Scl } from '@/v2019C1/config'
import type { IedCollisions } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'

export type IedNameClaimParams = {
	/** The root the IED is placed under. */
	anchor: Scl.Ref<'SCL'>
	/** The name the IED would take. */
	name: string
	/** The IED itself when it is already staged, so it never collides with itself. */
	excludeId?: string
}

/** Whether a name is taken under the project root, and the name numbering would write instead. */
export type IedNameClaim = { taken: boolean; proposal: string }

export type AssertIedNameFreeParams = IedNameClaimParams

export type ReadIedNameParams = {
	sourceQuery: Core.Query<Config>
	iedRef: Scl.Ref<'IED'>
	/** The name the consumer chose, when it chose one. */
	chosen?: string
}

export type WithNameClaimParams = {
	/** The report instance of the first placement. */
	reportInstance: ReportInstance
	sourceQuery: Core.Query<Config>
	iedRef: Scl.Ref<'IED'>
	anchor: Scl.Ref<'SCL'>
	/** What the consumer asked for, absent: the default of the identity placed with. */
	collisions: IedCollisions | undefined
	placementIdentity: ScenarioPolicy['placementIdentity']
}

export type ResolveIedCollisionsParams = {
	/** What the consumer asked for, absent: the default of the identity placed with. */
	collisions: IedCollisions | undefined
	placementIdentity: ScenarioPolicy['placementIdentity']
}

export type AssertPlacedIedNameParams = IedNameClaimParams & {
	/** Whether the name is the one the consumer chose (checked against the IED name type), not the source IED's. */
	chosen: boolean
	/** What the placement does with a taken name, resolved. */
	collisions: IedCollisions
}

/** Why a placement asks for a name, and the name it proposes. */
export type AskedName = { reason: 'name-taken' | 'name-template'; proposal: string }

export type AskedNameParams = {
	anchor: Scl.Ref<'SCL'>
	name: string
	/** The name's claim, already read. */
	claim: IedNameClaim
}

export type RefuseIedNameParams = {
	name: string
	/** The step of the IED name type that refused it, or `template`. */
	issue: string
}
