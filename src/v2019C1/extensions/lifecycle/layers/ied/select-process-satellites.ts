import { keptProcessIds } from './kept-process-ids'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { ProcessIndex, ProcessScope, ProcessStepResult } from './ied-process.types'
import type {
	IndexedSatellite,
	SatelliteIndex,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'

/**
 * What the process part leaves out of what describes its LNodes from outside them. A behaviour description is written
 * whole when every variable of it names what the file holds, left out otherwise (and said, when it names some of it). A
 * variable keeps only its applications to a written LNode, to what it holds, or to what the IED part writes (the logical
 * node implementing it); a process resource is written when the specification of a written LNode names it.
 */
export function selectProcessSatellites(params: {
	scope: ProcessScope
	satellites: SatelliteIndex
}): ProcessStepResult {
	const { scope, satellites } = params
	const kept = keptProcessIds(scope)
	const lnodeContent = lnodeContentIds({ index: scope.index, kept, lnodes: scope.lnodes })
	const keptUuids = uuidsOf({ index: scope.index, ids: kept })
	const lnodeContentUuids = new Set([
		...uuidsOf({ index: scope.index, ids: lnodeContent }),
		...scope.iedUuids,
	])
	const leaveOut = new Set<string>()
	const warnings: ProcessStepResult['warnings'] = []
	for (const satellite of satellites.values()) {
		const id = satellite.satelliteRef.id ?? ''
		if (!kept.has(id)) continue
		if (satellite.satelliteRef.tagName !== 'BehaviorDescription') {
			for (const reference of satellite.references) {
				if (!namesAny({ reference, uuids: lnodeContentUuids })) leaveOut.add(reference.id)
			}
			continue
		}
		const verdict = behaviourVerdict({ satellite, keptUuids })
		if (verdict !== 'whole') leaveOut.add(id)
		if (verdict === 'partly') warnings.push(behaviourLeftOut(id))
	}
	for (const id of unlinkedResources({ index: scope.index, kept, lnodeContent })) leaveOut.add(id)
	return { leaveOut, warnings }
}

/** Whether a behaviour description names only what is written (`whole`), some of it (`partly`) or none (`none`). */
function behaviourVerdict(params: {
	satellite: IndexedSatellite
	keptUuids: ReadonlySet<string>
}): 'whole' | 'partly' | 'none' {
	const { satellite, keptUuids } = params
	const names = satellite.references.flatMap(function namesOf(reference) {
		return reference.names
	})
	const written = names.filter(function isWritten(name) {
		return keptUuids.has(name.uuid)
	})
	if (written.length === 0) return 'none'
	const whole = satellite.references.every(function isComplete(reference) {
		return reference.names.length > 0 && reference.names.every((name) => keptUuids.has(name.uuid))
	})
	return whole ? 'whole' : 'partly'
}

function namesAny(params: {
	reference: IndexedSatellite['references'][number]
	uuids: ReadonlySet<string>
}): boolean {
	return params.reference.names.some(function isNamed(name) {
		return params.uuids.has(name.uuid)
	})
}

function behaviourLeftOut(id: string): ProcessStepResult['warnings'][number] {
	return {
		code: 'behavior-description-left-out',
		source: { tagName: 'BehaviorDescription', id },
		reason: 'partly-mapped',
	}
}

/** The written LNodes and everything written below them. */
function lnodeContentIds(params: {
	index: ProcessIndex
	kept: ReadonlySet<string>
	lnodes: ReadonlySet<string>
}): ReadonlySet<string> {
	const { index, kept, lnodes } = params
	const ids = new Set<string>()
	for (const { record, ancestry } of index.nodes) {
		if (!kept.has(record.id)) continue
		const underLNode = ancestry.some(function isWrittenLNode(ancestor) {
			return lnodes.has(ancestor.id)
		})
		if (lnodes.has(record.id) || underLNode) ids.add(record.id)
	}
	return ids
}

/** The written process resources that nothing in a written LNode names. */
function unlinkedResources(params: {
	index: ProcessIndex
	kept: ReadonlySet<string>
	lnodeContent: ReadonlySet<string>
}): string[] {
	const { index, kept, lnodeContent } = params
	const named = new Set<string>()
	for (const id of lnodeContent) {
		const record = index.byId.get(id)?.record
		if (!record) continue
		const pairs = UUID_REFERENCE_PAIRS[record.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
		for (const pair of pairs) {
			if (!(pair.target as readonly string[]).includes('ProcessResource')) continue
			const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
			if (uuid) named.add(uuid)
		}
	}
	return index.nodes
		.filter(function isUnlinkedResource({ record }) {
			if (record.tagName !== 'ProcessResource' || !kept.has(record.id)) return false
			return !named.has(readAttribute({ record, name: 'uuid', defaults: 'none' }))
		})
		.map(function idOf({ record }) {
			return record.id
		})
}

/** The uuids of the elements given. */
function uuidsOf(params: { index: ProcessIndex; ids: ReadonlySet<string> }): ReadonlySet<string> {
	const uuids = new Set<string>()
	for (const id of params.ids) {
		const record = params.index.byId.get(id)?.record
		const uuid = record && readAttribute({ record, name: 'uuid', defaults: 'none' })
		if (uuid) uuids.add(uuid)
	}
	return uuids
}
