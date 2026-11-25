/**
 * What a template IED's copy leaves out: the files and the checkout it came from, and what a specification builds from its LNodes (logical
 * devices with their logical nodes, data sets, control blocks and inputs; an access point's own logical nodes; the
 * associations naming them).
 */
export const SHELL_OMITTED_TAGS = [
	'IEDSourceFiles',
	'MinRequestedSCDFiles',
	'CheckoutID',
	'LDevice',
	'LN',
	'LN0',
	'Association',
] as const

/** The attributes of the template IED the shell does not keep: its description is the template's. */
export const SHELL_STRIPPED_ATTRIBUTES = ['desc']

/** The class of the LPHD the build adds to a logical device: its type is taken from the template too. */
export const SHELL_FRAME_LN_CLASS = 'LPHD'
