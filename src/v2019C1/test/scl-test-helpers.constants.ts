import { createTestHelpers } from '@dialecte/core/test'

import { SCL_DIALECTE } from '@/v2019C1/declaration.constants'

/**
 * Every test helper core derives from the SCL declaration; each checks its fixtures against the SCL schema. Internal
 * to the test helpers, which add what is SCL's own: coherent references and the output gate.
 */
export const SCL_TEST_HELPERS = createTestHelpers({ dialecte: SCL_DIALECTE, schemaName: 'SCL' })
