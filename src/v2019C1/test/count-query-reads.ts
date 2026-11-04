/**
 * A query that answers as `query` does and notes the name of each method called on it, to assert how many reads a
 * function makes: the calls made from inside the query (a method calling another) are not noted.
 */
export function countQueryReads<GenericQuery extends object>(
	query: GenericQuery,
): { query: GenericQuery; reads: string[] } {
	const reads: string[] = []
	const counting = new Proxy(query, {
		get(target, property) {
			const value: unknown = Reflect.get(target, property, target)
			if (typeof value !== 'function') return value
			return function noteTheRead(...args: unknown[]): unknown {
				reads.push(String(property))
				return value.apply(target, args)
			}
		},
	})
	return { query: counting, reads }
}
