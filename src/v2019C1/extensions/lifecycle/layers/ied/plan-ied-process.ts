import { indexProcessSection } from './index-process-section'
import { planProcessFrames } from './plan-process-frames'
import { selectProcessLNodes } from './select-process-lnodes'
import { writtenIedUuids } from './written-ied-uuids'

import type { IedProcessPlan, PlanIedProcessParams } from './ied-process.types'

/**
 * The process part of an IED export, decided from what was read, without reading: the LNodes the IED's logical nodes
 * implement (those of a logical node the IED part leaves out are not, and are said), planned in their frame.
 */
export function planIedProcess(params: PlanIedProcessParams): IedProcessPlan {
	const { source, iedRef, iedLeaveOut, options } = params
	const index = indexProcessSection(source.section)
	const selected = selectProcessLNodes({ index, mapped: source.mapped, iedRef, iedLeaveOut })
	const plan = planProcessFrames({
		index,
		satellites: source.satellites,
		lnodes: selected.ids,
		iedUuids: writtenIedUuids({ elements: source.iedElements, iedLeaveOut }),
		options,
	})
	return { ...plan, warnings: [...selected.warnings, ...plan.warnings] }
}
