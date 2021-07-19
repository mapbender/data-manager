<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;
use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataSourceBundle\Component\DataStore;
use Mapbender\DataSourceBundle\Component\DataStoreService;

class SchemaFilter
{
    /** @var DataStoreService */
    protected $registry;
    /** @var FormItemFilter */
    protected $formItemFilter;
    /** @var string */
    protected $uploadsBasePath;

    /**
     * @param DataStoreService $registry
     * @param FormItemFilter $formItemFilter
     * @param string $uploadsBasePath
     */
    public function __construct(DataStoreService $registry,
                                FormItemFilter $formItemFilter,
                                $uploadsBasePath)
    {
        $this->registry = $registry;
        $this->formItemFilter = $formItemFilter;
        $this->uploadsBasePath = trim($uploadsBasePath, '/\\');
    }

    /**
     * @return mixed[]
     */
    public static function getConfigDefaults()
    {
        return array(
            'allowEdit' => true,
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
        $schemaConfig = $this->getRawSchemaConfig($element, $schemaName, true);
        return $this->checkAllowDeleteInternal($schemaConfig);
    }

    /**
     * @param array $schemaConfig
     * @return boolean
     */
    protected function checkAllowDeleteInternal(array $schemaConfig)
    {
        return !empty($schemaConfig['allowDelete']);
    }

    /**
     * @param Element $element
     * @param string $schemaName
     * @param boolean $isNew
     * @return boolean
     */
    public function checkAllowSave(Element $element, $schemaName, $isNew)
    {
        $schemaConfig = $this->getRawSchemaConfig($element, $schemaName, true);
        return $this->checkAllowSaveInternal($schemaConfig, $isNew);
    }

    /**
     * @param array $schemaConfig
     * @param boolean $isNew
     * @return boolean
     */
    protected function checkAllowSaveInternal(array $schemaConfig, $isNew)
    {
        if (!$isNew || !\array_key_exists('allowCreate', $schemaConfig)) {
            // "allowEditData": Digitizer quirk
            return !empty($schemaConfig['allowEdit']) || !empty($schemaConfig['allowEditData']);
        } else {
            return !empty($schemaConfig['allowCreate']);
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
     * @return DataStore
     */
    public function getDataStore(Element $element, $schemaName)
    {
        $config = $this->getDataStoreConfig($element, $schemaName);
        return DataStoreUtil::storeFromConfig($this->registry, $config);
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

    /**
     * Returns web-relative path to file uploads.
     *
     * @param Element $element
     * @param string $schemaName
     * @param string $fieldName
     * @return mixed|string
     */
    public function getUploadPath(Element $element, $schemaName, $fieldName)
    {
        $storeConfig = $this->getDataStoreConfig($element, $schemaName);
        return DataStoreUtil::getUploadPath($this->registry, $storeConfig, $this->uploadsBasePath, $fieldName);
    }
}
