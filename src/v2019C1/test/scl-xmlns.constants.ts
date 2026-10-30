import { XMLNS_XSI_NAMESPACE } from '@dialecte/core/helpers'
import { XMLNS_DEV_NAMESPACE } from '@dialecte/core/test'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

/** The SCL default namespace, as an attribute of a fixture's root. */
export const XMLNS_SCL_NAMESPACE = `xmlns="${SCL_DIALECTE_CONFIG.namespaces.default.uri}"`
/** The eIEC61850-6-100 namespace, as an attribute of a fixture's root. */
export const XMLNS_SCL_6_100_NAMESPACE = `xmlns:${SCL_DIALECTE_CONFIG.namespaces.v2019C1.prefix}="${SCL_DIALECTE_CONFIG.namespaces.v2019C1.uri}"`
/** Every namespace a fixture's root declares: SCL, eIEC61850-6-100, the test record ids and xsi. */
export const ALL_XMLNS_NAMESPACES = `${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${XMLNS_XSI_NAMESPACE}`
