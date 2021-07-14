<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;
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

    /**
     * @param mixed[][] $schemaConfigs
     * @return mixed[][]
     */
    public function prepareConfigs($schemaConfigs)
    {
        $storeConfigs = DataStoreUtil::configsFromSchemaConfigs($this->registry, $schemaConfigs);

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

    /**
     * @param Element $element
     * @param string $schemaName
     * @return boolean
     */
    public function checkAllowDelete(Element $element, $schemaName)
    {
        $baseConfig = $this->getRawSchemaConfig($element, $schemaName, true);
        return !empty($baseConfig['allowDelete']);
    }

    /**
     * @param Element $element
     * @param string $schemaName
     * @param boolean $isNew
     * @return boolean
     */
    public function checkAllowSave(Element $element, $schemaName, $isNew)
    {
        $baseConfig = $this->getRawSchemaConfig($element, $schemaName, true);
        if ($isNew || !\array_key_exists('allowCreate', $baseConfig)) {
            // "allowEditData": Digitizer quirk
            return !empty($baseConfig['allowEdit']) || !empty($baseConfig['allowEditData']);
        } else {
            return !empty($baseConfig['allowCreate']);
        }
    }

    /**
     * @param Element $element
     * @param string $schemaName
     * @return mixed[]
     */
    public function getDataStoreConfig(Element $element, $schemaName)
    {
        $elementConfig = $element->getConfiguration();
        $schemaConfigs = $elementConfig['schemes'];
        $storeConfigs = DataStoreUtil::configsFromSchemaConfigs($this->registry, $schemaConfigs);
        return $storeConfigs[$schemaName];
    }

    /**
     * @param Element $element
     * @param string $schemaName
     * @param bool $addDefaults
     * @return mixed[]
     */
    protected function getRawSchemaConfig(Element $element, $schemaName, $addDefaults = false)
    {
        $elementConfig = $element->getConfiguration();
        $rawSchemaConfig = $elementConfig['schemes'][$schemaName];
        if ($addDefaults) {
            $rawSchemaConfig += $this->getConfigDefaults();
        }
        return $rawSchemaConfig;
    }
}
