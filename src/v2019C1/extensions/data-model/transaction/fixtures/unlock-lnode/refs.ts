import type { KeptValue, RemovedData } from '../../unlock-lnode.types'

/** A ref of the fixture: its id is the tag in lower case, then the case's name. */
export function ref(params: { tagName: RemovedData['tagName']; name: string }): RemovedData {
	const { tagName, name } = params
	return { tagName, id: `${tagName.toLowerCase()}-${name}` } as RemovedData
}

/** The `DAI` of a case of the fixture, kept with its value for a reason. */
export function kept(params: { name: string; reason: KeptValue['reason'] }): KeptValue {
	const { name, reason } = params
	return {
		dai: { tagName: 'DAI', id: `dai-${name}` },
		specification: { tagName: 'DAS', id: `das-${name}` },
		reason,
	}
}
