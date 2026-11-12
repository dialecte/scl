import type { Scl } from '@/v2019C1/config'
import type { ReferenceOutsideScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'

/**
 * What a placement carries with another clone than an application's, scoped (record ids): what the clones leave out —
 * the references naming what the placement neither places nor lands on, those making an application the project's copy
 * makes already, and the variables left applying to nothing —, and those variables (`notPlaced`): a role referring to one
 * names the project's copy standing for it (`copies`, by record id), or drops the reference and is warned.
 */
export type CarriedScoping = {
	leaveOut: Set<string>
	notPlaced: Set<string>
	copies: Map<string, Scl.Ref<Scl.ElementsOf>>
	/**
	 * The references of what the placement carries to a connectivity node written by path only, naming nothing the
	 * template holds (a terminal of a function's equipment on a node of a bay not in the template): left out, and told of.
	 */
	referencesNotPlaced: ReferenceOutsideScope[]
}
