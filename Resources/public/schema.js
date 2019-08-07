(function () {
    "use strict";

    /**
     *
     * @param {Object} rawScheme
     * @param widget
     * @param {number} index
     * @constructor
     */

    Mapbender.DataManager.Scheme = function (rawScheme, widget, index) {

        var schema = this;

        this.index = index;
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

        schema.createMenu_();

    };


    Mapbender.DataManager.Scheme.prototype = {





        createPopupConfiguration_: function () {
            var schema = this;
            schema.popup = new Mapbender.DataManager.PopupConfiguration(schema.popup, schema);
        },



        createMenu_: function () {
            var schema = this;
            var widget = schema.widget;
            var element = $(widget.element);

            schema.menu = new Mapbender.DataManager.Menu(schema);

            element.append(schema.menu.frame);
        },


        activateSchema: function (wholeWidget) {

            var schema = this;

            var widget = schema.widget;
            var frame = schema.menu.frame;

            widget.getCurrentSchema = function () {
                return schema;
            };

            frame.show();

            widget.map.dispatchEvent({ type: 'DataManager.activateSchema', schema: schema});

            schema.getData();

        },

        deactivateSchema: function (wholeWidget) {

            var schema = this;
            var widget = schema.widget;
            var frame = schema.menu.frame;

            frame.hide();

            if (widget.currentPopup) {
                widget.currentPopup.popupDialog('close');
            }

            widget.map.dispatchEvent({ type: 'Digitizer.deactivateSchema', schema: schema});

        },

        getData: function (extent, resolution, projection) {

            var schema = this;
            var widget = schema.widget;

            // // This is necessary to enable cache deletion in currentExtentSearch when zooming In
            // schema.layer.getSource().resolution = resolution;

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
                Mapbender.error(Mapbender.DigitizerTranslator.translate("features.loading.error"), featureCollection);
                return;
            }

            if (featureCollection.features && featureCollection.features.length === parseInt(schema.maxResults)) {
                Mapbender.info("It is requested more than the maximal available number of results.\n ( > " + schema.maxResults + " results. )");
            }


            var geoJsonReader = new ol.format.GeoJSON();
            var newFeatures = geoJsonReader.readFeaturesFromObject({
                type: "FeatureCollection",
                features: featureCollection.features
            });

            newFeatures.forEach(function (feature) {
                schema.widget.map.dispatchEvent({type: "DataManager.FeatureLoaded", feature: feature});
            });


        },




        openFeatureEditDialog: function (feature) {
            var schema = this;
            return schema.popup.createFeatureEditDialog(feature, schema);
        },

        removeFeature: function (feature) {
            var schema = this;
            var widget = schema.widget;

            var limitedFeature = {};
            limitedFeature[schema.featureType.uniqueId] = feature.getId();
            if (!feature.getId()) {
                schema.layer.getSource().removeFeature(feature);
            } else {
                Mapbender.confirmDialog({
                    html: Mapbender.DigitizerTranslator.translate("feature.remove.from.database"),

                    onSuccess: function () {
                        widget.query('delete', {
                            schema: schema.schemaName,
                            feature: limitedFeature,
                        }).done(function (fid) {
                            schema.layer.getSource().removeFeature(feature);
                            $.notify(Mapbender.DigitizerTranslator.translate('feature.remove.successfully'), 'info');
                        });
                    }
                });
            }

            return feature;
        },


        saveFeature: function (feature, formData) {
            var schema = this;
            var widget = schema.widget;

            var createNewFeatureWithDBFeature = function (feature, response) {

                var features = response.features;

                if (features.length === 0) {
                    console.warn("No Feature returned from DB Operation");
                    schema.layer.getSource().removeFeature(feature);
                    return null;
                } else if (features.length > 1) {
                    console.warn("More than 1 Feature returned from DB Operation");
                }

                var geoJsonReader = new ol.format.GeoJSON();

                var newFeatures = geoJsonReader.readFeaturesFromObject(response);
                var newFeature = _.first(newFeatures);

                schema.introduceFeature(newFeature);

                return newFeature;

            };

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


                    var newFeature = createNewFeatureWithDBFeature(feature, response);

                    if (newFeature == null) {
                        console.warn("Creation of new Feature failed");
                        return;
                    }

                    schema.layer.getSource().removeFeature(feature);
                    schema.layer.getSource().addFeature(newFeature);


                    feature.dispatchEvent({type: 'Digitizer.ModifyFeature', allowSaving: false});

                    $.notify(Mapbender.DigitizerTranslator.translate("feature.save.successfully"), 'info');

                }

                return response;

            });

            return promise;

        },


    };


})();
