import { SCL_TEST_HELPERS } from './scl-test-helpers.constants'

/**
 * Assert the structure of an XML text against scl's generated definition and SCL's namespaces
 * (`assertValidSclXml(xml, label?, { requireComplete? })`): elements in the right namespace and allowed under their
 * parent, attributes known to their element and, unless `requireComplete: false`, every required attribute present.
 * Throws with every violation, under `label`. It reads no schema file and checks no attribute value: the schema-file
 * check is `collectSclOutputViolations`, once `configureSclXsdSchemas` has said where the files are.
 *
 * @intent check the structure of an SCL test fixture before using it, assert allowed children and known attributes of SCL XML, check a hand-written SCL snippet
 */
export const assertValidSclXml = SCL_TEST_HELPERS.assertValidXml
