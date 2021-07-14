<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataSourceBundle\Component\DataStoreService;

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

    public function prepareConfigs($schemaConfigs, DataStoreService $registry = null)
    {
        $registry = $registry ?: $this->registry;
        $storeConfigs = DataStoreUtil::configsFromSchemaConfigs($registry, $schemaConfigs);

        foreach ($schemaConfigs as $schemaName => $schemaConfig) {
            $haveDs = false;
            foreach (array('dataStore', 'featureType') as $dsKey) {
                if (\array_key_exists($dsKey, $schemaConfig)) {
                    $schemaConfig[$dsKey] = $storeConfigs[$schemaName];
                    $haveDs = true;
                }
            }
            if (!$haveDs) {
                throw new ConfigurationErrorException("No dataStore / featureType in schema {$schemaName}");
            }
            if (!empty($schemaConfig['formItems'])) {
                $schemaConfig['formItems'] = $this->formItemFilter->prepareItems($schemaConfig['formItems']);
            } else {
                @trigger_error("WARNING: no formItems in schema {$schemaName}. Object detail view will not work", E_USER_DEPRECATED);
                $schemaConfig['formItems'] = array();
            }
            $schemaConfigs[$schemaName] = $schemaConfig;
        }
        return $schemaConfigs;
    }
}
