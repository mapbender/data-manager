(function () {
    "use strict";


    Mapbender.DataManager.Menu = function (schema) {

        var menu = this;
        menu.schema = schema;
        var frame = menu.frame = $("<div />").addClass('frame');

        frame.append('<div style="clear:both;"/>');

        menu.generateDataTable_();

        frame.hide();
    };


    Mapbender.DataManager.Menu.prototype = {



        generateDataTable_: function () {
            var menu = this;
            var frame = menu.frame;
            var schema = menu.schema;
            var map = schema.widget.map;

            var resultTable;

            var generateResultDataTableButtons = function () {


                map.on("DataManager.activateSchema",  function (event) {
                    resultTable.getApi().clear();

                });

                map.on("DataManager.FeatureLoaded",  function (event) {
                    var feature = event.feature;
                    resultTable.addRow(feature);

                });

                var buttons = [];

                if (schema.allowEditData) {
                    buttons.push({
                        title: Mapbender.DigitizerTranslator.translate('feature.edit'),
                        className: 'edit',
                        onClick: function (feature, ui) {
                            schema.openFeatureEditDialog(feature);
                        }
                    });
                }

                if (schema.allowDelete) {

                    buttons.push({
                        title: Mapbender.DigitizerTranslator.translate("feature.remove.title"),
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


            };

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
                    console.log(tableFields,"!");
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


            var tableTranslation = schema.tableTranslation ? Mapbender.DigitizerTranslator.translateObject(schema.tableTranslation) : Mapbender.DigitizerTranslator.tableTranslations();

            var buttons = generateResultDataTableButtons();

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


            frame.append($table);

        },


    };

})();
