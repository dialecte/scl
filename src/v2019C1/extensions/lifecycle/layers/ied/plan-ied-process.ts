import { closeProcessFrame } from './close-process-frame'
import { indexProcessSection } from './index-process-section'
import { keptProcessIds } from './kept-process-ids'
import { leaveOutDanglingReferences } from './leave-out-dangling-references'
import { leaveOutEmptyHolders } from './leave-out-empty-holders'
import { leaveOutProcessScope } from './leave-out-process-scope'
import { planProcessEdits } from './plan-process-edits'
import { selectProcessLNodes } from './select-process-lnodes'
import { selectProcessSatellites } from './select-process-satellites'
import { writtenIedUuids } from './written-ied-uuids'

import type { IedProcessPlan, PlanIedProcessParams, ProcessScope } from './ied-process.types'

/**
 * The process part of an IED export, decided from what was read, without reading: the IED's LNodes in their frame,
 * what describes them (behaviour descriptions fully on them, variables, process resources), what names the functions
 * written (applications, allocation roles) and the relations to the equipment written, each left out when an option
 * turns it off. Then what changes on what is written, and what is said about what was left out or cut.
 */
export function planIedProcess(params: PlanIedProcessParams): IedProcessPlan {
	const { source, iedRef, iedLeaveOut, options } = params
	const index = indexProcessSection(source.section)
	const selected = selectProcessLNodes({ index, mapped: source.mapped, iedRef, iedLeaveOut })
	const frame = closeProcessFrame({ index, lnodes: selected.ids })
	const scoped: ProcessScope = {
		index,
		lnodes: selected.ids,
		iedUuids: writtenIedUuids({ elements: source.iedElements, iedLeaveOut }),
		leaveOut: leaveOutProcessScope({ index, frame, options }),
	}
	const satellites = selectProcessSatellites({ scope: scoped, satellites: source.satellites })
	const { leaveOut } = settleReferences(
		withLeftOut({ scope: scoped, leaveOut: satellites.leaveOut }),
	)
	const kept = keptProcessIds({ index, leaveOut })
	const changes = planProcessEdits({
		index,
		kept,
		lnodes: selected.ids,
		iedUuids: scoped.iedUuids,
		internalService: options.internalService === true,
	})
	return {
		roots: index.roots
			.filter(function isWritten(root) {
				return kept.has(root.record.id)
			})
			.map(function refOf(root) {
				return root.ref
			}),
		leaveOut,
		edits: changes.edits,
		namings: changes.namings,
		warnings: [...selected.warnings, ...satellites.warnings, ...changes.warnings],
	}
}

/**
 * Until nothing more is left out: the references naming what is not written, then the holders left without what they
 * must hold. A holder left out may be what another reference names, hence the repetition.
 */
function settleReferences(scope: ProcessScope): ProcessScope {
	let current = scope
	for (;;) {
		const referenced = withLeftOut({
			scope: current,
			leaveOut: leaveOutDanglingReferences(current),
		})
		const settled = { ...current, leaveOut: leaveOutEmptyHolders(referenced) }
		if (settled.leaveOut.size === current.leaveOut.size) return settled
		current = settled
	}
}

function withLeftOut(params: { scope: ProcessScope; leaveOut: ReadonlySet<string> }): ProcessScope {
	return { ...params.scope, leaveOut: new Set([...params.scope.leaveOut, ...params.leaveOut]) }
}
