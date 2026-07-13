import { describe, expect, it } from 'vitest'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

// The reference-pair table is the dialecte-wide source of truth; it lives at a
// shared top level (not owned by the reference extension) and is re-exported by
// the reference extension for back-compat.
describe('UUID_REFERENCE_PAIRS canonical location', () => {
	it('is importable from the shared constants module', () => {
		expect(UUID_REFERENCE_PAIRS.FunctionCatRef[0].attribute.uuid).toBe('functionUuid')
	})
})
