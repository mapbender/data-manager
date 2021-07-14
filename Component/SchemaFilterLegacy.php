<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\DataSourceBundle\Component\DataStoreService;

class SchemaFilterLegacy extends SchemaFilter
{
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
