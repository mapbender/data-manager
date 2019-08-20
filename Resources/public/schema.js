(function ($) {
    "use strict";

    /**
     *
     * @param {Object} options
     * @param widget
     * @constructor
     */

    Mapbender.DataManager.Scheme = function (options, widget) {

        var schema = this;

        schema.widget = widget;

        schema.featureType = options.featureType;

        if (!schema.featureType) {
            throw new Error("No Feature Type specified in Configuration of scheme")
        }

        schema.schemaName = options.schemaName;
        if (!schema.featureType) {
            throw new Error("No proper Schema Name specified in Configuration of scheme")
        }

        schema.label = options.label;

        schema.popup = options.popup || { title: schema.schemaName, width: '500px' };

        schema.tableFields = options.tableFields || schema.createDefaultTableFields_();

        schema.formItems = options.formItems || {};

        schema.allowEditData = options.allowEditData || false;

        schema.allowSave = options.allowSave || false;

        schema.allowOpenEditDialog = options.allowOpenEditDialog || false;

        schema.allowDelete = options.allowDelete || false;

        schema.hideSearchField = options.hideSearchField || false;

        schema.pageLength = options.pageLength || 10;

        schema.inlineSearch = options.inlineSearch || false;

        schema.tableTranslation = options.tableTranslation || undefined;




        schema.createPopupConfiguration_();

        if (schema.widget.TYPE == "DataManager") {
            schema.getData();
        }

    };


    Mapbender.DataManager.Scheme.prototype = {

        createDefaultTableFields_: function () {
            var schema = this;
            var tableFields = {};

            tableFields[schema.featureType.uniqueId] = {label: 'Nr.', width: '20%'};
            if (schema.featureType.name) {
                tableFields[schema.featureType.name] = {label: 'Name', width: '80%'};
            }
            return tableFields;

        },

        createPopupConfiguration_: function () {
            var schema = this;
            schema.popup = new Mapbender.DataManager.PopupConfiguration(schema.popup, schema);
        },


        createMenu: function ($element) {
            var schema = this;
            schema.menu = new Mapbender.DataManager.Menu(schema);
            schema.menu.appendTo($element);
        },

        activateSchema: function (wholeWidget) {

            var schema = this;

            var widget = schema.widget;

            schema.menu.show();

            widget.map.dispatchEvent({type: 'DataManager.activateSchema', schema: schema});
        },


        deactivateSchema: function (wholeWidget) {

            var schema = this;
            var widget = schema.widget;

            schema.menu.hide();

            if (widget.currentPopup) {
                widget.currentPopup.popupDialog('close');
            }

            widget.map.dispatchEvent({type: 'DataManager.deactivateSchema', schema: schema});

        },


        openFeatureEditDialog: function (feature) {
            var schema = this;
            return schema.popup.createFeatureEditDialog(feature, schema);
        },


        getData: function (extent, resolution, projection) {

            var schema = this;
            var widget = schema.widget;

            var request = {
                srid: widget.getProjectionCode(),
                maxResults: schema.maxResults,
                schema: schema.schemaName,
            };

            var selectXHR = widget.query('select', request).then(schema.onFeatureCollectionLoaded.bind(schema));

            return selectXHR;
        },


        onFeatureCollectionLoaded: function (featureCollection) {
            var schema = this;

            if (!featureCollection || !featureCollection.hasOwnProperty("features")) {
                Mapbender.error(Mapbender.DataManager.Translator.translate("features.loading.error"), featureCollection);
                return;
            }

            if (featureCollection.features && featureCollection.features.length > parseInt(schema.maxResults)) {
                Mapbender.info("It is requested more than the maximal available number of results.\n ( > " + schema.maxResults + " results. )");
            }


            var geoJsonReader = new ol.format.GeoJSONWithSeperateData();

            var newFeatures = geoJsonReader.readFeaturesFromObject({
                type: "FeatureCollection",
                features: featureCollection.features
            });

            schema.integrateFeatures(newFeatures);

        },

        integrateFeatures: function (features) {
            var schema = this;
            features.forEach(function (feature) {
                schema.widget.map.dispatchEvent({type: "DataManager.FeatureLoaded", feature: feature});
            });
        },


        removeFeature: function (feature) {
            var schema = this;
            var widget = schema.widget;

            var limitedFeature = {};
            limitedFeature[schema.featureType.uniqueId] = feature.getId();
            // if (!feature.getId()) {
            //     schema.layer.getSource().removeFeature(feature);
            // } else {
            console.trace();
            Mapbender.confirmDialog({
                html: Mapbender.DataManager.Translator.translate("feature.remove.from.database"),

                onSuccess: function () {
                    widget.query('delete', {
                        schema: schema.schemaName,
                        feature: limitedFeature,
                    })
                        .done(function (fid) {
                            widget.map.dispatchEvent({type: "DataManager.FeatureRemoved", feature: feature});
                            $.notify(Mapbender.DataManager.Translator.translate('feature.remove.successfully'), 'info');
                        });
                }
            });
            //}

            return feature;
        },


        saveFeature: function (feature, formData) {
            var schema = this;
            var widget = schema.widget;


            var request = {
                id: feature.getId(),
                properties: formData || {},
                geometry: new ol.format.WKT().writeGeometryText(feature.getGeometry()),
                srid: widget.getProjectionCode(),
                type: "Feature"
            };

            var promise = widget.query('save', {
                schema: schema.schemaName,
                feature: request
            }).then(function (response) {

                if (response.errors) {

                    response.errors.forEach(function (error) {
                        console.error(error.message);
                        $.notify(error.message, {
                            title: 'API Error',
                            autoHide: false,
                            className: 'error'
                        });
                    });

                } else {


                    // TODO hier beachten
                    // var newFeature = createNewFeatureWithDBFeature(feature, response);
                    //
                    // if (newFeature == null) {
                    //     console.warn("Creation of new Feature failed");
                    //     return;
                    // }
                    //
                    // schema.layer.getSource().removeFeature(feature);
                    // schema.layer.getSource().addFeature(newFeature);
                    //
                    //
                    // feature.dispatchEvent({type: 'Digitizer.ModifyFeature', allowSaving: false});

                    $.notify(Mapbender.DataManager.Translator.translate("feature.save.successfully"), 'info');

                }

                return response;

            });

            return promise;

        },


    };


})(jQuery);
