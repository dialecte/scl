import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

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
