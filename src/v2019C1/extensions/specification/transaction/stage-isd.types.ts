import type { BuildIedParams, IedBuildResult } from './build-ied.types'
import type { ShellLeftOut } from './copy-ied-shell.types'
import type { STAGE_REFUSAL_REASONS } from './stage-isd.constants'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type StageRefusalReason = (typeof STAGE_REFUSAL_REASONS)[number]

export type StageIsdParams = {
	/** The project the logical nodes are read from; only read. */
	sourceQuery: Core.Query<Config>
	/** The project's LNodes the staged IED implements. */
	lnodes: readonly Scl.Ref<'LNode'>[]
	/** A specification IED copied as the staged IED: its services, access points, servers and logical devices. */
	shell: { query: Core.Query<Config>; ied: Scl.Ref<'IED'> }
	/** The staged IED's name: the real IED's for an instance (a template export renames it `SPECIFICATION`). */
	iedName: string
	/** Stamped on the staged IED when given: the real IED's uuid, so an instance ISD pairs with it. */
	iedUuid?: string
	/** Passed to the build. */
	build?: Pick<
		BuildIedParams,
		'prefixFromLeafSubFunction' | 'openValues' | 'excludeFunctionalConstraints'
	>
}

export type StageIsdResult = {
	/** The built IED in the staging document. */
	ied: Scl.Ref<'IED'>
	/** What the build planned and wrote. */
	build: IedBuildResult
	/** The staged LNodes a project binding was released from. */
	released: Scl.Ref<'LNode'>[]
	/** What the shell IED held that a specification builds (its logical devices...): left out of the staged IED. */
	shellLeftOut: ShellLeftOut[]
}
