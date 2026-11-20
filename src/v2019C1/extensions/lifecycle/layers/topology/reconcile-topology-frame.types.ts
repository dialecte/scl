import type { InstanceLevels } from './resolve-instance-levels.types'
import type { Scl } from '@/v2019C1/config'
import type { InstanceAdditions } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references.types'
import type { AnyRefOrRecord } from '@dialecte/core'

/** What reconciling the frame of each instance of a unit wrote, and where its levels now stand. */
export type FrameReconciliation = {
	/** What was added to each frame instance: its references are repointed once the fn/app cascade ran. */
	additions: InstanceAdditions[]
	/**
	 * Where each level of the unit stands for each instance once reconciled — the levels it created
	 * included: where the primaries the template gained are placed.
	 */
	instanceLevelsList: InstanceLevels[]
}

/** One instance of the unit, once the frame's additions are written: where its levels stand, what was added. */
export type FrameBeforeRemovalsParams = {
	instanceRootRef: AnyRefOrRecord
	instanceLevels: InstanceLevels
	added: readonly Scl.CloneMapping[]
}

/** The levels of one instance, and the levels the frame's additions created there, by source id. */
export type LevelsStandingParams = {
	instanceLevels: InstanceLevels
	created: ReadonlyMap<string, AnyRefOrRecord>
}
