(function ($) {
    "use strict";

    /**
     *
     * @param {Object} rawScheme
     * @param widget
     * @constructor
     */

    Mapbender.DataManager.Scheme = function (rawScheme, widget) {

        var schema = this;

        this.widget = widget;


        /**
         * @type {boolean}
         */
        this.allowEditData = false;

        /**
         * @type {boolean}
         */
        this.allowOpenEditDialog = false;


        $.extend(schema, rawScheme);

        schema.createPopupConfiguration_();

        if (schema.widget.TYPE == "DataManager") {
            schema.getData();
        }

    };


    Mapbender.DataManager.Scheme.prototype = {

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

            widget.map.dispatchEvent({ type: 'DataManager.activateSchema', schema: schema});
        },


        deactivateSchema: function (wholeWidget) {

            var schema = this;
            var widget = schema.widget;

            schema.menu.hide();

            if (widget.currentPopup) {
                widget.currentPopup.popupDialog('close');
            }

            widget.map.dispatchEvent({ type: 'DataManager.deactivateSchema', schema: schema});

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


            var geoJsonReader = new ol.format.GeoJSON();
            var newFeatures = geoJsonReader.readFeaturesFromObject({
                type: "FeatureCollection",
                features: featureCollection.features
            });

           schema.integrateFeatures(newFeatures);

        },

        integrateFeatures: function(features) {
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
