import type { InstanceLevels } from './resolve-instance-levels.types'
import type { InstanceAdditions } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references.types'

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
