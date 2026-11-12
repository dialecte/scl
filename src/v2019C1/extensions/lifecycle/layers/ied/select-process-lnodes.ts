import type { ProcessIndex, SelectedLNodes } from './ied-process.types'
import type { Scl } from '@/v2019C1/config'
import type { MappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'

/**
 * The LNodes of the process part an IED is exported with: those its logical nodes implement, under a substation, line
 * or process. An LNode implemented by a logical node the IED part leaves out (a supervision one) is not, and is said.
 */
export function selectProcessLNodes(params: {
	index: ProcessIndex
	mapped: MappedLNodes
	iedRef: Scl.Ref<'IED'>
	iedLeaveOut: ReadonlySet<string>
}): SelectedLNodes {
	const { index, mapped, iedRef, iedLeaveOut } = params
	const rootIds = new Set(
		index.roots.map(function idOf(root) {
			return root.record.id
		}),
	)
	const ids = new Set<string>()
	const warnings: SelectedLNodes['warnings'] = []
	for (const { record, ancestry } of index.nodes) {
		if (record.tagName !== 'LNode' || !rootIds.has(ancestry[1]?.id ?? '')) continue
		const implementer = mapped.get(record.id)
		if (implementer?.ied.id !== iedRef.id) continue
		if (!iedLeaveOut.has(implementer.ln.id)) {
			ids.add(record.id)
			continue
		}
		warnings.push({
			code: 'process-lnode-left-out',
			source: { tagName: 'LNode', id: record.id },
			reason: 'target-not-carried',
		})
	}
	return { ids, warnings }
}
