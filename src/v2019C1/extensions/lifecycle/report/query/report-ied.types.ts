import type { Scl } from '@/v2019C1/config'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

export type WithCompanionParams = {
	instanceDiff: InstanceDiff
	iedRef: Scl.Ref<'IED'>
	/** What the IED's Communication part adds to the project's, when the source holds one for it. */
	companion: InstanceDiff | undefined
}
