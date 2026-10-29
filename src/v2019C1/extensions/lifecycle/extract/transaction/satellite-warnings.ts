import type { ExtractWarning } from './extract.types'
import type { Scl } from '@/v2019C1/config'
import type { CloneAppliedSatellitesResult } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites.types'

/**
 * What an extract tells of the satellites it placed elsewhere than in the copy of the element holding them (what their
 * relative paths start from moved), of those it numbered (what names them by their name names another), and of what a
 * role refers to that it does not place (`notPlaced`).
 */
export function satelliteWarnings(params: {
	applied: Pick<CloneAppliedSatellitesResult, 'moved' | 'renamed'>
	notPlaced: readonly Scl.Ref<Scl.ElementsOf>[]
}): ExtractWarning[] {
	const { moved, renamed } = params.applied
	return [
		...params.notPlaced.map(function notPlacedWarning(source): ExtractWarning {
			return { code: 'satellite-not-placed', source }
		}),
		...moved.map(function movedWarning(satellite): ExtractWarning {
			return { code: 'satellite-moved', ...satellite }
		}),
		...renamed.map(function renamedWarning(satellite): ExtractWarning {
			return { code: 'satellite-renamed', ...satellite }
		}),
	]
}
