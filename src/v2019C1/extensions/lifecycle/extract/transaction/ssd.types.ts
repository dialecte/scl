import type {
	AddressChoice,
	IedSelection,
	SsdExtractFileType,
	SsdExtractScope,
} from './extract.types'
import type { CarriedIeds } from './select-carried-ieds.types'
import type { Config } from '@/v2019C1/config'
import type { BoundIed } from '@/v2019C1/extensions/lifecycle/ied/bound-ieds.types'
import type { CarriedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/read-carried-communication.types'
import type { ReferencePlan } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/reference-closure.types'
import type * as Core from '@dialecte/core'

export type CarriedIedSectionsParams = {
	sourceQuery: Core.Query<Config>
	scopeRef: SsdExtractScope
	ieds: IedSelection
	fileType: SsdExtractFileType
	/** Absent: kept in an SCD, left out of an SSD. */
	addresses: AddressChoice | undefined
}

export type CarriedIedSections = {
	selection: CarriedIeds
	/** The file type written. */
	fileType: 'SSD' | 'SCD'
	references: ReferencePlan
	communication: CarriedCommunication
	/** The uuids of the source's logical nodes. */
	implementationUuids: ReadonlySet<string>
}

export type ResolveFileTypeParams = {
	fileType: SsdExtractFileType
	carried: readonly BoundIed[]
}
