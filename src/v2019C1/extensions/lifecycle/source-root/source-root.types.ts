import type { ASD_ROOT_TAG, FSD_UNSUPPORTED_ROOT_TAG, IED_ROOT_TAG } from './source-root.constants'
import type { Config, Scl } from '@/v2019C1/config'
import type { FSD_PLACEABLE_ROOT_TAGS } from '@/v2019C1/extensions/lifecycle/contract.constants'
import type { LifecycleVerbTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type * as Core from '@dialecte/core'

/** The verbs a template file can be read for: those the lifecycle contract has a target arm for. */
export type SourceRootVerb = LifecycleVerbTarget['verb']

/** The element of a template file a verb takes as its `ref`: whatever its target arm gives `ref`. */
export type SourceRootRef<GenericVerb extends SourceRootVerb> = Extract<
	LifecycleVerbTarget,
	{ verb: GenericVerb }
>['ref']

/**
 * One element the consumer can choose when a file holds several: its name, and the elements linked to it
 * (placed together with it), each with its name. Empty `linked` where the verb links nothing.
 */
export type SourceRootCandidate<GenericVerb extends SourceRootVerb> = {
	ref: SourceRootRef<GenericVerb>
	name: string
	linked: { ref: SourceRootRef<GenericVerb>; name: string }[]
}

/** A root the file holds that the verb does not handle yet: an equipment function of an FSD. */
export type SourceRootUnsupported<GenericVerb extends SourceRootVerb> = 'fsd' extends GenericVerb
	? { kind: 'unsupported'; ref: Scl.Ref<typeof FSD_UNSUPPORTED_ROOT_TAG> }
	: never

/**
 * What a template file holds to instantiate: the one element (`found`), nothing (`none`), several the
 * consumer chooses from (`several`), or a root form the verb does not handle yet (`unsupported`).
 */
export type SourceRoot<GenericVerb extends SourceRootVerb> =
	| { kind: 'found'; ref: SourceRootRef<GenericVerb> }
	| { kind: 'none' }
	| { kind: 'several'; candidates: SourceRootCandidate<GenericVerb>[] }
	| SourceRootUnsupported<GenericVerb>

/** The tags of the roots an FSD, an ASD or an IED file is read for (an SSD reads its scope). */
export type SourceRootTag =
	| (typeof FSD_PLACEABLE_ROOT_TAGS)[number]
	| typeof FSD_UNSUPPORTED_ROOT_TAG
	| typeof ASD_ROOT_TAG
	| typeof IED_ROOT_TAG

/** One reader per verb a file can be read for: a verb added to the contract without one does not compile. */
export type SourceRootReaders = {
	[GenericVerb in SourceRootVerb]: (query: Core.Query<Config>) => Promise<SourceRoot<GenericVerb>>
}
