import type { Config } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type * as Core from '@dialecte/core'

/**
 * Whether a placement's source is the project: a copy (`scenario: 'copy'`) reading the document it writes. A template
 * placed from the same document is a placement from a file all the same, and a copy read from another document is not
 * one inside the project. Read from both documents' ids, at the verb that places.
 */
export async function readsOwnDocument(
	tx: Core.Transaction<Config>,
	params: { sourceQuery: Core.Query<Config>; scenario: LifecycleScenario | undefined },
): Promise<boolean> {
	if (params.scenario !== 'copy') return false
	const { id: document } = await tx.getDocumentInfo()
	const { id: source } = await params.sourceQuery.getDocumentInfo()
	return document === source
}
