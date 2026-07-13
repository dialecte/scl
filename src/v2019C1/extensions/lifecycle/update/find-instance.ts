import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/** A reader with the untyped `.any` facade — either a Query or a Transaction. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The `Function` instance under `targetParent` whose `templateUuid` equals the
 * source Function's `uuid`, if any. Shared by the apply verb (`tx`) and the
 * report query (`query`).
 */
export async function findFunctionInstance(
	reader: Reader,
	targetParent: Scl.Ref<Scl.ElementsOf>,
	sourceUuid: string | undefined,
): Promise<AnyTreeRecord | undefined> {
	if (!sourceUuid) return undefined
	const parentTree = await reader.any.getTree(targetParent)
	if (!parentTree) return undefined
	return walkForFunction(reader, parentTree, sourceUuid)
}

async function walkForFunction(
	reader: Reader,
	node: AnyTreeRecord,
	sourceUuid: string,
): Promise<AnyTreeRecord | undefined> {
	if (
		node.tagName === 'Function' &&
		(await reader.any.getAttribute(node, { name: 'templateUuid' })) === sourceUuid
	) {
		return node
	}
	for (const child of node.tree) {
		const found = await walkForFunction(reader, child, sourceUuid)
		if (found) return found
	}
	return undefined
}

/** The `Application` whose `templateUuid` equals the source uuid, if any. */
export async function findApplicationInstance(
	reader: Reader,
	sourceUuid: string | undefined,
): Promise<AnyTrackedRecord | undefined> {
	if (!sourceUuid) return undefined
	const applications = await reader.any.getRecordsByTagName('Application')
	for (const application of applications) {
		if ((await reader.any.getAttribute(application, { name: 'templateUuid' })) === sourceUuid) {
			return application
		}
	}
	return undefined
}
