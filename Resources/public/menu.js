(function () {
    "use strict";


    Mapbender.DataManager.Menu = function (schema) {

        var menu = this;
        menu.schema = schema;
        var frame = $("<div />").addClass('frame');

        menu.generateResultTable_(frame);

        frame.hide();

        menu.appendTo = function ($element) {
            $element.append(frame);
        };

        menu.registerEvents_(frame);

    };


    Mapbender.DataManager.Menu.prototype = {

        registerEvents_: function (frame) {
            var menu = this;
            var schema = menu.schema;
            var widget = schema.widget;

            $(widget).on(widget.TYPE + ".activateSchema", function (event) {
                if (event.schema == schema) {
                    frame.show();
                }
            });

            $(schema).on(widget.TYPE + ".deactivateSchema", function (event) {
                if (event.schema == schema) {
                    frame.hide();
                }
            });
        },

        registerResultTableEvents: function (resultTable, frame) {
            var menu = this;
            var schema = menu.schema;
            var map = schema.widget.map;

            map.on("DataManager.FeaturesLoaded", function (event) {
                var features = event.feature;

                if (event.schema == schema) {


                    features.forEach(function (feature) {


                        feature.on('DataManager.HoverFeature', function (event) {

                            resultTable.hoverInResultTable(feature, true);

                        });

                        feature.on('DataManager.UnhoverFeature', function (event) {

                            resultTable.hoverInResultTable(feature, false);

                        });

                    });

                    resultTable.getApi().clear();
                    resultTable.getApi().rows.add(features);
                    resultTable.getApi().draw();
                }

            });

            map.on("DataManager.FeatureRemoved", function (event) {
                var feature = event.feature;
                resultTable.deleteRow(feature);
            });

            ;

        },

        generateResultDataTableButtons: function () {
            var menu = this;
            var schema = menu.schema;

            var buttons = [];

            if (schema.allowEditData || schema.allowOpenEditDialog) {
                buttons.push({
                    title: Mapbender.DataManager.Translator.translate('feature.edit'),
                    className: 'edit',
                    onClick: function (feature, ui) {
                        schema.openFeatureEditDialog(feature);
                    }
                });
            }

            if (schema.allowDelete) {

                buttons.push({
                    title: Mapbender.DataManager.Translator.translate("feature.remove.title"),
                    className: 'remove',
                    cssClass: 'critical',
                    onClick: function (feature, ui) {
                        if (schema.allowDelete) {
                            schema.removeFeature(feature);
                        } else {
                            $.notify("Deletion is not allowed");
                        }
                    }
                });
            }

            return buttons;

        },

        generateResultTable_: function (frame) {
            var menu = this;
            var schema = menu.schema;
            var widget = schema.widget;

            var resultTable;


            var generateResultDataTableColumns = function () {

                var columns = [];

                var createResultTableDataFunction = function (columnId, fieldSettings) {

                    return function (feature, type, val, meta) {

                        var escapeHtml = function (str) {

                            return str.replace(/["&'\/<>]/g, function (a) {
                                return {
                                    '"': '&quot;',
                                    '&': '&amp;',
                                    "'": '&#39;',
                                    '/': '&#47;',
                                    '<': '&lt;',
                                    '>': '&gt;'
                                }[a];
                            });
                        };

                        var data = feature.get('data') && feature.get('data').get(columnId);
                        if (typeof (data) == 'string') {
                            data = escapeHtml(data);
                        }
                        return data || '';
                    };
                };


                $.each(schema.tableFields, function (columnId, fieldSettings) {
                    fieldSettings.title = fieldSettings.label;
                    fieldSettings.data = fieldSettings.data || createResultTableDataFunction(columnId, fieldSettings);
                    columns.push(fieldSettings);
                });

                return columns;

            };


            var tableTranslation = schema.tableTranslation ? Mapbender.DataManager.Translator.translateObject(schema.tableTranslation) : Mapbender.DataManager.Translator.tableTranslations();

            var buttons = menu.generateResultDataTableButtons();

            var resultTableSettings = {
                lengthChange: false,
                pageLength: schema.pageLength,
                searching: schema.inlineSearch,
                info: true,
                processing: false,
                ordering: true,
                paging: true,
                selectable: false,
                autoWidth: false,
                columns: generateResultDataTableColumns(),
                buttons: buttons,
                oLanguage: tableTranslation,
            };

            if (schema.view && schema.view.settings) {
                Object.assign({},schema.view.settings,resultTableSettings)
            }

            var $div = $("<div/>");
            var $table = $div.resultTable(resultTableSettings);

            resultTable = $table.resultTable("instance");


            resultTable.initializeColumnTitles();

            resultTable.element.delegate("tbody > tr", 'mouseenter', function () {
                var tr = this;
                var row = resultTable.getApi().row(tr);
                var feature = row.data();
                if (feature) {
                    feature.dispatchEvent({type: widget.TYPE + '.HoverFeature'});
                }

            });

            resultTable.element.delegate("tbody > tr", 'mouseleave', function () {
                var tr = this;
                var row = resultTable.getApi().row(tr);
                var feature = row.data();
                if (feature) {
                    feature.dispatchEvent({type: widget.TYPE + '.UnhoverFeature'});
                }
            });

            menu.registerResultTableEvents(resultTable, frame);

            frame.append($table);

            if (schema.hideSearchField) {
                $table.find(".dataTables_filter").hide();
            }


        }


    };

})();
