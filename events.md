# Client-side events
All events are triggered on the element node, bubbling up to `document`.  
Events may contain some more data than listed here for legacy / BC reasons. Only event
data properties listed here should be relied upon.

## `data.manager.item.saved`
Contains item data and schema configuration as objects. Contains originalId (before saving) to help distinguishing new
items from updated items. Sent after the item has already been persisted on the server.

|data key|type|description|
|---|---|---|
|item|Object|full data item|
|itemId|String|(new) identifier for item|
|originalId|String or null|identifier for item before saving; null on newly created item|
|schemaName|String|identifier of schema the item belongs to|
|schema|Object|full schema configuration|
|originator|Object|jQueryUI widget instance that produced the event|

## `data.manager.item.deleted`
|data key|type|description|
|---|---|---|
|item|Object|full data item|
|itemId|String|previous identifier for item|
|schemaName|String|identifier of schema the item belongs to|
|schema|Object|full schema configuration|
|originator|Object|jQueryUI widget instance that produced the event|
