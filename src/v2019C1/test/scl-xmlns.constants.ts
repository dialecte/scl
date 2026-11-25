import { XMLNS_XSI_NAMESPACE } from '@dialecte/core/helpers'
import { XMLNS_DEV_NAMESPACE } from '@dialecte/core/test'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

const EXTENSION_PREFIX = SCL_DIALECTE_CONFIG.namespaces.v2019C1.prefix
const SCL_ROOT_ATTRIBUTES = SCL_DIALECTE_CONFIG.definition.SCL.attributes.details

/** The SCL edition every current file's root states, as attributes of a fixture's root. */
export const CURRENT_SCL_EDITION = 'version="2007" revision="C" release="5"'

/**
 * The eIEC61850-6-100 version a root carrying the extension states, as attributes of a fixture's root: the values the
 * extension's schema fixes (2019 C 1, the release paired with the SCL edition 2007 C 5).
 */
export const CURRENT_6_100_VERSION = `${EXTENSION_PREFIX}:version="${SCL_ROOT_ATTRIBUTES['eIEC61850-6-100:version'].fixed}" ${EXTENSION_PREFIX}:revision="${SCL_ROOT_ATTRIBUTES['eIEC61850-6-100:revision'].fixed}" ${EXTENSION_PREFIX}:release="${SCL_ROOT_ATTRIBUTES['eIEC61850-6-100:release'].fixed}"`

/** The SCL default namespace, as an attribute of a fixture's root. */
export const XMLNS_SCL_NAMESPACE = `xmlns="${SCL_DIALECTE_CONFIG.namespaces.default.uri}"`
/** The eIEC61850-6-100 namespace, as an attribute of a fixture's root. */
export const XMLNS_SCL_6_100_NAMESPACE = `xmlns:${SCL_DIALECTE_CONFIG.namespaces.v2019C1.prefix}="${SCL_DIALECTE_CONFIG.namespaces.v2019C1.uri}"`
/**
 * What every fixture's root states: the namespaces it declares (SCL, eIEC61850-6-100, the test record ids and xsi), the
 * SCL edition of the current files, `version="2007" revision="C" release="5"`, and the eIEC61850-6-100 version paired
 * with it, `CURRENT_6_100_VERSION`. A root stating no version is a first-edition file: build it from the namespace
 * constants and opt the case in with `editionOneRoot`; a root carrying the extension without its version opts in with
 * `noExtensionVersion`.
 */
export const ALL_XMLNS_NAMESPACES = `${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${XMLNS_XSI_NAMESPACE} ${CURRENT_SCL_EDITION} ${CURRENT_6_100_VERSION}`
