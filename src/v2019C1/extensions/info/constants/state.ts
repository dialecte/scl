import { UNALLOCATED_IED_NAME } from '@/v2019C1/constants'
import { isLNodeLocked } from '@/v2019C1/extensions/data-model/query'
import {
	EXT_CTRL_SIGNAL,
	EXT_REF_CONTROL_BLOCK,
	EXT_REF_SIGNAL,
	INTERNAL_ADDRESS_ATTRIBUTE,
} from '@/v2019C1/extensions/dataflow/constants/ext-ref-state.constants'
import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { resolveMappedLNode } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnode'

import type {
	ElementStateByTag,
	LNodeMapping,
	LNodeState,
	SignalState,
	StateRuleParams,
} from './state.types'
import type { Scl, Config } from '@/v2019C1/config'
import type {
	ExtCtrlState,
	ExtRefState,
	SignalAttributes,
} from '@/v2019C1/extensions/dataflow/dataflow.types'
import type { RefPairEntry } from '@/v2019C1/extensions/reference/constants'
import type * as Core from '@dialecte/core'

// ── State rules ──────────────────────────────────────────────────────
// One rule per tag that has a state; a tag absent here has none. A rule reads the element's
// own attributes (no query in a loop), except where the state is already a query of its own.

export const STATE_RULES: {
	[Tag in keyof ElementStateByTag]: (params: StateRuleParams) => Promise<ElementStateByTag[Tag]>
} = {
	SourceRef: signalState,
	ControlRef: signalState,
	LNode: lnodeState,
	ExtRef: extRefState,
	ExtCtrl: extCtrlState,
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

/** Whether the attributes give the path or the uuid of a pair of `resolution`. */
function namesTarget(params: {
	pairs: readonly RefPairEntry[]
	resolution: string
	attributes: Readonly<Record<string, string>>
}): boolean {
	const { pairs, resolution, attributes } = params
	return pairs
		.filter((pair) => pair.resolution === resolution)
		.some((pair) => Boolean(attributes[pair.pathAttr] || attributes[pair.uuidAttr]))
}

/**
 * An ExtRef, read from its own attributes only: nothing, the internal address alone, the signal
 * it names, that signal with its service and control block (a service published without one needs
 * none), then the internal address as well. The internal address alone is never a binding.
 */
async function extRefState(params: StateRuleParams): Promise<ExtRefState> {
	const { attributes } = params
	const internalAddress = Boolean(attributes[INTERNAL_ADDRESS_ATTRIBUTE])
	if (!namesSignal({ signal: EXT_REF_SIGNAL, attributes })) {
		return internalAddress ? 'later-binding' : 'empty'
	}
	if (!hasControlBlockIfNeeded(attributes)) return 'expected'
	return internalAddress ? 'bound' : 'subscribed'
}

/** An ExtCtrl, read from its own attributes only: nothing, the internal address, the signal, both. */
async function extCtrlState(params: StateRuleParams): Promise<ExtCtrlState> {
	const { attributes } = params
	const internalAddress = Boolean(attributes[INTERNAL_ADDRESS_ATTRIBUTE])
	if (!namesSignal({ signal: EXT_CTRL_SIGNAL, attributes })) {
		return internalAddress ? 'later-binding' : 'empty'
	}
	return internalAddress ? 'bound' : 'expected'
}

/**
 * Whether an ExtRef has what its service needs: the service is set, and it either names the control
 * block publishing the signal or is published without one. Without a service nothing else it names
 * counts.
 */
function hasControlBlockIfNeeded(attributes: Readonly<Record<string, string>>): boolean {
	const { names, serviceAttribute, servicesWithControlBlock } = EXT_REF_CONTROL_BLOCK
	const service = attributes[serviceAttribute]
	if (!service) return false
	return names.some((name) => attributes[name]) || !servicesWithControlBlock.has(service)
}

/**
 * Whether the attributes name a signal: its logical node, by uuid or by all its names, and its data
 * object.
 */
function namesSignal(params: {
	signal: SignalAttributes
	attributes: Readonly<Record<string, string>>
}): boolean {
	const { signal, attributes } = params
	const namesLogicalNode =
		Boolean(attributes[signal.uuid]) || signal.names.every((name) => attributes[name])
	return namesLogicalNode && Boolean(attributes[signal.data])
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
	const { query, record, attributes, context } = params
	if (!attributes.iedName || attributes.iedName === UNALLOCATED_IED_NAME) return 'unmapped'

	const ln = attributes.lnUuid
		? (await context.lnByUuid()).get(attributes.lnUuid)
		: await resolveMappedLNode(query, record as Scl.TrackedRecord<'LNode'>)
	if (!ln) return 'unmapped'

	const iedId = await findIedId(query, ln)
	const kind = iedId ? (await context.iedKindById()).get(iedId) : undefined
	if (kind === 'implemented') return 'real-ied'
	if (kind === 'specification') return 'specification-ied'
	return 'unmapped'
}

/** The IED holding a record, climbing its parents one step at a time. */
async function findIedId(
	query: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
): Promise<string | undefined> {
	let current = await query.getRecord(ref)
	while (current) {
		if (current.tagName === 'IED') return current.id
		current = current.parent
			? await query.getRecord(current.parent as Scl.Ref<Scl.ElementsOf>)
			: undefined
	}
	return undefined
}
