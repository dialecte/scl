import type { SupervisionDependencyPlan } from './supervision-dependencies.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Edit only the mapped copies, preserving the ordinary empty-container predicate. */
export async function applySupervisionDependencies(
	tx: Core.Transaction<Config>,
	params: { plan: SupervisionDependencyPlan; cloneMappings: Scl.CloneMapping[] },
): Promise<void> {
	const { plan, cloneMappings } = params
	const targets = new Map(cloneMappings.map((mapping) => [mapping.source.id, mapping.target]))
	for (const source of plan.fcdas) {
		const target = targets.get(source.id)
		if (target?.id) await tx.delete({ tagName: 'FCDA', id: target.id })
	}
	// A just-created FCDA's deletion can cancel its creation before commit pruning sees a deleted-child candidate.
	for (const source of plan.emptyDataSets) {
		const target = targets.get(source.id)
		if (!target?.id) continue
		const ref = { tagName: 'DataSet' as const, id: target.id }
		const record = await tx.getRecord<Scl.ElementsOf>(ref)
		if (record && holdsNothingBut({ record, gone: new Set() })) await tx.delete(ref)
	}
	for (const source of plan.payloadDataSets) {
		const target = targets.get(source.id)
		if (target?.id) await tx.delete({ tagName: 'DataSet', id: target.id })
	}
	for (const edit of plan.consumers) {
		const target = targets.get(edit.source.id)
		if (target?.id)
			await tx.update({ ...edit.source, id: target.id }, { attributes: edit.attributes })
	}
}
import { holdsNothingBut } from '@/v2019C1/hooks/before-delete'
