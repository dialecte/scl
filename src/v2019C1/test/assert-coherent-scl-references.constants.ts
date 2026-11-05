import { defineDialecte } from '@dialecte/core'

import { SCL_NAMESPACES } from '@/v2019C1/config/dialecte.config'
import { SCL_DIALECTE } from '@/v2019C1/declaration.constants'

/** The namespaces of SCL elements: the reference check reads the elements in them only. */
export const SCL_NAMESPACE_URIS: readonly string[] = Object.values(SCL_NAMESPACES).map(
	(namespace) => namespace.uri,
)

/** The SCL dialecte with no hook and no extension: a fixture read as written, nothing filling or repairing a reference. */
export const SCL_FIXTURE_READING_DIALECTE = defineDialecte({
	id: SCL_DIALECTE.id,
	version: SCL_DIALECTE.version,
	configs: SCL_DIALECTE.configs,
	defaultConfigKey: SCL_DIALECTE.defaultConfigKey,
})
