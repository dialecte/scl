import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type CopyIedShellParams = {
	/** The template IED copied as the shell, and the document holding it; only read. */
	shell: { query: Core.Query<Config>; ied: Scl.Ref<'IED'> }
	/** The copied IED's name. */
	iedName: string
	/** Stamped on the copied IED when given. */
	iedUuid?: string
}

/** What a specification builds and a template holds below its servers and access points: never copied. */
export type ShellLeftOut = Scl.Ref<'LDevice' | 'LN' | 'LN0' | 'Association'>

export type CopyIedShellResult = {
	/** The copied IED. */
	ied: Scl.Ref<'IED'>
	/** What the template IED held that a specification builds, in document order: left out, with what it held. */
	leftOut: ShellLeftOut[]
	/** The template's LN0 and LPHD types as imported (their ids in the document copied into), for `buildIed`'s `shellTypes`. */
	shellTypes: string[]
}
