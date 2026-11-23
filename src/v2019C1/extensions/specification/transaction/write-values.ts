import type { IedValuePlan } from './build-ied.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Writes the planned values on their logical nodes: the DOI, SDIs and DAI of each path, found or created by name and
 * `ix`; the DAI's `valKind` and `valImport` set, its `Val`s replaced by the planned ones.
 */
export async function writeValues(params: {
	tx: Core.Transaction<Config>
	values: readonly IedValuePlan[]
	/** The logical node each LNode is built as, by LNode id. */
	logicalNodeOf: ReadonlyMap<string, Scl.Ref<'LN' | 'LN0'>>
}): Promise<void> {
	const { tx, values, logicalNodeOf } = params
	for (const value of values) {
		const logicalNode = logicalNodeOf.get(value.lnode.id ?? '')
		if (!logicalNode) continue
		const doi = await tx.ensureChild(logicalNode as Scl.Ref<'LN'>, {
			tagName: 'DOI',
			attributes: { name: value.path.doi },
		})
		let parent: Scl.Ref<'DOI' | 'SDI'> = { tagName: 'DOI', id: doi.id }
		for (const step of value.path.sdi) {
			const sdi: { id: string } = await tx.ensureChild(parent as Scl.Ref<'DOI'>, {
				tagName: 'SDI',
				attributes: { name: step.name, ...(step.ix && { ix: step.ix }) },
			})
			parent = { tagName: 'SDI', id: sdi.id }
		}
		const dai = await tx.ensureChild(parent as Scl.Ref<'DOI'>, {
			tagName: 'DAI',
			attributes: {
				name: value.path.dai.name,
				...(value.path.dai.ix && { ix: value.path.dai.ix }),
			},
		})
		await writeDaiValues({ tx, dai, value })
	}
}

/** The DAI's `valKind` and `valImport` as planned (cleared on a DAI held before when not specified), its `Val`s replaced. */
async function writeDaiValues(params: {
	tx: Core.Transaction<Config>
	dai: Scl.RawRecord<'DAI'>
	value: IedValuePlan
}): Promise<void> {
	const { tx, dai, value } = params
	// a DAI held before takes the attributes as specified, those the specification no longer gives cleared
	const attributes = value.existing
		? { valKind: value.valKind, valImport: value.valImport }
		: {
				...(value.valKind && { valKind: value.valKind }),
				...(value.valImport && { valImport: value.valImport }),
			}
	if (Object.keys(attributes).length > 0)
		await tx.update({ tagName: 'DAI', id: dai.id }, { attributes })
	for (const child of dai.children) {
		if (child.tagName === 'Val') await tx.delete({ tagName: 'Val', id: child.id })
	}
	for (const val of value.vals) {
		await tx.addChild(
			{ tagName: 'DAI', id: dai.id },
			{
				tagName: 'Val',
				attributes: { ...(val.sGroup && { sGroup: val.sGroup }) },
				value: val.value,
			},
		)
	}
}
