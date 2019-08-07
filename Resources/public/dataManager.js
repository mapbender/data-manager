(function () {
    "use strict";

    Mapbender.DataManager = function($element,options) {

        var widget  = this;

        $.extend(widget, options);

        widget.id = $element.attr("id");

        var $spinner = (function() {
            var $parent = $('#' + widget.id).parents('.container-accordion').prev().find('.tablecell');
            var spinner = $("<div class='spinner' style='display:none'></div>");
            $parent.prepend(spinner);
            return spinner;
        })();

        var $title = (function(){
            var title = $('<div class="title"></div>');
            $element.append(title);
            return title;
        })();

        var $selector = (function(){
            var selector =  $('<select class="selector"></select>');
            $element.append(selector);
            return selector;
        })();


        var qe = new Mapbender.DataManager.QueryEngine(widget.id,Mapbender.DataManager.createSpinner_($spinner));
        widget.query = qe.query;
        widget.getElementURL = qe.getElementURL;

        widget.disabled = true;

        Mapbender.elementRegistry.waitReady(widget.target).then( function() {
            widget.setup($element,$title,$selector);
        });

        // Mapbender.elementRegistry.waitCreated('.mb-element-printclient').then(function (printClient) {
        //     widget.printClient = printClient;
        //     $.extend(widget.printClient, Mapbender.Digitizer.printPlugin);
        // });
    };

    Mapbender.DataManager.createSpinner_ = function ($spinner) {

        var spinner = new function () {
            var spinner = this;

            spinner.openRequests = 0;

            spinner.$element = $spinner;

            spinner.addRequest = function () {
                spinner.openRequests++;
                if (spinner.openRequests >= 1) {
                    spinner.$element.trigger("show");
                }
            };

            spinner.removeRequest = function () {
                spinner.openRequests--;
                if (spinner.openRequests === 0) {
                    spinner.$element.trigger("hide");
                }
            };


        };

        return spinner;
    };

    var createSelector_= function($selector, schemes) {

        var selector = new function() {
            var selector = this;

            selector.getSelectedSchema = function() {
                var $option = $selector.find(":selected") || $selector.find("option").first();
                return schemes[$option.val()]
            };

            $.each(schemes,function(schemaName,schema) {
                var option = $("<option/>").val(schemaName).html(schemaName);
                $selector.append(option);
            });

            $selector.on('focus', function () {
                selector.previousSchema = selector.getSelectedSchema();
            }).on('change', function () {
                var schema = selector.getSelectedSchema();
                selector.previousSchema.deactivateSchema();
                schema.activateSchema();
                selector.previousSchema = schema;

            });

        };

        return selector;

    };

    Mapbender.DataManager.prototype = {

        TYPE: "DataManager",

        createScheme_: function(rawScheme) {
            return new Mapbender.DataManager.Scheme(rawScheme,this);
        },

        setup: function ($element,$title,$selector) {
            var widget = this;

            widget.map = $('#' + widget.target).data('mapbenderMbMap').map.olMap;

            var rawSchemes = widget.schemes;
            widget.schemes = {};
            $.each(rawSchemes, function (schemaName,rawScheme) {
                rawScheme.schemaName = schemaName;
                var schema = widget.schemes[schemaName] = widget.createScheme_(rawScheme);
                schema.createMenu($element);
            });
            Object.freeze(widget.schemes);



            widget.selector = createSelector_($selector,widget.schemes);

            if (Object.keys(widget.schemes).length === 1) {
                $selector.hide();
                $title.html(Object.keys(widget.schemes)[0]);
            } else { }

            if (widget.displayOnInactive) {
                widget.activate(false);
            }

        },

        disable: function () {
            var widget = this;
            widget.disabled = true;
        },

        enable: function () {
            var widget = this;
            widget.disabled = false;
        },

        isEnabled: function () {
            var widget = this;
            return !widget.disabled;
        },


        getProjectionCode: function() {
            var widget = this;
            return widget.map.getView().getProjection().getCode().split(':').pop();
        },

        getCurrentSchema: function() {
            var widget = this;
            return widget.selector.getSelectedSchema();
        },






        activate: function () {
            var widget = this;
            if (!widget.isEnabled()) {
                widget.enable();
                widget.getCurrentSchema().activateSchema(true);
            }
        },

        deactivate: function () {
            var widget = this;
            widget.disable();
            widget.getCurrentSchema().deactivateSchema(true);
            //widget.recalculateLayerVisibility_(false);
        },


        // // TODO muss repariert werden
        // refreshConnectedDigitizerFeatures: function (featureTypeName) {
        //     var widget = this;
        //     $(".mb-element-digitizer").not(".mb-element-data-manager").each(function (index, element) {
        //         var schemes = widget.schemes;
        //         schemes[featureTypeName] && schemes[featureTypeName].layer && schemes[featureTypeName].layer.getData();
        //     })
        //
        //
        // },
    }


})();
