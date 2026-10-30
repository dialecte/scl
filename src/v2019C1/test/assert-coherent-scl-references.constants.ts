import { SCL_NAMESPACES } from '@/v2019C1/config/dialecte.config'

/** The namespaces of SCL elements: the reference check reads the elements in them only. */
export const SCL_NAMESPACE_URIS: readonly string[] = Object.values(SCL_NAMESPACES).map(
	(namespace) => namespace.uri,
)
