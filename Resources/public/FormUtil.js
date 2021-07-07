!(function ($) {
    "use strict";
    /** @external jQuery */

    window.Mapbender = Mapbender || {};
    Mapbender.DataManager = Mapbender.DataManager || {};

    Mapbender.DataManager.FormUtil = {
        /**
         * @param {(HTMLElement|jQuery)} form
         * @return {Object}
         */
        extractValues: function(form) {
            var values = {};
            var radioMap = {};
            var $allNamedInputs = $(':input[name]', form);
            $allNamedInputs.get().forEach(function(input) {
                var type = input.type;
                var value;
                switch (type) {
                    case 'radio':
                        // Radio inputs repeat with the same name. Do not evaluate them individually. Evaluate the
                        // whole group.
                        if (radioMap[input.name]) {
                            // already done
                            return;
                        }
                        value = $allNamedInputs.filter('[type="radio"][name="' + input.name + '"]:checked').val();
                        radioMap[input.name] = true;
                        break;
                    case 'checkbox':
                        value = input.checked && input.value;
                        break;
                    case 'select-multiple':
                        var separator = $(input).attr('data-visui-multiselect-separator') || ',';
                        /** @var {Array<String>|null} valueList */
                        var valueList = $(input).val();
                        value = valueList && valueList.join(separator) || null;
                        break;
                    default:
                        value = input.value;
                        break;
                }
                values[input.name] = value;
            });
            return values;
        },
        /**
         * @param {(HTMLElement|jQuery)} form
         * @param {Object} values
         * @private
         */
        setValues: function(form, values) {
            var valueKeys = Object.keys(values);
            for (var i = 0; i < valueKeys.length; ++i) {
                var inputName = valueKeys[i];
                var value = values[inputName];
                var $input = $(':input[name="' + inputName + '"]', form);
                if (!$input.length) {
                    continue;
                }
                switch ($input.get(0).type) {
                    case 'select-multiple':
                        if (!Array.isArray(value)) {
                            var separator = $input.attr('data-visui-multiselect-separator') || ',';
                            value = (value || '').split(separator);
                        }
                        $input.val(value);
                        break;
                    case 'radio':
                        var $check = $input.filter(function() {
                            return this.value === value;
                        });
                        $check.prop('checked', true);
                        break;
                    case 'checkbox':
                        // Legacy fun time: database may contain stringified booleans "false" or even "off"
                        value = !!value && (value !== 'false') && (value !== 'off');
                        $input.prop('checked', value);
                        break;
                    default:
                        $input.val(value);
                        break;
                }
                switch ($input.get(0).type) {
                    case 'text':
                        $input.trigger('input.colorpicker').trigger('change.colorpicker');
                        break;
                    case 'select':
                    case 'select-multiple':
                        $input.trigger('change.select2');
                        break;

                    default:
                        break;
                }
            }
        },
        updateImages: function(form, values, fileConfigs) {
            var dataImages = $('img[data-preview-for]', form).get();
            for (var i = 0; i < dataImages.length; ++i) {
                var $img = $(dataImages[i]);
                var dataProp = $img.attr('data-preview-for');
                var fileConfig = fileConfigs.filter(function(x) {
                    return x.field === dataProp;
                })[0];

                var value = values[dataProp];
                if (typeof value !== 'undefined') {
                    if (!/^(http[s]?)?:?\/\//.test(value || '')) {
                        if (fileConfig && fileConfig.uri) {
                            value = [fileConfig.uri, value].join('/');
                        }
                        $img.attr('src', Mapbender.configuration.application.urls.asset + value);
                    } else {
                        $img.attr('src', value || '');
                    }
                }
            }
        },
        /**
         * @param {(HTMLElement|jQuery)} form
         * @return {boolean}
         */
        validateForm: function(form) {
            var self = this;
            var invalidInputs = $(':input[name]', form).get().filter(function(input) {
                return !self.validateInput(input);
            });
            // If there are erros, switch tab container (if any) to reveal the first affected input
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/utils/fn.formData.js#L166 */
            var $firstInvalid = invalidInputs.length && $(invalidInputs[0]);
            var $tabElement = $firstInvalid && $firstInvalid.closest('.ui-tabs');
            if ($tabElement && $tabElement.length) {
                var tabIndex = $firstInvalid.closest('.ui-tabs-panel').index('.ui-tabs-panel');
                $tabElement.tabs({active: tabIndex});
            }
            if ($firstInvalid) {
                $firstInvalid.focus();
            }
            return !invalidInputs.length;
        },
        /**
         * @param {HTMLElement} input
         * @return {boolean}
         * @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/utils/fn.formData.js#L13
         */
        validateInput: function(input) {
            var $input = $(input);
            if ($input.attr('type') === 'radio') {
                // Individual radio buttons cannot be invalid and cannot be validated
                return true;
            }
            // NOTE: hidden inputs must be explicitly excluded from jQuery validation
            //       see https://stackoverflow.com/questions/51534473/jquery-validate-not-working-on-hidden-input
            var isValid =
                ($input.is(':valid') || $input.get(0).type === 'hidden')
                && this.validateCustom_($input)
            ;
            this.markValidationState($input, isValid);
            if (!isValid) {
                var self = this;
                // Re-validate once on change, to make error message disappear
                $input.one('change', function() {
                    self.validateInput(input);
                });
            }
            return isValid;
        },
        markValidationState: function($input, isValid) {
            var $formGroup = $input.closest('.form-group');
            $formGroup.toggleClass('has-error', !isValid);
            $formGroup.toggleClass('has-success', isValid);
            /** @todo: ensure message container is always present in the right place */
            var $messageContainer = $('.invalid-feedback', $formGroup);
            var invalidMessage = $input.attr('data-custom-validation-message');
            if (!isValid && invalidMessage && $input.attr('type') !== 'checkbox') {
                if (!$messageContainer.length) {
                    $messageContainer = $(document.createElement('div')).addClass('help-block invalid-feedback');
                    $formGroup.append($messageContainer);
                }
                $messageContainer.text(invalidMessage || '');
            }
            $messageContainer.toggle(!isValid);
            // .has-warning is set initially to required inputs but its styling conflicts with .has-error / .has-success.
            // After validation, we always either .has-error or .has-success, so .has-warning needs to go
            /** @todo: remove has-warning from rendered form groups; use standard required hinting (in label) instead */
            $formGroup.removeClass('has-warning');
        },
        copyToClipboard: function($input) {
            var text = $input.val() || '';
            if (text && Array.isArray(text)) {
                // select[multple]
                var separator = $input.attr('data-visui-multiselect-separator') || ',';
                /** @var {Array<String>|null} valueList */
                text = text.join(separator) || '';
            }
            /** @see https://github.com/mapbender/vis-ui.js/blob/0.2.84/src/js/jquery.form.generator.js#L157 */
            if (window.clipboardData && window.clipboardData.setData) {
                /** @see https://caniuse.com/mdn-api_clipboardevent_clipboarddata */
                return clipboardData.setData("Text", text);
            } else {
                var textarea = document.createElement("textarea");
                textarea.textContent = text;
                textarea.style.position = "fixed";  // Prevent scrolling to bottom of page in MS Edge.
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    return document.execCommand("copy");  // Security exception may be thrown by some browsers.
                } catch (ex) {
                    console.warn("Copy to clipboard failed.", ex);
                    return false;
                } finally {
                    document.body.removeChild(textarea);
                }
            }
        },
        /**
         * @param {jQuery} $input
         * @return {boolean}
         * @private
         */
        validateCustom_: function($input) {
            /** @todo: use a more reasonable data key than "warn" */
            var validationCallback = $input.data('warn');
            if (validationCallback) {
                var value = $input.val();
                // Legacy quirk: pass null instead of empty string to validation callback
                if (value === '') {
                    return !!validationCallback(null);
                } else {
                    return !!validationCallback(value);
                }
            } else {
                return true;
            }
        }
    };

}(jQuery));

