;!(function() {

    var parent = Mapbender.DataManager.TableRenderer;

    Mapbender.DataManager.RelatedItemTableRenderer = function($container, rtOptions) {
        this.rtOptions = rtOptions;
        var fakeOwner = {
            element: $container,
            __dummy__: null
        }
        parent.apply(this, [fakeOwner, null]);
    };
    Mapbender.DataManager.RelatedItemTableRenderer.prototype = Object.create(parent.prototype);
    Object.assign(Mapbender.DataManager.RelatedItemTableRenderer.prototype, {
        constructor: Mapbender.DataManager.RelatedItemTableRenderer,
        initializeEditEvents: function($scope, dataManager, schemaName, parentItemId) {
            var self = this;
            $scope.on('click', '.-fn-edit', function() {
                var item = $(this).closest('tr').data('item');
                var schema = dataManager.getItemSchema(item);
                var otherDialog = dataManager._openEditDialog(schema, item);
                self.trackRelatedDialog_($scope, otherDialog);
            });
            $scope.on('click', '.-fn-create', function() {
                var item = {
                    id: null,
                    schemaName: schemaName,
                    properties: {}
                };
                item.properties[self.rtOptions.dataManagerLink.fieldName] = parentItemId;
                var schema = dataManager.getItemSchema(item);
                var otherDialog = dataManager._openEditDialog(schema, item);
                self.trackRelatedDialog_($scope, otherDialog);
            });
        },
        trackRelatedDialog_: function($scope, dialog) {
            var $mainDialog = $scope.closest('.ui-dialog-content');
            var dlgCollection = $mainDialog.data('relatedDialogs') || [];
            dlgCollection.push(dialog);
            $mainDialog.data('relatedDialogs', dlgCollection);
        },
        getOptions: function(schema) {
            var self = this;
            function getDataFn(propertyName) {
                return function(item) {
                    return item.properties[propertyName];
                };
            }
            var columnsOptions = this.rtOptions.columns.map(function(columnOption) {
                return {
                    title: columnOption.title,
                    data: getDataFn(columnOption.data),
                    render: self.defaultColumnRenderFn_
                };
            });
            if (this.rtOptions.editable) {
                columnsOptions.push({
                    targets: -1,
                    width: '1%',
                    orderable: false,
                    searchable: false,
                    className: 'interface no-clip',
                    defaultContent: [
                        '<button type="button" class="btn btn-xs -fn-edit"',
                        ' title="', Mapbender.trans('mb.actions.edit'), '"',
                        '>',
                        '<i class="fa fa-edit"></i>',
                        '</button>'
                    ].join('')
                });
            }
            return {
                columns: columnsOptions,
                pageLength: this.rtOptions.pageLength || 10,
                lengthChange: false,
                searching: false,
                autoWidth: false,
                processing: false,
                ordering: true,
                oLanguage: this.getOLanguageOption(null),
                createdRow: function(tr, item) {
                    $(tr).data('item', item)
                }
            };
        },
        __dummy__: null
    });
}());
