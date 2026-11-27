import type { CarriedCommunication } from './read-carried-communication.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { ReferencePlan } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/reference-closure.types'
import type * as Core from '@dialecte/core'

export type CloneCarriedIedsParams = {
	sourceQuery: Core.Query<Config>
	/** Where the IEDs and their Communication sections are written: the target's root. */
	targetParent: Scl.Ref<Scl.ElementsOf>
	ieds: readonly Scl.Ref<'IED'>[]
	/** The cut of their references: what is left out and the attributes edited. */
	references: ReferencePlan
	communication: CarriedCommunication
}
