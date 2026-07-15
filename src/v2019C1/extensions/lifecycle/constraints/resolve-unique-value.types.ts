/**
 * Consumer hook that shapes the collision-resolution naming scheme. Given the base
 * value and the current attempt, returns a candidate value. The engine still owns
 * uniqueness (it loops `attempt` until the candidate is collision-free), so a hook
 * need not guarantee uniqueness — only the scheme (e.g. a domain affix).
 *
 * Default (no hook): `` `${base}_${attempt}` ``. A SET affix hook could return
 * `` `${base}_Fn_${attempt}` ``.
 */
export type CollisionDecorator = (params: {
	base: string
	attempt: number
	attr: string
	childTag: string
}) => string
