(function($) {

    /**
     * Regular Expression to get checked if string should be translated
     *
     * @type {RegExp}
     */
    var translationReg = /^trans:\w+\.(\w|-|\.{1}\w+)+\w+$/;

    /**
     * Translate digitizer keywords
     * @param title
     * @returns {*}
     */
    function translate(title, withoutSuffix) {
        var key = withoutSuffix ? title : "mb.data.store." + title;
        return Mapbender.trans(key);
    }


    /**
     * Translate object
     *
     * @param items
     * @returns object
     */
    function translateObject(items) {
        for (var k in items) {
            var item = items[k];
            if(typeof item === "string" && item.match(translationReg)) {
                items[k] = translate(item.split(':')[1], true);
            } else if(typeof item === "object") {
                translateObject(item);
            }
        }
        return item;
    }

    /**
     * Check and replace values recursive if they should be translated.
     * For checking used "translationReg" variable
     *
     *
     * @param items
     */
    function translateStructure(items) {
        var isArray = items instanceof Array;
        for (var k in items) {
            if(isArray || k == "children") {
                translateStructure(items[k]);
            } else {
                if(typeof items[k] == "string" && items[k].match(translationReg)) {
                    items[k] = translate(items[k].split(':')[1], true);
                }
            }
        }
    }
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


    /**
     * Digitizing tool set
     *
     * @author Andriy Oblivantsev <eslider@gmail.com>
     * @author Stefan Winkelmann <stefan.winkelmann@wheregroup.com>
     *
     * @copyright 20.04.2015 by WhereGroup GmbH & Co. KG
     */
    $.widget("mapbender.mbDataManager", {
        options: {
            allowCreate:     true,
            allowEditData:   true,
            allowDelete:     true,
            maxResults:      5001,
            oneInstanceEdit: true,
            inlineSearch:    false,
            useContextMenu:  false,
            dataStore:       "default",
            newItems:        [],
            popup:          {

            }
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

            if(options.tableTranslation) {
                translateObject(options.tableTranslation);
            }

            var dataManagerId = widget.options.dataManager;
            if (dataManagerId) {
                Mapbender.elementRegistry.waitReady(dataManagerId).then(function (dataManager) {
                    widget.dataManager = dataManager;
                });
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
                        dataItem.schema = schema;
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
                        $.notify(translate('remove.successfully'), 'info')
                    },
                    isNew:      function(dataItem) {
                        return _.contains(this.newItems, dataItem);
                    },
                    getStoreIdKey: function() {
                        var dataStore = this.dataStore;
                        return dataStore.uniqueId ? dataStore.uniqueId : "id";
                    }
                });

                // Merge settings with default values from options there are not set by backend configuration
                _.extend(schema, _.omit(options, _.keys(schema)));

                buttons.push({
                    title:     translate('edit'),
                    className: 'fa-edit',
                    onClick:   function(dataItem, ui) {
                        widget._openEditDialog(dataItem);
                    }
                });

                if(schema.allowDelete) {
                    buttons.push({
                        title:     translate("remove"),
                        className: 'fa-times',
                        cssClass:  'critical',
                        onClick:   function(dataItem, ui) {
                            widget.removeData(dataItem);
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
                    autoWidth:    false
                }, schema.table);

                // Merge buttons
                resultTableSettings.buttons = resultTableSettings.buttons ? _.flatten(buttons, resultTableSettings.buttons) : buttons;

                // use Digitizer functionality
                resultTableSettings.oLanguage = Mapbender.DigitizerTranslator && Mapbender.DigitizerTranslator.tableTranslations();

                var table = schema.table = $("<div/>").resultTable(resultTableSettings).data('settings', resultTableSettings);

                // use Digitizer functionality
                table.resultTable("instance").initializeColumnTitles && table.resultTable("instance").initializeColumnTitles();

                schema.schemaName = schemaName;

                var toolBarButtons = [];
                if(schema.allowRefresh) {
                    toolBarButtons.push({
                        type:     "button",
                        title:    translate("create"),
                        cssClass: "fa-refresh",
                        click:    function(e) {

                            var refreshDigitizer = function() {
                                var digitizer = Mapbender.elementRegistry.listWidgets()['mapbenderMbDigitizer'];
                                if (digitizer) {
                                    $.each(digitizer.schemes,function(schemaName,scheme){
                                        scheme.lastRequest = null; // force reload
                                        scheme.getData({ reloadNew: true });
                                    });
                                }

                                $.each(Mapbender.Model.map.olMap.layers.filter(function(layer) { return layer.mbConfig && layer.mbConfig.type === "wms"; }), function(id,layer)  {
                                    layer.redraw(true);
                                });
                            };
                            var schema = $(this).closest(".frame").data("schema");
                            if(widget.currentPopup) {
                                confirmDialog({
                                    html:      translate("confirm.close.edit.form"),
                                    onSuccess: function() {
                                        widget.currentPopup.popupDialog('close');
                                        widget.currentPopup = null;
                                        widget._getData(schema);
                                        refreshDigitizer();
                                    }
                                });
                            } else {
                                widget._getData(schema);
                                refreshDigitizer();
                            }
                            e.preventDefault();
                            return false;
                        }
                    });
                }

                if(schema.allowCreate) {
                    toolBarButtons.push({
                        type:     "button",
                        title:    translate("create"),
                        cssClass: "fa-plus",
                        click: function(e) {
                            var schema = $(this).closest(".frame").data("schema");
                            widget._openEditDialog(schema.create());
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

            function deactivateFrame(schema) {
                var frame = schema.frame;
                frame.css('display', 'none');
                if(widget.currentPopup){
                    widget.currentPopup.popupDialog('close');
                    widget.currentPopup = null;

                }
                //tableApi.clear();
            }

            function activateFrame(schema) {
                var frame = schema.frame;
                widget.activeSchema = widget.currentSettings = schema;
                frame.css('display', 'block');
            }

            function onSelectorChange() {
                var option = selector.find(":selected");
                var schema = option.data("schema");
                var table = schema.table;
                var tableApi = table.resultTable('getApi');

                if(widget.currentSettings) {
                    deactivateFrame(widget.currentSettings);
                }

                activateFrame(schema);

                table.off('mouseenter', 'mouseleave', 'click');
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

                widget._getData(schema);
            }

            selector.on('change',onSelectorChange);

            widget._trigger('ready');

            onSelectorChange();
        },

        /**
         * Open edit feature dialog
         *
         * @param dataItem open layer feature
         * @private
         */
        _openEditDialog: function(dataItem, callback) {
            var widget = this;
            var schema = dataItem.schema;
            var buttons = [];

            if(widget.currentPopup) {
                widget.currentPopup.popupDialog('close');
                widget.currentPopup = null;
            }


            if(schema.allowEdit){
                var saveButton = {
                    text:  translate("save"),
                    click: function() {
                        var form = $(this).closest(".ui-dialog-content");
                        var formData = form.formData();
                        var errorInputs = $(".has-error", dialog);
                        var hasErrors = errorInputs.size() > 0;

                        if(!hasErrors) {

                            var uniqueIdKey = schema.dataStore.uniqueId;
                            var isNew = !dataItem.hasOwnProperty(uniqueIdKey) && !!dataItem[uniqueIdKey];

                            if(!isNew) {
                                formData[uniqueIdKey] = dataItem[uniqueIdKey];
                            }else{
                                delete formData[uniqueIdKey];
                            }

                            form.disableForm();
                            widget.query('save', {
                                schema:   schema.schemaName,
                                dataItem: formData
                            }).done(function(response) {
                                if(response.hasOwnProperty('errors')) {
                                    form.enableForm();
                                    $.each(response.errors, function(i, error) {
                                        $.notify(error.message, {
                                            title:     'API Error',
                                            autoHide:  false,
                                            className: 'error'
                                        });
                                        console.error(error.message);
                                    });
                                    return;
                                }
                                _.extend(dataItem, response.dataItem);
                                schema.save(dataItem);
                                widget.currentPopup.popupDialog('close');
                                widget.currentPopup = null;
                                $.notify(translate("save.successfully"), 'info');
                                $(widget.element).trigger('data.manager.item.saved',{ item : dataItem, uniqueIdKey : uniqueIdKey, scheme : schema.schemaName});
                                $(dialog).trigger('data.manager.item.saved',{ item : dataItem });
                            }).done(function(){
                                form.enableForm();
                            });
                        }
                    }
                };
                buttons.push(saveButton);
            }
            if(schema.allowDelete) {
                buttons.push({
                    text:  translate("remove"),
                    'class': 'critical',
                    click: function() {
                        widget.removeData(dataItem);
                        widget.currentPopup.popupDialog('close');
                        widget.currentPopup = null;
                    }
                });
            }
            buttons.push({
                text:  translate("cancel"),
                click: function() {
                    widget.currentPopup.popupDialog('close');
                    widget.currentPopup = null;
                }
            });
            var dialog = $("<div/>");

            if(!schema.elementsTranslated) {
                translateStructure(widget.currentSettings.formItems);
                schema.elementsTranslated = true;
            }

            if(schema.popup.buttons ){
                buttons =_.union(schema.popup.buttons , buttons);
            }
            var popupConfig = _.extend({
                title:   translate("edit.title"),
                width:   widget.featureEditDialogWidth,
            }, schema.popup);

            popupConfig.buttons = buttons;

            widget.query('getConfiguration',{
                schema: widget.currentSettings.schemaName
            }).done(function(schema) {

                widget.currentSettings.formItems = schema.formItems;

                var formItems = JSON.parse(JSON.stringify(widget.currentSettings.formItems)); // Deep clone hack!

                var processedFormItems = widget.processFormItems(dataItem, formItems);

                var declarations = Mapbender && Mapbender.Digitizer && Mapbender.Digitizer.PopupConfiguration && Mapbender.Digitizer.PopupConfiguration.prototype.declarations;
                dialog.generateElements({children: processedFormItems}, declarations);
                dialog.popupDialog(popupConfig);
                dialog.addClass("data-manager-edit-data");
                widget.currentPopup = dialog;

                setTimeout(function() {
                    dialog.formData(dataItem);
                }, 0);

                initResultTables(dataItem);
                callback && callback();
            });



            var initResultTables = function(feature) {

                var tables = dialog.find(".mapbender-element-result-table");
                $.each(tables, function (i, table) {

                    var formItem = $(table).data('item');

                    if (formItem.dataManagerLink) {
                        var schemaName = formItem.dataManagerLink.schema;
                        var fieldName = formItem.dataManagerLink.fieldName;

                        var dm = widget.getConnectedDataManager();
                        var id = schema.dataStore.uniqueId;

                        if (!feature[id]) {
                            $(table).siblings(".button").attr("disabled","disabled");
                        }
                        dm.withSchema(schemaName, function (schema) {
                            var tableApi = $(table).resultTable('getApi');
                            tableApi.clear();
                            tableApi.rows.add(schema.dataItems.filter(function (dataItem) {
                                return dataItem[fieldName] == feature[id];
                            }));
                            tableApi.draw();
                        });
                    }

                });
            };

            return dialog;
        },

        /**
         * Getdata
         *
         * @private
         */
        _getData: function(schema) {
            var widget = this;
            schema = schema || widget.currentSettings;
            return widget.query('select', {
                maxResults: schema.maxResults,
                schema:     schema.schemaName
            }).done(function(dataItems) {
                schema.dataItems = dataItems;
                dataItems.forEach(function(dataItem) {
                   dataItem.schema = schema;
                });
                widget.reloadData(schema);
            });
        },

        /**
         * Remove data item
         *
         * @param dataItem
         * @version 0.2
         * @returns {*}
         */
        removeData: function(dataItem, callback) {

            var widget = this;
            var schema = dataItem.schema;
            if(schema.isNew(dataItem)) {
                schema.remove(dataItem);
            } else {
                confirmDialog({
                    html:      translate("remove.confirm.text"),
                    onSuccess: function() {
                        widget.query('delete', {
                            schema: schema.schemaName,
                            id:     dataItem[schema.getStoreIdKey()]
                        }).done(function(fid) {
                            schema.remove(dataItem);
                            callback && callback(dataItem);
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
                var errorMessage = translate('api.query.error-message');
                $.notify(errorMessage + JSON.stringify(xhr.responseText));
                console.log(errorMessage, xhr);
            });
        },

        withSchema: function(schemaName, callback) {
            var widget = this;
            var schema = widget.options.schemes[schemaName];
            // FIXME: following lines are a hack to get dataManager to open the correct popup
            // (it does open the popup for the scheme provided in currentSettings, not
            // the one passed to the _openEditPopup function)
            var prevSettings = widget.currentSettings;
            var prevActiveSchema = widget.activeSchema;
            widget.activeSchema = widget.currentSettings = schema;

            widget._getData(schema).then(function () {
                callback(schema);
                widget.currentSettings = prevSettings;
                widget.activeSchema = prevActiveSchema;
            });
        },

        getSchemaByName: function(name) {
          return this.options.schemes[name] || null;
        },


        processFormItem: function (feature, item) {


            var widget = this;
            var schema = widget.currentSettings;

            if (item.type === "resultTable" && item.editable && !item.isProcessed) {

                var onCreateClick;
                var onEditClick;
                var onRemoveClick;

                if (item.hasOwnProperty('dataManagerLink')) {
                    var fieldName = item.dataManagerLink.fieldName;
                    var schemaName = item.dataManagerLink.schema;

                    var getRowId = function(tableApi,rowData) {
                        var rowId = null;

                        tableApi.rows(function(idx,data) {
                            if (data == rowData) {
                                rowId = idx;
                            }
                        });

                        if (rowId == null) {
                            throw new Error();
                        }
                        return rowId;
                    };


                    onCreateClick = function (e) {
                        e.preventDefault && e.preventDefault();
                        var table = $(this).siblings(".mapbender-element-result-table");
                        var tableApi = table.resultTable('getApi');


                        var dm = widget.getConnectedDataManager();

                        var dataItem = dm.getSchemaByName(schemaName).create();
                        var id = schema.dataStore.uniqueId;

                        dataItem[fieldName] = feature[id];
                        var dialog = dm._openEditDialog(dataItem, function() {
                            var id = dataItem[fieldName];
                            if (!$(dialog).find(":input[name=" + fieldName + "]").length) {
                                $.notify("No input with name "+fieldName+" found in dialog ");
                            }
                            $(dialog).find("select[name=" + fieldName + "]").find("option[value!="+id+"]").attr("disabled",true).hide();
                            $(dialog).find("input[name=" + fieldName + "]").attr("disabled",true);
                        });
                        dialog.parentTable = table;
                        $(dialog).bind('data.manager.item.saved', function (event, data) {
                            tableApi.rows.add([data.item]);
                            tableApi.draw();
                            dm._getData();

                        });

                        return false;
                    };

                    onEditClick = function (rowData, button, e) {
                        e.defaultPrevented && e.defaultPrevented();
                        e.preventDefault && e.preventDefault();
                        var table = button.parents('.mapbender-element-result-table');
                        var tableApi = table.resultTable('getApi');


                        var dm = widget.getConnectedDataManager();
                        var dialog = dm._openEditDialog(rowData, function(){
                            var id = rowData[fieldName];
                            $(dialog).find("select[name=" + fieldName + "]").find("option[value!="+id+"]").attr("disabled",true).hide();
                        });
                        dialog.parentTable = table;
                        var rowId = getRowId(tableApi,rowData);
                        $(dialog).bind('data.manager.item.saved', function (event, data) {
                            tableApi.row(rowId).data(data.item);
                            tableApi.draw();
                            dm._getData();

                        });

                        return false;
                    };


                    onRemoveClick = function (rowData, button, e) {
                        e.defaultPrevented && e.defaultPrevented();
                        e.preventDefault && e.preventDefault();
                        var table = button.parents('.mapbender-element-result-table');
                        var tableApi = table.resultTable('getApi');


                        var rowId = getRowId(tableApi,rowData);

                        var dm = widget.getConnectedDataManager();

                        dm.removeData(rowData, function () {
                            tableApi.row(rowId).remove();
                            tableApi.draw();
                            dm._getData();


                        });

                        return false;


                    }

                }

                var cloneItem = $.extend({}, item);
                cloneItem.isProcessed = true;
                item.type = "container";
                var button = {
                    type: "button",
                    title: "",
                    hover: Mapbender.trans('mb.data.store.feature.create'),
                    cssClass: "icon-create",
                    click: onCreateClick
                };

                item.children = [button, cloneItem];

                var buttons = [];

                buttons.push({
                    title: Mapbender.trans('mb.data.store.feature.edit'),
                    className: 'edit',
                    onClick: onEditClick
                });

                if (item.allowDelete) {
                    buttons.push({
                        title: Mapbender.trans('mb.data.store.feature.remove.title'),
                        className: 'remove',
                        onClick: onRemoveClick
                    });
                }

                cloneItem.buttons = buttons;

            }

            if (item.type === "file") {
                item.uploadHanderUrl = widget.elementUrl + "file/upload?schema=" + schema.schemaName + "&fid=" + feature.fid + "&field=" + item.name;
                if (item.hasOwnProperty("name") && feature.data.hasOwnProperty(item.name) && feature.data[item.name]) {
                    item.dbSrc = feature.data[item.name];
                    if (schema.dataStore.files) {
                        $.each(schema.dataStore.files, function (k, fileInfo) {
                            if (fileInfo.field && fileInfo.field === item.name) {
                                if (fileInfo.formats) {
                                    item.accept = fileInfo.formats;
                                }
                            }
                        });
                    }
                }

            }

            if (item.type === 'image') {

                if (!item.origSrc) {
                    item.origSrc = item.src;
                }

                if (item.hasOwnProperty("name") && feature.data.hasOwnProperty(item.name) && feature.data[item.name]) {
                    item.dbSrc = feature.data[item.name];
                    if (schema.dataStore.files) {
                        $.each(schema.dataStore.files, function (k, fileInfo) {
                            if (fileInfo.field && fileInfo.field == item.name) {

                                if (fileInfo.uri) {
                                    item.dbSrc = fileInfo.uri + "/" + item.dbSrc;
                                } else {
                                    item.dbSrc = widget.options.fileUri + "/" + schema.dataStore.table + "/" + item.name + "/" + item.dbSrc;
                                }
                            }
                        });
                    }
                }

                var src = item.dbSrc ? item.dbSrc : item.origSrc;
                if (!item.hasOwnProperty('relative') && !item.relative) {
                    item.src = src;
                } else {
                    item.src = Mapbender.configuration.application.urls.asset + src;
                }
            }
        },


        processFormItems: function (feature, formItems) {
            var widget = this;
            DataUtil.eachItem(formItems, function (item) {
                widget.processFormItem(feature, item);
            });

            return formItems;
        },


        getConnectedDataManager: function() {
            var widget = this;
            if (!widget.dataManager) {
                throw new Error("Data Manager is not activated");
            }
            return widget.dataManager;
        },

    });



})(jQuery);



