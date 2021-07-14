<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\DataSourceBundle\Component\DataStoreService;

class SchemaFilterLegacy extends SchemaFilter
{
    public function checkAllowSaveInConfig($schemaConfig, $isNew)
    {
        if ($isNew) {
            return !empty($schemaConfig['allowCreate']);
        } else {
            return !empty($schemaConfig['allowEdit']);
        }
    }

    /**
     * @param mixed[][] $schemaConfigs
     * @param DataStoreService|null $registry
     * @return mixed[][]
     */
    public function prepareConfigs($schemaConfigs, DataStoreService $registry = null)
    {
        $registryBefore = $this->registry;
        $this->registry = $registry ?: $this->registry;
        $rv = parent::prepareConfigs($schemaConfigs);
        $this->registry = $registryBefore;
        return $rv;
    }
}
