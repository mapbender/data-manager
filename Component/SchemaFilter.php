<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataSourceBundle\Component\DataStoreService;
use Mapbender\DataSourceBundle\Component\FeatureTypeService;

class SchemaFilter
{
    /** @var DataStoreService */
    protected $registry;
    /** @var FormItemFilter */
    protected $formItemFilter;

    public function __construct(DataStoreService $registry,
                                FormItemFilter $formItemFilter)
    {
        $this->registry = $registry;
        $this->formItemFilter = $formItemFilter;
    }

    /**
     * @return mixed[]
     */
    public static function getConfigDefaults()
    {
        return array(
            'allowEdit' => false,
            'allowRefresh' => false,
            'allowCreate' => true,
            'allowDelete' => true,
            'maxResults' => 5000,
            'popup' => array(
                'width' => '550px',
            ),
            'table' => array(
                'searching' => true,
                'pageLength' => 16,
            ),
        );
    }

    /**
     * @param mixed[] $config
     * @param DataStoreService|null $registry
     * @return mixed[]
     */
    public function prepareConfig($config, $registry = null)
    {
        if (isset($config['formItems'])) {
            $config['formItems'] = $this->formItemFilter->prepareItems($config['formItems'] ?: array());
        }
        $config = $this->resolveDatastoreReferences($config, $registry);
        return $config;
    }

    /**
     * @param mixed[] $schemaConfig
     * @param DataStoreService|null $registry
     * @param string|null $errorName
     * @return mixed[]
     */
    public function resolveDataStoreReferences(array $schemaConfig, $registry = null, $errorName = null)
    {
        $schemaMsg = $errorName ? " in schema " . print_r($errorName, true) : '';
        $validDs = false;
        foreach (array('dataStore', 'featureType') as $dsKey) {
            if (!empty($schemaConfig[$dsKey])) {
                $validDs = true;
                if (\is_string($schemaConfig[$dsKey])) {
                    $registry = $registry ?: $this->registry;
                    if ($registry instanceof FeatureTypeService) {
                        /** @todo data-source: use the same method name! */
                        $storeConfigs = $registry->getFeatureTypeDeclarations();
                    } else {
                        $storeConfigs = $registry->getDataStoreDeclarations();
                    }
                    $schemaConfig[$dsKey] = $storeConfigs[$schemaConfig[$dsKey]];
                } elseif (!\is_array($schemaConfig[$dsKey])) {
                    throw new ConfigurationErrorException("Invalid dataStore setting{$schemaMsg}: " . var_export(array($dsKey => $schemaConfig[$dsKey]), true));
                }
            }
        }
        if (!$validDs) {
            throw new ConfigurationErrorException("Missing dataStore configuration" . ($errorName ? "for schema " . print_r($errorName, true) : ''));
        }
        return $schemaConfig;
    }
}
