import { ADDED_LPHD } from '../transaction/build-ied.constants'
import { functionalConstraintOf } from './plan-values'

import { readAttributes } from '@/v2019C1/helpers'

import type {
	BuildInput,
	HeldValue,
	RequestedLNode,
	TargetLDevice,
} from '../build/build-input.types'
import type { BuildRefusal, PlannedLogicalNode } from '../transaction/build-ied.types'
import type {
	IedRebuildReport,
	LnIdentity,
	PairedLNodes,
	RebuildWrites,
} from './plan-rebuild.types'
import type { Scl } from '@/v2019C1/config'

/**
 * Pairs each LNode bound to the target IED with its logical node, through the binding (pure): its specification naming
 * (`sPrefix` / `sLnClass` / `sLnInst`) renames it, its own `lnType` retypes it (a typeless LNode keeps the logical
 * node's type), an LNode whose own names differ from its logical node's is drift; it stays in its logical device.
 */
export function pairBound(params: {
	input: BuildInput
	existing: readonly RequestedLNode[]
}): PairedLNodes {
	const { input, existing } = params
	const paired: PairedLNodes = {
		logicalNodes: [],
		renamed: [],
		retyped: [],
		drift: [],
		refusals: [],
	}
	for (const lnode of existing) {
		const held = heldLogicalNodeOf({ input, ln: lnode.implementation?.ln })
		if (!held) continue
		const { lDevice, logicalNode } = held
		const attributes = readAttributes({ record: lnode.record, defaults: 'none' })
		if (
			driftsFrom({ attributes, iedName: input.ied.name, lDevice, identity: logicalNode.identity })
		)
			paired.drift.push({ lnode: lnode.ref, ln: logicalNode.ref })
		const naming = input.specNamingOf.get(lnode.ref.id)
		const isLn0 = logicalNode.ref.tagName === 'LN0'
		const to: LnIdentity =
			naming && !isLn0
				? {
						prefix: naming.prefix,
						lnClass: naming.lnClass || logicalNode.identity.lnClass,
						inst: naming.inst,
					}
				: logicalNode.identity
		const lnType = attributes.lnType || logicalNode.lnType
		const typeClass = input.types.find((type) => type.id === lnType)?.lnClass
		if (typeClass !== undefined && typeClass !== to.lnClass) {
			paired.refusals.push({
				reason: 'type-mismatch',
				ref: lnode.ref,
				detail: `${lnType} is of class ${typeClass}, not ${to.lnClass}`,
			})
			continue
		}
		if (!sameIdentity({ identity: to, other: logicalNode.identity }))
			paired.renamed.push({ ln: logicalNode.ref as Scl.Ref<'LN'>, from: logicalNode.identity, to })
		if (lnType !== logicalNode.lnType)
			paired.retyped.push({
				ln: logicalNode.ref,
				from: logicalNode.lnType,
				to: lnType,
				valuesRemoved: valuesRemovedOf({ input, ln: logicalNode.ref, lnType }),
			})
		paired.logicalNodes.push({
			lnode: lnode.ref,
			lDeviceInst: lDevice.inst,
			kind: isLn0 ? 'LN0' : 'LN',
			identity: to,
			lnType,
			existing: logicalNode.ref,
		})
	}
	return paired
}

/** The logical device and logical node of the target IED an implementation names. */
export function heldLogicalNodeOf(params: {
	input: BuildInput
	ln?: { id?: string }
}): { lDevice: TargetLDevice; logicalNode: TargetLDevice['logicalNodes'][number] } | undefined {
	const { input, ln } = params
	for (const lDevice of input.lDevices) {
		const logicalNode = lDevice.logicalNodes.find((held) => held.ref.id === ln?.id)
		if (logicalNode) return { lDevice, logicalNode }
	}
	return undefined
}

/** An LNode whose own names (the mapping) differ from those of the logical node it is bound to. */
function driftsFrom(params: {
	attributes: Record<string, string | undefined>
	iedName: string
	lDevice: TargetLDevice
	identity: LnIdentity
}): boolean {
	const { attributes, iedName, lDevice, identity } = params
	return (
		(attributes.iedName ?? '') !== iedName ||
		(attributes.ldInst ?? '') !== lDevice.inst ||
		(attributes.prefix ?? '') !== identity.prefix ||
		(attributes.lnClass ?? '') !== identity.lnClass ||
		(attributes.lnInst ?? '') !== identity.inst
	)
}

