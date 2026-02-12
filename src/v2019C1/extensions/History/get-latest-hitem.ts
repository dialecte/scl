import type { Scl } from '@/v2019C1/config'

export function getLatestHitem(params: Scl.MethodsParams<'History'>) {
	const { chain, contextPromise } = params

	return async function (): Promise<Scl.ChainRecord<'Hitem'> | undefined> {
		const sourceChain = chain({
			contextPromise,
		})

		const hitems = await sourceChain.getSortedHitems()

		return hitems.at(-1)
	}
}
