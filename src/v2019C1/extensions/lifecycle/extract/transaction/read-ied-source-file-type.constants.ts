import type { SclFileExtension } from '@/v2019C1/extensions/lifecycle/source-file-type.types'

/** The source extensions an IED export reads: a project file (SSD, SCD, or `.xml` and no extension for an SCD). */
export const IED_EXPORT_SOURCE_EXTENSIONS: ReadonlySet<SclFileExtension> =
	new Set<SclFileExtension>(['.ssd', '.scd', '.xml', ''])
