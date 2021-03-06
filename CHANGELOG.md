# dev-master @ 74cbcb8 (1.2.x WIP)
* Fix broken vertical alignment of "fieldSet" children when displaying validation errors
* Fix form validation message not displaying when field not in currently active tab
* Fix copy to clipboard for multi-select
* Fix multi-select layout break / lack of growth when resizing form dialog
* Fix form dialog file upload buttons not reflecting already stored values
* Fix initial poor preview quality of uploaded images
* Fix non-portable persisted urls for file uploads (previously included http schema + host name)
* Fix revalidation of text inputs with input errors happening only after removing field focus
* Add "readonly" input setting
* Decouple / remove deprecated vis-ui.js dependency for Composer 2 compatibility
* Decouple / remove dependency on outdated blueimp server-side upload handling
* Strictness: Throw an exception if a schema references an undefined dataStore / featureType
* Strictness: Detect dataStore / featureType reference cycles and throw an exception
* Strictness: throw exception if dataStore / featureType configures an (client inaccessible) absolute upload path ("uri" / "path"); use web-relative paths only
* Add more client-side (console) warnings about legacy / ambiguous `formItems` contents
* Drop support for file uploads on IE <= 10

# 1.1.9
- Fix incomplete client-side configuration for central "dataStore" / "featureType" referenced by name

# 1.1.8
- Fix file input regression

# 1.1.7
- Fix missing content in "type: text" fields ([Mapbender #1319](https://github.com/mapbender/mapbender/issues/1319); also affects Digitizer 1.4)

# 1.1.6
- Fix DataTables initialization error when showing column values with null values with filtering enabled
- Default to listing object id if no table columns are defined

# 1.1.5
- Fix multi-select data extraction (convert to scalar by joining with separator)
- Fix radio groups initializing with no radio button checked

# 1.1.4
- Fix backend form browser text searchability through off-screen portions of "schemes" area
- Fix backend form sizing
- Extract backend form block "schemes_row" for customization

# 1.1.3
- Prevent attribute editing dialog from becoming narrower than configured while resizing
- Fix row button alignment dependency on table column width configuration

# 1.1.2
- Fix uploads integration
- Fix loading indicator producing undesired horizontal scrollbars in certain container types

# 1.1.1
- Fix undesirable table pagination reset after deletion

# 1.1.0
- Adopt basic Mapbender 3.2 design sensibilities
- Drop support hacks for legacy vis-ui versions <0.1.80
- Replace vis-ui.js-built.js dependency (provided by abandonware robloach/component-installer) with individual vendor-sourced file references

# 1.0.14
- Fix file input regression

# 1.0.13
- Fix missing content in "type: text" fields ([Mapbender #1319](https://github.com/mapbender/mapbender/issues/1319); also affects Digitizer 1.4)

# 1.0.12
- Fix multi-select data extraction (convert to scalar by joining with separator)
- Fix radio groups initializing with no radio button checked

# 1.0.11
- Fix backend form browser text searchability through off-screen portions of "schemes" area
- Fix backend form sizing
- Extract backend form block "schemes_row" for customization

# 1.0.10
- Prevent attribute editing dialog from becoming narrower than configured while resizing
- Fix row button alignment dependency on table column width configuration

# 1.0.9
- Fix uploads integration
- Fix undesirable table pagination reset after deletion
- Fix loading indicator producing undesired horizontal scrollbars in certain container types

# 1.0.8
- Localize table filtering / result count language
- Fix errors finding item id in file upload fields

# 1.0.7.1
- Fix undesired application reload when pressing enter in an attribute form input
- Fix double-display of http errors occuring on save
- Fix success message language on delete / save
- Replace HTML dump error messages with readable text
- Save / load error messages now remain on screen until clicked away

# 1.0.7
- Fix openEditDialog to use passed schema
- Fix bad server-side access check for item creation; use config value `allowCreate`)
- Fix bad server-side access check for item deletion (use config value `allowDelete`)
- Fix broken "Delete" interaction being offered on newly created item data dialog
- Fix table pagination after saving new data (switch page to make new entry visible)
- Fix reliance on Mapbender template or other Elements to provide vis-ui.js requirement
- Add visual indicator for loading / http activity
- Implement per-schema configurable popup title and width, [as documented](./README.md)
- Extract Element methods support WIP Digitizer 1.4 / other child class customization

# 1.0.6.4
- Fix empty table row "ghosts" appearing when cancelling new item creation
- Fix broken file upload implementation
- Fix popup positioning when switching between object detail forms without manually closing previous popup first
- Fix broken single-scheme operation
- Fix misc client-side memory leaks
- Fix popup staying open when switching to other element in Mapbender sidepane
- Fix schema selector option encoding
- Fix backend configuration popup styling issues on current Mapbender versions
- Improve http response performance when querying single data store
- Improve http response performance when interacting with schemas with complex / expensive form item configurations
- Improve client performance when interacting with large object collections
- Resolve CSS dependencies on Digitizer
- Resolve form type incompatibilites with Symfony 3
- Resolve Mapbender Element API deprecations (backward-compatible)
- Resolve FontAwesome 5 incompatibilities
- Add [event documentation](./events.md)

# 1.0.6.3
- Nothing

# 1.0.6.2
- Extract frontend twig
- Misc updates for Mapbender internal API conventions
