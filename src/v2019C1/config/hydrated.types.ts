import type { Config } from './dialecte.config'
import type { SCL_EXTENSION_MODULES } from '@/v2019C1/extensions'
import type * as Core from '@dialecte/core'

type SclModules = typeof SCL_EXTENSION_MODULES
type SclExtensions = Core.MergedExtensions<SclModules>

export namespace Scl {
	export type Project<GenericCustomModules extends Core.ExtensionModules = Record<never, never>> =
		Core.Project<Config, SclModules & GenericCustomModules>
	export type Document = Core.Document<Config, SclExtensions>

	export type ExtendedDocument<
		GenericCustomModules extends Core.ExtensionModules = Record<never, never>,
	> = Core.ExtendedDocument<Config, SclModules & GenericCustomModules>

	export type Context = Core.Context<Config>

	export type Query = Core.Query<Config> & Core.QueryExtensions<SclExtensions>
	export type Transaction = Core.Transaction<Config> & Core.AllExtensions<SclExtensions>
	export type TransactionHooks = Core.TransactionHooks<Config>

	// DEFINITION
	export type ElementsOf = Core.ElementsOf<Config>
	export type Ref<GenericElement extends ElementsOf> = Core.Ref<Config, GenericElement>
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
	export type TrackedRecord<GenericElement extends ElementsOf> = Core.TrackedRecord<
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

	// MISCELLANEOUS
	export type CloneMapping = Core.CloneMapping<Config>
}
