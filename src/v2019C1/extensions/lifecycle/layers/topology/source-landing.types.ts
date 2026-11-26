import type { Scl } from '@/v2019C1/config'

/**
 * Where an element of the source lands, read from its ancestors (any order of nearest first): the landing of the nearest
 * of them a level row places, `undefined` when none does — the caller then places it as it would without rows.
 */
export type LandingOf = (
	ancestors: readonly { id: string }[],
) => Scl.Ref<Scl.ElementsOf> | undefined

/** Where each source level a placement lands what it holds, by the source level's record id. */
export type LevelLandings = ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>
