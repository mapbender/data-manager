(function($) {

    /**
     * @param options
     * @returns {*}
     */
    confirmDialog = function (options) {
        var dialog = $("<div class='confirm-dialog'>" + (options.hasOwnProperty('html') ? options.html : "") + "</div>").popupDialog({
            title:       options.hasOwnProperty('title') ? options.title : "",
            maximizable: false,
            dblclick:    false,
            minimizable: false,
            resizable:   false,
            collapsable: false,
            modal:       true,
            buttons:     [{
                text:  "OK",
                click: function(e) {
                    if(!options.hasOwnProperty('onSuccess') || options.onSuccess(e) !== false) {
                        dialog.popupDialog('close');
                    }
                    return false;
                }
            }, {
                text:    "Abbrechen",
                'class': 'critical',
                click:   function(e) {
                    if(!options.hasOwnProperty('onCancel') || options.onCancel(e) !== false) {
                        dialog.popupDialog('close');
                    }
                    return false;
                }
            }]
        });
        return dialog;
    };

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

        /**
         * Constructor.
         *
         * At this moment not all elements (like a OpenLayers) are avaible.
         *
         * @private
         */
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
                    schemaName: schemaName,
                    popup: {},
                    frame:  frame,  // why?
                    remove:     function(dataItem) {
                        this.dataItems = _.without(this.dataItems, dataItem);
                        widget.reloadData(this);
                        widget._trigger('removed', null, {
                            schema:  this,
                            feature: dataItem
                        });
                        $.notify(Mapbender.trans('mb.data.store.remove.successfully'), 'info')
                    }
                });

                var table = widget._renderTable(schema);
                // @todo: eliminate total transmutation of original schema property .table
                schema.schemaName = schemaName;

                frame.append(table);
                frame.css('display','none');

                element.append(frame);
            });

            selector.on('change', function() {
                widget._onSchemaSelectorChange();
            });

            widget._trigger('ready');
            selector.trigger('change');
        },
        /**
         * @todo Digitizer: use .featureType attribute instead of .dataStore (otherwise equivalent)
         * @param {Object} schema
         * @private
         */
        _getDataStoreFromSchema: function(schema) {
            return schema.dataStore;
        },
        _activateSchema: function(schema) {
            // @todo: remove monkey-patched frame property on schema
            var frame = schema.frame;
            if (this.currentSettings) {
                this._deactivateSchema(this.currentSettings);
                this.currentSettings = null;
            }
            // @todo: decide on one property
            this.activeSchema = this.currentSettings = schema;
            frame.css('display', 'block');
        },
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
            var table = $('.mapbender-element-result-table[data-schema-name="' + schema.schemaName + '"]', this.element);
            var tableApi = table.resultTable('getApi');

            this._activateSchema(schema);

            // why?
            table.off('mouseenter', 'mouseleave', 'click');

            // why?
            table.delegate("tbody > tr", 'mouseenter', function() {
                var tr = this;
                var row = tableApi.row(tr);
            });
            table.delegate("tbody > tr", 'mouseleave', function() {
                var tr = this;
                var row = tableApi.row(tr);
            });
            table.delegate("tbody > tr", 'click', function() {
                var tr = this;
                var row = tableApi.row(tr);
            });

            this._getData(schema);
        },
        _buildTableRowButtons: function(schema) {
            var buttons = [];
            var self = this;
            // @todo: surely this requires checking schema.allowEdit
            buttons.push({
                title: Mapbender.trans('mb.data.store.edit'),
                className: 'fa-edit',
                onClick:   function(dataItem, ui) {
                    self._openEditDialog(schema, dataItem);
                }
            });

            if(schema.allowDelete) {
                buttons.push({
                    title: Mapbender.trans('mb.data.store.remove'),
                    className: 'fa-times',
                    cssClass:  'critical',
                    onClick:   function(dataItem, ui) {
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
         * @param {Object} schema
         * @return {Array<String>}
         */
        _getTableDataAttributes: function(schema) {
            return (schema.table.columns || []).map(function(columnConfig) {
                return columnConfig.data;
            });
        },
        /**
         * @param {Object} schema
         * @return {Array<Object>}
         * @see https://datatables.net/reference/option/columns
         * @private
         * @todo Digitizer: table configuration is structurally incompatible, placed in attribute tableFields
         */
        _buildTableColumnsOptions: function(schema) {
            return (schema.table.columns || []).map(function(fieldSettings) {
                return $.extend({}, fieldSettings, {
                    fieldName: fieldSettings.data,  // why?
                    render: function(data, type, row, meta) {
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
                            confirmDialog({
                                html: Mapbender.trans('mb.data.store.confirm.close.edit.form'),
                                onSuccess: function() {
                                    self.currentPopup.popupDialog('close');
                                    self.currentPopup = null;
                                    self._getData(schema);
                                }
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
                $.notify(Mapbender.trans('mb.data.store.save.successfully'), 'info');
                if (!id) {
                    schema.dataItems.push(dataItem);
                }
                self.reloadData(schema);
                self.element.trigger('data.manager.item.saved',{
                    item: dataItem,
                    uniqueIdKey: self._getDataStoreFromSchema(schema).uniqueId, // why?
                    scheme: schema.schemaName,
                    originator: self
                });
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
         * @param dataItem open layer feature
         * @private
         */
        _openEditDialog: function(schema, dataItem) {
            var widget = this;
            var buttons = [];
            var dataStore = this._getDataStoreFromSchema(schema);

            if(widget.currentPopup) {
                widget.currentPopup.popupDialog('close');
                widget.currentPopup = null;
            }

            if(schema.allowEdit){
                var saveButton = {
                    text: Mapbender.trans('mb.data.store.save'),
                    click: function() {
                        var $form = $(this).closest('.ui-dialog-content');
                        $form.disableForm();
                        var saved = widget._submitFormData(schema, $form, dataItem);
                        var always_ = function() {
                            $form.enableForm()
                        };
                        if (saved) {
                            saved.then(function() {
                                widget.currentPopup.popupDialog('close');
                                widget.currentPopup = null;
                            }).always(always_);
                        } else {
                            always_();
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
                width:   widget.featureEditDialogWidth,
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
         * @param {Object} schema
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
                    itemOut = itemOut || $.extend({}, item);
                    itemOut.uploadHanderUrl = self.elementUrl + "file-upload?schema=" + schema.schemaName + "&fid=" + dataItem.fid + "&field=" + item.name;
                    if(item.hasOwnProperty("name") && dataItem.hasOwnProperty(item.name) && dataItem[item.name]) {
                        itemOut.dbSrc = dataItem[item.name];
                        // @todo: figure out who even populates this value (not data source, not data manager)
                        files = this._getDataStoreFromSchema(schema).files || [];
                        $.each(files, function(k, fileInfo) {
                            if(fileInfo.field && fileInfo.field == item.name) {
                                if(fileInfo.formats) {
                                    itemOut.accept = fileInfo.formats;
                                }
                            }
                        });
                    }
                    break;
                case 'image':
                    itemOut = itemOut || $.extend({}, item);
                    if(!item.origSrc) {
                        itemOut.origSrc = item.src; //why?
                    }
                    if(item.hasOwnProperty("name") && dataItem.hasOwnProperty(item.name) && dataItem[item.name]) {
                        itemOut.dbSrc = dataItem[item.name]; // why?
                        // @todo: figure out who even populates this value (not data source, not data manager)
                        files = this._getDataStoreFromSchema(schema).files || [];
                        $.each(files, function(k, fileInfo) {
                            if(fileInfo.field && fileInfo.field == item.name) {
                                if(fileInfo.uri) {
                                    itemOut.dbSrc = fileInfo.uri + "/" + itemOut.dbSrc;
                                }
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
                widget.reloadData(schema);
            });
        },

        /**
         * Remove data item
         *
         * @param {Object} schema
         * @param {Object} dataItem
         * @version 0.2
         * @returns {*}
         */
        removeData: function(schema, dataItem) {
            var widget = this;
            confirmDialog({
                html: Mapbender.trans('mb.data.store.remove.confirm.text'),
                onSuccess: function() {
                    widget.query('delete', {
                        schema: schema.schemaName,
                        // @todo: this default should be server provided
                        id: (widget._getDataStoreFromSchema(schema).uniqueId || 'id')
                    }).done(function(fid) {
                        schema.remove(dataItem);
                    });
                }
            });
            return dataItem;
        },

        /** @todo: rename; maybe redrawTable */
        reloadData: function(schema) {
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
