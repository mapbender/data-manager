# Deprecated

This repository is deprecated. Its functionality will be integrated into the [mapbender digitizer repository](https://github.com/mapbender/mapbender-digitizer) in version 2.0 and the code has already been ported to the [develop branch](https://github.com/mapbender/mapbender-digitizer/tree/develop/src/Mapbender/DataManagerBundle). Propose any changes there.

---

## Old description: Mapbender Data Manager element
List and edit database table contents in a Mapbender application.

Data listings are displayed as (HTML) tables. Individual items can be edited or created in customizable forms.

Designed for use in a sidepane.

Data is organized into "schemes" to support multiple tables with differing data and form structures.

If multiple schemes are defined, Data Manager will display a dropdown to allow schema switching.

Each schema separately defines how data is listed and the structure of the form used for editing and creating items.

For spatial data integration, see [Digitizer](https://github.com/mapbender/mapbender-digitizer).

For database connection / table selection, please refer to [the Data Source documentation](https://github.com/mapbender/data-source#configuring-repositories).

Connection and table configuration may either be inlined into the Data Manager schema configuration directly, or
reference an existing global configuration placed into a Symfony container parameter.

## Configuring tabular item listing
Each schema configuration contains an object under key `table` with the following structure:

| name | type | description | default |
|---|---|---|---|
| columns | list of objects with `data` and `label` entries | maps database columns to HTMl table columns | Display primary key only |
| searching | boolean | Enables display filtering by search term | true |
| pageLength | integer | Limits the number of rows per page | 16 |

## Configuring forms
Each schema configuration contains a list of (potentially nested) objects under key
`formItems`, defining the contents and structure of the form shown
when an item is created or edited. Note that this form will also be
used purely as a detail display vehicle even if editing is disabled.

Additionaly, the `popup` object in the schema controls properties of the
the popup itself. It supports the following values:

| name | type | description | default |
|---|---|---|---|
| title | string | Popup title text | "Edit" (localized) |
| width | string | valid CSS width rule | "550px" |


### Form input fields
Form input fields come in a multitude of different types, controlled by the `type`
value. All inputs share a common set of configuration options:

| name | type | description | default |
|---|---|---|---|
| type | string | Type of form input field (see below) | -none- |
| name | string | Database column mapped to the input | -none- |
| value | string | Initial field value on newly created items | -none- |
| title | string | Label text for form input field | -none- |
| attr | object | Mapping of HTML attributes to add to the input | -none- |
| infoText | string | Explanatory text placed in a tooltip next to the label | -none- |
| css | object | Mapping of CSS rules to add to the form group (container around label and input) | -none- |
| cssClass | string | Added to the class attribute of the form group (container around label and input) | -none- |

Input field `type` is one of
* "input" for a [regular single-row text input](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/text)
* "textArea" for a [multiple-row text input](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea)
* "select" for a [dropdown offering predefined choices](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/select)
* "radioGroup" for an expanded list of [predefined choices](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/radio)
* "checkbox" for an [on / off choice](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/checkbox)
* "date" for a [specialized input selecting a calendar day](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date) (produces standard SQL date string format "YYYY-MM-DD")
* "colorPicker" for a [specialized input selecting a color](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/color) (produces CSS-like hash + 6 hex digits string format)
* "file" for [allowing file attachments](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file)

Many common customizations for inputs can be performed purely with the `attr` object.
E.g. type "input" can be restricted to allow numbers only by overriding
its HTML type attribute; all inputs can be made required or readonly.

```yml
<...>
formItems:
  - type: input
    name: strictly_formatted_column
    title: Strict input pattern demo
    attr:
        pattern: '\w{2}\d{3,}'
        placeholder: Two letters followed by at least three digits
        required: true
  - type: input
    name: numeric_column
    title: Numbers only
    attr:
      type: number
      min: 10
      max: 200
      step: 10
      required: true
  - type: textArea
    name: text_column
    title: Very large text area
    attr:
      rows: 10
```


#### Choice input option formats
Types "radioGroup" and "select" require a list of objects under key
`options` to specify the available choices. Option objects contain:

| name | type | description | default |
|---|---|---|---|
| value | string | Generated database value for the choice | -none- |
| label | string | Displayed text for the choice | Same as value |
| attr | object | Mapping of HTML attributes to add to the individual HTML `<option>` or `<input type="radio">` | -none- |

```yml
<...>
formItems:
  - type: select
    options:
      # Allow user to explicitly (re)select ~nothing in particular
      - label: ''
        value: ''
      - label: First option text   # displayed
        value: v1   # value in database column
      - label: Second option text (disabled)
        value: v2
        attr:
          disabled: true
      - label: Third option text
        value: v3
```

Selects (NOT radioGroup items) can alternatively specify `sql`
and `connection` (Doctrine DBAL connection name) to generate choices
dynamically. The `sql` _should_ generate `label` and `value` aliases
for clarity. If it does not, the first column of each
row is used as the option label and the last column as the submit value.

Static `option` definitions and `sql` can also be combined.
```yml
<...>
formItems:
  - type: select
    options:
      # Allow user to explicitly (re)select ~nothing in particular
      - label: ''
        value: ''
      - label: Static option a
        value: a
    sql: SELECT CONCAT("label_prefix", ': ', "name") AS label, "id" AS value FROM "some_table"
    connection: name_of_some_connection
```

If `sql` is defined but `connection` is omitted, the "default" DBAL connection
is used for the query.

#### File uploads
Files uploaded through `type: file` form items will be stored in the
server's file system. The mapped database column will only store a file path as a string.

The default storage path for uploads is determined by Mapbender, but
can be reconfigured on the "dataStore" / "featureType" level, individually
for each database column. This is done via a `files` object in the
"dataStore" / "featureType" configuration.

E.g.
```yml
schemes:
  items_with_customized_upload_location:
    dataStore:
        connection: dm_connection_name
        table: items_with_file_attachments
        ## Customization per column here
        files:
          - field: attachment_path_column
            path: /var/mapbender-attachments/dm/items_with_customized_upload_location/attachment_path_column
```

The starting point for a relative `path` (no leading slash) is the web server document root.

For image attachments, you may link a `type: img` item that will automatically display a preview of the current attachment.

```yml
<...>
formItems:
    - type: file
      title: Attached image
      name: img_path_column
      attr:
        accept: 'image/*'
    - type: image
      name: img_path_column   # Link to input established by matching "name" value
      src: attachment-placeholder.png
```

### Structural / misc form elements
#### Type "tabs"
Complex form dialogs can be organized into multiple tabs by inserting an object with `type: tabs`
into the `formItems` list, and assigning it one or more tab specifications, which
consist of `title` (text displayed on the tab) and `children` (contents of the tab).

```yml
<...>
popup:
  title: 'Multi-tab form dialog'
formItems:
  - type: tabs
    children:
      - title: 'First tab'
        children:
          # First tab form item specifications
          - type: input
            title: Input in first tab
            <...>
      - title: 'Second tab'
        children:
          # First tab form item specifications
          - type: input
            title: Input in second tab
```

### Misc container tags "div", "span", "p"
Inserts HTML `<div>`, `<span>` or `<p>` tags. May specify `text` (encoded, inserted first) and `children` (list of more items to insert).
Supports adding free-form HTML attributes via `attr` object and custom `cssClass`.

```yml
<...>
formItems:
  - type: p
    text: This is an introductory paragraph.
  # Arrange inputs in Bootstrap grid row + columns
  - type: div
    cssClass: row
    children:
      - type: input
        title: Input in left column
        cssClass: col-xs-4 col-4
      - type: input
        title: Input in middle column
        cssClass: col-xs-4 col-4
      - type: input
        title: Input in right column
        cssClass: col-xs-4 col-4
```

### Type "html"
Inserts custom HTML content (no escaping), wrapped into an extra div. May specify `attr` and `cssClass` to be added onto the containing div.
```yml
<...>
formItems:
  - type: html
    html: 'This will <strong>not</strong> go through any HTML escaping.'
    cssClass: added-on-wrapping-div
```

#### Type "breakLine"
Inserts a single HTML `<hr>` element. Supports adding free-form HTML attributes via `attr` object and custom `cssClass`.


## Configuring access
Each schema may also limit the possible interactions users can perform:

| name | type | description | default |
|---|---|---|---|
| allowCreate | boolean | Enables creation of new items | true |
| allowEdit | boolean | Enables editing of existing items | true |
| allowDelete | boolean | Enables deletion of existing items | true |
| allowRefresh | boolean | Add button to explicitly reload items from database | false |

## Example configuration
```yaml

schemes:
  a_demo_schema:
    label: Demo   # displayed in schema selector, if multiple schemes configured
    dataStore:
      connection: dm_connection_name
      table: dm_items
      uniqueId: id
    allowEdit:    true    # Can edit existing items
    allowCreate:  true    # Can create new items from scratch
    allowDelete:  false   # Can not delete anything
    allowRefresh: true    # Enable item refresh button
    table:
      columns:
      - data: id
        title: ID
      - data: name
        title: Item name
    popup:
      title: 'Edit dialog title'
      width: 50vw   # half screen width
    formItems:
    - type: p
      text: This is a non-interactive introductory paragraph.
    - type: input
      name: name
      infoText: This will show up in a tooltip next to the label.
      title: Item name
      attr:
        placeholder: 'Entry required'
        required: true
    - type: textArea
      name: description
      title: Longer description text
      attr:
        rows: 4
    - type: radioGroup
      title: Choose one
      name: choice_column_1
      options:
        - label: Option 1
          value: v1
        - label: Option 2
          value: v2
      value: v2   # Pre-select second option by default for new items
    - type: select
      title: Select at least one (multiple choice)
      attr:
        required: required
        multiple: multiple
      name: choice_column_2
      options:
        - label: Option 1
          value: v1
        - label: Option 2 (disabled)
          value: v2
          attr:
            disabled: disabled
        - label: Option 3
          value: v3
      value: v1,v3   # use comma-separated values for default multi-select value
```
