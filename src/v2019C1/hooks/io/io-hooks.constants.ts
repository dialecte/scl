import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

/** The resolutions whose names are local to the referrer: their parsing reads its ancestry. */
export const LOCAL_NAME_RESOLUTIONS: ReadonlySet<string> = new Set([
	RESOLUTION_TYPE.behaviorDescription,
	RESOLUTION_TYPE.iedAddress,
	RESOLUTION_TYPE.ancestorName,
])
