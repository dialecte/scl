import type { Scl } from '@/v2019C1/config'

/** A record a cascade removes outside the subtrees of its roots, with what it does to it and the root it goes with. */
export type CascadeOutside = {
	record: Scl.RawRecord<Scl.ElementsOf>
	effect: 'deleted' | 'cleared'
	/** The root it goes with; `undefined` when the cascade recorded no cause for it. */
	rootId: string | undefined
	/** Every record it takes with it: its own subtree, never listed on its own. */
	holds: readonly Scl.RawRecord<Scl.ElementsOf>[]
}
