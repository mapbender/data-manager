<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataSourceBundle\Component\DataStore;
use Mapbender\DataSourceBundle\Component\DataStoreService;
use Mapbender\DataSourceBundle\Component\FeatureTypeService;
use Symfony\Component\Filesystem\Filesystem;

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

    /**
     * @param array $storeConfig
     * @return array keys = "field" entries
     * @throws ConfigurationErrorException
     */
    public static function getFileConfigOverrides(array $storeConfig)
    {
        $overrides = array();
        if (\array_key_exists('files', $storeConfig)) {
            $filesConfigs = $storeConfig['files'];
            if (!\is_array($filesConfigs)) {
                throw new ConfigurationErrorException("DataStore / FeatureType 'files' setting must be an array (value: " . var_export($filesConfigs, true) . ")");
            }
            foreach ($filesConfigs as $filesConfig) {
                if (empty($filesConfig['field']) || !\is_string($filesConfig['field'])) {
                    throw new ConfigurationErrorException("DataStore / FeatureType 'files' settings must contain a string-type 'field' entry");
                }
                $uri = !empty($filesConfig['uri']) ? ($filesConfig['uri'] ?: null) : null;
                $path = !empty($filesConfig['path']) ? ($filesConfig['path'] ?: null) : null;
                $fs = new Filesystem();
                if ($path) {
                    if ($fs->isAbsolutePath($path) || preg_match('#^(\.\.)?/#', $path)) {
                        throw new ConfigurationErrorException("DataStore / FeatureType 'files' 'path' setting be web-relative");
                    }
                }
                if ($uri) {
                    if ($fs->isAbsolutePath($uri) || preg_match('#^(\.\.)?/#', $path)) {
                        throw new ConfigurationErrorException("DataStore / FeatureType 'files' 'uri' setting be web-relative");
                    }
                }
                if ($uri && $path && $uri !== $path) {
                    throw new ConfigurationErrorException("Ambiguous DataStore / FeatureType 'files' settings 'uri' and 'path'. Remove 'uri'.");
                }
                unset($filesConfig['uri']);
                $filesConfig['path'] = $path ?: $uri ?: null;
                $overrides[$filesConfig['field']] = $filesConfig;
            }
        }
        return $overrides;
    }

    /**
     * @param DataStoreService $registry
     * @param mixed[] $storeConfig
     * @param string $basePath
     * @param string $fieldName
     * @return string
     */
    public static function getUploadPath(DataStoreService $registry, $storeConfig, $basePath, $fieldName)
    {
        $overrides = DataStoreUtil::getFileConfigOverrides($storeConfig);
        if (!empty($overrides[$fieldName]['path'])) {
            return $overrides[$fieldName]['path'];
        } else {
            if ($registry instanceof FeatureTypeService) {
                $path = 'featureTypes';
            } else {
                $path = 'ds-uploads';
            }
            if (!empty($basePath)) {
                $path = "{$basePath}/{$path}";
            }
            if (!empty($storeConfig['table'])) {
                $path = "{$path}/{$storeConfig['table']}";
            }
            if (!empty($fieldName)) {
                $path = "{$path}/{$fieldName}";
            }
            return $path;
        }
    }
}