function sameIdentity(params: { identity: LnIdentity; other: LnIdentity }): boolean {
	const { identity, other } = params
	return (
		identity.prefix === other.prefix &&
		identity.lnClass === other.lnClass &&
		identity.inst === other.inst
	)
}

/** The DAIs a logical node holds whose data a type does not hold. */
export function valuesRemovedOf(params: {
	input: BuildInput
	ln: Scl.Ref<'LN' | 'LN0'>
	lnType: string
}): Scl.Ref<'DAI'>[] {
	const { input, ln, lnType } = params
	const inTarget = input.types.find((type) => type.id === lnType)?.inTargetDocument ?? true
	const types = inTarget ? input.valueTypes.target : input.valueTypes.context
	return (input.heldValues.get(ln.id ?? '') ?? []).flatMap((held: HeldValue) =>
		types && functionalConstraintOf({ types, lnType, path: held.path }) !== undefined
			? []
			: [held.dai],
	)
}

/**
 * The logical nodes no LNode specifies any more in the logical devices the rebuild builds (not an LN0, not an LPHD,
 * bound by no LNode): removed when nothing names them and they hold no control block, data set or inputs, else kept
 * with what uses them; and the logical devices outside the rebuild holding only such logical nodes.
 */
export function orphansOf(params: { input: BuildInput; scope: ReadonlySet<string> }): {
	removed: Scl.Ref<'LN'>[]
	keptInUse: IedRebuildReport['keptInUse']
	orphanLDevices: IedRebuildReport['orphanLDevices']
} {
	const { input, scope } = params
	const orphans: ReturnType<typeof orphansOf> = { removed: [], keptInUse: [], orphanLDevices: [] }
	for (const lDevice of input.lDevices) {
		const specifiable = lDevice.logicalNodes.filter(
			(held) => held.ref.tagName === 'LN' && held.identity.lnClass !== ADDED_LPHD.lnClass,
		)
		const unbound = specifiable.filter((held) => !input.boundLNodeOf.has(held.ref.id))
		if (!scope.has(lDevice.inst)) {
			if (unbound.length > 0 && unbound.length === specifiable.length)
				orphans.orphanLDevices.push({
					lDevice: lDevice.ref,
					orphans: unbound.map((held) => held.ref as Scl.Ref<'LN'>),
				})
			continue
		}
		for (const held of unbound) {
			const usedBy = [...(input.usersOf.get(held.uuid) ?? []), ...held.holds]
			if (usedBy.length > 0) orphans.keptInUse.push({ ln: held.ref as Scl.Ref<'LN'>, usedBy })
			else orphans.removed.push(held.ref as Scl.Ref<'LN'>)
		}
	}
	return orphans
}

/** The logical nodes of the target IED bound by LNodes the rebuild was not given. */
export function boundOutsideScopeOf(params: {
	input: BuildInput
	requested: ReadonlySet<string>
}): IedRebuildReport['boundOutsideScope'] {
	const { input, requested } = params
	return input.lDevices.flatMap((lDevice) =>
		lDevice.logicalNodes.flatMap(function outside(held) {
			const lnode = input.boundLNodeOf.get(held.ref.id)
			return lnode && !requested.has(lnode.record.id)
				? [{ ln: held.ref, lnode: { tagName: 'LNode' as const, id: lnode.record.id } }]
				: []
		}),
	)
}

/**
 * The logical devices this run empties: one it removed or moved a logical node out of, left with its LN0 and LPHD only,
 * nothing planned in it, nothing it holds in use.
 */
export function emptiedLDevicesOf(params: {
	input: BuildInput
	leaving: ReadonlySet<string>
	logicalNodes: readonly PlannedLogicalNode[]
	/** The LNodes whose binding moves to another logical device's LN0 in this run. */
	rebound: ReadonlySet<string>
}): TargetLDevice[] {
	const { input, leaving, logicalNodes, rebound } = params
	return input.lDevices.filter(function emptied(lDevice) {
		if (!lDevice.logicalNodes.some((held) => leaving.has(held.ref.id))) return false
		if (logicalNodes.some((planned) => planned.lDeviceInst === lDevice.inst)) return false
		return lDevice.logicalNodes.every(function goesOrIsEmptyFrame(held) {
			if (leaving.has(held.ref.id)) return true
			const frame = held.ref.tagName === 'LN0' || held.identity.lnClass === ADDED_LPHD.lnClass
			const boundBy = input.boundLNodeOf.get(held.ref.id)
			// an LN0 or LPHD still bound by an LNode that stays keeps its logical device, as one holding a data set does
			return frame && held.holds.length === 0 && (!boundBy || rebound.has(boundBy.record.id))
		})
	})
}

