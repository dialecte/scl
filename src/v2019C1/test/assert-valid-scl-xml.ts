import { createXmlSchemaAssertions } from '@dialecte/core/test'

import { SCL_NAMESPACES } from '@/v2019C1/config/dialecte.config'
import { DEFINITION } from '@/v2019C1/definition/definition.generated'

/**
 * Structural SCL validation for test fixtures. The engine is dialecte-agnostic and
 * lives in `@dialecte/core/test` (createXmlSchemaAssertions); here it is bound once to
 * the v2019C1 generated `DEFINITION` and declared `SCL_NAMESPACES`, like createTestProject.
 *
 * `assertValidSclXml` asserts, structurally: every element's namespace matches its parent
 * context, every element is an allowed child of its parent, and every attribute is known to
 * its element. Elements unknown to the schema are skipped (bespoke content under a
 * transparent `Private`), and so is any element in a namespace the SCL config does not
 * declare — even when its local name collides with a schema element.
 */
const { assertValidXml, assertValidXmlTestCases } = createXmlSchemaAssertions({
	definition: DEFINITION,
	namespaces: SCL_NAMESPACES,
	schemaName: 'SCL',
})

export const assertValidSclXml = assertValidXml
export const assertValidSclTestCases = assertValidXmlTestCases
