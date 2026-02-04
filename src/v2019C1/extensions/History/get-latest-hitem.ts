import type { Scl } from '@/v2019C1/config'
import type { ExtensionsMethodParams } from '@dialecte/core'

export function getLatestHitem(params: ExtensionsMethodParams<Scl.Config, 'History'>) {
	const { chain, contextPromise } = params

	return async function (): Promise<Scl.ChainRecord<'Hitem'> | undefined> {
		const sourceChain = chain({
			contextPromise,
		})

		const hitems = await sourceChain.getSortedHitems()

		return hitems.at(-1)
	}
}
