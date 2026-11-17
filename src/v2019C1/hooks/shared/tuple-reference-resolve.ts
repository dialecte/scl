import { targetKey } from '@/v2019C1/extensions/reference/query/ied-tuple/target-key'

/**
 * The uuid a tuple reference's names give one of its pairs: the one of the element its address names, when exactly one
 * of the tags the pair may point at answers (control blocks of different kinds may share a name). One rule for the
 * import and the commit, each indexing the targets it holds under `targetKey`.
 */
export function resolveTupleUuid(params: {
	address: string
	targetTags: readonly string[]
	targetsByAddress: ReadonlyMap<string, string>
}): string | undefined {
	const { address, targetTags, targetsByAddress } = params
	const uuids = targetTags.flatMap((tagName) => {
		const found = targetsByAddress.get(targetKey({ address, tagName }))
		return found ? [found] : []
	})
	return uuids.length === 1 ? uuids[0] : undefined
}
