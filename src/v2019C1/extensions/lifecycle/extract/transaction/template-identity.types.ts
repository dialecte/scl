import type { Scl } from '@/v2019C1/config'

/** What a template ISD's identity is decided from: the clones of the IED and its connections, and of the process part. */
export type TemplateIdentityParams = {
	/** The IED and its Communication part, cloned. */
	iedMappings: readonly Scl.CloneMapping[]
	/** The process part, cloned. */
	processMappings: readonly Scl.CloneMapping[]
}

/** What a template ISD is named from: the IED written and the process part cloned. */
export type TemplateNamingParams = {
	ied: Scl.Ref<'IED'>
	processMappings: readonly Scl.CloneMapping[]
}
