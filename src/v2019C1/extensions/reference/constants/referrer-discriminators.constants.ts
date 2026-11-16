import type { Scl } from '@/v2019C1/config'

/**
 * Per tuple referrer, the attributes beside what it names that tell two of them naming the same target apart: the data
 * a data set entry selects on its logical node, the access point a report client is reached through, the id of an
 * association. Part of the referrer's identity wherever references are paired, with the target it names.
 */
export const REFERRER_DISCRIMINATORS: ReadonlyMap<string, readonly string[]> = new Map<
	string,
	readonly string[]
>([
	['FCDA', ['doName', 'daName', 'fc', 'ix'] satisfies Scl.AttributesOf<'FCDA'>[]],
	['ClientLN', ['apRef'] satisfies Scl.AttributesOf<'ClientLN'>[]],
	['Association', ['associationID'] satisfies Scl.AttributesOf<'Association'>[]],
])
