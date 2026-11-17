import { REQUIRED_ATTRIBUTES } from '@/v2019C1/definition/constants.generated'
import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'

/** The element whose rename renames every tuple target in it. */
export const IED_TAG = 'IED'

/**
 * Per referrer tag and uuid attribute, the names of a pair no other pair of the tag holds, or all its names when another
 * pair holds each of them: the names an edit removes to unbind that pair (an `IEDName`'s logical node part, or its
 * device; an `ExtRef`'s data or control block source).
 */
export const OWN_NAMES_BY_PAIR: ReadonlyMap<
	string,
	ReadonlyMap<string, readonly string[]>
> = new Map(
	[...REFERENCE_UUIDS_BY_TAG].map(
		([tagName, references]): [string, ReadonlyMap<string, readonly string[]>] => [
			tagName,
			new Map(
				references.map((reference): [string, readonly string[]] => {
					const others = new Set(
						references
							.filter((other) => other.uuid !== reference.uuid)
							.flatMap((other) => other.names),
					)
					const own = reference.names.filter((name) => !others.has(name))
					// a pair whose every name another pair holds too (an `IEDName`'s device, `ldInst`) unbinds with all of them
					return [reference.uuid, own.length > 0 ? own : reference.names]
				}),
			),
		],
	),
)

/**
 * Per referrer tag and uuid attribute, the own names of a pair the schema requires on the referrer (an `IEDName`'s
 * `apRef`): removed, they are written again from the pair's uuid instead of unbinding it.
 */
export const REQUIRED_OWN_NAMES_BY_PAIR: ReadonlyMap<
	string,
	ReadonlyMap<string, readonly string[]>
> = new Map(
	[...OWN_NAMES_BY_PAIR].map(
		([tagName, pairs]): [string, ReadonlyMap<string, readonly string[]>] => {
			const required = new Set<string>(
				(REQUIRED_ATTRIBUTES as Record<string, readonly string[]>)[tagName] ?? [],
			)
			return [
				tagName,
				new Map(
					[...pairs].map(([uuid, names]): [string, readonly string[]] => [
						uuid,
						names.filter((name) => required.has(name)),
					]),
				),
			]
		},
	),
)
