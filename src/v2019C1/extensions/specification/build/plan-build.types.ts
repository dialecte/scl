import type {
	BuildOpenValues,
	BuildRefusal,
	LNodeContainerTag,
	OpenValueUsed,
	PlannedLDevice,
} from '../transaction/build-ied.types'
import type { SectionElement, TargetLDevice } from './build-input.types'
import type { Scl } from '@/v2019C1/config'

/** The options of a build the planner reads. */
export type BuildOptions = {
	server?: Scl.Ref<'Server'>
	prefixFromLeafSubFunction: boolean
	openValues: BuildOpenValues
	excludeFunctionalConstraints: readonly string[]
	/** Other IED names each logical device name must also fit. */
	ldNameAlsoFits: readonly string[]
	/** Re-derive the logical device of every LNode built before from its function. */
	rederiveLDevices: boolean
}

/** Where an LNode's logical device comes from: the element holding it, or its own `ldInst`. */
export type LDeviceSource =
	| {
			kind: 'container'
			key: string
			container: SectionElement
			ref: Scl.Ref<LNodeContainerTag>
			/** No function-like holds the LNode: only the `ldInst` rule can name its logical device. */
			outsideFunction: boolean
	  }
	| {
			kind: 'ldInst'
			key: string
			inst: string
			ref: Scl.Ref<'LNode'>
			/** The key of the element whose logical device the LNode would land in without its `ldInst`. */
			containerKey: string
	  }

/** The name a container's logical device gets, before the per-build checks. */
export type ContainerName = {
	/** Empty when nothing is left of the name. */
	inst: string
	answered: boolean
	/** Another container of the document gets the same name. */
	clashes: boolean
}

/** One logical device of the plan while it is made. */
export type LDeviceDraft = PlannedLDevice & {
	/** The element the values asked for its added logical nodes are about. */
	element: Scl.Ref<Scl.ElementsOf>
	target?: TargetLDevice
}

/** What one step of the planner adds. */
export type PlanStep = { refusals: BuildRefusal[]; openValuesUsed: OpenValueUsed[] }
