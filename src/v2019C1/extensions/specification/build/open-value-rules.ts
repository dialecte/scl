import type { LnTypeContext } from '../transaction/build-ied.types'

/**
 * `lnType` rule: the first candidate type a logical node of the target IED already uses (the shell's LN0 or LPHD type,
 * a type of that class already built), else none.
 *
 * @intent take the type a logical node of that class already has in the target IED
 */
export function sameClassInTargetIed(context: LnTypeContext): string | undefined {
	return context.candidates.find((candidate) => candidate.inTargetIed)?.id
}

/**
 * `lnType` rule: the first LNodeType of the logical node's class in document order, else none.
 *
 * @intent take the first data type of that logical node class
 */
export function firstOfClass(context: LnTypeContext): string | undefined {
	return context.candidates[0]?.id
}
