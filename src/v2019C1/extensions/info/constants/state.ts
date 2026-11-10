import { UNALLOCATED_IED_NAME } from '@/v2019C1/constants'
import { isLNodeLocked } from '@/v2019C1/extensions/data-model/query'
import { extCtrlState } from '@/v2019C1/extensions/dataflow/query/ext-ctrl-state'
import { extRefState } from '@/v2019C1/extensions/dataflow/query/ext-ref-state'
import { namesTarget } from '@/v2019C1/extensions/dataflow/query/names-target'
import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

import type {
	ElementStateByTag,
	LNodeMapping,
	LNodeState,
	SignalState,
	StateRuleParams,
} from './state.types'
import type { Scl } from '@/v2019C1/config'
import type { ExtCtrlState, ExtRefState } from '@/v2019C1/extensions/dataflow/dataflow.types'

// ── State rules ──────────────────────────────────────────────────────
// One rule per tag that has a state; a tag absent here has none. A rule reads the element's
// own attributes (no query in a loop), except where the state is already a query of its own.

export const STATE_RULES: {
	[Tag in keyof ElementStateByTag]: (params: StateRuleParams) => Promise<ElementStateByTag[Tag]>
} = {
	SourceRef: signalState,
	ControlRef: signalState,
	LNode: lnodeState,
	ExtRef: extRefStateRule,
	ExtCtrl: extCtrlStateRule,
}

/**
 * A SourceRef / ControlRef, read from its reference pairs: it is connected once the pair pointing
 * to an LNode (its source, its controlled data) is given, by path or by uuid; implemented once the
 * pair pointing into an IED (its ExtRef, its ExtCtrl) is given.
 */
async function signalState(params: StateRuleParams): Promise<SignalState> {
	const { record, attributes } = params
	const pairs = PAIRS_BY_REF.get(record.tagName) ?? []
	const connected = namesTarget({ pairs, resolution: RESOLUTION_TYPE.lnode, attributes })
	return {
		binding: connected ? 'connected' : 'open',
		implemented: namesTarget({ pairs, resolution: RESOLUTION_TYPE.iedAddress, attributes }),
	}
}

/**
 * An ExtRef, read from its own attributes only (see `extRefState`): the shape it is written in,
 * none when it is written in none of the documented ones.
 */
async function extRefStateRule(params: StateRuleParams): Promise<ExtRefState | undefined> {
	return extRefState({ attributes: params.attributes })
}

/** An ExtCtrl, read from its own attributes only (see `extCtrlState`). */
async function extCtrlStateRule(params: StateRuleParams): Promise<ExtCtrlState | undefined> {
	return extCtrlState({ attributes: params.attributes })
}

async function lnodeState(params: StateRuleParams): Promise<LNodeState> {
	return {
		locked: await isLNodeLocked(params.query, params.record),
		mapping: await lnodeMapping(params),
	}
}

/**
 * What an LNode is bound to: its LN found by `lnUuid` (a uuid naming no LN of the document is no
 * binding, its names are not tried), else by its identity attributes; then the kind of the IED
 * holding that LN.
 */
async function lnodeMapping(params: StateRuleParams): Promise<LNodeMapping> {
	const { record, attributes, context } = params
	if (!attributes.iedName || attributes.iedName === UNALLOCATED_IED_NAME) return 'unmapped'

	const mapped = await context.mappedLNodeOf(record as Scl.TrackedRecord<'LNode'>)
	if (!mapped) return 'unmapped'

	const kind = (await context.iedKindById()).get(mapped.ied.id)
	if (kind === 'implemented') return 'real-ied'
	if (kind === 'specification') return 'specification-ied'
	return 'unmapped'
}
