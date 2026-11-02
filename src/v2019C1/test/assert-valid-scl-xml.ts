import { createXmlSchemaAssertions } from '@dialecte/core/test'

import { SCL_NAMESPACES } from '@/v2019C1/config/dialecte.config'
import { DEFINITION, TYPES } from '@/v2019C1/definition/definition.generated'

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
	types: TYPES,
	namespaces: SCL_NAMESPACES,
	schemaName: 'SCL',
})

/**
 * Assert the structure of an XML text against scl's generated definition and SCL's namespaces
 * (`assertValidSclXml(xml, label?, { requireComplete? })`): elements in the right namespace and allowed under their
 * parent, attributes known to their element and, unless `requireComplete: false`, every required attribute present.
 * Throws with every violation, under `label`. It reads no schema file and checks no attribute value: the schema-file
 * check is `collectSclOutputViolations`, once `configureSclXsdSchemas` has said where the files are.
 *
 * @intent check the structure of an SCL test fixture before using it, assert allowed children and known attributes of SCL XML, check a hand-written SCL snippet
 */
export const assertValidSclXml = assertValidXml
export const assertValidSclTestCases = assertValidXmlTestCases
