import type { CopyWrite, WriteCopyUnbindsParams } from './copy.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Write the unbind plan of a copy on the copy, each source element named by the plan found through the clone mappings. */
export async function writeCopyUnbinds(
	tx: Core.Transaction<Config>,
	params: WriteCopyUnbindsParams,
): Promise<void> {
	const { unbinds, cloneMappings } = params
	if (unbinds.length === 0) return
	const copyOf = new Map(
		cloneMappings.map((mapping) => [mapping.source.id ?? '', mapping.target] as const),
	)
	const writes = unbinds.flatMap((unbind) => [
		unbind.lnode,
		...(unbind.specNaming ? [unbind.specNaming] : []),
		...unbind.references,
	])
	for (const write of writes) {
		const target = copyOf.get(write.element.id ?? '')
		if (target) await writeOn(tx, { target, write })
	}
}

/** One element's write: its values written, the attributes it removes given `undefined`. */
async function writeOn(
	tx: Core.Transaction<Config>,
	params: { target: Scl.Ref<Scl.ElementsOf>; write: CopyWrite },
): Promise<void> {
	const { target, write } = params
	const attributes: Record<string, string | undefined> = { ...write.written }
	for (const name of write.removed) attributes[name] = undefined
	if (Object.keys(attributes).length === 0) return
	// `update` removes an attribute given `undefined`; the untyped surface takes string values only
	await tx.any.update(target, { attributes: attributes as Record<string, string> })
}