/** The writes a rebuild's report needs, from what was read (pure). */
export function rebuildWritesOf(params: {
	input: BuildInput
	report: IedRebuildReport
	logicalNodes: readonly PlannedLogicalNode[]
}): RebuildWrites {
	const { input, report, logicalNodes } = params
	const valueRemovals = report.retyped.flatMap(function removalsOf(entry) {
		const removed = new Set(entry.valuesRemoved.map((dai) => dai.id))
		const held = input.heldValues.get(entry.ln.id ?? '') ?? []
		const byDoi = Map.groupBy(held, (value) => value.doi.id ?? '')
		return [...byDoi.values()].flatMap((values): Scl.Ref<'DOI' | 'DAI'>[] => {
			const going = values.filter((value) => removed.has(value.dai.id))
			const [first] = values
			if (going.length === 0 || !first) return []
			return going.length === values.length ? [first.doi] : going.map((value) => value.dai)
		})
	})
	const rebindings = logicalNodes.flatMap(function rebinding(planned) {
		const lnode = input.lnodes.find((candidate) => candidate.ref.id === planned.lnode.id)
		const held = planned.existing && heldLogicalNodeOf({ input, ln: planned.existing })
		if (!lnode?.implementation || !held || lnode.implementation.ln.id === planned.existing?.id)
			return []
		return [{ lnode: planned.lnode, lnUuid: held.logicalNode.uuid }]
	})
	const namingUpdates = report.moved.flatMap(function namingOf(entry) {
		const planned = logicalNodes.find((candidate) => candidate.existing?.id === entry.ln.id)
		const naming = planned && input.specNamingOf.get(planned.lnode.id ?? '')
		return naming ? [{ naming: naming.ref, sLdInst: entry.toLd }] : []
	})
	return { valueRemovals, namingUpdates, rebindings }
}

/**
 * The logical nodes of the IED whose LNode a real IED implements now: unbound (no LNode binds them by its names or its
 * `lnUuid`), wherever they sit, and named by that LNode's specification naming as it stands (the specification IED,
 * logical device and identity), its own names the real IED's. A naming changed before the run no longer names them.
 */
export function implementedElsewhereOf(params: {
	input: BuildInput
	leftOut: readonly { lnode: Scl.Ref<'LNode'>; ied: Scl.Ref<'IED'> }[]
}): IedRebuildReport['implementedElsewhere'] {
	const { input, leftOut } = params
	const orphanIds = new Set(
		input.lDevices.flatMap((lDevice) =>
			lDevice.logicalNodes.flatMap((held) =>
				held.ref.tagName === 'LN' && !input.boundLNodeOf.has(held.ref.id) ? [held.ref.id] : [],
			),
		),
	)
	return leftOut.flatMap(function namedOrphan(entry) {
		const naming = input.specNamingOf.get(entry.lnode.id ?? '')
		if (!naming || naming.iedName !== input.ied.name) return []
		const lDevice = input.lDevices.find((candidate) => candidate.inst === naming.ldInst)
		const held = lDevice?.logicalNodes.find(
			(candidate) =>
				orphanIds.has(candidate.ref.id) &&
				candidate.identity.prefix === naming.prefix &&
				candidate.identity.lnClass === naming.lnClass &&
				candidate.identity.inst === naming.inst,
		)
		const lnode = input.lnodes.find((candidate) => candidate.ref.id === entry.lnode.id)
		const iedName = lnode
			? (readAttributes({ record: lnode.record, defaults: 'none' }).iedName ?? '')
			: ''
		return held
			? [{ ln: held.ref as Scl.Ref<'LN'>, lnode: entry.lnode, ied: entry.ied, iedName }]
			: []
	})
}
