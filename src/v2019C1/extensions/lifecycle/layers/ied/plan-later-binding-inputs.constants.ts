import type { Scl } from '@/v2019C1/config'

/**
 * Each expected value of an input, by the attribute of its binding it expects: what a later binding needs, taken from
 * the source the input was bound to when the input does not state it.
 */
export const EXPECTED_FROM_BINDING = [
	{ expected: 'pLN', bound: 'lnClass' },
	{ expected: 'pDO', bound: 'doName' },
	{ expected: 'pDA', bound: 'daName' },
	{ expected: 'pServT', bound: 'serviceType' },
] as const satisfies readonly {
	expected: Scl.AttributesOf<'ExtRef'>
	bound: Scl.AttributesOf<'ExtRef'>
}[]

/** The expected service, written again as the service type of an input in later-binding form. */
export const EXPECTED_SERVICE = 'pServT' satisfies Scl.AttributesOf<'ExtRef'>

/** The service type of an input, which an ISD's input carries equal to its expected service. */
export const SERVICE_TYPE = 'serviceType' satisfies Scl.AttributesOf<'ExtRef'>

/** The description of an input: with its internal address and expected data, what a later binding needs. */
export const INPUT_DESCRIPTION = 'desc' satisfies Scl.AttributesOf<'ExtRef'>
