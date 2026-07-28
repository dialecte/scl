import { TEMPLATE_UUID_WARNING_INFO } from './template-uuid-check.info'

import { describe, expect, it } from 'vitest'

import type { TemplateUuidWarningCode } from './template-uuid-check.types'

const CODES: TemplateUuidWarningCode[] = [
	'cross-type-template-uuid',
	'duplicate-instance-uuid',
	'template-uuid-type-mismatch',
]

describe('TEMPLATE_UUID_WARNING_INFO', () => {
	it('has a complete, non-empty info entry for every warning code', () => {
		for (const code of CODES) {
			const info = TEMPLATE_UUID_WARNING_INFO[code]
			expect(info, code).toBeDefined()
			expect(info.title.length, `${code}.title`).toBeGreaterThan(0)
			expect(info.description.length, `${code}.description`).toBeGreaterThan(0)
			expect(info.fallback.length, `${code}.fallback`).toBeGreaterThan(0)
		}
	})

	it('carries no entry beyond the known codes', () => {
		expect(new Set(Object.keys(TEMPLATE_UUID_WARNING_INFO))).toEqual(new Set(CODES))
	})
})
