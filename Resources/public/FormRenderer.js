!(function ($) {
    "use strict";
    /** @external jQuery */

    window.Mapbender = Mapbender || {};
    Mapbender.DataManager = Mapbender.DataManager || {};

    var $nothing = $();
    var requireChildrenRxp = new RegExp([
        '/^(',
        [
            'form',
            'fieldSet',
            'tabs'
        ].join('|'),
        ')$/'
    ].join(''));

    var browserSupportsHtml5Date = (function() {
        // detect support for HTML5 date input; see https://stackoverflow.com/a/10199306
        var dateInput = document.createElement('input');
        var invalidDate = 'not-a-date';
        dateInput.setAttribute('type', 'date');
        dateInput.setAttribute('value', invalidDate);
        return dateInput.value !== invalidDate;
    })();

    function isNode(x) {
        // Minimum (DOM level 1) criteria for DOM Nodes or text nodes
        // see https://www.w3.org/TR/REC-DOM-Level-1/ecma-script-language-binding.html
        return x && x.nodeType && x.nodeName;
    }

    /**
     * @param {String} expr
     * @return {RegExp|null}
     */
    function expressionToRegex(expr) {
        // for valid flags see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Advanced_searching_with_flags
        var matches = expr.match(/^[/](.*?)[/]([gimsuy]*)$/);
        if (matches) {
            return new RegExp(matches[1], matches[2]);
        } else {
            return null;
        }
    }


    Mapbender.DataManager.FormRenderer = function FormRenderer() {
    };

    Object.assign(Mapbender.DataManager.FormRenderer.prototype, {
        /**
         * @param {Array<Object>} children
         * @return {Array<HTMLElement>}
         */
        renderElements: function(children) {
            var elements = [];
            for (var i = 0; i < children.length; ++i) {
                var $element = this.renderElement(children[i]);
                elements.push.apply(elements, $element.get());
            }
            return elements;
        },
        /**
         * @param {Object} settings
         * @return {jQuery}
         */
        renderElement: function(settings) {
            if (isNode(settings)) {
                console.warn("Fixme: HTMLElement passed to renderElement. This should not occur with integrated form rendering", settings);
                return $(settings);
            }
            if (typeof settings === 'string') {
                console.warn("Deprecated: passing plain string. Use {type: html, html: 'your content'}", settings);
                return this.renderElement({type: 'html', html: settings});
            }
            if (!settings || !settings.type) {
                console.error("Not an object or missing type", settings);
                return $nothing;
            }
            if (requireChildrenRxp.test(settings.type) && !(settings.children || []).length) {
                console.error("Missing required 'children' on type " + settings.type + " => ignoring", settings);
                return $nothing;
            }
            switch (settings.type) {
                default:
                    // Uh-oh
                    return this.renderFallback_(settings);
                case 'form':
                    console.warn("Not rendering top-level type: form, skipping directly into children. Move your form field configurations up directly into your 'formItems' list", settings);
                    // Completely ignore forms. Skip into children
                    return $(this.renderElements(settings.children));
                case 'tabs':
                    return this.handle_tabs_(settings);
                case 'fieldSet':
                    return this.handle_fieldSet_(settings);
                case 'html':
                    return this.handle_html_(settings);
                case 'text':
                    return this.handle_text_(settings);
                case 'label':
                    return this.handle_label_(settings);
                case 'input':
                    return this.handle_input_(settings);
                case 'textArea':
                    return this.handle_textArea_(settings);
                case 'date':
                    return this.handle_date_(settings);
                case 'colorPicker':
                    return this.handle_colorPicker_(settings);
                case 'file':
                    return this.handle_file_(settings);
                case 'image':
                    return this.handle_image_(settings);
                case 'select':
                    return this.handle_select_(settings);
            }
        },
        handle_input_: function(settings) {
            var $input = this.textInput_(settings, 'text');
            this.addCustomEvents_($input, settings);
            return this.wrapInput_($input, settings);
        },
        handle_textArea_: function(settings) {
            var $input = $(document.createElement('textarea'))
                .attr('rows', settings.rows || 3)
            ;
            this.configureTextInput_($input, settings);
            return this.wrapInput_($input, settings);
        },
        handle_date_: function(settings) {
            var type = browserSupportsHtml5Date && 'date' || 'text';
            var $input = this.textInput_(settings, type);
            if (settings.required || settings.mandatory) {
                var now = new Date();
                var defaultValue = now.toISOString().replace(/T.*$/, '');
                $input.val(defaultValue);
            }
            var $wrapper = this.wrapInput_($input, settings);
            if (!browserSupportsHtml5Date) {
                var dp = $input.datepicker({
                    dateFormat: 'yy-mm-dd', // format must be SQL compatible / HTML5 interchangeable
                    firstDay: 1
                }).data('datepicker');
                dp.dpDiv.addClass('popover data-manager-datepicker');
            }
            return $wrapper;
        },
        handle_colorPicker_: function(settings) {
            var $input = this.textInput_(settings, 'text');
            var $addonGroup = $(document.createElement('div'))
                .addClass('input-group colorpicker-component')
                .append($input)
                .append($('<span class="input-group-addon"><i></i></span>'))
            ;
            $addonGroup.colorpicker({format: 'hex'});
            return this.wrapInput_($addonGroup, settings);
        },
        handle_file_: function(settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L545 */
            var $inputReal = $('<input type="hidden" />')
                // NOTE: do not attempt required / disabled etc on hidden inputs
                .attr('name', settings.name)
            ;
            var $fileInput = $('<input type="file" />')
                .attr('accept', settings.accept)
                .attr(settings.attr || {})
            ;
            var $btnText = $('<span class="upload-button-text">')
                .text(settings.text || 'Select')
            ;
            var $btn = $('<span class="btn btn-success button fileinput-button">')
                .append($fileInput)
                .append($inputReal)
                .append('<i class="fa fa-upload" aria-hidden="true"/>')
                .append($btnText)
            ;
            var $group = $(document.createElement('div'))
                .append($btn)
                .append('<div class="progress-bar"/>')
            ;
            $fileInput.fileupload({
                dataType: 'json',
                url: settings.uploadHanderUrl,      // SIC!
                progressall: function(evt, data) {
                    var progressPct = parseInt(data.loaded / data.total * 100, 10);
                    $('.progress-bar', $group).css('width', [progressPct, '%'].join(''));
                },
                success: function(response) {
                    var fileInfo = response.files && response.files[0];
                    var $previewImage = $('img[data-preview-for="' + settings.name + '"]', $group.closest('.ui-dialog'));
                    $previewImage.attr('src', fileInfo.thumbnailUrl);
                    if (fileInfo.name) {
                        $btnText.text(fileInfo.name);
                        $btn.attr('title', fileInfo.name);
                    }
                    $inputReal.val(fileInfo.url);
                    $('.progress-bar', $group).css('width', '0');
                }
            });
            return this.wrapInput_($group, settings);
        },
        handle_image_: function(settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L496 */
            /** @todo: support "enlargeImage"...? */
            var $img = $(document.createElement('img'))
                .addClass('img-responsive')
                .attr('src', settings.src || null)
                .attr('data-preview-for', settings.name || null)
            ;
            // Wrap in form-group (potentially with label), but
            // remove input-related values (img is not an input)
            return this.wrapInput_($img, {
                title: settings.title,
                infoText: settings.infoText,
                css: settings.css
            });
        },
        textInput_: function(settings, type) {
            var $input = $('<input type="' + type + '"/>');
            this.configureTextInput_($input, settings);
            return $input;
        },
        configureTextInput_: function($input, settings) {
            // Used for input type="text" and textarea
            $input
                .prop({
                    disabled: !!settings.disabled,
                    readonly: !!settings.readonly,
                    required: !!settings.mandatory || settings.required
                })
                .attr(settings.attr || {})
                .attr('name', settings.name || null)
                .addClass('form-control')
            ;
            if (settings.value) {
                $input.val(settings.value);
            }
            if (settings.name && settings.mandatory && (typeof settings.mandatory === 'string')) {
                $input.data('warn', this.createValidationCallback_(settings.mandatory));
            }
            $input.attr('data-custom-validation-message', settings.mandatoryText || null);
        },
        handle_tabs_: function(settings) {
            /** https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L641 */
            var $tabList = $(document.createElement('ul'));
            var $container = $(document.createElement('div'));
            $container.append($tabList);
            for (var i = 0; i < settings.children.length; ++i) {
                var sub = settings.children[i];
                var title = sub.title;
                if (!title || !(sub.children || []).length) {
                    console.error("Missing title or content on 'tabs' type index " + i, sub);
                    continue;
                }
                var $panel = $(document.createElement('div')).uniqueId();
                var $tabLink = $(document.createElement('a'))
                    .attr('href', ['#', $panel.attr('id')].join(''))
                    .text(title)
                ;
                this.checkExtraSettings_(sub, ['children', 'title'], 'tabs child');
                $panel.append(this.renderElements(sub.children));
                $tabList.append($(document.createElement('li')).append($tabLink));
                $container.append($panel);
            }
            /** @todo: decouple rendering from widget init */
            $container.tabs({
                classes: {
                    "ui-tabs": "ui-tabs mapbender-element-tab-navigator",
                    "ui-tabs-nav": "ui-tabs-nav nav nav-tabs",
                    "ui-tabs-panel": "ui-tabs-panel tab-content"
                }
            });
            return $container;
        },
        handle_fieldSet_: function(settings) {
            this.checkExtraSettings_(settings, ['type', 'children']);
            var $container = $(document.createElement('div'))
                .addClass('row reduce-gutters')
            ;
            for (var i = 0; i < settings.children.length; ++i) {
                var sub = settings.children[i];
                var subSettings = Object.assign({}, sub);
                delete(subSettings['css']);
                var $column = $(document.createElement('div'))
                    .addClass('col-4 col-xs-4')
                    .css(sub.css || {})
                    .append(this.renderElement(subSettings))
                ;
                $container.append($column);
            }
            return $container;
        },
        handle_label_: function(settings) {
            // NOT a field label. Ignore input-related stuff and
            // emit a simple text paragraph.
            return $(document.createElement('p'))
                .attr(settings.attr || {})
                .addClass(settings.cssClass)
                .text(settings.text || settings.title)
            ;
        },
        handle_html_: function(settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L265 */
            var $wrapper = $(document.createElement('div'))
                .attr(settings.attr || {})
                .addClass(settings.cssClass)
                .css(settings.css || {})
                .append(settings.html)
            ;
            return $wrapper;
        },
        handle_text_: function(settings) {
            /** https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L823 */
            var $wrapper = $(document.createElement('div')).addClass('form-group text');
            var $textContainer = $(document.createElement('div'))
                .addClass('-fn-calculated-text')
                .attr('data-expression', settings.text)
            ;
            $wrapper
                .append(this.fieldLabel_({title: settings.title, infoText: settings.infoText}))
                .append($textContainer)
                .css(settings.css || {})
                .addClass(settings.cssClass)
            ;
            return $wrapper;
        },
        handle_select_: function(settings) {
            var $select = $(document.createElement('select'))
                .attr('name', settings.name)
                .prop('multiple', !!settings.multiple)
                .addClass('form-control')
            ;
            var options = settings.options || [];
            for (var i = 0; i < options.length; ++i) {
                var option = options[i];
                var $option = $(document.createElement('option'))
                    .attr(option.attr || {})
                    .attr('value', option.value)
                    .text(option.label)
                ;
                $select.append($option);
            }
            if (settings.value !== null && typeof (settings.value) !== undefined) {
                var initial = settings.value;
                if (settings.multiple && !Array.isArray(initial)) {
                    initial = initial.toString().split(settings.separator || ',') || [];
                }
                $select.val(initial);
            }
            if ((settings.multiple || settings.select2) && (typeof ($select.select2) === 'function')) {
                $select.select2(settings);
            }
            // Legacy amenities
            $select.data('declaration', settings);
            this.addCustomEvents_($select, settings);
            return this.wrapInput_($select, settings);

        },
        fieldLabel_: function(settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L353 */
            var $label = $(document.createElement('label'))
                .attr({'for': settings.name || null })
                .attr(settings.attr || {})
                .text(settings.title || settings.text)
            ;
            if (settings.infoText) {
                var $icon = $('<i/>')
                    .addClass('fa fa-info-circle -visui-infotext')
                    .attr('title', settings.infoText)
                ;
                $label.append('&nbsp;', $icon);
            }
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L345 */
            if (settings.copyClipboard) {
                $label.append('&nbsp;', $('<i/>')
                    .addClass('fa fa-clipboard far-clipboard -fn-copytoclipboard')
                    .attr('aria-hidden', 'true')
                );
            }
            return $label;
        },
        wrapInput_: function($input, settings) {
            var $group = $(document.createElement('div'))
                .addClass('form-group')
                .css(settings.css || {})
            ;
            if (settings.title) {
                $group.append(this.fieldLabel_(settings));
            }
            $group.append($input);
            return $group;
        },
        renderFallback_: function(settings) {
            var $wrapper = $(document.createElement('div'));
            $wrapper.generateElements({children: [settings]});
            return $wrapper.children();
        },
        createValidationCallback_: function(expression) {
            // legacy fun fact: string runs through eval, but result of eval can only be used
            // if it happens to have an method named .exec accepting a single parameter
            // => this was never compatible with anything but regex literals
            return (function() {
                var rxp = expressionToRegex(expression);
                return function(value) {
                    return rxp.test(value);
                }
            }());
        },
        addCustomEvents_: function($input, settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L123 */
            var names = ['filled', 'change'].filter(function(name) {
                return settings[name];
            });
            for (var i = 0; i < names.length; ++i) {
                var name = names[i];
                var handler = settings[name];
                $input.addClass('-js-custom-events');
                if (typeof handler !== 'function') {
                    console.error("Using eval'd Javascript in the configuration is deprecated. Add event handlers to your project code.", settings);
                    handler = (function(code) {
                        var element = $input;
                        var el = element;
                        return function() {
                            eval(code);
                        };
                    })(handler);
                }
                $input.on(name, handler);
            }
        },
        checkExtraSettings_: function(settings, expectedProps, description) {
            var description_ = description || ['type ', '"', settings.type, '"'].join('');
            var other = Object.keys(settings).filter(function(name) {
                return -1 === expectedProps.indexOf(name);
            });
            if (other.length) {
                console.warn(
                    ["Ignoring extra properties on ", description_, ": ",
                    other.join(', '),
                    "; keep ", expectedProps.join(', '),
                    "; remove everything else"].join(''),
                    settings);
            }
        },
        __dummy: null
    });

    // Handled:
    // * 'form'
    // * 'tabs'
    // * 'fieldSet'
    // * 'html'
    // * 'text'
    // * 'label'
    // * 'input'
    // * 'textArea'
    // * 'date'
    // * 'colorPicker'
    // * 'file'
    // * 'image'

    // @todo:
    // * 'breakLine'
    // * 'select'
    // * 'selectOption' ?
    // * 'selectOptionList' ?
    // * 'radio'
    // * 'checkbox'

    // Not concerned / drop support (vs vis-ui):
    // * 'accordion'
    // * 'container'
    // * 'fluidContainer'
    // * 'inline'
    // * 'formGroup'
    // * 'button'
    // * 'submit'
    // * 'resultTable'
    // * 'digitizingToolSet'
    // * 'popup'
}(jQuery));

