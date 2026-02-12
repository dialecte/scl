import type { EXTENSIONS } from '../extensions'
import type { SCL_DIALECTE_CONFIG } from './dialecte.config'
import type * as Core from '@dialecte/core'

export namespace Scl {
	export type Config = typeof SCL_DIALECTE_CONFIG

	export type MethodsParams<GenericElement extends Core.ElementsOf<Config>> =
		Core.ExtensionsMethodParams<Config, GenericElement, typeof EXTENSIONS>

	export type Context<GenericElement extends Core.ElementsOf<Config>> = Core.Context<
		Config,
		GenericElement
	>

	export type Chain<GenericElement extends ElementsOf> = Core.Chain<
		Config,
		GenericElement,
		typeof EXTENSIONS
	>

	// DEFINITION
	export type ElementsOf = Core.ElementsOf<Config>
	export type AttributesValueObjectOf<GenericElement extends ElementsOf> =
		Core.AttributesValueObjectOf<Config, GenericElement>
	export type AttributesOf<GenericElement extends ElementsOf> = Core.AttributesOf<
		Config,
		GenericElement
	>
	export type FullAttributeObjectOf<GenericElement extends ElementsOf> = Core.FullAttributeObjectOf<
		Config,
		GenericElement
	>
	export type ChildrenOf<GenericElement extends ElementsOf> = Core.ChildrenOf<
		Config,
		GenericElement
	>
	export type ParentsOf<GenericElement extends ElementsOf> = Core.ParentsOf<Config, GenericElement>
	export type DescendantsOf<GenericElement extends ElementsOf> = Core.DescendantsOf<
		Config,
		GenericElement
	>
	export type AncestorsOf<GenericElement extends ElementsOf> = Core.AncestorsOf<
		Config,
		GenericElement
	>
	export type RootElementOf = Core.RootElementOf<Config>
	export type SingletonElementsOf = Core.SingletonElementsOf<Config>

	// OPERATIONS
	export type Operation = Core.Operation<Config>

	// RECORDS
	export type RawRecord<GenericElement extends ElementsOf> = Core.RawRecord<Config, GenericElement>
	export type ChainRecord<GenericElement extends ElementsOf> = Core.ChainRecord<
		Config,
		GenericElement
	>
	export type TreeRecord<GenericElement extends ElementsOf> = Core.TreeRecord<
		Config,
		GenericElement
	>

	export type ParentRelationship<GenericElement extends ElementsOf> = Core.ParentRelationship<
		Config,
		GenericElement
	>
	export type ChildRelationship<GenericElement extends ElementsOf> = Core.ChildRelationship<
		Config,
		GenericElement
	>

	export type Attribute<GenericElement extends ElementsOf> = Core.Attribute<Config, GenericElement>
	export type QualifiedAttribute<GenericElement extends ElementsOf> = Core.QualifiedAttribute<
		Config,
		GenericElement
	>
}
