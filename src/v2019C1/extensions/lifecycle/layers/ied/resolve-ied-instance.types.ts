import type { AssertIedPlacementParams } from './assert-ied-placement.types'
import type { Scl } from '@/v2019C1/config'

export type ResolveIedInstanceParams = AssertIedPlacementParams & {
	/** The IED of the project the update starts from: required when the project holds several instances. */
	targetInstance: Scl.Ref<'IED'> | undefined
}
