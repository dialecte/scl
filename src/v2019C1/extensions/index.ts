import { cleanUp } from './clean-up'
import { dataModel } from './data-model'
import { history } from './history'
import { identity } from './identity'
import { extract } from './lifecycle/extract'
import { instantiate } from './lifecycle/instantiate'
import { transplant } from './lifecycle/transplant'
import { presentation } from './presentation'
import { reference } from './reference'
import { signature } from './signature'

export const SCL_EXTENSION_MODULES = {
	cleanUp,
	dataModel,
	extract,
	history,
	identity,
	instantiate,
	transplant,
	reference,
	signature,
	presentation,
}
