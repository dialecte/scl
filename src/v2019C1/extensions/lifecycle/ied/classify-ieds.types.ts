import type { Scl } from '@/v2019C1/config'

/** A real device's IED (`implemented`) or one written to specify a device (`specification`). */
export type IedKind = 'specification' | 'implemented'

/**
 * What decided the kind: an ICD / IID reference among the IED's source files (`provenance`),
 * the document being an ICD file (`icd-file`), or no such reference (`no-provenance`).
 */
export type IedClassificationBasis = 'provenance' | 'icd-file' | 'no-provenance'

export type IedClassification = {
	ied: Scl.Ref<'IED'>
	name: string
	kind: IedKind
	basis: IedClassificationBasis
}

/** An IED with its name and its kind, without what decided the kind. */
export type IedKindEntry = Pick<IedClassification, 'ied' | 'name' | 'kind'>
