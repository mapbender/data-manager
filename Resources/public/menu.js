(function () {
    "use strict";


    Mapbender.DataManager.Menu = function (schema) {

        var menu = this;
        menu.schema = schema;
        var frame = $("<div />").addClass('frame');

        menu.generateDataTable_(frame);

        frame.hide();

        menu.show = function() {
            frame.show();
        };

        menu.hide = function() {
            frame.hide();
        };

        menu.appendTo = function($element) {
            $element.append(frame);
        };


    };


    Mapbender.DataManager.Menu.prototype = {

        registerResulTableEvents: function(resultTable) {

        },

        generateResultDataTableButtons: function () {
            var menu = this;
            var schema = menu.schema;

            var buttons = [];

            if (schema.allowEditData) {
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

        generateDataTable_: function (frame) {
            var menu = this;
            var schema = menu.schema;

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

                        var data = feature.get(columnId);
                        if (typeof (data) == 'string') {
                            data = escapeHtml(data);
                        }
                        return data || '';
                    };
                };

                var getDefaultTableFields = function () {
                    var tableFields = this;

                    tableFields[schema.featureType.uniqueId] = {label: 'Nr.', width: '20%'};
                    if (schema.featureType.name) {
                        tableFields[schema.featureType.name] = {label: 'Name', width: '80%'};
                    }
                    return tableFields;

                };


                $.each(schema.tableFields || getDefaultTableFields(), function (columnId, fieldSettings) {
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
                _.extend(resultTableSettings, schema.view.settings);
            }

            var $div = $("<div/>");
            var $table = $div.resultTable(resultTableSettings);

            resultTable = $table.resultTable("instance");


            resultTable.initializeColumnTitles();

            resultTable.initializeResultTableEvents(schema.highlightControl);

            menu.registerEvents(resultTable);

            frame.append($table);

            if (schema.hideSearchField) {
                $table.find(".dataTables_filter").hide();
            }



        },


    };

})();
