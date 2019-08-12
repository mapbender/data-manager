(function () {
    "use strict";

    Mapbender.DataManager.PopupConfiguration = function (configuration, schema) {
        var popupConfiguration = this;
        popupConfiguration.schema = schema;

        this.PREFIX = "DataManager";

        $.extend(popupConfiguration, configuration);

        popupConfiguration.checkForDeprecatedUsageOfButtons_();

        popupConfiguration.buttons = popupConfiguration.createButtons_();


        Object.freeze(popupConfiguration.buttons);

    };

    Mapbender.DataManager.PopupConfiguration.prototype = {

        checkForDeprecatedUsageOfButtons_: function () {
            var configuration = this;
            _.each(configuration.buttons, function (button) {
                console.error("Using Javascript code in the configuration is deprecated:", button);
            });
        },

        createButtons_: function () {

            var popupConfiguration = this;
            var schema = popupConfiguration.schema;

            var buttons = {};

            if (schema.allowEditData) {
                buttons.saveButton = {
                    title: 'feature.save.title',
                    event: 'Save',
                };
            }
            if (schema.allowDelete) {
                buttons.deleteButton = {
                    title: 'feature.remove.title',
                    event: 'Delete',
                };
            }
            if (schema.allowCancelButton) {
                buttons.cancelButton = {
                    title: 'cancel',
                    event: 'Cancel',
                };
            }

            return buttons;

        },

        clone: function () {
            return $.extend(true, {}, this)
        },

        initButtons: function (feature) {
            var configuration = this;

            $.each(configuration.buttons, function (name, button) {
                button.text = button.title = Mapbender.DataManager.Translator.translate(button.title);
                button.click = function (event) {
                    feature.dispatchEvent({type: configuration.PREFIX+'.FeatureEditDialog.' + button.event});
                }
            });
        },

        createFeatureEditDialog: function (feature, schema) {
            return new FeatureEditDialog(feature, schema)
        },

        createEventListeners: function(dialog) {

            var configuration = this;
            var schema = configuration.schema;

            var feature = dialog.$popup.data("feature");

            var eventListeners = {

                'DataManager.FeatureEditDialog.Save' : function(event) {
                    var formData = dialog.$popup.formData();

                    dialog.$popup.disableForm();

                    schema.saveFeature(feature, formData).then(function (response) {

                        if (response.hasOwnProperty('errors')) {
                            dialog.$popup.enableForm();
                            return;
                        }
                        dialog.$popup.popupDialog('close');
                    });

                },
                'DataManager.FeatureEditDialog.Delete' : function(event) {
                    schema.removeFeature(feature);
                },
                'DataManager.FeatureEditDialog.Cancel' : function(event) {

                    dialog.$popup.popupDialog('close');
                }

            };

            return eventListeners;
        },

    };


    /**
     *
     * @param {ol.Feature} feature
     * @param {Mapbender.Digitizer.Scheme} schema
     * @returns {FeatureEditDialog}
     * @constructor
     */
    var FeatureEditDialog = function (feature, schema) {

        var dialog = this;

        var widget = schema.widget;
        var $popup = dialog.$popup = $("<div/>");

        $popup.data('feature', feature);


        var configuration = schema.popup.clone();

        configuration.initButtons(feature);


        var eventListeners = configuration.createEventListeners(dialog);

        $.each(eventListeners,function(type,listener){
            feature.on(type,listener);
        });

        $popup.bind('popupdialogclose', function () {

            $.each(eventListeners,function(type,listener){
                feature.un(type,listener);
            });
        });




        widget.currentPopup = $popup;

        $popup.generateElements({children: schema.formItems});


        $popup.popupDialog(configuration);



        /** This is evil, but filling of input fields currently relies on that (see select field) **/
        setTimeout(function () {
            $popup.formData(feature.getProperties());
        }, 0);


        return dialog;

    };


})();
