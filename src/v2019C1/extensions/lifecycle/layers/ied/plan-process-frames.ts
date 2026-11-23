import { closeProcessFrame } from './close-process-frame'
import { keptProcessIds } from './kept-process-ids'
import { leaveOutDanglingReferences } from './leave-out-dangling-references'
import { leaveOutEmptyHolders } from './leave-out-empty-holders'
import { leaveOutProcessScope } from './leave-out-process-scope'
import { planProcessEdits } from './plan-process-edits'
import { selectProcessSatellites } from './select-process-satellites'

import type { IedProcessPlan, PlanProcessFramesParams, ProcessScope } from './ied-process.types'

/**
 * The process part holding the LNodes given, whatever implements them, decided from what was read, without reading:
 * the LNodes in their frame, what describes them (behaviour descriptions fully on them, variables, process
 * resources), what names the functions written (applications, allocation roles) and the relations to the equipment
 * written, each left out when an option turns it off. Then what changes on what is written, and what is said about
 * what was left out or cut.
 */
export function planProcessFrames(params: PlanProcessFramesParams): IedProcessPlan {
	const { index, satellites, lnodes, iedUuids, options } = params
	const frame = closeProcessFrame({ index, lnodes })
	const scoped: ProcessScope = {
		index,
		lnodes,
		iedUuids,
		leaveOut: leaveOutProcessScope({ index, frame, options }),
	}
	const selected = selectProcessSatellites({ scope: scoped, satellites })
	const { leaveOut } = settleReferences(withLeftOut({ scope: scoped, leaveOut: selected.leaveOut }))
	const kept = keptProcessIds({ index, leaveOut })
	const changes = planProcessEdits({
		index,
		kept,
		lnodes,
		iedUuids,
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
		warnings: [...selected.warnings, ...changes.warnings],
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
