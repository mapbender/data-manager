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
     * @property {Array<*>} formItems
     * @property {*} table
     */
    /**
     * @typedef {Object} DataManagagerBaseEventData
     * @property {Object} item
     * @property {String} itemId
     * @property {Object} schema
     * @property {*} originator sending widget instance
     */
    /**
     * @typedef {DataManagagerBaseEventData} DataManagerDeletedEventData
     * @property {String} schemaName
     * @property {Object} feature digitizer / bc amenity
     */
    /**
     * @typedef {DataManagagerBaseEventData} DataManagagerSaveEventData
     * @property {String|null} originalId null for newly saved item
     * @property {String} uniqueIdKey legacy: name of attribute on item that contains id
     * @property {String} schemaName identifier for schema
     * @property {String} scheme legacy (ambiguous): alias for schemaName
     */

    /**
     * @param {String} title
     * @returns {Promise}
     */
    function confirmDialog(title) {

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
                click: function(e) {
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
                click:   function(e) {
                    // work around vis-ui forgetting to remove its invisible modal block
                    $(this).popupDialog('close');
                    // ... then do what we actually need to do
                    $(this).popupDialog('destroy');
                    deferred.reject();
                }
            }]
        });
        return deferred;
    }

    /**
     * Escape HTML chars
     * @param text
     * @returns {string}
     */
    function escapeHtml(text) {
        'use strict';
        return text.replace(/[\"&'\/<>]/g, function (a) {
            return {
                '"': '&quot;', '&': '&amp;', "'": '&#39;',
                '/': '&#47;',  '<': '&lt;',  '>': '&gt;'
            }[a];
        });
    }

    $.widget("mapbender.mbDataManager", {
        options: {
            /** @type {Object<String, DataManagerSchemaConfig>} */
            schemes: {}
        },
        /** @type {DataManagerSchemaConfig|null} */
        currentSettings: null,
        featureEditDialogWidth: "423px",

        _create: function() {
            var widget = this;
            var element = widget.element;
            var selector = widget.selector = $('<select class="selector"/>');
            if ((typeof this.options.schemes !== 'object') || $.isArray(this.options.schemes)) {
                throw new Error("Invalid type for schemes configuration " + (typeof this.options.schemes));
            }
            if (!Object.keys(this.options.schemes).length) {
                throw new Error("Missing schemes configuration");
            }

            var options = widget.options;
            var hasOnlyOneScheme = widget.hasOnlyOneScheme = _.size(options.schemes) === 1;
            widget.elementUrl = Mapbender.configuration.application.urls.element + '/' + element.attr('id') + '/';

            if (hasOnlyOneScheme) {
                var singleScheme = _.first(_.toArray(this.options.schemes));
                var title = singleScheme.label || singleScheme.schemaName;
                if(title) {
                    element.append($('<h3 class="title"/>').text(title));
                }
                selector.hide();
            }
            element.append(selector);

            // build select options
            _.each(options.schemes, function(schema, schemaName) {
                var option = $("<option/>");
                option.val(schemaName).text(schema.label || schemaName);
                option.data("schema", schema);
                selector.append(option);
            });

            this._initializeEvents();
            widget._trigger('ready');
            selector.trigger('change');
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
                if(self.currentPopup) {
                    confirmDialog(Mapbender.trans('mb.data.store.confirm.close.edit.form')).then(function() {
                        self._closeCurrentPopup();
                        self._getData(schema);
                    });
                } else {
                    self._getData(schema);
                }
            });
            this.element.on('click', '.-fn-create-item', function() {
                var schema = $(this).data('schema');
                self._openEditDialog(schema, {});
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
        _onSchemaSelectorChange: function() {
            var $select = $('select.selector', this.element);
            var option = $('option:selected', $select);
            var schema = option.data("schema");
            this._activateSchema(schema);
            this._getData(schema);
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {Array<Object>}
         * @private
         */
        _buildTableRowButtons: function(schema) {
            var buttons = [];
            var self = this;
            // @todo: surely this requires checking schema.allowEdit
            buttons.push({
                title: Mapbender.trans('mb.data.store.edit'),
                cssClass: 'fa fa-edit -fn-edit-data'
            });

            if(schema.allowDelete) {
                buttons.push({
                    title: Mapbender.trans('mb.data.store.remove'),
                    cssClass: 'critical fa fa-times -fn-delete'
                });
            }
            if (schema.table.buttons) {
                // why flatten...?
                // how exactly can the table configuration define row buttons?
                return _.flatten(buttons, schema.table.buttons);
            } else {
                return buttons;
            }
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {Array<Object>}
         * @see https://datatables.net/reference/option/columns
         * @private
         * @todo Digitizer: table configuration is structurally incompatible, placed in attribute tableFields
         */
        _buildTableColumnsOptions: function(schema) {
            return (schema.table.columns || []).map(function(fieldSettings) {
                return $.extend({}, fieldSettings, {
                    fieldName: fieldSettings.data,  // why?
                    render: function(data, type, row) {
                        switch (type) {
                            case 'sort':
                            case 'type':
                            default:
                                return row[fieldSettings.data];
                            case 'filter':
                                return ('' + row[fieldSettings.data]) || undefined;
                            case 'display':
                                return escapeHtml('' + row[fieldSettings.data]);
                        }
                        if (typeof this[fieldSettings.data] !== 'undefined') {
                            return escapeHtml('' + this[fieldSettings.data]);
                        } else {
                            return '';
                        }
                    }
                });
            });
        },
        /**
         * @param {Object} schema
         * @return {jQuery}
         * @private
         */
        _renderTable: function(schema) {
            var settings = _.extend({
                lengthChange: false,
                pageLength:   20,
                searching:    true,
                info:         true,
                processing:   false,
                ordering:     true,
                paging:       true,
                selectable:   false,
                oLanguage: this.options.tableTranslation || {},
                autoWidth:    false
            }, schema.table);
            settings.buttons = this._buildTableRowButtons(schema);
            settings.columns = this._buildTableColumnsOptions(schema);
            settings.createdRow = function(tr, data) {
                $(tr).data({
                    item: data,
                    schema: schema
                });
            };
            var $tableWrap = $("<div/>").resultTable(settings);
            $tableWrap.attr('data-schema-name', schema.schemaName);
            return $tableWrap;
        },
        /**
         * @param {Object} schema
         * @return {jQuery}
         * @private
         */
        _renderSchemaFrame: function(schema) {
            var frame =  $("<div/>")
                .addClass('frame')
                .data("schema", schema)
            ;
            var $buttons = $('<div>').addClass('btn-group schema-toolset');
            if(schema.allowRefresh) {       // how?
                var $refreshButton = $('<button>').data('schema', schema).attr({
                    type: 'button',
                    'class': 'btn btn-sm -fn-refresh-schema',
                    title: Mapbender.trans('mb.data.store.create')      // sic! @todo: distinct translation
                });
                $refreshButton.append($('<i/>').addClass('fa fa-refresh'));
                $buttons.append($refreshButton);
            }

            if(schema.allowCreate) {
                var $createButton = $('<button>').data('schema', schema).attr({
                    type: 'button',
                    'class': 'btn btn-sm -fn-create-item',
                    title: Mapbender.trans('mb.data.store.create')
                });
                $createButton.append($('<i/>').addClass('fa fa-plus'));
                $buttons.append($createButton);
            }

            frame.append($buttons);
            frame.append(this._renderTable(schema));
            return frame;
        },
        /**
         * @param {Object} schema
         * @param {*} id
         * @param {Object} dataItem
         * @return {Promise}
         * @private
         */
        _saveItem: function(schema, id, dataItem) {
            var self = this;
            var params = {
                schema: schema.schemaName
            };
            if (id) {
                params.id = id;
            }
            return this.postJSON('save?' + $.param(params), {
                dataItem: dataItem
            }).then(function(response) {
                _.extend(dataItem, response.dataItem);
                self._afterSave(schema, dataItem, id);
            }, function(jqXHR, textStatus, errorThrown) {
                var message = (jqXHR.responseJSON || {}).message || 'API error';
                console.error(message, textStatus, errorThrown, jqXHR);
                $.notify(message, {
                    title:     'API Error',
                    autoHide:  false,
                    className: 'error'
                });
            });
        },
        /**
         * Produces event after item has been saved on the server.
         * New items have a null originalId. Updated items have a non-empty originalId.
         *
         * @param {Object} schema
         * @param {Object} dataItem
         * @param {String|null} originalId
         * @private
         */
        _saveEvent: function(schema, dataItem, originalId) {
            // @todo: this default should be server provided
            var uniqueIdKey = this._getDataStoreFromSchema(schema).uniqueId || 'id';
            var id = dataItem[uniqueIdKey];
            /** @var {DataManagagerSaveEventData} eventData */
            var eventData = {
                item: dataItem,
                itemId: id,
                originalId: originalId,
                uniqueIdKey: uniqueIdKey,
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
         * @param {Object} schema
         * @param {Object} dataItem
         * @param {String|null} originalId
         * @private
         */
        _afterSave: function(schema, dataItem, originalId) {
            if (!originalId) {
                // new item
                schema.dataItems.push(dataItem);
            }
            this.redrawTable(schema);
            this._saveEvent(schema, dataItem, originalId);
            $.notify(Mapbender.trans('mb.data.store.save.successfully'), 'info');
        },
        /**
         * @param {Object} schema
         * @param {jQuery} $form
         * @param {Object} [dataItem]
         * @return {boolean|Promise}
         * @private
         */
        _submitFormData: function(schema, $form, dataItem) {
            var formData = $form.formData();
            if (!$(".has-error", $form).length) {
                $form.disableForm();
                var uniqueIdAttribute = this._getDataStoreFromSchema(schema).uniqueId;
                var uniqueId = (dataItem && dataItem[uniqueIdAttribute]) || null;
                if (typeof formData[uniqueIdAttribute] !== 'undefined') {
                    console.warn("Form contains an input field for the object id", schema);
                }
                delete formData[uniqueIdAttribute];
                _.extend(dataItem, formData);
                return this._saveItem(schema, uniqueId, formData)
                    .always(function() {
                        $form.enableForm();
                    })
                ;
            } else {
                return false;
            }
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

            var dialog = $("<div/>");
            var formItems = widget.currentSettings.formItems.map(function(item) {
                return widget._processFormItem(schema, item, dataItem);
            });
            dialog.generateElements({children: formItems});
            dialog.popupDialog(this._getEditDialogPopupConfig(schema, dataItem));
            widget.currentPopup = dialog;

            setTimeout(function() {
                dialog.formData(dataItem);
            }, 30);

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
            if(schema.allowEdit){
                var saveButton = {
                    text: Mapbender.trans('mb.data.store.save'),
                    click: function() {
                        var $form = $(this).closest('.ui-dialog-content');
                        var saved = widget._submitFormData(schema, $form, dataItem);
                        if (saved) {
                            saved.then(function() {
                                widget._closeCurrentPopup();
                            });
                        }
                    }
                };
                buttons.push(saveButton);
            }
            if(schema.allowDelete) {
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
                    widget._closeCurrentPopup();
                }
            });
            // @todo Digitizer: add custom schema buttons...?

            return buttons;
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
                    if (item.relative && !src.test(/^(http[s]?\:|\/{2})/)) {
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
            }).done(function(dataItems) {
                schema.dataItems = dataItems;
                widget.redrawTable(schema);
            });
        },

        /**
         * Remove data item
         *
         * @param {Object} schema
         * @param {Object} dataItem
         */
        removeData: function(schema, dataItem) {
            var widget = this;
            // @todo: this default should be server provided
            var idPropertyName = this._getDataStoreFromSchema(schema).uniqueId || 'id';
            var id = dataItem[idPropertyName];
            if (!id) {
                throw new Error("Can't delete item without id from server");
            }
            confirmDialog(Mapbender.trans('mb.data.store.remove.confirm.text')).then(function() {
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

            // Listeners should prefer data.manager.deleted because a) it is much easier to search for non-magic, explicit
            // event names in project code; b) it contains more data
            this.element.trigger('data.manager.deleted', eventData);
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
            schema.dataItems = _.without(schema.dataItems, dataItem);
            this.redrawTable(schema);
            this._deleteEvent(schema, dataItem, id);
            $.notify(Mapbender.trans('mb.data.store.remove.successfully'), 'info');
        },
        redrawTable: function(schema) {
            var $tableWrap = $('.mapbender-element-result-table[data-schema-name="' + schema.schemaName + '"]', this.element);
            var tableApi = $tableWrap.resultTable('getApi');
            tableApi.clear();
            tableApi.rows.add(schema.dataItems);
            tableApi.draw();
        },
        /**
         * @param {String} title
         * @return {Promise}
         */
        confirmDialog: confirmDialog,
        /**
         * @param {String} uri
         * @param {Object} [data]
         * @return {jQuery.Deferred}
         */
        getJSON: function(uri, data) {
            var url = this.elementUrl + uri;
            return $.getJSON(url, data).fail(this._onAjaxError);
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
            return $.ajax(options_).fail(this._onAjaxError);
        },
        _onAjaxError: function(xhr) {
            var errorMessage = Mapbender.trans('mb.data.store.api.query.error-message');
            $.notify(errorMessage + JSON.stringify(xhr.responseText));
            console.log(errorMessage, xhr);
        }
    });

})(jQuery);
