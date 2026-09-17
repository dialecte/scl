/**
 * The schema-derived identity of an element — how a source element is matched to its instance
 * across a clone:
 *  - `uuid`: the element carries a `uuid` (its intrinsic identity). Matched by LINEAGE
 *    (`instance.templateUuid === source.uuid`, or `uuid` for fork), NOT by this uuid value.
 *  - `fields`: no uuid, but the schema declares `identityFields` (e.g. DataTypeTemplates types by
 *    `id`) — these survive a clone verbatim and identify the element.
 *  - `positional`: neither — a leaf/config element identified only by its position among siblings.
 */
export type ElementIdentity =
	| { kind: 'uuid'; uuid: string | undefined }
	| { kind: 'fields'; fields: Record<string, string> }
	| { kind: 'positional' }
