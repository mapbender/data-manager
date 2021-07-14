<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataSourceBundle\Component\DataStore;
use Mapbender\DataSourceBundle\Component\DataStoreService;
use Mapbender\DataSourceBundle\Component\FeatureTypeService;

/**
 * Collection of static methods to deal with DataStoreService /
 * FeatureType service configs, and config / API discrepancies.
 */
class DataStoreUtil
{
    /**
     * @param DataStoreService $registry
     * @return mixed[][]
     */
    public static function getGlobalConfigs(DataStoreService $registry)
    {
        if ($registry instanceof FeatureTypeService) {
            /** @todo data-source: use the same method name! */
            return $registry->getFeatureTypeDeclarations() ?: array();
        } else {
            return $registry->getDataStoreDeclarations() ?: array();
        }
    }

    /**
     * @param array $config
     * @param DataStoreService|null $registry
     * @return DataStore
     */
    public static function storeFromConfig(DataStoreService $registry, array $config)
    {
        if ($registry instanceof FeatureTypeService) {
            /** @todo data-source: use the same method name! */
            return $registry->featureTypeFactory($config);
        } else {
            return $registry->dataStoreFactory($config);
        }
    }

    /**
     * Merges and reference-expands all dataStore / featureType configs
     * from DataStoreService global config plus passed-in schema configs.
     *
     * @param DataStoreService $registry
     * @param array $schemaConfigs
     * @return mixed[][]
     * @throws ConfigurationErrorException
     */
    public static function configsFromSchemaConfigs(DataStoreService $registry, array $schemaConfigs)
    {
        $merged = $globalConfigs = static::getGlobalConfigs($registry);
        foreach ($schemaConfigs as $schemaName => $schemaConfig) {
            foreach (array('dataStore', 'featureType') as $dsKey) {
                if (!empty($schemaConfig[$dsKey])) {
                    $merged[$schemaName] = $schemaConfig[$dsKey];
                }
            }
        }
        $merged = static::resolveConfigReferences($merged);
        static::checkConfigs($merged);
        return $merged;
    }

    /**
     * @param mixed[] $storeConfigs
     * @return mixed[][]
     * @throws ConfigurationErrorException
     */
    public static function resolveConfigReferences(array $storeConfigs)
    {
        foreach ($storeConfigs as $schemaName => $storeConfig) {
            $visited = array();
            while (\is_string($storeConfig)) {
                if (empty($storeConfigs[$storeConfig])) {
                    throw new ConfigurationErrorException("Undefined dataStore / featureType reference in schema {$schemaName}: {$storeConfig}");
                }
                $isCyclic = \in_array($storeConfig, $visited);
                $visited[] = $storeConfig;
                if ($isCyclic) {
                    throw new ConfigurationErrorException("Circular dataStore / featureType reference in schema {$schemaName}: " . implode(' => ', $visited));
                }
                $storeConfigs[$schemaName] = $storeConfig = $storeConfigs[$storeConfig];
            }
        }
        return $storeConfigs;
    }

    /**
     * @param mixed[][] $storeConfigs
     * @throws ConfigurationErrorException
     */
    public static function checkConfigs(array $storeConfigs)
    {
        foreach ($storeConfigs as $schemaName => $storeConfig) {
            if (!\is_array($storeConfig)) {
                $t = \is_object($storeConfig) ? \get_class($storeConfig) : \gettype($storeConfig);
                throw new ConfigurationErrorException("Invalid dataStore / featureType configuration type {$t} in schema {$schemaName}; must be array or string");
            }
            if (empty($storeConfig)) {
                throw new ConfigurationErrorException("Empty dataStore / featureType in schema {$schemaName}");
            }
        }
    }
}
