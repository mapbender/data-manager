(function($) {
    /**
     * @typedef {Object} DataManagerItem
     */
    /**
     * @typedef {Object} DataStoreConfig
     * @property {String} id
     * @property {String} uniqueId
     */
    /**
     * @typedef {Object} DataManagerSchemaConfig
     * @property {String} schemaName identifier for schema
     * @property {DataStoreConfig} dataStore
     * @property {boolean} allowEdit
     * @property {boolean} allowCreate
     * @property {boolean} allowDelete
     * @property {String} label
     * @property {Array<*>} formItems
     * @property {*} table
     */
    /**
     * @typedef {Object} DataManagagerBaseEventData
     * @property {Object} item
     * @property {String} itemId
     * @property {DataManagerSchemaConfig} schema
     * @property {*} originator sending widget instance
     */
    /**
     * @typedef {DataManagagerBaseEventData} DataManagerDeletedEventData
     * @property {String} schemaName
     * @property {Object} feature digitizer / bc amenity
     */
    /**
     * @typedef {DataManagagerBaseEventData} DataManagagerSaveEventData
     * @property {(String|null)} originalId null for newly saved item
     * @property {String} uniqueIdKey legacy: name of attribute on item that contains id
     * @property {String} schemaName identifier for schema
     * @property {String} scheme legacy (ambiguous): alias for schemaName
     */

    $.widget("mapbender.mbDataManager", {
        options: {
            /** @type {Object<String, DataManagerSchemaConfig>} */
            schemes: {}
        },
        /** @type {{DataManagerSchemaConfig|null}} */
        currentSettings: null,
        /** @type {Array.<Object>} */
        currentItems: [],
        featureEditDialogWidth: "423px",

        _create: function() {
            this.elementUrl = [
                Mapbender.configuration.application.urls.element,
                this.element.attr('id'),
                ''  // produce trailing slash
            ].join('/');
            this.selector = $(this._renderSchemaSelector(this.element));
            this.tableRenderer = this._createTableRenderer();
            this._initializeEvents();
            this._afterCreate();
        },
        _createTableRenderer: function() {
            return new Mapbender.DataManager.TableRenderer(this);
        },
        /**
         * @param {jQuery} $container to render into
         * @return {*|jQuery|HTMLElement} should always be (or wrap) the <select> tag
         * @private
         */
        _renderSchemaSelector: function($container) {
            var widget = this;
            var selector = $('<select class="selector -fn-schema-selector"/>');
            if ((typeof this.options.schemes !== 'object') || $.isArray(this.options.schemes)) {
                throw new Error("Invalid type for schemes configuration " + (typeof this.options.schemes));
            }
            // Use _.size, to support both Array and Object types
            var nSchemes = _.size(this.options.schemes);
            if (!nSchemes) {
                throw new Error("Missing schemes configuration");
            }

            if (nSchemes === 1) {
                var singleScheme = _.first(_.toArray(this.options.schemes));
                var title = singleScheme.label || singleScheme.schemaName;
                if(title) {
                    $container.append($('<h3 class="title"/>').text(title));
                }
                selector.hide();
            }
            this.hasOnlyOneScheme = (nSchemes === 1);
            $container.append(selector);

            // build select options
            _.each(this.options.schemes, function(schemaConfig) {
                var option = $("<option/>");
                option.val(schemaConfig.schemaName).text(schemaConfig.label);
                option.data('schema', widget._schemaFactory(schemaConfig));
                selector.append(option);
            });
            return selector;
        },
        /**
         * Called before binding schema to schema selection dropdown, effectively before
         * using schema in any scope. Support for child classes that want to add methods or
         * extend / modify / freeze the schema config otherwise before using it.
         * @param {DataManagerSchemaConfig} schemaConfig
         * @return {*}
         * @private
         */
        _schemaFactory: function(schemaConfig) {
            // return incoming object as is, no transformation
            return schemaConfig;
        },
        /**
         * Unraveled from _create for child class actions after initialization, but
         * before triggering ready event and loading the first set of data.
         * @private
         */
        _afterCreate: function() {
            this._start();
        },
        /**
         * Loads and displays data from initially selected schema.
         * Unraveled from _create for child classes need to act after our initialization,
         * but before loading the first set of data.
         * @private
         */
        _start: function() {
            this._trigger('ready');
            // Use schema change event, it does everything we need
            this.selector.trigger('change');
        },
        _initializeEvents: function() {
            var self = this;
            $('select.selector', this.element).on('change', function() {
                self._onSchemaSelectorChange();
            });
            this.element.on('click', '.-fn-edit-data', function() {
                var $tr = $(this).closest('tr');
                self._openEditDialog($tr.data('schema'), $tr.data('item'));
            });
            this.element.on('click', '.-fn-delete', function() {
                var $tr = $(this).closest('tr');
                self.removeData($tr.data('schema'), $tr.data('item'));
            });
            this.element.on('click', '.-fn-refresh-schema', function() {
                var schema = $(this).data('schema');
                if (self.currentPopup) {
                    self.confirmDialog(Mapbender.trans('mb.data.store.confirm.close.edit.form')).then(function() {
                        self._closeCurrentPopup();
                        self._getData(schema);
                    });
                } else {
                    self._getData(schema);
                }
            });
            this.element.on('click', '.-fn-create-item', function() {
                var schema = $(this).data('schema');
                self._createItem(schema);
            });
        },
        /**
         * Mapbender sidepane interaction API
         */
        hide: function() {
            this._closeCurrentPopup();
        },
        /**
         * @todo Digitizer: use .featureType attribute instead of .dataStore (otherwise equivalent)
         * @param {DataManagerSchemaConfig} schema
         * @return {DataStoreConfig}
         */
        _getDataStoreFromSchema: function(schema) {
            return schema.dataStore;
        },
        _closeCurrentPopup: function() {
            if (this.currentPopup){
                this.currentPopup.popupDialog('destroy');
                this.currentPopup = null;
            }
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @private
         */
        _activateSchema: function(schema) {
            if (this.currentSettings) {
                this._deactivateSchema(this.currentSettings);
                this.currentSettings = null;
            }
            $('.frame', this.element).remove();
            this.currentSettings = schema;
            $('select.selector', this.element).after(this._renderSchemaFrame(schema));
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @private
         */
        _deactivateSchema: function(schema) {
            this._closeCurrentPopup();
        },
        _getCurrentSchema: function() {
            var $select = $('select.selector', this.element);
            var option = $('option:selected', $select);
            return option.data("schema");
        },
        _onSchemaSelectorChange: function() {
            var schemaNew = this._getCurrentSchema();
            this._activateSchema(schemaNew);
            this._getData(schemaNew);
        },
        _buildTableRowButtons: function(schema) {
            return this.tableRenderer.getButtonsOption(schema);
        },
        _buildTableColumnsOptions: function(schema) {
            return this.tableRenderer.getColumnsOption(schema);
        },
        _getTableColumnsConfiguration: function(schema) {
            return this.tableRenderer.getColumnsConfigs(schema);
        },
        _getTableSettings: function(schema) {
            return this.tableRenderer.getOptions(schema);
        },
        _renderTable: function(schema) {
            return this.tableRenderer.render(schema);
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {jQuery}
         * @private
         */
        _renderSchemaFrame: function(schema) {
            var frame =  $("<div/>")
                .addClass('frame')
                .data("schema", schema)
            ;
            var $toolset = $('<div>').addClass('schema-toolset');
            frame.append($toolset);
            this._updateToolset($toolset, schema);

            frame.append($toolset);
            var $loadingIndicator = $(document.createElement('div'))
                .addClass('loading-indicator')
                .css({opacity: 0})
                .append($('<i class="fa fas fa-spinner fa-spin">'))
            ;
            frame.append($loadingIndicator);
            frame.append(this._renderTable(schema));
            return frame;
        },
        /**
         * @param {jQuery} $container
         * @param {DataManagerSchemaConfig} schema
         * @private
         */
        _updateToolset: function($container, schema) {
            $container.empty();
            var toolset = this._renderToolset(schema);
            $container.append(toolset);
        },
        /**
         * @param {DataManagerSchemaConfig}schema
         * @return {Array<(Element|{jQuery})>}
         * @private
         */
        _renderToolset: function(schema) {
            var buttons = [];
            if (schema.allowRefresh) {       // how?
                var $refreshButton = $('<button>').data('schema', schema).attr({
                    type: 'button',
                    'class': 'btn btn-sm -fn-refresh-schema',
                    title: Mapbender.trans('mb.data.store.create')      // sic! @todo: distinct translation
                });
                $refreshButton.append($('<i/>').addClass('fa fa-refresh'));
                buttons.push($refreshButton);
            }

            if (schema.allowCreate) {
                var $createButton = $('<button>').data('schema', schema).attr({
                    type: 'button',
                    'class': 'btn btn-sm -fn-create-item',
                    title: Mapbender.trans('mb.data.store.create')
                });
                $createButton.append($('<i/>').addClass('fa fa-plus'));
                buttons.push($createButton);
            }
            if (buttons.length) {
                var $group = $(document.createElement('span'))
                    .addClass('btn-group')
                    .append(buttons)
                ;
                return $group.get();
            } else {
                return [];
            }
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {String|null|undefined} id will auto-extract from dataItem if undefined
         * @param {Object} dataItem
         * @param {Object} [newValues]
         * @return {Promise}
         * @private
         * @todo 1.1: remove id argument, always auto-extract item id
         */
        _saveItem: function(schema, id, dataItem, newValues) {
            var self = this;
            var params = {
                schema: schema.schemaName
            };
            var id_;
            if (typeof id === 'undefined') {
                id_ = this._getUniqueItemId(schema, dataItem);
            } else {
                id_ = id;
            }
            if (id_) {
                params.id = id_;
            }
            var submitData = this._getSaveRequestData(schema, dataItem, newValues);
            return this.postJSON('save?' + $.param(params), submitData)
                .then(function(response) {
                    self._afterSave(schema, dataItem, id_, response);
                    return response;
                }, function(jqXHR, textStatus, errorThrown) {
                    var message = (jqXHR.responseJSON || {}).message || 'API error';
                    console.error(message, textStatus, errorThrown, jqXHR);
                    $.notify(message, {
                        title:     'API Error',
                        autoHide:  false,
                        className: 'error'
                    });
                })
            ;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @param {Object} [newValues]
         * @return {{dataItem: *}}
         * @private
         */
        _getSaveRequestData: function(schema, dataItem, newValues) {
            return {
                dataItem: Object.assign({}, this._getItemData(schema, dataItem), newValues || {})
            };
        },
        /**
         * Produces event after item has been saved on the server.
         * New items have a null originalId. Updated items have a non-empty originalId.
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @param {(String|null)} originalId
         * @private
         */
        _saveEvent: function(schema, dataItem, originalId) {
            /** @var {DataManagagerSaveEventData} eventData */
            var eventData = {
                item: dataItem,
                itemId: this._getUniqueItemId(schema, dataItem),
                originalId: originalId,
                uniqueIdKey: this._getUniqueItemIdProperty(schema),
                schema: schema,
                schemaName: schema.schemaName,
                scheme: schema.schemaName,
                originator: this
            };
            this.element.trigger('data.manager.item.saved', eventData);
        },
        /**
         * Called after item has been stored on the server.
         * New items have a null originalId. Updated items have a non-empty originalId.
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @param {String|null} originalId
         * @param {Object} responseData
         * @private
         */
        _afterSave: function(schema, dataItem, originalId, responseData) {
            this._replaceItemData(schema, dataItem, responseData.dataItem);
            if (!originalId) {
                // new item
                this.currentItems.push(dataItem);
                this.tableRenderer.addRow(schema, dataItem, true);
            } else {
                this.tableRenderer.refreshRow(schema, dataItem, true);
            }
            this._saveEvent(schema, dataItem, originalId);
            $.notify(Mapbender.trans('mb.data.store.save.successfully'), 'info');
        },
        /**
         * @param {jQuery} $form
         * @return {Object|boolean} false on any invalid form inputs
         * @private
         */
        _getFormData: function($form) {
            // @todo vis-ui: make form validation and form data extraction available separately
            //               validation is currently only performed implicitly on extraction
            var formData = $form.formData();
            var $allNamedInputs = $(':input[name]', $form);
            var $invalidInputs = $allNamedInputs.filter(function() {
                // NOTE: jQuery pseudo-selector :valid can not be chained into a single .find (or snytactic variant)
                return $(this).is(':not(:valid)');
            });
            // @todo vis-ui: some inputs (with ".mandatory") are made invalid only visually when
            //               empty, but do not have the HTML required or pattern property to
            //               support selector detection. Work around that here.
            $invalidInputs = $invalidInputs.add($('.has-error :input', $form));
            // return false if any inputs are invalid
            return !$invalidInputs.length && formData;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {jQuery} $form
         * @param {Object} [dataItem]
         * @return {boolean|Promise}
         * @private
         */
        _submitFormData: function(schema, $form, dataItem) {
            var formData = this._getFormData($form);

            if (formData) {
                $form.disableForm();
                var uniqueIdAttribute = this._getUniqueItemIdProperty(schema);
                var uniqueId = this._getUniqueItemId(schema, dataItem);
                if (typeof formData[uniqueIdAttribute] !== 'undefined') {
                    console.warn("Form contains an input field for the object id", schema);
                }
                delete formData[uniqueIdAttribute];
                return this._saveItem(schema, uniqueId, dataItem, formData)
                    .always(function() {
                        $form.enableForm();
                    })
                ;
            } else {
                return false;
            }
        },
        /**
         * Gets persistent data properties of the item
         * @return {Object}
         */
        _getItemData: function(schema, dataItem) {
            // Trivial in data manager: the item and the item data are completely interchangeable
            // @todo Digitizer: when working with native Openlayers feature, return data properties instead of top-level object
            return dataItem;
        },
        /**
         * Places updated data (from form or otherwise) back into the item
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @param {Object} newValues
         * @private
         */
        _replaceItemData: function(schema, dataItem, newValues) {
            // @todo Digitizer: when working with native Openlayers feature, use data properties instead of top-level object
            _.extend(dataItem, newValues);
        },
        /**
         * Open edit feature dialog
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @private
         */
        _openEditDialog: function(schema, dataItem) {
            var widget = this;
            this._closeCurrentPopup();
            var itemValues = this._getItemData(schema, dataItem);

            var dialog = $("<div/>");
            var formItems = schema.formItems.map(function(item) {
                return widget._processFormItem(schema, item, itemValues);
            });
            dialog.generateElements({children: formItems});
            dialog.popupDialog(this._getEditDialogPopupConfig(schema, dataItem));
            widget.currentPopup = dialog;

            // Work around vis-ui quirk where item creation may be asynchrnous (selects in particular),
            // and form data can only be set after waiting for all pending events to complete
            setTimeout(function() {
                dialog.formData(itemValues);
            }, 30);

            dialog.one('popupdialogclose', function() {
                widget._cancelForm(schema, dataItem);
            });

            return dialog;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @return {Object}
         * @see https://api.jqueryui.com/1.12/dialog/
         * @private
         */
        _getEditDialogPopupConfig: function(schema, dataItem) {
            return {
                title: Mapbender.trans('mb.data.store.edit.title'),
                width: this.featureEditDialogWidth,
                classes: {
                    'ui-dialog-content': 'ui-dialog-content data-manager-edit-data'
                },
                buttons: this._getEditDialogButtons(schema, dataItem)
            };
        },
        /**
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @return {Array<Object>}
         * @private
         */
        _getEditDialogButtons: function(schema, dataItem) {
            var buttons = [];
            var widget = this;
            if (schema.allowEdit) {
                buttons.push({
                    text: Mapbender.trans('mb.data.store.save'),
                    click: function() {
                        // HACK: depending on configuration, there may not even be a form tag
                        //       in the current editing dialog
                        var $form = $(this).closest('.ui-dialog-content');
                        var saved = widget._submitFormData(schema, $form, dataItem);
                        if (saved) {
                            saved.then(function() {
                                widget._closeCurrentPopup();
                            });
                        }
                    }
                });
            }
            if (schema.allowDelete && this._getUniqueItemId(schema, dataItem)) {
                buttons.push({
                    text: Mapbender.trans('mb.data.store.remove'),
                    'class': 'critical',
                    click: function() {
                        widget._closeCurrentPopup();
                        widget.removeData(schema, dataItem);
                    }
                });
            }
            buttons.push({
                text: Mapbender.trans('mb.data.store.cancel'),
                click: function() {
                    widget._cancelForm(schema, dataItem);
                }
            });
            // @todo Digitizer: add custom schema buttons...?

            return buttons;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @private
         */
        _createItem: function(schema) {
            this._openEditDialog(schema, {});
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @private
         */
        _cancelForm: function(schema, dataItem) {
            this._closeCurrentPopup();
            // @todo Digitizer: discard geometry modifications / discard entire item if it's new
        },
        /**
         * Preprocess form items from schema before passing off to vis-ui
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} item
         * @param {Object} dataItem
         * @return {Object}
         * @private
         * @todo: this could also be a postprocess on the finished form
         */
        _processFormItem: function(schema, item, dataItem) {
            // shallow copy only. Sub-attributes that need patching will be replaced recursively anyway.
            var itemOut;
            var self = this;
            var files;
            if (item.children && item.children.length) {
                itemOut = $.extend({}, item, {
                    children: item.children.map(function(ch) {
                        return self._processFormItem(schema, ch, dataItem);
                    })
                });
            }
            switch (item.type) {
                case 'file':
                    // @todo: cannot upload file properly to new data item (no id to target); disable file inputs, or use proper forms
                    // @todo: cannot use fid in DataManager (fid seems like a Digitizer-specific thing)
                    itemOut = itemOut || $.extend({}, item);
                    itemOut.uploadHanderUrl = self.elementUrl + "file-upload?schema=" + schema.schemaName + "&fid=" + dataItem.fid + "&field=" + item.name;
                    // @todo: form inputs without a name attribute should be an error condition
                    if (item.name && dataItem[item.name]) {
                        itemOut.dbSrc = dataItem[item.name];
                        // @todo: figure out who even populates this value (not data source, not data manager)
                        files = this._getDataStoreFromSchema(schema).files || [];
                        $.each(files, function(k, fileInfo) {
                            if (fileInfo.field === item.name && fileInfo.formats) {
                                itemOut.accept = fileInfo.formats;
                            }
                        });
                    }
                    break;
                case 'image':
                    var origSrc = item.origSrc || item.src;
                    var dbSrc = item.name && dataItem[item.name];
                    if (dbSrc) {
                        // @todo: figure out who even populates this value (not data source, not data manager)
                        files = this._getDataStoreFromSchema(schema).files || [];
                        $.each(files, function(k, fileInfo) {
                            if (fileInfo.field === item.name && fileInfo.uri) {
                                dbSrc = fileInfo.uri + "/" + dbSrc;
                            }
                        });
                    }
                    var src = dbSrc || origSrc;
                    // why do we support a distinct 'relative' image type if this means supporting both absolute and relative?
                    if (item.relative && !src.test(/^(http[s]?:|\/{2})/)) {
                        src = Mapbender.configuration.application.urls.asset + src;
                    }
                    if (src !== item.src) {
                        itemOut = itemOut || $.extend({}, item, {
                            src: src
                        });
                    }
                    break;
                default:
                    // fall out
                    break;
            }
            return itemOut || item;
        },
        /**
         * Getdata
         *
         * @private
         */
        _getData: function(schema) {
            var widget = this;
            return this.getJSON('select', {
                    schema: schema.schemaName
            }).then(function(dataItems) {
                widget.currentItems = dataItems.map(function(itemData) {
                    return widget._prepareDataItem(schema, itemData);
                });
                widget.tableRenderer.replaceRows(schema, widget.currentItems);
                return widget.currentItems;
            });
        },
        /**
         * Transforms data item server response data to internally used item structure.
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} data
         * @return {*}
         * @private
         */
        _prepareDataItem: function(schema, data) {
            // trivial in data-manager: data item and plain data objects are interchangeable
            // @todo Digitizer: create Openlayers feature
            return data;
        },
        /**
         * Remove data item
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         */
        removeData: function(schema, dataItem) {
            var widget = this;
            var id = this._getUniqueItemId(schema, dataItem);
            if (!id) {
                throw new Error("Can't delete item without id from server");
            }
            this.confirmDialog(Mapbender.trans('mb.data.store.remove.confirm.text')).then(function() {
                var params ={
                    schema: schema.schemaName,
                    id: id
                };
                widget.postJSON('delete?' + $.param(params), null, {
                    method: 'DELETE'
                }).done(function() {
                    widget._afterRemove(schema, dataItem, id);
                });
            });
        },
        /**
         * Produces event after item has been deleted server-side
         *
         * @param schema
         * @param dataItem
         * @param id
         * @private
         */
        _deleteEvent: function(schema, dataItem, id) {
            // Quirky jquery ui event. Triggers a 'mbdatamanagerremove' on this.element. Limited legacy data payload.
            this._trigger('removed', null, {
                schema: schema,
                feature: dataItem
            });
            /** @type {DataManagerDeletedEventData} */
            var eventData = {
                schema: schema,
                schemaName: schema.schemaName,
                item: dataItem,
                // Digitizer / bc amenity
                feature: dataItem,
                itemId: id,
                // sending widget instance
                originator: this
            };

            // Listeners should prefer data.manager.item.deleted because a) it is much easier to search for non-magic, explicit
            // event names in project code; b) it contains more data
            this.element.trigger('data.manager.item.deleted', eventData);
        },
        /**
         * Called after item has been deleted from the server
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} dataItem
         * @param {String} id
         * @private
         */
        _afterRemove: function(schema, dataItem, id) {
            this.currentItems = _.without(this.currentItems, dataItem);
            this.tableRenderer.replaceRows(schema, this.currentItems);
            this._deleteEvent(schema, dataItem, id);
            $.notify(Mapbender.trans('mb.data.store.remove.successfully'), 'info');
        },
        /**
         * @param schema
         * @todo 1.1: remove this method
         */
        redrawTable: function(schema) {
            this.tableRenderer.replaceRows(schema, this.currentItems);
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {String}
         * @private
         */
        _getUniqueItemIdProperty: function(schema) {
            // @todo: this default should be server provided
            return this._getDataStoreFromSchema(schema).uniqueId || 'id';
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} item
         * @return {(String|null)}
         * @private
         */
        _getUniqueItemId: function(schema, item) {
            var itemData = this._getItemData(schema, item);
            var idProperty = this._getUniqueItemIdProperty(schema);
            return itemData[idProperty] || null;
        },
        /**
         * @param {String} uri
         * @param {Object} [data]
         * @return {jQuery.Deferred}
         */
        getJSON: function(uri, data) {
            var url = this.elementUrl + uri;
            var $loadingIndicator = $('.loading-indicator', this.element);
            $loadingIndicator.css({opacity: 1});
            return $.getJSON(url, data)
                .fail(this._onAjaxError)
                .always(function() {
                    $loadingIndicator.css({opacity: 0})
                })
            ;
        },
        postJSON: function(uri, data, options) {
            var options_ = {
                url: this.elementUrl + uri,
                method: 'POST',
                contentType: 'application/json; charset=utf-8',
                dataType: 'json'
            };
            _.extend(options_, options || {});
            if (data && !options_.data) {
                options_.data = JSON.stringify(data);
            }
            var $loadingIndicator = $('.loading-indicator', this.element);
            $loadingIndicator.css({opacity: 1});
            return $.ajax(options_)
                .fail(this._onAjaxError)
                .always(function() {
                    $loadingIndicator.css({opacity: 0})
                })
            ;
        },
        _onAjaxError: function(xhr) {
            var errorMessage = Mapbender.trans('mb.data.store.api.query.error-message');
            $.notify(errorMessage + JSON.stringify(xhr.responseText));
            console.log(errorMessage, xhr);
        },
        /**
         * Promise-based confirmation dialog utility.
         * @param {String} title
         * @return {Promise}
         * @static
         */
        confirmDialog: function confirmDialog(title) {
            // @todo: bypass vis-ui / jquerydialogextend auto-monkey-patching
            var $dialog =$('<div/>').addClass('confirm-dialog');
            var deferred = $.Deferred();
            $dialog.popupDialog({
                title: title,
                maximizable: false,
                dblclick:    false,
                minimizable: false,
                resizable:   false,
                collapsable: false,
                modal:       true,
                buttons:     [{
                    // @todo: translate
                    text:  "OK",
                    click: function() {
                        // work around vis-ui forgetting to remove its invisible modal block
                        $(this).popupDialog('close');
                        // ... then do what we actually need to do
                        $(this).popupDialog('destroy');
                        deferred.resolveWith(true);
                    }
                }, {
                    // @todo: translate
                    text:    "Abbrechen",
                    'class': 'critical',
                    click:   function() {
                        // work around vis-ui forgetting to remove its invisible modal block
                        $(this).popupDialog('close');
                        // ... then do what we actually need to do
                        $(this).popupDialog('destroy');
                        deferred.reject();
                    }
                }]
            });
            return deferred;
        },
        /**
         * Utility method to escape HTML chars
         * @param {String} text
         * @returns {string}
         * @static
         */
        escapeHtml: function escapeHtml(text) {
            'use strict';
            return text.replace(/["&'\/<>]/g, function (a) {
                return {
                    '"': '&quot;', '&': '&amp;', "'": '&#39;',
                    '/': '&#47;',  '<': '&lt;',  '>': '&gt;'
                }[a];
            });
        },
        __dummy: null
    });

})(jQuery);
