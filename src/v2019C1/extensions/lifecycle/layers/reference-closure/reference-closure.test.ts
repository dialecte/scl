import { describe, expect, it } from 'vitest'

import {
	EXT_CTRL_LATER_BINDING,
	EXT_REF_LATER_BINDING,
} from '@/v2019C1/extensions/dataflow/constants/ext-ref-state.constants'

/** The attributes an input specifying a later binding must not hold: its source, the data it names and its service. */
const LATER_BINDING_FORBIDDEN = [
	'iedName',
	'ldInst',
	'prefix',
	'lnClass',
	'lnInst',
	'doName',
	'daName',
	'serviceType',
	'srcLDInst',
	'srcPrefix',
	'srcLNClass',
	'srcLNInst',
	'srcCBName',
]

describe('what a reference cut clears on an input or an output bound outside the file', () => {
	it('input in later-binding form -> every forbidden attribute cleared, beside them only the uuids of its source and control block', () => {
		const cleared = [...EXT_REF_LATER_BINDING.forbidden]
		expect(cleared).toEqual(expect.arrayContaining(LATER_BINDING_FORBIDDEN))
		expect(cleared.filter((name) => !LATER_BINDING_FORBIDDEN.includes(name)).sort()).toEqual([
			'lnUuid',
			'srcCBUuid',
		])
	})
	it('output in later-binding form -> its signal cleared, its internal address and access point kept', () => {
		const cleared = [...EXT_CTRL_LATER_BINDING.forbidden]
		expect(cleared).toEqual(
			expect.arrayContaining(['iedName', 'ldInst', 'lnClass', 'doName', 'lnUuid']),
		)
		expect(cleared).not.toContain('intAddr')
	})
})
