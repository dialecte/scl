import type { SCL_ERRORS } from '@/v2019C1/errors'

/** The errors a lifecycle verb refuses its inputs with before anything is read further, as a refusal names them. */
export type LifecycleRefusalCode = Extract<
	keyof typeof SCL_ERRORS,
	'NOT_A_VERSION_OF_FILE' | 'OPTION_NOT_AVAILABLE' | 'TARGET_INSTANCE_REQUIRED'
>

/**
 * Why a lifecycle operation is refused, one word per situation:
 *  - `other-file` / `other-ied`: a fork on an open ISD of a file that is not a version of it (`NOT_A_VERSION_OF_FILE`);
 *  - `source-extension`: a source file of an extension the operation does not read (`OPTION_NOT_AVAILABLE`);
 *  - `source-not-read`: an IED read from an IID or an SCD (`OPTION_NOT_AVAILABLE`);
 *  - `isd-instance-not-fork`: the IED of an ISD instance file placed other than as a fork (`OPTION_NOT_AVAILABLE`);
 *  - `already-in-project`: the project already holds the IED, or an element of its specification by uuid
 *    (`OPTION_NOT_AVAILABLE`);
 *  - `source-not-updated`: an update of an IED placed from another file than an ISD (`OPTION_NOT_AVAILABLE`);
 *  - `no-instance` / `not-an-instance` / `several-instances`: an update that does not start from one instance the
 *    project holds (`TARGET_INSTANCE_REQUIRED`);
 *  - `copy-not-offered`: a copy from another document, with another verb than fsd / asd, of another root, merged onto
 *    the functions it composes, or asked to create a level for a row (`OPTION_NOT_AVAILABLE`).
 */
export type LifecycleRefusalReason =
	| 'other-file'
	| 'other-ied'
	| 'source-extension'
	| 'source-not-read'
	| 'isd-instance-not-fork'
	| 'already-in-project'
	| 'source-not-updated'
	| 'no-instance'
	| 'not-an-instance'
	| 'several-instances'
	| 'copy-not-offered'

/**
 * A lifecycle operation refused, as data: the error's key (`code`), why (`reason`), the error's `meta` exactly as the
 * verb throws it, and its `detail`, naming the operation that refused.
 */
export type LifecycleRefusal = {
	code: LifecycleRefusalCode
	reason: LifecycleRefusalReason
	meta: Record<string, unknown>
	detail: string
}

/** The answer of a check that refuses. */
export type Refused = { refused: LifecycleRefusal }
