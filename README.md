# Mapbender data manager element

Allow configure, manage and display data using custom forms in mapbender3.


## Installation 
* First you need installed mapbender3-starter https://github.com/mapbender/mapbender-starter#installation project
* Add required module to mapbender

```sh
$ cd application/
$ ../composer.phar require "mapbender/data-manager"
```

## Configuration 


### Element 

#### Schemes 

Example configuration 

```yaml

schemes:
    baumkataster:
      dataStore:
        connection: databaseName
        table: tableName
        uniqueId: uniqueId

      allowEdit:    true
      allowCreate:  true
      allowDelete:  false
      allowRefresh: false
      popup:
        title: 'Datamanger edit dialog title'
        width: 550px
      formItems:
        -
          type: form
          children:
            -
              type: input
              name: textFieldName
              placeholder: 'Place holder text'
              mandatory: true
      table:
        autoWidth: false
        columns:
          -
            data: uniqueIdFieldName
            title: ID
          -
            data: textInputField
            title: 'Input text description'
        info: true
        lenghtChange: false
        ordering: true
        pageLength: 12
        paging: true
        processing: true
        searching: true
```


## Contributing

Please read official [contibuting documentation](https://github.com/mapbender/mapbender-starter/blob/feature/contributing-doc/CONTRIBUTING.md#modules)