import {
	LNODE_SCOPE_TAGS,
	NEVER_EXPORTED_PROCESS_TAGS,
	PROCESS_OPTION_TAGS,
} from './ied-process.constants'

import type { ProcessIndex, ProcessOptions } from './ied-process.types'

/**
 * What the process part leaves out before looking at what references what: each LNode, function, equipment, level or
 * node outside the frame, the function categories, and what an export option turned off names (applications,
 * allocation roles, power system relations).
 */
export function leaveOutProcessScope(params: {
	index: ProcessIndex
	frame: ReadonlySet<string>
	options: ProcessOptions
}): ReadonlySet<string> {
	const { index, frame, options } = params
	const turnedOff = new Set(
		Object.entries(PROCESS_OPTION_TAGS)
			.filter(function isOff([option]) {
				return options[option as keyof ProcessOptions] === false
			})
			.map(function tagOf([, tagName]) {
				return tagName
			}),
	)
	const leaveOut = new Set<string>()
	for (const { record } of index.nodes) {
		const outOfFrame = LNODE_SCOPE_TAGS.has(record.tagName) && !frame.has(record.id)
		const neverExported = NEVER_EXPORTED_PROCESS_TAGS.has(record.tagName)
		if (outOfFrame || neverExported || turnedOff.has(record.tagName)) leaveOut.add(record.id)
	}
	return leaveOut
}
