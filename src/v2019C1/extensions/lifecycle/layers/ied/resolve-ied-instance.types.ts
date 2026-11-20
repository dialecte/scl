import type { AssertIedPlacementParams } from './assert-ied-placement.types'
import type { Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { AnyTrackedRecord } from '@dialecte/core'

export type ResolveIedInstanceParams = AssertIedPlacementParams & {
	/** The IED of the project the update starts from: required when the project holds several instances. */
	targetInstance: Scl.Ref<'IED'> | undefined
}

/** The uuid of the source IED, and the attribute the fork matches it by. */
export type ForkedIedParams = {
	uuid: string | undefined
	matchKey: MatchKey
}

/** The IED of the project an IED operation updates: `undefined` for a first placement. */
export type IedInstanceAnswer = { instance: AnyTrackedRecord | undefined }
