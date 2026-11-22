import type { FUNCTION_TAGS } from './role-lnodes.constants'
import type { Scl } from '@/v2019C1/config'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'

export type RoleLNodesParams = { allocationRole: Scl.Ref<'AllocationRole'> }

/** An IED implementing LNodes of the role. */
export type RoleImplementer = {
	ied: Scl.Ref<'IED'>
	name: string
	/** `implemented` for a real device's IED, `specification` otherwise, by the rule of `classifyIeds`. */
	kind: IedKind
	/** The role's LNodes this IED implements, in document order. */
	lnodes: Scl.Ref<'LNode'>[]
}

export type RoleLNodes = {
	/** Every LNode below the functions the role names, once each, in document order. */
	lnodes: Scl.Ref<'LNode'>[]
	/** The IEDs implementing them, in document order. */
	implementers: RoleImplementer[]
	/** The LNodes no logical node implements, in document order. */
	unimplemented: Scl.Ref<'LNode'>[]
	/** The function references naming no function, in the order the role holds them. */
	unresolvedFunctionRefs: Scl.Ref<'FunctionRef'>[]
}

/** The function-like tags a function reference may name. */
export type FunctionTag = (typeof FUNCTION_TAGS)[number]
