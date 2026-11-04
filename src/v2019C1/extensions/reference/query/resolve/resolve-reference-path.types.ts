import type { ElementPath } from '../build/path-segment.types'
import type { Scl } from '@/v2019C1/config'

export type ResolveResult = {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	qualifier?: string
}

/**
 * Where a signal role's reference starts its path: the function its FunctionRef names, and the base
 * an earlier version wrote the path from.
 */
export type FunctionBases = {
	/** The path of the function the referrer's FunctionRef names. */
	functionPath: ElementPath
	/** The path of the Function (or EqFunction) nearest above it, or at it; `undefined` when none. */
	formerBase: string | undefined
}

/** The bases read for the FunctionRefs of a loop, by what each FunctionRef names (see `functionBasesOfReferrer`). */
export type FunctionBasesCache = Map<string, FunctionBases | undefined>
