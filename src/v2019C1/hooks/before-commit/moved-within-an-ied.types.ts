import type { MovePlaces, MovedRecord } from './moved-roots.types'
import type { AnyRawRecord } from '@dialecte/core'

/** One move of the commit, judged or followed over the document the move step read once. */
export type MoveJudgedParams = { places: MovePlaces; move: MovedRecord }

/** An address (`GSE` / `SMV`) a logical device moved to another access point carries: where it sits and where it goes. */
export type CarriedAddress = {
	address: AnyRawRecord
	/** The connection of the old access point holding it. */
	from: AnyRawRecord
	subNetwork: AnyRawRecord
	/** The connection of the new access point on the same subnetwork; none when it is not connected there. */
	connection: AnyRawRecord | undefined
}

/** An address with no connection of the new access point on its subnetwork to go to. */
export type UnconnectedAddress = { address: AnyRawRecord; subNetwork: AnyRawRecord }

/** The tuple names to write for the targets moved within their IED, over what the commit's earlier steps wrote. */
export type MovedTargetNamesParams = {
	places: MovePlaces
	pending: ReadonlyMap<string, AnyRawRecord>
}
