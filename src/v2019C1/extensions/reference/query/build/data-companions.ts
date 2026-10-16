import type { ReferencePair } from '@/v2019C1/extensions/reference/constants/types'

/**
 * The attributes of a reference pair that hold the data its path carries beyond the target: the
 * data object, then the data attribute (a pair of a signal that controls has no data attribute).
 * The companions of a pair are, in order, those two. `doRequired` tells whether the registry marks
 * the data object as required beside the target's uuid.
 */
export function dataCompanionsOf(pair: Pick<ReferencePair, 'companions'>): {
	doAttribute: string | undefined
	daAttribute: string | undefined
	doRequired: boolean
} {
	const [doCompanion, daCompanion] = pair.companions
	return {
		doAttribute: doCompanion?.name,
		daAttribute: daCompanion?.name,
		doRequired: doCompanion?.required === true,
	}
}
