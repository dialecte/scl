import type { CountedQueryCall } from './count-query-reads.types'

/**
 * A query that answers as `query` does and notes each method called on it (`reads`: the names, `calls`: the names with
 * their arguments), to assert how many reads a function makes and which: the calls made from inside the query (a
 * method calling another) are not noted.
 */
export function countQueryReads<GenericQuery extends object>(
	query: GenericQuery,
): { query: GenericQuery; reads: string[]; calls: CountedQueryCall[] } {
	const reads: string[] = []
	const calls: CountedQueryCall[] = []
	const counting = new Proxy(query, {
		get(target, property) {
			const value: unknown = Reflect.get(target, property, target)
			if (typeof value !== 'function') return value
			return function noteTheRead(...args: unknown[]): unknown {
				reads.push(String(property))
				calls.push({ method: String(property), args })
				return value.apply(target, args)
			}
		},
	})
	return { query: counting, reads, calls }
}
