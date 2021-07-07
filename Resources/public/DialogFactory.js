!(function ($) {
    "use strict";
    /** @external jQuery */

    window.Mapbender = Mapbender || {};
    Mapbender.DataManager = Mapbender.DataManager || {};

    Mapbender.DataManager.DialogFactory = {
        baseDialog_: function(content, options) {
            var $content = $((typeof content === 'string') ? $.parseHTML(content) : content);
            var defaults = {
                classes: {
                    'ui-dialog': 'ui-dialog mb-element-popup-dialog modal-content',
                    'ui-dialog-titlebar': 'ui-dialog-titlebar modal-header',
                    'ui-dialog-titlebar-close': 'ui-dialog-titlebar-close close',
                    'ui-dialog-buttonpane': 'ui-dialog-buttonpane modal-footer',
                    'ui-button': 'ui-button button btn'
                },
                resizable: false,
                hide: {
                    effect: 'fadeOut',
                    duration: 200
                }
            };
            var options_ = Object.assign({}, defaults, options || {});
            $content.dialog(options_);
            // Hide text labels on .ui-button-icon-only, with or without jqueryui css
            $('.ui-dialog-titlebar .ui-button-icon-only', $content.closest('.ui-dialog')).each(function() {
                var $button = $(this);
                var $icon = $('.ui-button-icon', this);
                $button.empty().append($icon);
            });
            $content.on('dialogclose', function() {
                window.setTimeout(function() { $content.dialog('destroy') }, 500);
            });

            return $content;
        },

        /**
         *
         * @param {String} title
         * @param {*} content
         * @return {Promise}
         */
        confirm: function(title, content) {
            var $content = $(document.createElement('div'))
                .append(content || null)
            ;
            var deferred = $.Deferred();
            this.baseDialog_($content, {
                title: title,
                modal: true,
                buttons:[
                    {
                         text: Mapbender.trans('mb.actions.accept'),
                         'class': 'button success btn',
                         click: function() {
                             deferred.resolve();
                             $(this).dialog('close');
                             return false;
                         }
                    }, {
                         text: Mapbender.trans('mb.actions.cancel'),
                         'class': 'button critical btn',
                         click:   function() {
                             deferred.reject();
                             $(this).dialog('close');
                             return false;
                         }
                     }
                ]
            });
            return deferred.promise();
        },
        __dummy__: null
    };
}(jQuery));

