import type { Config } from '@/v2019C1/config'
import type { OtherIedImpact } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/** An element of another IED the update may change, with the group bringing it, before its IED is known. */
export type Candidate = Omit<OtherIedImpact, 'ied'>

/** A data set entry an update removes: what it sends and the uuids of the control blocks sending its data set. */
export type DataSetEntry = {
	lnUuid: string
	doName: string
	daName: string
	blockUuids: ReadonlySet<string>
	groupId: string
}

/** A reader of the project: the report's query or the apply's transaction. */
export type IedReader = Core.Query<Config> | Core.Transaction<Config>

/** What an IED update would change in other IEDs, and the groups bringing it: see `readOtherIedImpacts`. */
export type OtherIedImpacts = {
	impacts: OtherIedImpact[]
	/** The groups bringing a change to another IED: each waits for a decision. */
	decidingGroupIds: ReadonlySet<string>
}

/** An input of another IED subscribed to data entries of an IED's data sets send, with those entries (record ids). */
export type Subscription = {
	input: { tagName: string; id: string }
	entryIds: string[]
}
