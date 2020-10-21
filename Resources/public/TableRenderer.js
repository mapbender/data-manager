!(function () {
    "use strict";
    Mapbender.DataManager = Mapbender.DataManager || {};
    /**
     * @param {*} owner owning DataManager (jQueryUI widget instance)
     * @param {Element|jQuery} [scope]
     * @constructor
     */
    Mapbender.DataManager.TableRenderer = function TableRenderer(owner, scope) {
        this.owner = owner;
        this.scope = scope || owner.element.get(0);
    }

    Object.assign(Mapbender.DataManager.TableRenderer.prototype, {
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {jQuery}
         */
        render: function(schema) {
            /** @todo 1.1: remove owner inflection to _getTableSettings */
            var settings = this.owner._getTableSettings(schema);
            var $tableWrap = $("<div/>").resultTable(settings);
            $tableWrap.attr('data-schema-name', schema.schemaName);
            return $tableWrap;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {Array<Object>} data
         */
        replaceRows: function(schema, data) {
            var dt = this.getDatatablesInstance_(schema);
            dt.clear();
            dt.rows.add(data);
            dt.draw();
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} item
         * @param {Boolean} show to automatically update pagination
         */
        addRow: function(schema, item, show) {
            var dt = this.getDatatablesInstance_(schema);
            var tr = dt.row.add(item).node();
            if (show) {
                this.showRow(schema, tr);
            }
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @param {Object} item
         * @param {Boolean} show to automatically update pagination
         */
        refreshRow: function(schema, item, show) {
            var dt = this.getDatatablesInstance_(schema);
            var dtRow = dt.row(function(_, data) {
                return data === item;
            });
            dtRow.data(item);
            if (show) {
                this.showRow(schema, dtRow.node());
            }
        },
        /**
         * Switch pagination so the given tr element is on the current page
         *
         * @param {DataManagerSchemaConfig} schema
         * @param {Element} tr
         */
        showRow: function(schema, tr) {
            var dt = this.getDatatablesInstance_(schema);
            // NOTE: current dataTables versions could just do dt.row(tr).show().draw(false)
            var rowIndex = dt.rows({order: 'current'}).nodes().indexOf(tr);
            var pageLength = dt.page.len();
            var rowPage = Math.floor(rowIndex / pageLength);
            dt.page(rowPage);
            dt.draw(false);
        },
        /**
         * Get table DOM Element for schema. Must be in current document.
         *
         * @param {DataManagerSchemaConfig} schema
         * @return {Element|null}
         */
        findElement: function(schema) {
            // NOTE: Class mapbender-element-result-table added implicitly by vis-ui resultTable
            //       data-schema-name added by us (see render)
            var $tableWrap = $('.mapbender-element-result-table[data-schema-name="' + schema.schemaName + '"]', this.scope);
            return $tableWrap.get(0) || null;
        },
        /**
         * Get native dataTables instance for schema. Must be in current document.
         * @param {DataManagerSchemaConfig} schema
         * @return {Element|null}
         * @private
         */
        getDatatablesInstance_: function(schema) {
            var element = this.findElement(schema);
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
            var settings = {
                lengthChange: false,
                pageLength: schema.table.pageLength,
                searching: schema.table.searching,
                info:         true,
                processing:   false,
                ordering:     true,
                paging:       true,
                selectable:   false,
                oLanguage: this.getOLanguageOption(schema),
                autoWidth:    false
            };
            /** @todo 1.1: remove owner inflection to _buildTableRowButtons */
            settings.buttons = this.owner._buildTableRowButtons(schema);
            /** @todo 1.1: remove owner inflection to _getTableColumnsConfiguration */
            settings.columns = this.owner._buildTableColumnsOptions(schema);
            settings.createdRow = this.onRowCreation.bind(this, schema);
            return settings;
        },
        onRowCreation: function(schema, tr, dataItem) {
            $(tr).data({
                item: dataItem,
                schema: schema
            });
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
            return buttons;
        },
        /**
         * @param {DataManagerSchemaConfig} schema
         * @return {Array<Object>}
         * @see https://datatables.net/reference/option/columns
         */
        getColumnsOption: function(schema) {
            /** @todo 1.1: remove owner inflection to _getTableColumnsConfiguration */
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
            return {
                // @see https://legacy.datatables.net/usage/i18n
                sSearch: Mapbender.trans('mb.data-manager.table.filter') + ':',
                sEmptyTable: Mapbender.trans('mb.data-manager.table.empty'),
                sZeroRecords: Mapbender.trans('mb.data-manager.table.empty_after_filtering'),
                sInfoEmpty: Mapbender.trans('mb.data-manager.table.empty'),
                sInfo: Mapbender.trans('mb.data-manager.table.from_to_total'),
                sInfoFiltered: Mapbender.trans('mb.data-manager.table.out_of')
            };
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
