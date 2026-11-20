### Changed

- **An exported ISD holds no function category.** `extract.ied` leaves every `FunctionCategory` out of the process part, with its subcategories and function references, whatever the options: categories classify the functions of a project, they are no part of what an IED is specified with. An application kept no longer names a category; a `Private` left empty is not written. Source documents are unchanged.
