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
            var frames = widget.frames = [];
            var selector = widget.selector = $('<select class="selector"/>');
            var options = widget.options;
            var hasOnlyOneScheme = widget.hasOnlyOneScheme = _.size(options.schemes) === 1;
            widget.elementUrl = Mapbender.configuration.application.urls.element + '/' + element.attr('id') + '/';

            if(hasOnlyOneScheme) {
                var title = _.propertyOf(_.first(_.toArray(options.schemes)))("title");
                if(title) {
                    element.append($('<div class="title"/>').html(title));
                }
            } else {
                element.append(selector);
            }

            // build select options
            _.each(options.schemes, function(schema, schemaName) {
                var buttons = [];
                var option = $("<option/>");
                var frame =  $("<div/>")
                    .addClass('frame')
                    .data("schema", schema);

                // Improve schema with handling methods
                _.extend(schema, {
                    schemaName: schemaName,
                    newItems:   [],
                    popup: {},
                    frame:  frame,
                    create: function(data) {
                        var dataItem = {};
                        var schema = this;
                        var table = $(schema.table);

                        // create data with empty fields to get table work
                        _.each(table.data("settings").columns, function(column) {
                            if(!column.data) {
                                return;
                            }
                            dataItem[column.data] = '';
                        });

                        data && _.extend(dataItem, data);
                        schema.dataItems.push(dataItem);
                        schema.newItems.push(dataItem);
                        widget.reloadData(schema);
                        return dataItem;
                    },
                    save: function(dataItem) {
                        this.newItems = _.without(this.newItems, dataItem);
                        widget.reloadData(schema);
                    },
                    remove:     function(dataItem) {
                        this.dataItems = _.without(this.dataItems, dataItem);
                        widget.reloadData(this);
                        widget._trigger('removed', null, {
                            schema:  this,
                            feature: dataItem
                        });
                        $.notify(Mapbender.trans('mb.data.store.remove.successfully'), 'info')
                    },
                    isNew:      function(dataItem) {
                        return _.contains(this.newItems, dataItem);
                    },
                    getStoreIdKey: function() {
                        var dataStore = this.dataStore;
                        return dataStore.uniqueId ? dataStore.uniqueId : "id";
                    }
                });

                buttons.push({
                    title: Mapbender.trans('mb.data.store.edit'),
                    className: 'fa-edit',
                    onClick:   function(dataItem, ui) {
                        widget._openEditDialog(schema, dataItem);
                    }
                });

                if(schema.allowDelete) {
                    buttons.push({
                        title: Mapbender.trans('mb.data.store.remove'),
                        className: 'fa-times',
                        cssClass:  'critical',
                        onClick:   function(dataItem, ui) {
                            widget.removeData(schema, dataItem);
                        }
                    });
                }

                option.val(schemaName).html(schema.label ? schema.label : schemaName);


                if(schema.table.columns) {
                    $.each(schema.table.columns, function(fieldId, fieldSettings) {
                        var fieldName = fieldSettings.data;
                        fieldSettings.fieldName = fieldName;
                        fieldSettings.data = function(row, type, val, meta) {
                            return row.hasOwnProperty(fieldName) ? escapeHtml('' + row[fieldName]) : '';
                        };
                    });
                }

                var resultTableSettings = _.extend({
                    lengthChange: false,
                    pageLength:   20,
                    searching:    true,
                    info:         true,
                    processing:   false,
                    ordering:     true,
                    paging:       true,
                    selectable:   false,
                    oLanguage: options.tableTranslation || {},
                    autoWidth:    false
                }, schema.table);

                // Merge buttons
                resultTableSettings.buttons = resultTableSettings.buttons ? _.flatten(buttons, resultTableSettings.buttons) : buttons;

                var table = schema.table = $("<div/>").resultTable(resultTableSettings).data('settings', resultTableSettings);
                schema.schemaName = schemaName;

                var toolBarButtons = [];
                if(schema.allowRefresh) {
                    toolBarButtons.push({
                        type:     "button",
                        title: Mapbender.trans('mb.data.store.create'),
                        cssClass: "fa-refresh",
                        click:    function(e) {
                            var schema = $(this).closest(".frame").data("schema");
                            if(widget.currentPopup) {
                                confirmDialog({
                                    html: Mapbender.trans('mb.data.store.confirm.close.edit.form'),
                                    onSuccess: function() {
                                        widget.currentPopup.popupDialog('close');
                                        widget.currentPopup = null;
                                        widget._getData(schema);
                                    }
                                });
                            } else {
                                widget._getData(schema);
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
                            var schema = $(this).closest(".frame").data("schema");
                            widget._openEditDialog(schema, schema.create());
                            e.preventDefault();
                            return false;
                        }
                    })
                }

                frame.generateElements({
                    children: [{
                        type:     'fieldSet',
                        children: toolBarButtons,
                        cssClass: 'toolbar'
                    }]
                });
                frame.append(table);
                frames.push(frame);

                frame.css('display','none');

                element.append(frame);
                option.data("schema", schema);
                selector.append(option);
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
            var table = schema.table;
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
                schema.save(dataItem);
                $.notify(Mapbender.trans('mb.data.store.save.successfully'), 'info');
                self.element.trigger('data.manager.item.saved',{
                    item: dataItem,
                    uniqueIdKey: self._getDataStoreFromSchema(schema).uniqueId, // why?
                    scheme: schema.schemaName,
                    originator: self
                });
            }).fail(function(jqXHR, textStatus, errorThrown) {
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
         * @param {jQuery} $form
         * @return {boolean|Promise}
         * @private
         */
        _submitFormData: function(schema, dataItem, $form) {
            var formData = $form.formData();
            if (!$(".has-error", $form).length) {
                var uniqueIdAttribute = this._getDataStoreFromSchema(schema).uniqueId;
                var uniqueId = dataItem[uniqueIdAttribute] || null;
                if (typeof formData[uniqueIdAttribute] !== 'undefined') {
                    console.warn("Form contains an input field for the object id", schema);
                }
                delete formData[uniqueIdAttribute];
                _.extend(dataItem, formData);
                return this._saveItem(schema, uniqueId, dataItem);
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
                        var saved = widget._submitFormData(schema, dataItem, $form);
                        if (saved) {
                            saved.always(function() {
                                $form.enableForm();
                            }).then(function() {
                                widget.currentPopup.popupDialog('close');
                                widget.currentPopup = null;
                            });
                        } else {
                            $form.enableForm();
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

            DataUtil.eachItem(widget.currentSettings.formItems, function(item) {
                if(item.type == "file") {
                    item.uploadHanderUrl = widget.elementUrl + "file-upload?schema=" + schema.schemaName + "&fid=" + dataItem.fid + "&field=" + item.name;
                    if(item.hasOwnProperty("name") && dataItem.hasOwnProperty(item.name) && dataItem[item.name]) {
                        item.dbSrc = dataItem[item.name];
                        if (dataStore.files) {
                            $.each(dataStore.files, function(k, fileInfo) {
                                if(fileInfo.field && fileInfo.field == item.name) {
                                    if(fileInfo.formats) {
                                        item.accept = fileInfo.formats;
                                    }
                                }
                            });
                        }
                    }

                }

                if(item.type == 'image') {

                    if(!item.origSrc) {
                        item.origSrc = item.src;
                    }

                    if(item.hasOwnProperty("name") && dataItem.hasOwnProperty(item.name) && dataItem[item.name]) {
                        item.dbSrc = dataItem[item.name];
                        if(dataStore.files) {
                            $.each(dataStore.files, function(k, fileInfo) {
                                if(fileInfo.field && fileInfo.field == item.name) {

                                    if(fileInfo.uri) {
                                        item.dbSrc = fileInfo.uri + "/" + item.dbSrc;
                                    } else {
                                    }
                                }
                            });
                        }
                    }

                    var src = item.dbSrc ? item.dbSrc : item.origSrc;
                    if(item.relative) {
                        item.src = src.match(/^(http[s]?\:|\/{2})/) ? src : Mapbender.configuration.application.urls.asset + src;
                    } else {
                        item.src = src;
                    }
                }
            });
            if(schema.popup.buttons ){
                buttons =_.union(schema.popup.buttons , buttons);
            }
            var popupConfig = _.extend({
                title: Mapbender.trans('mb.data.store.edit.title'),
                width:   widget.featureEditDialogWidth,
            }, schema.popup);

            popupConfig.buttons = buttons;

            dialog.generateElements({children: widget.currentSettings.formItems});
            dialog.popupDialog(popupConfig);
            dialog.addClass("data-manager-edit-data");
            widget.currentPopup = dialog;

            setTimeout(function() {
                dialog.formData(dataItem);
            }, 30);

            return dialog;
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
            if(schema.isNew(dataItem)) {
                schema.remove(dataItem);
            } else {
                confirmDialog({
                    html: Mapbender.trans('mb.data.store.remove.confirm.text'),
                    onSuccess: function() {
                        widget.query('delete', {
                            schema: schema.schemaName,
                            id:     dataItem[schema.getStoreIdKey()]
                        }).done(function(fid) {
                            schema.remove(dataItem);
                        });
                    }
                });
            }

            return dataItem;
        },

        reloadData: function(schema) {
            var tableApi = schema.table.resultTable('getApi');
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
