import { cleanUp } from './clean-up'
import { dataModel } from './data-model'
import { history } from './history'
import { importExtension } from './import'
import { presentation } from './presentation'
import { reference } from './reference'
import { signature } from './signature'
import { template } from './template'

export const SCL_EXTENSION_MODULES = {
	cleanUp,
	dataModel,
	history,
	import: importExtension,
	reference,
	signature,
	template,
	presentation,
}
