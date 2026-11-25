import { planReferences } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/plan-references'
import { CID_REFERENCE_POLICIES } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/reference-closure.constants'

import type { IedContentSelection } from './select-ied-content.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ClientRefs } from '@/v2019C1/extensions/lifecycle/extract/transaction/ied.types'
import type { ClosureRoot } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/reference-closure.types'
import type * as Core from '@dialecte/core'

/**
 * Select what a real IED's file writes of the IED: the IED as the project holds it, its references to what the file does not
 * hold cut as a real IED's file does (`planReferences` with the file policy of `clientRefs`): inputs and outputs bound to an
 * IED absent from the file reduced, receivers and report clients naming one kept and listed or left out, associations, key
 * distribution entries and supervisions kept and listed. The IEDs sending to it (`senders`) count as held by the file.
 */
export async function selectRealIedContent(
	query: Core.Query<Config>,
	params: {
		iedRef: Scl.Ref<'IED'>
		destinationQuery: Core.Query<Config>
		clientRefs: ClientRefs
		/** The IEDs sending to the IED the file holds, cut to their interface: inside, their own references left to the closure. */
		senders: readonly ClosureRoot[]
	},
): Promise<IedContentSelection> {
	const { iedRef, destinationQuery, clientRefs, senders } = params
	const plan = await planReferences({
		roots: [{ ref: iedRef, depth: 'whole' }, ...senders],
		sourceQuery: query,
		destinationQuery,
		policy: CID_REFERENCE_POLICIES[clientRefs],
	})
	return { leaveOut: plan.leaveOut, warnings: [...plan.warnings], edits: plan.edits }
}
