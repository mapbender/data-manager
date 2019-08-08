(function () {
    "use strict";

    Mapbender.DataManager.PopupConfiguration = function (configuration, schema) {
        var popupConfiguration = this;
        popupConfiguration.schema = schema;

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
                    feature.dispatchEvent({type: 'Digitizer.FeatureEditDialog.' + button.event});
                }
            });
        },

        createFeatureEditDialog: function (feature, schema) {
            return new FeatureEditDialog(feature, schema)
        },

        createEventListeners: function(dialog) {

            var eventListeners = {

                'Digitizer.FeatureEditDialog.Save' : function(event) {
                    var formData = dialog.$popup.formData();


                    //
                    // // TODO this is not nice. Find a better solution
                    // var errorInputs = $(".has-error", dialog.$popup);
                    // if (errorInputs.length > 0) {
                    //     console.warn("Error", errorInputs);
                    //     return;
                    // }

                    dialog.$popup.disableForm();

                    schema.saveFeature(feature, formData).then(function (response) {

                        if (response.hasOwnProperty('errors')) {
                            dialog.$popup.enableForm();
                            return;
                        }
                        dialog.$popup.popupDialog('close');
                    });

                },
                'Digitizer.FeatureEditDialog.Delete' : function(event) {
                    schema.removeFeature(feature);
                },
                'Digitizer.FeatureEditDialog.Cancel' : function(event) {
                    dialog.$popup.popupDialog('close');
                },

            };

            return eventListeners;
        },

    };


    var FeatureEditDialog = function (feature, schema) {

        var dialog = this;

        var widget = schema.widget;
        var $popup = dialog.$popup = $("<div/>");

        var configuration = schema.popup.clone();

        configuration.initButtons(feature);


        var eventListeners = configuration.createEventListeners();

        $.each(eventListeners,function(type,listener){
            feature.on(type,listener);
        });

        $popup.bind('popupdialogclose', function () {

            $.each(eventListeners,function(type,listener){
                feature.un(type,listener);
            });
        });




        widget.currentPopup = $popup;


        $popup.data('feature', feature);

        $popup.generateElements({children: schema.formItems});


        $popup.popupDialog(configuration);



        /** This is evil, but filling of input fields currently relies on that (see select field) **/
        setTimeout(function () {
            $popup.formData(feature.getProperties());
        }, 0);


        return dialog;

    };


})();
