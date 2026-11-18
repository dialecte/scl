import type { Scl } from '@/v2019C1/config'

/** A container judged once everything in `gone` is gone, `removed` the children the transaction took out of it. */
export type EmptiedRuleParams = {
	record: Scl.RawRecord<Scl.ElementsOf>
	gone: ReadonlySet<string>
	removed?: readonly { tagName: string; id?: string }[]
}

/** The rule that removes an emptied container: it holds nothing, or it lost every child of a group it requires. */
export type EmptiedRule =
	| { rule: 'holds-nothing' }
	| { rule: 'lost-required'; group: readonly string[] }
