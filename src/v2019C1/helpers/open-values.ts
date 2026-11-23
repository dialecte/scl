import type { OpenValueRule } from './open-values.types'

/**
 * The first answer of the rules given, in order: a rule returning `undefined` hands over to the next one.
 *
 * @intent combine open value rules, fall back from one rule to another
 *
 * @example
 * const lnType = firstOf(sameClassInTargetIed, firstOfClass)
 */
export function firstOf<Context, Value = string>(
	...rules: readonly OpenValueRule<Context, Value>[]
): OpenValueRule<Context, Value> {
	return function firstAnswer(context: Context): Value | undefined {
		for (const rule of rules) {
			const answer = rule(context)
			if (answer !== undefined) return answer
		}
		return undefined
	}
}
