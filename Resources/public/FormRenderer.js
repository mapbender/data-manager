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
    var browserNativeInputs = {
        date: (function () {
            // detect support for HTML5 date input; see https://stackoverflow.com/a/10199306
            var dateInput = document.createElement('input');
            var invalidDate = 'not-a-date';
            dateInput.setAttribute('type', 'date');
            dateInput.setAttribute('value', invalidDate);
            return dateInput.value !== invalidDate;
        })()
        // @todo: native color input
    };

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

    Mapbender.DataManager.FormRenderer = function FormRenderer(widget) {
        this.widget = widget;
    };

    Object.assign(Mapbender.DataManager.FormRenderer.prototype, {

        /**
         * Fixes / amends form items list (in place).
         *
         * @param {Array<Object>} items
         * @param {String} baseUrl
         * @param {Array<Object>} fileConfigs
         * @param {Object} [parent]
         */
        prepareItems: function (items, baseUrl, fileConfigs, parent) {
            var dropped = [], i;
            for (i = 0; i < items.length; ++i) {
                var item = items[i];
                if (typeof item === 'string') {
                    console.warn("Deprecated: plain string form item. Use {type: html, html: 'your content'}", item);
                    item = items[i] = {type: 'html', html: item};
                }
                if (!item || (!item.type && (!parent || parent.type !== 'tabs'))) {
                    console.error("Not an object or missing type", item);
                    dropped.push(item);
                    items[i] = null;
                } else {
                    item = items[i] = this.prepareLeaf_(item, baseUrl, fileConfigs) || item;
                    if ((item.children || []).length) {
                        this.prepareItems(item.children, baseUrl, fileConfigs, item);
                    }
                }
            }
            if (dropped.length) {
                var remaining = items.filter(function (x) {
                    return !!x;
                });
                items.splice.apply(items, [0, items.length].concat(remaining));
            }
            // strip trailing "breakLine" (sequence)
            for (i = items.length - 1; i >= 0; --i) {
                if (items[i].type === 'breakLine') {
                    items.pop();
                } else {
                    break;
                }
            }
        },
        /**
         * @param {Object} item
         * @param {String} baseUrl
         * @param {Array<Object>} fileConfigs
         * @return {Object}
         * @private
         */
        prepareLeaf_: function (item, baseUrl, fileConfigs) {
            if (item.type === 'inline' || item.type === 'fieldSet') {
                var reformedRadioGroup = this.reformRadioGroup_(item.children || [], item);
                if (reformedRadioGroup && reformedRadioGroup.__filtered__.length) {
                    var spliceIndex = item.children.indexOf(reformedRadioGroup.__filtered__[0]);
                    var remainingChildren = item.children.filter(function (ch) {
                        return -1 === reformedRadioGroup.__filtered__.indexOf(ch);
                    });
                    delete (reformedRadioGroup['__filtered__']);
                    if (item.type === 'inline' || !remainingChildren.length) {
                        // Replace entire parent item
                        return reformedRadioGroup;
                    } else {
                        item.children = remainingChildren;
                        item.children.splice(spliceIndex, 0, reformedRadioGroup);
                        return item;
                    }
                }
            }
            if (item.type === 'file' && item.name) {
                var fileConfig = fileConfigs.filter(function (x) {
                    return x.field === item.name;
                })[0];
                if (!item.accept && !(item.attr || {}).accept && fileConfig && fileConfig.formats) {
                    console.warn('Deprecated: configuring file input "accept" attribute indirectly from schema "files". Prefer using e.g. attr: {accept: "image/*"} on the file input field.', item);
                    item.attr = item.attr || {};
                    item.attr.accept = fileConfig.formats;
                }
                item.__uploadUrl__ = [baseUrl, 'attachment', '?field=', encodeURIComponent(item.name)].join('');
                return item;
            }
        },
        /**
         * @param {Array<Object>} children
         * @return {Array<HTMLElement>}
         */
        renderElements: function (children) {
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
        renderElement: function (settings) {
            var definedChildren = settings.children && settings.children.length && settings.children || null;
            if (requireChildrenRxp.test(settings.type) && !definedChildren) {
                console.error("Missing required 'children' on type " + settings.type + " => ignoring", settings);
                return $nothing;
            }
            switch (settings.type) {
                default:
                    // Uh-oh
                    return this.renderFallback_(settings);
                case 'resultTable' :
                    return this.render_resultTable_(settings);
                case 'coordinates':
                    return this.handle_coordinates(settings);
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
                    return this.renderTag_('p', settings);
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
                case 'checkbox':
                    return this.handle_checkbox_(settings);
                case 'select':
                    return this.handle_select_(settings);
                case 'radioGroup':
                    return this.handle_radioGroup_(settings);
                case 'breakLine':
                    return this.handle_breakLine_(settings);
                case 'div':
                case 'span' :
                case 'button' :
                case 'p':
                    return this.renderTag_(settings.type, settings);
            }
        },
        initializeWidgets: function (scope, baseUrl) {
            if ($.fn.colorpicker) {
                $('.-js-init-colorpicker', scope).each(function () {
                    $(this).colorpicker({
                        format: 'hex',
                        container: $('.input-group', $(this).closest('.form-group'))
                    });
                });
            }
            $('.-js-datepicker', scope).each(function () {
                var dp = $(this).datepicker({
                    dateFormat: 'yy-mm-dd', // format must be SQL compatible / HTML5 interchangeable
                    firstDay: 1
                }).data('datepicker');
                dp.dpDiv.addClass('popover data-manager-datepicker');
            });
            if ($.fn.select2) {
                $('.-js-init-select2', scope).each(function () {
                    var $select = $(this);
                    $(this).select2($select.data('select2-options') || {});
                });
            }
            var self = this;
            $('.-js-rt-container', scope).each(function() {
                self.init_resultTable_($(this));
            });

            $('input[type="file"][data-upload-url][data-name]', scope).each(function () {
                var $input = $(this);
                var name = $input.attr('data-name');
                var $group = $input.closest('.form-group');
                var $realInput = $('input[name="' + name + '"]', $group);
                var url = $input.attr('data-upload-url');
                var $loadingIcon = $('.fa-spin', $group);
                $input.fileupload({
                    dataType: 'json',
                    url: url,
                    success: function (response) {
                        var values = {};
                        values[name] = response.filename;
                        $realInput.val(response.filename);
                        self.updateFileInputs(scope, baseUrl, values);
                    },
                    send: function () {
                        $loadingIcon.removeClass('hidden');
                    },
                    always: function () {
                        $loadingIcon.addClass('hidden');
                    }
                });
            });
            $(scope).on('click', '.-fn-delete-attachment', function () {
                var $link = $(this);
                var $group = $link.closest('.form-group');
                var $input = $('input[type="hidden"][name]', $group);
                var dataProp = $('input[type="file"][data-name]', $group).attr('data-name');
                $input.val('');
                var fakeValues = {};
                fakeValues[dataProp] = '';
                self.updateFileInputs($group, baseUrl, fakeValues);
                return false;
            });
        },
        getAttachmentUrl_: function (baseUrl, fieldName, inputValue) {
            if (inputValue && !/^(http[s]?)?:?\/\//.test(inputValue)) {
                var baseName = inputValue.replace(/^.*?\/([^/]*)$/, '$1');
                return [baseUrl, 'attachment', '?field=', encodeURIComponent(fieldName), '&name=', encodeURIComponent(baseName)].join('');
            } else {
                return inputValue;
            }
        },
        updateFileInputs: function (scope, baseUrl, values) {
            var fileInputs = $('.fileinput-button input[name]', scope).get();
            var dataImages = $('img[data-preview-for]', $(scope).closest('.ui-dialog')).get();
            var i;
            for (i = 0; i < fileInputs.length; ++i) {
                var fileInput = fileInputs[i];
                var $group = fileInput.closest('.form-group');
                var inputValue = fileInput.value;
                var displayValue = inputValue && inputValue.split('/').pop();
                var $display = $('.upload-button-text', $group);
                if (displayValue && inputValue) {
                    $display.text(displayValue);
                    $('.fileinput-button', $group).attr('title', displayValue);
                } else {
                    $display.text($display.attr('data-placeholder'));
                    $('.fileinput-button', $group).attr('title', '');
                }
                var url = this.getAttachmentUrl_(baseUrl, fileInput.name, values[fileInput.name] || '');
                $('.-fn-open-attachment', $group)
                    .toggle(!!displayValue)
                    .attr('href', url)
                ;
                $('.-fn-delete-attachment', $group)
                    .toggle(!!displayValue)
                    .attr('data-href', url)
                ;
            }

            for (i = 0; i < dataImages.length; ++i) {
                var $img = $(dataImages[i]);
                var dataProp = $img.attr('data-preview-for');
                var value = values[dataProp];
                if (typeof value !== 'undefined') {
                    if (value) {
                        $img.attr('src', this.getAttachmentUrl_(baseUrl, dataProp, value));
                    } else {
                        var defaultSrc = $img.attr('data-default-src') || '';
                        $img.attr('src', defaultSrc || '').toggle(!!defaultSrc);
                    }
                }
            }
        },
        handle_automatic_detection(settings) {
            var widget = this.widget;
            var children = [];
            var input = {
                type: settings.type,
                title: settings.title,
                label: '',
                name: settings.name,
                mandatory: settings.mandatory,
                options: settings.options,
                css: {width: '80%', flex: '0 0 80%' },
                keyup: settings.keyup,

            };

            var button = {
                type: "button",
                cssClass: "fa fa-plus",
                css: { 'margin-bottom': '6px', 'width': '10%', 'max-width': '30px', flex: '0 0 20%'},
                label: '&nbsp;',
                attr: {'href': '#', 'title': 'Automatisch ermitteln' },
                click: function () {
                    widget._getRemotePropertyValues(widget.currentPopup.data("feature"), widget._getCurrentSchema(), settings.name).done(function (properties) {

                        Object.keys(properties).forEach(function(prop){
                            let $inputfield = $(widget.currentPopup).find("[name=" + prop + "]");
                            $inputfield.val(properties[prop]).keyup();
                        });

                    }).fail(()=>console.log("No geometry or no access to server"));
                    return false;
                }
            };

            children.push(input);
            children.push(button);

            let item = {};

            item.type = "fieldSet";
            item.title = '';
            item.label = '';
            item.css = { display: 'flex', 'align-items' : 'flex-end' };
            item.cssClass = 'automatic-detection-fieldset';
            item.children = children;

            return this.handle_fieldSet_(item);
        },
        handle_input_: function (settings) {
            var widget = this.widget;
            var $input = this.textInput_(settings, 'text');
            if (widget._getCurrentSchema().popup.remoteData && settings.automatic_detection) {
                return this.handle_automatic_detection(settings);
            }
            this.addCustomEvents_($input, settings);
            if (typeof settings.mandatory === "function" && settings.mandatoryText) {
                $input.data('warn', settings.mandatory);
                $input.attr('data-custom-validation-message', settings.mandatoryText || null);
            }
            return this.wrapInput_($input, settings);
        },
        handle_textArea_: function (settings) {
            var $input = $(document.createElement('textarea'))
                .attr('rows', settings.rows || 3)
            ;
            this.configureTextInput_($input, settings);
            return this.wrapInput_($input, settings);
        },
        handle_date_: function (settings) {
            var native = browserNativeInputs.date;
            var type = native && 'date' || 'text';
            var $input = this.textInput_(settings, type);
            if (settings.required || settings.mandatory) {
                var now = new Date();
                var defaultValue = now.toISOString().replace(/T.*$/, '');
                $input.val(defaultValue);
            }
            var $wrapper = this.wrapInput_($input, settings);
            if (!native) {
                $input.addClass('-js-datepicker');
            }
            return $wrapper;
        },
        handle_colorPicker_: function (settings) {
            var $input = this.textInput_(settings, 'text');
            if ($.fn.colorpicker) {
                var $addonGroup = $(document.createElement('div'))
                    .addClass('input-group colorpicker-component -js-init-colorpicker')
                    .append($input)
                    .append($('<span class="input-group-addon"><i></i></span>'))
                ;
                return this.wrapInput_($addonGroup, settings);
            } else {
                return this.wrapInput_($input, settings);
            }
        },
        handle_file_: function (settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L545 */
            var $inputReal = $('<input type="hidden" />')
                // NOTE: do not attempt required / disabled etc on hidden inputs
                .attr('name', settings.name)
            ;
            var $fileInput = $('<input type="file" />')
                .attr(settings.attr || {})
                .attr('accept', (settings.attr || settings).accept || null)
                .attr('data-upload-url', settings.__uploadUrl__)
                .attr('data-name', settings.name)
            ;
            var $btnText = $('<span class="upload-button-text">')
                .attr('data-placeholder', settings.text || 'Select')
            ;
            var $btn = $('<span class="btn btn-success button fileinput-button">')
                .append($fileInput)
                .append($inputReal)
                .append('<i class="fa fa-upload" aria-hidden="true"/>')
                .append($btnText)
            ;
            var $downloadBtn = $('<a href="#" class="btn btn-xs -fn-open-attachment"><i class="fa fa-lg fa-fw fas fa-external-link-alt fa-external-link"></i></a>')
                .attr('title', Mapbender.trans('mb.data-manager.attachment.open'))
                .attr('target', '_blank')
                .append($('<span class="sr-only">').text(Mapbender.trans('mb.data-manager.attachment.open')))
            ;
            var $deleteBtn = $('<a href="#" class="btn btn-xs -fn-delete-attachment"><i class="fa fa-lg fa-fw fas fa-trash-alt fa-trash"></i></a>')
                .attr('title', Mapbender.trans('mb.actions.remove'))
                .append($('<span class="sr-only">').text(Mapbender.trans('mb.actions.remove')))
            ;
            var $group = $(document.createElement('div'))
                .addClass('file-group')
                .append($btn)
                .append($downloadBtn)
                .append($deleteBtn)
                .append('<i class="fa fas fa-fw fa-spinner fa-spin hidden" />')
            ;
            return this.wrapInput_($group, settings);
        },
        handle_image_: function (settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L496 */
            /** @todo: support "enlargeImage"...? */
            var src = settings.src || null;
            if (src && !/^(http[s]?)?:?\//.test(src)) {
                src = [Mapbender.configuration.application.urls.asset, src].join('');
            }

            var $img = $(document.createElement('img'))
                .addClass('img-responsive')
                .attr('src', src)
                .attr('data-default-src', settings.src || '')
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
        textInput_: function (settings, type) {
            var $input = $('<input type="' + type + '"/>');
            this.configureTextInput_($input, settings);
            return $input;
        },
        configureTextInput_: function ($input, settings) {
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
                .addClass(settings.cssClass || '');
            ;
            if (settings.value) {
                $input.val(settings.value);
            }
            if (!!settings.mandatory || settings.required) {
                $input.css("border-color", "#c90");
            }
            if (settings.name && settings.mandatory && (typeof settings.mandatory === 'string')) {
                $input.data('warn', this.createValidationCallback_(settings.mandatory,$input));
            }
            $input.attr('data-custom-validation-message', settings.mandatoryText || null);
        },
        handle_tabs_: function (settings) {
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
                    'ui-tabs-tab': 'ui-tabs-tab buttonColors'
                }
            });
            return $container;
        },
        handle_fieldSet_: function (settings) {
            this.checkExtraSettings_(settings, ['type', 'children']);
            var $container = $(document.createElement('div'))
                .addClass('row reduce-gutters').css(settings.css || {});
            ;
            for (var i = 0; i < settings.children.length; ++i) {
                var sub = settings.children[i];
                var subSettings = Object.assign({}, sub);
                delete (subSettings['css']);
                var $column = $(document.createElement('div'))
                    .addClass('col-4 col-xs-4')
                    .css(sub.css || {})
                    .append(this.renderElement(subSettings))
                ;
                $container.append($column);
            }
            return $container;
        },
        renderTag_: function (tagName, settings) {
            var $element = $(document.createElement(tagName))
                .attr(settings.attr || {})
                .addClass(settings.cssClass || '')
                .css(settings.css || {})
                .text(settings.text || settings.title)
                .append(this.renderElements(settings.children || []))

                if (tagName == "button") {
                    $element.click(settings.click);
                }
            ;
            return $element;
        },
        handle_html_: function (settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L265 */
            var $wrapper = $(document.createElement('div'))
                .attr(settings.attr || {})
                .addClass(settings.cssClass)
                .css(settings.css || {})
                .append(settings.html)
            ;
            return $wrapper;
        },
        handle_text_: function (settings) {
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
        handle_checkbox_: function (settings) {
            var $label = this.fieldLabel_(settings);
            var $checkbox = $('<input type="checkbox"/>')
                .attr('name', settings.name || null)
                .attr('value', settings.value || null)
                .prop('disabled', settings.disabled || false)
                .prop('required', !!settings.mandatory || settings.required || !!(settings.attr || {}).required)
                .prop('checked', settings.checked)
            ;
            $label.prepend($checkbox);
            return $(document.createElement('div'))
                .addClass('form-group checkbox')
                .append($label)
                ;
        },
        handle_select_: function (settings) {
            var widget = this.widget;
            var required = (settings.attr || {}).required || settings.required;
            var multiple = (settings.attr || {}).multiple || settings.multiple;
            var $select = $(document.createElement('select'))
                .attr(settings.attr || {})
                .prop('required', required)
                .attr('name', settings.name)
                .prop('multiple', !!multiple)
                .addClass('form-control')
            ;
            var options = settings.options || [];
            if (settings.withDefault) {
                // if options do not already contain an empty value, add one
                if (!options.some(function (option) { return option.value === ''; })) {
                    options.unshift({value: '', label: ' '});
                };
            }
            for (var i = 0; i < options.length; ++i) {
                var option = options[i]
                let value = option.value === null ? '' : option.value;
                let label = option.label === null ? '' : option.label;
                var $option = $(document.createElement('option'))
                    .attr(option.attr || {})
                    .attr('value', value)
                    .text(label)
                ;
                $select.append($option);
            }
            if (multiple || settings.select2) {
                $select.addClass('-js-init-select2');
                if (settings.placeholder) {
                    $select.data('select2-options', {placeholder: settings.placeholder});
                }
            }
            if (settings.value !== null && typeof (settings.value) !== 'undefined') {
                var initial = settings.value;
                if (multiple && !Array.isArray(initial)) {
                    initial = initial.toString().split(settings.separator || ',') || [];
                }
                $select.val(initial);
            }
            if (widget._getCurrentSchema().popup.remoteData && settings.automatic_detection) {
                return this.handle_automatic_detection(settings);
            }
            if (settings.calculateMaxElevationOnChange) {
                $select.change(()=>{
                    return $.ajax({
                        url: widget.elementUrl + 'getMaxElevation',
                        type: 'POST',
                        dataType:    "json",
                        contentType: "application/json; charset=utf-8",
                        data: JSON.stringify({
                            curveseg_id: $select.val(),
                            schema: widget._getCurrentSchema().schemaName,
                            srs: widget.getCurrentSrid()
                        })
                    }).done((res)=>{
                        let dialog = widget.currentPopup;

                        dialog.find("input[name=height_max_curveseg]").val(res.height_max_curveseg);
                        dialog.find("input.-fn-coordinates.x").val(res.x);
                        dialog.find("input.-fn-coordinates.y").val(res.y);
                        dialog.find("input.-fn-coordinates.x").trigger("change");
                        dialog.find("input.-fn-coordinates.y").trigger("change");


                    }).fail(()=>{
                        console.log("Request failed");
                    });
                });
            }
            // Legacy amenities
            $select.data('declaration', settings);
            this.addCustomEvents_($select, settings);
            if (settings.mandatory === true && settings.mandatoryText) {
                $select.data('warn', this.createValidationCallback_(val => {
                    return val != "" && val !== null;
                },$select));

                $select.attr('data-custom-validation-message', settings.mandatoryText || null);
            }
            return this.wrapInput_($select, settings);
        },
        handle_radioGroup_: function (settings) {
            var wrappedRadios = [];
            if (!settings.options || !settings.options.length) {
                console.error('Ignoring item type "radioGroup" with empty "options" list.', settings);
                return $nothing;
            }
            var groupValue = settings.value || '';
            for (var r = 0; r < settings.options.length; ++r) {
                var radio = settings.options[r];
                var disabled = (radio.attr || {}).disabled || radio.disabled || settings.disabled;
                var $radio = $('<input type="radio">')
                    .attr(radio.attr || {})
                    .attr('name', settings.name)
                    .attr('value', radio.value || '')
                    // Browser magic: if multiple radios with same name have "checked" prop,
                    // the last one (in DOM order) will win out
                    .prop('checked', r === 0 || (radio.value || '') === groupValue)
                    .prop('disabled', disabled)
                ;
                /** @see https://getbootstrap.com/docs/3.4/css/#checkboxes-and-radios */
                var $label = $(document.createElement('label'))
                    .text(radio.label)
                    .prepend($radio)
                ;
                if (settings.inline) {
                    wrappedRadios.push($label.addClass('radio-inline'));
                } else {
                    wrappedRadios.push($(document.createElement('div'))
                        .addClass('radio')
                        .append($label)
                    );
                }
            }
            if (settings.inline && (settings.title || settings.text)) {
                wrappedRadios = $(document.createElement('div'))
                    .append(wrappedRadios)
                ;
            }
            return this.wrapInput_(wrappedRadios, settings);
        },
        handle_breakLine_: function (settings) {
            return $(document.createElement('hr'))
                .attr(settings.attr || {})
                .addClass(settings.cssClass || null)
                ;
        },
        handle_coordinates: function (settings) {
            let widget = this.widget;
            let projection, inputX, inputY;
            var mapProjection = widget.mbMap.getModel().getCurrentProjectionCode();
            let previousSRS = null;

            proj4.defs("EPSG:31255","+proj=tmerc +lat_0=0 +lon_0=13.3333333333333 +k=1 +x_0=0 +y_0=-5000000 +ellps=bessel +towgs84=408.0895,-288.9616,791.5498,-4.078662,0.022669,9.825424,94.060626 +units=m +no_defs +type=crs");

            let transform = (x, y, fromSrs, toSrs = mapProjection) => {
                var
                    fromProj = proj4.Proj(fromSrs),
                    toProj = proj4.Proj(toSrs),
                    transformedCoordinates = proj4.transform(fromProj, toProj, [x, y])
                ;
                return {
                    x: transformedCoordinates.x,
                    y: transformedCoordinates.y
                };
            }


            const toDecimal = (value) => {
                if (typeof value !== 'string') {
                    $.notify("Ungültige Eingabe: " + value);
                    return false;
                }

                const numericPattern = /^-?\d+(\.\d+)?$/;
                if (numericPattern.test(value)) {
                    return  Number(value);
                }

                const dmsPattern = /(\d*)\°(\d*)\'([\d.]*)\"?/;
                const match = value.match(dmsPattern);

                if (!match || match.length < 3) {
                    $.notify("Ungültige Eingabe: " + value);
                    return false;
                }

                const [_, degrees, minutes, seconds] = match;
                let decimals = parseFloat(degrees) + parseFloat(minutes / 60);

                if (seconds) {
                    decimals += parseFloat(seconds / 3600);
                }

                return decimals;
            };

            const toDMS = (value) => {
                if (typeof value !== 'number') {
                    $.notify("Ungültige Eingabe: " + value);
                    return false;
                }

                const degrees = Math.floor(value);
                const minutesDecimal = (value - degrees) * 60;
                const minutes = Math.floor(minutesDecimal);
                const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);

                return `${degrees}°${minutes}'${seconds}"`;
            };


            let areCoordinatesValid = (x, y) => {
                var mapExtentArray = widget.mbMap.getModel().getMaxExtentArray();
                return (x >= mapExtentArray[0] && x <= mapExtentArray[2] && y >= mapExtentArray[1] && y <= mapExtentArray[3]);
            };


            let changeInput = function(changedField) {
                let feature = widget.currentPopup.data("feature");

                let rawx = inputX.find("input").val();
                let rawy = inputY.find("input").val();

                let x = toDecimal(rawx);
                let y = toDecimal(rawy);
                let proj = projection.find("select").val();

                if (x && y) {
                    let transformation = transform(x, y, proj);


                    if (!isNaN(transformation.x) && !isNaN(transformation.y) ) {
                        if (!areCoordinatesValid(transformation.x,transformation.y)) {
                            let invalidValue = changedField.find("input").val();
                            $.notify("Koordinate '"+invalidValue+"' ist außerhalb des maximalen Karten-Extent");
                            //changedField.find("input").val("");
                        } else
                        if (!feature.getGeometry()) {
                            feature.setGeometry(new ol.geom.Point([transformation.x, transformation.y]));
                        } else {
                            feature.getGeometry().setCoordinates([transformation.x, transformation.y]);
                        }
                    } else {
                        let invalidValue = changedField.find("input").val();
                        $.notify("Koordinate '"+invalidValue+"' ist nicht gültig");
                        //changedField.find("input").val("");
                    }

                }

            }



            let projectionSettings = {
                title: (settings.title_epsg || 'EPSG')+':',
                type: 'select',
                options: settings.epsgCodes.map((code) => {
                    return {
                        value: code[0],
                        label: code[1]
                    }
                }),
                //value: mapProjection,
                cssClass: '-fn-active-epsgCode',
                disabled: !!settings.disabled,
                focus: function () {
                    previousSRS = this.value;
                },
                change: function (event) {

                    let rawx = inputX.find("input").val();
                    let rawy = inputY.find("input").val();
                    let x = toDecimal(rawx);
                    let y = toDecimal(rawy);

                    let toSrs = projection.find("select").val();

                    let transformation = transform(x, y, previousSRS, toSrs);
                    previousSRS = toSrs;

                    let tx = toSrs == "EPSG:4326" ? toDMS(transformation.x) : transformation.x;
                    let ty = toSrs == "EPSG:4326" ? toDMS(transformation.y) : transformation.y;

                    inputX.find("input").val(tx);
                    inputY.find("input").val(ty);

                }
            };

            let mandatory = function() {

                    let rawx = inputX.find("input").val();
                    let rawy = inputY.find("input").val();
                    let x = toDecimal(rawx);
                    let y = toDecimal(rawy);
                    let proj = projection.find("select").val();
                    let transformation = transform(x, y, proj);;
                return (!isNaN(transformation.x) && !isNaN(transformation.y)
                    && areCoordinatesValid(transformation.x,transformation.y));
            };

            let inputXSettings = {
                type: 'input',
                cssClass : "-fn-coordinates x",
                title: (settings.title_longitude || 'longitude')+':',
                change: () => { changeInput(inputX); },
                mandatory: mandatory,
                mandatoryText: "x-Koordinate muss vorhanden sein, Koordinaten müssen gültig sein"
            }
            let inputYSettings = {
                type: 'input',
                cssClass : "-fn-coordinates y",
                title: (settings.title_latitude || 'latitude')+':',
                change: () => { changeInput(inputY); },
                mandatory: mandatory,
                mandatoryText: "y-Koordinate muss vorhanden sein, Koordinaten müssen gültig sein"

            }

            projection = this.renderElement(projectionSettings);
            inputX = this.renderElement(inputXSettings);
            inputY = this.renderElement(inputYSettings);


            var $container = $(document.createElement('div')).addClass('row reduce-gutters');

            [projection,inputY,inputX].forEach(($input) => {
                let $column = $(document.createElement('div'))
                    .addClass('col-4 col-xs-4')
                    .css({'width':'33.3%'})
                    .append($input);
                ;
                $container.append($column);
            });

            return $container;
        },

        fieldLabel_: function (settings) {
            // Create the label-wrapper div
            var $labelWrapper = $(document.createElement('div'))
                .addClass('label-wrapper');

            // Create the label
            var $label = $(document.createElement('label'))
                .attr({'for': settings.name || null, 'title' : settings.title || settings.text })
                .text(settings.title || settings.text);

            // Adding info text, if available
            if (settings.infoText) {
                var $icon = $('<i/>')
                    .addClass('fa fa-info-circle -visui-infotext')
                    .attr('title', settings.infoText);
                $label.append('&nbsp;', $icon);
            }

            // Adding copy to clipboard functionality, if enabled
            if (settings.copyClipboard) {
                $label.append('&nbsp;', $('<i/>')
                    .addClass('fa fa-clipboard far-clipboard -fn-copytoclipboard')
                    .attr('aria-hidden', 'true')
                );
            }

            // Append the label to the label-wrapper div
            $labelWrapper.append($label);

            // Return the label-wrapper containing the label
            return $labelWrapper;
        },

        wrapInput_: function ($input, settings) {
            var $group = $(document.createElement('div'))
                .addClass(settings.cssClass || '')
                .addClass('form-group')
                .css(settings.css || {})
            ;
            if (settings.title) {
                $group.append(this.fieldLabel_(settings));
            }
            $group.append($input);
            return $group;
        },
        renderFallback_: function (settings) {
            if ((settings.children || []).length) {
                return $(document.createElement('div'))
                    .append(this.renderElements(settings.children))
                    ;
            } else {
                console.error("Don't know how to render item type " + settings.type, settings);
                return $nothing;
            }
        },
        createValidationCallback_: function (expression,$input) {
            // legacy fun fact: string runs through eval, but result of eval can only be used
            // if it happens to have an method named .exec accepting a single parameter
            // => this was never compatible with anything but regex literals
            if (typeof (expression) == 'function') {
                return function (value) {
                    let result = expression.apply($input.get(0),[value]);
                    return result;
                };
            } else
            if (typeof (eval(expression)) == 'function') {
                return function (value) {
                    let result = (eval(expression)).apply($input.get(0),[value]);
                    return result;
                };
            } else
            return (function () {
                var rxp = expressionToRegex(expression);
                return function (value) {
                    return rxp.test(value);
                }
            }());
        },
        addCustomEvents_: function ($input, settings) {
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L123 */
            var names = ['filled', 'change','focus','keyup'].filter(function (name) {
                return settings[name];
            });
            for (var i = 0; i < names.length; ++i) {
                var name = names[i];
                var handler = settings[name];
                $input.addClass('-js-custom-events');
                if (typeof handler !== 'function') {
                    //console.error("Using eval'd Javascript in the configuration is deprecated. Add event handlers to your project code.", settings);
                    handler = (function (code) {
                        var element = $input;
                        var el = element;
                        return function () {
                            eval(code);
                        };
                    })(handler);
                }
                $input.on(name, handler);
            }
        },
        checkExtraSettings_: function (settings, expectedProps, description) {
            var description_ = description || ['type ', '"', settings.type, '"'].join('');
            var other = Object.keys(settings).filter(function (name) {
                return -1 === expectedProps.indexOf(name);
            });
            // if (other.length) {
            //     console.warn(
            //         ["Ignoring extra properties on ", description_, ": ",
            //             other.join(', '),
            //             "; keep ", expectedProps.join(', '),
            //             "; remove everything else"].join(''),
            //         settings);
            // }
        },
        reformRadioGroup_: function (children, parent) {
            var radioItems = children.filter(function (sub) {
                return sub.type === 'radio';
            });

            if (radioItems.length) {
                var filtered = [];
                var labelItems = children.filter(function (sub) {
                    return sub.type === 'label';
                });
                if (labelItems.length) {
                    filtered.push(labelItems[0]);
                }
                var value = radioItems[0].value;
                var name = radioItems[0].name;
                for (var r = 0; r < radioItems.length; ++r) {
                    if (radioItems[r].checked) {
                        value = radioItems[r].value;
                        break;
                    }
                }
                var options = radioItems.map(function (legacyRadio) {
                    if (legacyRadio.name === name) {
                        filtered.push(legacyRadio);
                        return {
                            value: legacyRadio.value,
                            label: legacyRadio.title,
                            disabled: legacyRadio.disabled
                        };
                    } else {
                        return null;
                    }
                }).filter(function (x) {
                    return !!x;
                });

                var replacement = {
                    title: (labelItems[0] || {}).text || (labelItems[0] || {}).title,
                    type: 'radioGroup',
                    name: name,
                    value: value,
                    inline: parent.type === 'inline',
                    disabled: false,
                    options: options,
                    __filtered__: filtered
                };
                console.warn('Detected legacy list of individual "radio" form items. Use a "radioGroup" item instead.', radioItems, replacement);
                return replacement;
            }
        },
        render_resultTable_: function(settings) {
            var $el = $(document.createElement('div'))
                .addClass('-js-rt-container')
                .data('rtOptions', settings)
            ;
            var renderer = new Mapbender.DataManager.RelatedItemTableRenderer($el, settings);
            // Current config / old code always offers a creation interaction.
            // This actually contradicts target DM schema allowCreate = false!
            /**  Auskommentiert, weil Formular anhält beim Speichern /
            var $createButton = $(document.createElement('button'))
                .attr('type', 'button')
                .attr('title', Mapbender.trans('mb.data.store.create'))
                .addClass('btn btn-default -fn-create')
                //.append('<i class="fa fas fa-plus"></i>')
            ;
            $el.append($createButton);
            / ** **/
            $el.append(renderer.render({schemaName: (settings.dataManagerLink || {}).schema || '!!unknown-schema!!'}));
            $el.data('renderer', renderer);
            return $el;
        },
        init_resultTable_: function($rtContainer) {
            /** @var {Mapbender.DataManager.RelatedItemTableRenderer} renderer */
            var renderer =  $rtContainer.data('renderer');
            var rtOptions = $rtContainer.data('rtOptions');
            var parentItemId = $rtContainer.closest('.ui-dialog-content').attr('data-item-id');
            if (!rtOptions.dataManagerLink) {
                console.error("Missing dataManagerLink configuration");
                return;
            }
            var schemaName = rtOptions.dataManagerLink.schema;
            if (parentItemId) {
                    var loadParams = {
                        schema: schemaName,
                        match: {}
                    };
                    loadParams.match[rtOptions.dataManagerLink.fieldName] = parentItemId;
                    this.widget.getJSON('select', loadParams)
                    .then(function(items) {
                        renderer.replaceRows({ schemaName: schemaName },items);
                    });

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
    // * 'checkbox'
    // * 'select'
    // * 'breakLine'
    // * 'radio' (legacy; individual items with repeating properties)
    // * 'radioGroup' (recommended; single item with "options" list, each expecting "label" and "value" props)

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
    // * 'slider' (=mockup, hardcoded [0..10] range; prefer <input type="range">)
    // * 'selectOption'
    // * 'selectOptionList'
}(jQuery));

