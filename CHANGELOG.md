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
