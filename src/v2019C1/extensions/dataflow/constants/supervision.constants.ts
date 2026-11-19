import type { SupervisionKind } from '../query/supervisions.types'

/**
 * How each kind of control block is supervised in a subscriber IED: the class of the supervising
 * logical node and its data object holding the reference to the control block (GOOSE: LGOS /
 * `GoCBRef`, sampled values: LSVS / `SvCBRef`). A report control block has no supervision.
 */
export const SUPERVISION_BY_CONTROL_BLOCK: Readonly<
	Record<'GSEControl' | 'SampledValueControl', SupervisionKind>
> = {
	GSEControl: { lnClass: 'LGOS', dataObject: 'GoCBRef' },
	SampledValueControl: { lnClass: 'LSVS', dataObject: 'SvCBRef' },
}

/** The data attribute of the supervising data object holding the reference to the control block. */
export const SUPERVISION_REFERENCE_ATTRIBUTE = 'setSrcRef'

/** The tag of a supervising logical node: never an LN0. */
export const SUPERVISION_LN_TAG = 'LN'

/** What a reference inside SCL starts with when it names an element by its uuid, in place of its hierarchy. */
export const UUID_REFERENCE_PREFIX = '#UID'

/** What a reference inside one IED starts with, in place of the IED name. */
export const IED_RELATIVE_REFERENCE_PREFIX = '@'

/** Every kind of supervision, whatever the control block. */
export const SUPERVISION_KINDS: readonly SupervisionKind[] = Object.values(
	SUPERVISION_BY_CONTROL_BLOCK,
)
