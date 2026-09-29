import {
	ATTRIBUTES,
	DESCENDANTS,
	REQUIRED_ATTRIBUTES,
} from '@/v2019C1/definition/constants.generated'
import { DEFINITION } from '@/v2019C1/definition/definition.generated'

/**
 * Tag sets deciding which edits change an IED's configuration, and so require the current SCD as
 * the IED's minimum requested SCD file.
 *
 * The standard leaves open which changes affect an IED; the ROOTS below are the domain experts'
 * choice. Every set is expanded to the roots' descendants from the schema, minus the descriptive
 * tags, so new schema content under a root is covered automatically.
 */

/** Descriptive content: editing it never changes how an IED is configured. */
export const MIN_REQUESTED_SCD_DESCRIPTIVE_TAGS: ReadonlySet<string> = new Set([
	'Text',
	'Private',
	'Labels',
	'Label',
])

/** IED content whose change requires a new SCD: control blocks, data sets, inputs, values. */
export const MIN_REQUESTED_SCD_IED_TRIGGER_ROOTS = [
	'ReportControl',
	'LogControl',
	'GSEControl',
	'SampledValueControl',
	'SettingControl',
	'DataSet',
	'ExtRef',
	'DAI',
] as const

/**
 * IED trigger roots and their schema descendants. Owned by the `IED` found among the element's
 * ancestors; the same tags outside an IED (e.g. `Val` under a type definition) resolve to none.
 */
export const MIN_REQUESTED_SCD_IED_TRIGGER_TAGS: ReadonlySet<string> = expandTriggerTags({
	roots: MIN_REQUESTED_SCD_IED_TRIGGER_ROOTS,
})

/** `ConnectedAP` and its schema descendants: communication attached to a single IED. */
export const MIN_REQUESTED_SCD_CONNECTED_AP_TRIGGER_TAGS: ReadonlySet<string> = expandTriggerTags({
	roots: ['ConnectedAP'],
})

/**
 * `SubNetwork` and its schema descendants outside `ConnectedAP`: settings shared by every IED
 * attached to the sub-network.
 */
export const MIN_REQUESTED_SCD_SUBNETWORK_TRIGGER_TAGS: ReadonlySet<string> = expandTriggerTags({
	roots: ['SubNetwork'],
	excluded: MIN_REQUESTED_SCD_CONNECTED_AP_TRIGGER_TAGS,
})

/**
 * Descriptive attributes: updating only these (or lineage) never changes how an IED is configured.
 * Every other attribute or text update of a trigger counts.
 */
export const MIN_REQUESTED_SCD_DESCRIPTIVE_ATTRIBUTES: ReadonlySet<string> = new Set(['desc'])

/**
 * Entry attributes a user may set by hand, carried over when two entries of one project merge:
 * every schema attribute of the entry except its identity (`fileUuid`) and the required ones, which
 * the sync keeps in agreement with the SCD `Header`.
 */
export const MIN_REQUESTED_SCD_FILE_USER_ATTRIBUTES = deriveUserAttributes()

function expandTriggerTags(params: {
	roots: readonly string[]
	excluded?: ReadonlySet<string>
}): ReadonlySet<string> {
	const { roots, excluded } = params
	const descendantsByTag: Record<string, readonly string[]> = DESCENDANTS

	const tags = roots.flatMap((root) => [root, ...(descendantsByTag[root] ?? [])])
	return new Set(
		tags.filter((tag) => !MIN_REQUESTED_SCD_DESCRIPTIVE_TAGS.has(tag) && !excluded?.has(tag)),
	)
}

function deriveUserAttributes(): readonly (keyof typeof ATTRIBUTES.byTag.MinRequestedSCDFile)[] {
	const identity: readonly string[] = DEFINITION.MinRequestedSCDFile.attributes.identityFields
	const required: readonly string[] = REQUIRED_ATTRIBUTES.MinRequestedSCDFile
	const names = Object.keys(
		ATTRIBUTES.byTag.MinRequestedSCDFile,
	) as (keyof typeof ATTRIBUTES.byTag.MinRequestedSCDFile)[]

	return names.filter((name) => !identity.includes(name) && !required.includes(name))
}
