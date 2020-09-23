!(function () {
    "use strict";
    Mapbender.DataManager = Mapbender.DataManager || {};
    /**
     * @param {*} owner owning DataManager (jQueryUI widget instance)
     * @constructor
     */
    Mapbender.DataManager.TableRenderer = function TableRenderer(owner) {
        this.owner = owner;
    }

    Object.assign(Mapbender.DataManager.TableRenderer.prototype, {
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {jQuery}
         */
        render: function(schema) {
            /** @todo: remove owner inflection to _getTableSettings */
            var settings = this.owner._getTableSettings(schema);
            var $tableWrap = $("<div/>").resultTable(settings);
            $tableWrap.attr('data-schema-name', schema.schemaName);
            return $tableWrap;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {Array<Object>} data
         * @param {*} [scope] (for limiting jQuery find)
         */
        replaceRows: function(schema, data, scope) {
            var dt = this.getDatatablesInstance_(schema, scope || undefined);
            dt.clear();
            dt.rows.add(data);
            dt.draw();
        },
        /**
         * Get table DOM Element for schema. Must be in current document.
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {*} [scope] (for limiting jQuery find)
         * @return {Element|null}
         */
        findElement: function(schema, scope) {
            var scope_ = scope || this.owner.element;
            // NOTE: Class mapbender-element-result-table added implicitly by vis-ui resultTable
            //       data-schema-name added by us (see render)
            var $tableWrap = $('.mapbender-element-result-table[data-schema-name="' + schema.schemaName + '"]', scope_);
            return $tableWrap.get(0) || null;
        },
        /**
         * Get native dataTables instance for schema. Must be in current document.
         * @param {DataManagerSchemaConfig} schema
         * @param {*} [scope] (for limiting jQuery find)
         * @return {Element|null}
         * @private
         */
        getDatatablesInstance_: function(schema, scope) {
            var element = this.findElement(schema, scope || undefined);
            if (!element) {
                throw new Error("Cannot access dataTables instance for schema " + schema.schemaName + ". Table not in DOM?")
            }
            // get instance from wrapping vis-ui widget
            return $(element).resultTable('getApi');
        },
        /**
         * Returns options used to initialize resultTable widget.
         * @param {DataManagerSchemaConfig} schema
         * @return {Object}
         */
        getOptions: function(schema) {
            var settings = _.extend({
                lengthChange: false,
                pageLength:   20,
                searching:    true,
                info:         true,
                processing:   false,
                ordering:     true,
                paging:       true,
                selectable:   false,
                oLanguage: this.getOLanguageOption(schema),
                autoWidth:    false
            }, schema.table);
            /** @todo: remove owner inflection to _buildTableRowButtons */
            settings.buttons = this.owner._buildTableRowButtons(schema);
            /** @todo: remove owner inflection to _getTableColumnsConfiguration */
            settings.columns = this.owner._buildTableColumnsOptions(schema);
            settings.createdRow = function(tr, data) {
                $(tr).data({
                    item: data,
                    schema: schema
                });
            };
            return settings;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {Array<Object>}
         */
        getButtonsOption: function(schema) {
            var buttons = [];
            // NOTE: "edit" interaction is always added even with "allowEdit" schema config false. Without "allowEdit",
            //       the dialog will not have a save button, but it will still function as an attribute data viewer.
            buttons.push({
                title: Mapbender.trans('mb.data.store.edit'),
                cssClass: 'fa fa-edit -fn-edit-data'
            });

            if (schema.allowDelete) {
                buttons.push({
                    title: Mapbender.trans('mb.data.store.remove'),
                    cssClass: 'critical fa fa-times -fn-delete'
                });
            }
            if ((schema.table || {}).buttons) {
                // why flatten...?
                // how exactly can the table configuration define row buttons?
                return _.flatten(buttons, schema.table.buttons);
            } else {
                return buttons;
            }
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {Array<Object>}
         * @see https://datatables.net/reference/option/columns
         */
        getColumnsOption: function(schema) {
            /** @todo: remove owner inflection to _getTableColumnsConfiguration */
            var columnConfigs = this.owner._getTableColumnsConfiguration(schema);
            var escapeHtml = this.escapeHtml;
            var self = this;
            return (columnConfigs).map(function(fieldSettings) {
                return $.extend({}, fieldSettings, {
                    fieldName: fieldSettings.data,  // why?
                    render: function(data, type, row) {
                        var rowData = self.owner._getItemData(schema, row);
                        switch (type) {
                            case 'sort':
                            case 'type':
                            default:
                                return rowData[fieldSettings.data];
                            case 'filter':
                                return ('' + rowData[fieldSettings.data]) || undefined;
                            case 'display':
                                return escapeHtml('' + rowData[fieldSettings.data]);
                        }
                    }
                });
            });
        },
        getColumnsConfigs: function(schema) {
            return (schema.table || {}).columns || [];
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {*}
         */
        getOLanguageOption: function(schema) {
            // @todo Digitizer: per-schema text customization...? (seen in 1.4, unsure since when)
            return this.owner.options.tableTranslation || {};
        },
        /**
         * Utility method to escape HTML chars
         * @param {String} text
         * @returns {string}
         * @static
         * @todo: eliminate duplicated code (extra utility namespace?)
         */
        escapeHtml: function escapeHtml(text) {
            'use strict';
            return text.replace(/["&'\/<>]/g, function (a) {
                return {
                    '"': '&quot;', '&': '&amp;', "'": '&#39;',
                    '/': '&#47;',  '<': '&lt;',  '>': '&gt;'
                }[a];
            });
        }
    });
})();
