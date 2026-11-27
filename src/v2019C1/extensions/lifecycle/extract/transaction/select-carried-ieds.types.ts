import type { ExtractWarning, IedSelection, SsdExtractScope } from './extract.types'
import type { BoundIed } from '@/v2019C1/extensions/lifecycle/ied/bound-ieds.types'

export type SelectCarriedIedsParams = {
	scopeRef: SsdExtractScope
	ieds: IedSelection
}

export type CarriedIeds = {
	/** The IEDs the extract carries, in document order. */
	carried: readonly BoundIed[]
	/** One `ied-not-carried` per IED tied to the scope that the selection leaves out. */
	warnings: readonly ExtractWarning[]
}

export type CarriesParams = {
	selection: IedSelection
	entry: BoundIed
}
