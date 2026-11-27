import { planReferences } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/plan-references'

import type { IedContentSelection } from './select-ied-content.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	ClosureRoot,
	ReferencePolicy,
} from '@/v2019C1/extensions/lifecycle/layers/reference-closure/reference-closure.types'
import type * as Core from '@dialecte/core'

/**
 * Select what a real IED's file writes of the IED: the IED as the project holds it, its references to what the file does not
 * hold cut by the file's `policy` (`planReferences`): a CID reduces inputs and outputs bound to an IED absent from the file,
 * an IID keeps them and lists them; receivers, report clients, associations, key distribution entries and supervisions naming
 * one are kept and listed, or left out. The IEDs sending to it (`senders`) count as held by the file.
 */
export async function selectRealIedContent(
	query: Core.Query<Config>,
	params: {
		iedRef: Scl.Ref<'IED'>
		destinationQuery: Core.Query<Config>
		/** What the file does with each reference to what it does not hold. */
		policy: ReferencePolicy
		/** The IEDs sending to the IED the file holds, cut to their interface: inside, their own references left to the closure. */
		senders: readonly ClosureRoot[]
	},
): Promise<IedContentSelection> {
	const { iedRef, destinationQuery, policy, senders } = params
	const plan = await planReferences({
		roots: [{ ref: iedRef, depth: 'whole' }, ...senders],
		sourceQuery: query,
		destinationQuery,
		policy,
	})
	return { leaveOut: plan.leaveOut, warnings: [...plan.warnings], edits: plan.edits }
}
