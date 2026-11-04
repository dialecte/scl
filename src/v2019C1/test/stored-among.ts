import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The records of `refs` the document's store still holds, as `<tag> <id>`: what a delete left in it, not only in the exported tree. */
export async function storedAmong(params: {
	document: Core.Document<Config>
	refs: readonly Scl.Ref<Scl.ElementsOf>[]
}): Promise<string[]> {
	const stored: string[] = []
	for (const ref of params.refs) {
		if (await params.document.query.getRecord(ref)) stored.push(`${ref.tagName} ${ref.id}`)
	}
	return stored
}
