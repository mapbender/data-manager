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
                    $(this).popupDialog('close');
                    deferred.resolveWith(true);
                }
            }, {
                // @todo: translate
                text:    "Abbrechen",
                'class': 'critical',
                click:   function(e) {
                    $(this).popupDialog('close');
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
            schemes: {}
        },
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
                var title = singleScheme.title || singleScheme.label || singleScheme.schemaName;
                if(title) {
                    element.append($('<div class="title"/>').html(title));
                }
                selector.hide();
            }
            element.append(selector);

            // build select options
            _.each(options.schemes, function(schema, schemaName) {
                var option = $("<option/>");
                option.val(schemaName).html(schema.label ? schema.label : schemaName);
                option.data("schema", schema);
                selector.append(option);

                var frame = widget._renderSchemaFrame(schema);

                // Improve schema with handling methods
                _.extend(schema, {
                    popup: {},
                    frame:  frame  // why?
                });

                var table = widget._renderTable(schema);
                // @todo: table should be rendered by _renderSchemaFrame, we only need it here because to break schema.table

                frame.append(table);
                frame.css('display','none');

                element.append(frame);
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
        },
        /**
         * @todo Digitizer: use .featureType attribute instead of .dataStore (otherwise equivalent)
         * @param {DataManagerSchemaConfig} schema
         * @return {DataStoreConfig}
         */
        _getDataStoreFromSchema: function(schema) {
            return schema.dataStore;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @private
         */
        _activateSchema: function(schema) {
            // @todo: remove monkey-patched frame property on schema
            var frame = schema.frame;
            if (this.currentSettings) {
                this._deactivateSchema(this.currentSettings);
                this.currentSettings = null;
            }
            this.currentSettings = schema;
            frame.css('display', 'block');
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @private
         */
        _deactivateSchema: function(schema) {
            // @todo: remove monkey-patched frame property on schema
            var frame = schema.frame;
            frame.css('display', 'none');
            if (this.currentPopup){
                this.currentPopup.popupDialog('close');
                this.currentPopup = null;
            }
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
                className: 'fa-edit',
                onClick: function(dataItem) {
                    self._openEditDialog(schema, dataItem);
                }
            });

            if(schema.allowDelete) {
                buttons.push({
                    title: Mapbender.trans('mb.data.store.remove'),
                    className: 'fa-times',
                    cssClass:  'critical',
                    onClick: function(dataItem) {
                        self.removeData(schema, dataItem);
                    }
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
            var self = this;
            var frame =  $("<div/>")
                .addClass('frame')
                .data("schema", schema)
            ;
            var toolBarButtons = [];
            if(schema.allowRefresh) {       // how?
                toolBarButtons.push({
                    type:     "button",
                    title: Mapbender.trans('mb.data.store.create'),
                    cssClass: "fa-refresh",
                    click:    function(e) {
                        // @todo: we have the schema here, why use bound data?
                        var schema = $(this).closest(".frame").data("schema");
                        if(self.currentPopup) {
                            confirmDialog(Mapbender.trans('mb.data.store.confirm.close.edit.form')).then(function() {
                                self.currentPopup.popupDialog('close');
                                self.currentPopup = null;
                                self._getData(schema);
                            });
                        } else {
                            self._getData(schema);
                        }
                        e.preventDefault();
                        return false;
                    }
                });
            }

            if(schema.allowCreate) {
                toolBarButtons.push({
                    type:     "button",
                    title: Mapbender.trans('mb.data.store.create'),
                    cssClass: "fa-plus",
                    click: function(e) {
                        // @todo: we have the schema here, why use bound data?
                        var schema = $(this).closest(".frame").data("schema");
                        self._openEditDialog(schema, {});
                        e.preventDefault();
                        return false;
                    }
                })
            }

            /** @todo: this is simple enough to do it without vis-ui */
            frame.generateElements({
                children: [{
                    type:     'fieldSet',
                    children: toolBarButtons,
                    cssClass: 'toolbar'
                }]
            });
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
            // todo: never post object ids with object data; put the id in the url
            return this.query('save', {
                schema:   schema.schemaName,
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
         * @param {Object} schema
         * @param {Object} dataItem
         * @param {String|null} originalId
         * @private
         */
        _afterSave: function(schema, dataItem, originalId) {
            // @todo: this default should be server provided
            var uniqueIdKey = this._getDataStoreFromSchema(schema).uniqueId || 'id';
            var id = dataItem[uniqueIdKey];
            if (!originalId) {
                // new item
                schema.dataItems.push(dataItem);
            }
            this.redrawTable(schema);
            $.notify(Mapbender.trans('mb.data.store.save.successfully'), 'info');
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
         * @param {Object} schema
         * @param {jQuery} $form
         * @param {Object} [dataItem]
         * @return {boolean|Promise}
         * @private
         */
        _submitFormData: function(schema, $form, dataItem) {
            var formData = $form.formData();
            if (!$(".has-error", $form).length) {
                var uniqueIdAttribute = this._getDataStoreFromSchema(schema).uniqueId;
                var uniqueId = (dataItem && dataItem[uniqueIdAttribute]) || null;
                if (typeof formData[uniqueIdAttribute] !== 'undefined') {
                    console.warn("Form contains an input field for the object id", schema);
                }
                delete formData[uniqueIdAttribute];
                _.extend(dataItem, formData);
                return this._saveItem(schema, uniqueId, formData);
            } else {
                return false;
            }
        },
        /**
         * Open edit feature dialog
         *
         * @param {Object} schema
         * @param {Object} dataItem
         * @private
         */
        _openEditDialog: function(schema, dataItem) {
            var widget = this;
            var buttons = [];

            if(widget.currentPopup) {
                widget.currentPopup.popupDialog('destroy');
                widget.currentPopup = null;
            }

            if(schema.allowEdit){
                var saveButton = {
                    text: Mapbender.trans('mb.data.store.save'),
                    click: function() {
                        var $form = $(this).closest('.ui-dialog-content');
                        $form.disableForm();
                        var saved = widget._submitFormData(schema, $form, dataItem);
                        var onFail = function() {
                            $form.enableForm()
                        };
                        if (saved) {
                            saved.then(function() {
                                widget.currentPopup.popupDialog('destroy');
                                widget.currentPopup = null;
                            }, onFail);
                        } else {
                            onFail();
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
                        widget.removeData(schema, dataItem);
                        widget.currentPopup.popupDialog('close');
                        widget.currentPopup = null;
                    }
                });
            }
            buttons.push({
                text: Mapbender.trans('mb.data.store.cancel'),
                click: function() {
                    widget.currentPopup.popupDialog('close');
                    widget.currentPopup = null;
                }
            });
            var dialog = $("<div/>");

            if(schema.popup.buttons ){
                buttons =_.union(schema.popup.buttons , buttons);
            }
            var popupConfig = _.extend({
                title: Mapbender.trans('mb.data.store.edit.title'),
                width: widget.featureEditDialogWidth
            }, schema.popup);

            popupConfig.buttons = buttons;

            var formItems = widget.currentSettings.formItems.map(function(item) {
                return widget._processFormItem(schema, item, dataItem);
            });
            dialog.generateElements({children: formItems});
            dialog.popupDialog(popupConfig);
            dialog.addClass("data-manager-edit-data");
            widget.currentPopup = dialog;

            setTimeout(function() {
                dialog.formData(dataItem);
            }, 30);

            return dialog;
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
                    itemOut = itemOut || $.extend({}, item);
                    if(!item.origSrc) {
                        itemOut.origSrc = item.src; //why?
                    }
                    if (item.name && dataItem[item.name]) {
                        itemOut.dbSrc = dataItem[item.name]; // why?
                        // @todo: figure out who even populates this value (not data source, not data manager)
                        files = this._getDataStoreFromSchema(schema).files || [];
                        $.each(files, function(k, fileInfo) {
                            if (fileInfo.field === item.name && fileInfo.uri) {
                                itemOut.dbSrc = fileInfo.uri + "/" + itemOut.dbSrc;
                            }
                        });
                    }
                    var src = itemOut.dbSrc || itemOut.origSrc || item.src;
                    if(item.relative) {
                        // why do we support a distinct 'relative' image type if this means supporting both absolute and relative?
                        itemOut.src = src.match(/^(http[s]?\:|\/{2})/) ? src : Mapbender.configuration.application.urls.asset + src;
                    } else {
                        itemOut.src = src;
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
            return widget.query('select', {
                maxResults: schema.maxResults,
                schema:     schema.schemaName
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
                widget.query('delete', {
                    schema: schema.schemaName,
                    id: id
                }).done(function() {
                    widget._afterRemove(schema, dataItem, id);
                });
            });
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
         * Query API
         *
         * @param uri suffix
         * @param request query
         * @return xhr jQuery XHR object
         * @version 0.2
         */
        query: function(uri, request) {
            var widget = this;
            return $.ajax({
                url:         widget.elementUrl + uri,
                type:        'POST',
                contentType: "application/json; charset=utf-8",
                dataType:    "json",
                data:        JSON.stringify(request)
            }).error(function(xhr) {
                var errorMessage = Mapbender.trans('mb.data.store.api.query.error-message');
                $.notify(errorMessage + JSON.stringify(xhr.responseText));
                console.log(errorMessage, xhr);
            });
        }
    });

})(jQuery);
