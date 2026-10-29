import type { ExtractWarning } from './extract.types'
import type { CloneAppliedSatellitesResult } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites.types'

/**
 * What an extract tells of the satellites it placed elsewhere than in the copy of the element holding them (what their
 * relative paths start from moved) and of those it numbered (what names them by their name names another).
 */
export function satelliteWarnings(params: {
	applied: Pick<CloneAppliedSatellitesResult, 'moved' | 'renamed'>
}): ExtractWarning[] {
	const { moved, renamed } = params.applied
	return [
		...moved.map(function movedWarning(satellite): ExtractWarning {
			return { code: 'satellite-moved', ...satellite }
		}),
		...renamed.map(function renamedWarning(satellite): ExtractWarning {
			return { code: 'satellite-renamed', ...satellite }
		}),
	]
}
