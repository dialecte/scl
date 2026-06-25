import { Scl } from '@/v2019C1/config'

export type StripConfig = {
	/** 'root': remove attributes from root element only (shallow).
	 *  'tree': remove attributes recursively from root and all descendants. */
	scope: 'root' | 'tree'
	attributes: string[]
}

export type PromoteRootConfig = {
	/** Replace the root tagName when it matches `from`. */
	from: Scl.ElementsOf
	to: Scl.ElementsOf
}
