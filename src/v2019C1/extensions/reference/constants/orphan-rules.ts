import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

/**
 * Ref tag names where the record is kept even when all uuid refs are orphaned.
 * Only the uuid/path/companion attributes are cleared; non-ref attributes preserved.
 *
 * Rule: elements with semantic content beyond the ref pointer (e.g. service, sourceDoName)
 * should be preserved with cleared pointers rather than deleted.
 */
export const KEEP_ON_ORPHAN_REFS: ReadonlySet<keyof typeof UUID_REFERENCE_PAIRS> = new Set<
	keyof typeof UUID_REFERENCE_PAIRS
>(['SourceRef', 'ControlRef', 'DOS', 'SDS', 'DAS', 'InputVar', 'OutputVar', 'ProcessEcho'])

/**
 * Maps ref tag names to their container tag names that should be cleaned up
 * when all children of that ref type are removed (inner->outer for nested cases).
 */
export const REF_CONTAINERS: Partial<Record<keyof typeof UUID_REFERENCE_PAIRS, readonly string[]>> =
	{
		FunctionCatRef: ['SubCategory', 'FunctionCategory'],
		PowerSystemRelation: ['PowerSystemRelations'],
		Resource: ['ProcessResource', 'ProcessResources'],
		VariableApplyTo: ['Variable'],
	} as const
