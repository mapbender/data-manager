<?php

namespace Mapbender\DataManagerBundle\Element;

use Mapbender\DataManagerBundle\Component\Uploader;
use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataManagerBundle\Exception\UnknownSchemaException;
use Mapbender\DataSourceBundle\Component\DataStore;
use Mapbender\DataSourceBundle\Element\BaseElement;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Translation\TranslatorInterface;

/**
 * @author  Andriy Oblivantsev <eslider@gmail.com>
 */
class DataManagerElement extends BaseElement
{
    /** @var mixed[] lazy-initialized entries */
    protected $schemaConfigs = array();
    /** @var null|TranslatorInterface */
    protected $translator;

    /**
     * @inheritdoc
     */
    public static function getClassTitle()
    {
        // @todo: translations
        return "Data manager";
    }

    /**
     * @inheritdoc
     */
    public static function getClassDescription()
    {
        // @todo: translations
        return "Data manager element";
    }

    /**
     * @inheritdoc
     */
    public function getWidgetName()
    {
        return 'mapbender.mbDataManager';
    }

    /**
     * @inheritdoc
     */
    public static function getDefaultConfiguration()
    {
        return array(
            'schemes' => null,
        );
    }

    /**
     * @inheritdoc
     */
    public static function getType()
    {
        return 'Mapbender\DataManagerBundle\Element\Type\DataManagerAdminType';
    }

    /**
     * @inheritdoc
     */
    public static function getFormTemplate()
    {
        return 'MapbenderDataManagerBundle:ElementAdmin:dataManager.html.twig';
    }

    public function getFrontendTemplatePath($suffix = '.html.twig')
    {
        return "MapbenderDataManagerBundle:Element:dataManager{$suffix}";
    }

    /**
     * @inheritdoc
     */
    public function getAssets()
    {
        return array(
            'css' => array(
                '@MapbenderDataManagerBundle/Resources/styles/dataManager.element.scss',
            ),
            'js' => array(
                '../../vendor/blueimp/jquery-file-upload/js/jquery.fileupload.js',
                '../../vendor/blueimp/jquery-file-upload/js/jquery.iframe-transport.js',
                '@MapbenderDataManagerBundle/Resources/public/dataManager.element.js',
            ),
            'trans' => array(
                'MapbenderDataManagerBundle:Element:datamanager.json.twig',
            ),
        );
    }

    /**
     * Prepare form items for each scheme definition
     * Optional: get featureType by name from global context.
     *
     * @inheritdoc
     */
    public function getConfiguration()
    {
        $configuration = $this->entity->getConfiguration();
        $configuration['schemes'] = $this->getSchemaConfigs();
        if (isset($configuration['tableTranslation'])) {
            if (!in_array('tableTranslation', array_keys($this->getDefaultConfiguration()))) {
                // Policy: make a top-level configuration setting available for DB applications or not at all; Yaml-app-only HACKs are not acceptable
                @trigger_error("WARNING: element config for " .get_class($this) . "#{$this->entity->getId()} contains illegal settings for 'tableTranslation', configurable only in a Yaml-defined application", E_USER_DEPRECATED);
            }
            $configuration['tableTranslation'] = $this->resolveTableTranslations($configuration['tableTranslation'] ?: array());
        }
        return $configuration;
    }

    /**
     * Request handling adapter for old Mapbender < 3.0.8-beta1
     * @param string $action ignored
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function httpAction($action)
    {
        /** @var $requestService Request */
        $request = $this->container->get('request_stack')->getCurrentRequest();
        return $this->handleHttpRequest($request);
    }

    /**
     * @param Request $request
     * @return \Symfony\Component\HttpFoundation\Response
     * @throws \Exception
     */
    public function handleHttpRequest(Request $request)
    {
        $action = $request->attributes->get('action');
        $schemaName = $request->query->get('schema');

        try {
            $schemaConfig = $this->getSchemaConfig($schemaName, true);
            $dataStore = $this->getDataStoreBySchemaName($schemaName);
        } catch (UnknownSchemaException $e) {
            return new JsonResponse(array('message' => 'Unknown schema ' . print_r($schemaName)), JsonResponse::HTTP_NOT_FOUND);
        }

        switch ($action) {
            case 'select':
                $results = array();
                $criteria = array(
                    'maxResults' => $schemaConfig['maxResults'],
                );
                foreach ($dataStore->search($criteria) as $dataItem) {
                    $results[] = $dataItem->toArray();
                }
                return new JsonResponse($results);
            case 'save':
                $itemId = $request->query->get('id', null);
                if (!$this->checkAllowSave($schemaName, !$itemId, 'save')) {
                    return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
                }
                $requestData = json_decode($request->getContent(), true);
                if ($itemId) {
                    // update existing item
                    $dataItem = $dataStore->getById($itemId);
                    $dataItem->setAttributes($requestData['dataItem']);
                } else {
                    // store new item
                    $dataItem = $dataStore->create($requestData['dataItem']);
                }
                return new JsonResponse(array(
                    'dataItem' => $dataStore->save($dataItem)->toArray(),
                ));
            case 'delete':
                if (!$this->checkAllowDelete($schemaName)) {
                    return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
                }
                $id = $request->query->get('id');
                return new JsonResponse($dataStore->remove($id));
            case 'file-upload':
                if (!$this->checkAllowSave($schemaName, false, 'file-upload')) {
                    return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
                }
                return new JsonResponse($this->getUploadHandlerResponseData($dataStore, $schemaName, $request->query->get('fid'), $request->query->get('field')));
            default:
                return new JsonResponse(array('message' => 'Unsupported action ' . $action), JsonResponse::HTTP_BAD_REQUEST);
        }
    }

    /**
     * Checks save access.
     *
     * @param string $schemaName
     * @param boolean $isNew
     * @param string $actionName 'save' or 'file-upload'
     * @return boolean
     */
    protected function checkAllowSave($schemaName, $isNew, $actionName)
    {
        try {
            $config = $this->getSchemaBaseConfig($schemaName);
        } catch (UnknownSchemaException $e) {
            // @todo: let fly? (needs some integration with json message formatting)
            return false;
        }
        if ($isNew) {
            return !empty($config['allowCreate']);
        } else {
            return !empty($config['allowEdit']);
        }
    }

    /**
     * Checks delete access
     * @param string $schemaName
     * @return boolean
     */
    protected function checkAllowDelete($schemaName)
    {
        try {
            $config = $this->getSchemaBaseConfig($schemaName);
            return !empty($config['allowDelete']);
        } catch (UnknownSchemaException $e) {
            // @todo: let fly? (needs some integration with json message formatting)
            return false;
        }
    }

    /**
     * @param string $schemaName
     * @return DataStore
     * @throws ConfigurationErrorException
     */
    protected function getDataStoreBySchemaName($schemaName)
    {
        // @todo: use DataStoreService::dataStoreFactory (requires data-source >= 0.1.15)
        return new DataStore($this->container, $this->getDataStoreConfigForSchema($schemaName));
    }

    /**
     * Get a mapping of ALL schema configurations, transformed. Transformed means
     * * formItems prepared
     *
     * @return mixed[] with schema names as string keys
     */
    protected function getSchemaConfigs()
    {
        $schemaNames = $this->getValidSchemaNames();
        $preparedConfigs = $this->schemaConfigs;
        foreach (array_diff($schemaNames, array_keys($preparedConfigs)) as $missingSchemaName) {
            // use get... instead of prepare... to buffer result for next time
            $preparedConfigs[$missingSchemaName] = $this->getSchemaConfig($missingSchemaName, false);
        }
        return $preparedConfigs;
    }

    /**
     * @return string[]
     * @throws ConfigurationErrorException if config values are completly unsalvagable
     */
    protected function getValidSchemaNames()
    {
        $entityConfig = $this->entity->getConfiguration();
        if (empty($entityConfig['schemes'])) {
            throw new ConfigurationErrorException("Schema configuration completely empty");
        }
        $names = array();
        $invalid = array();
        foreach (array_keys($entityConfig['schemes']) as $schemaName) {
            try {
                // data store must be configured properly as well
                $this->getDataStoreConfigForSchema($schemaName);
                $names[] = $schemaName;
            } catch (ConfigurationErrorException $e) {
                $invalid[] = $schemaName;
            }
        }
        if (!$names && $invalid) {
            throw new ConfigurationErrorException("All schema configurations are invalid");
        }
        if ($invalid) {
            @trigger_error("WARNING: " . get_class($this) . '#' . $this->entity->getId() . ' contains invalid schema configuration for schemes ' . implode(', ', $invalid), E_USER_DEPRECATED);
        }
        return $names;
    }

    /**
     * Get a single (default: transformed) schema configuration. Transformed means
     * * formItems prepared
     * * featureType string reference resolved to full featureType configuration + featureTypeName entry
     *
     * Pass $raw = true to skip prepareItems / dataStore / featureType resolution
     *
     * @param string $schemaName
     * @param bool $raw
     * @return mixed[]
     * @throws UnknownSchemaException
     */
    protected function getSchemaConfig($schemaName, $raw = false)
    {
        if (!array_key_exists($schemaName, $this->schemaConfigs)) {
            $schemaConfig = $this->getSchemaBaseConfig($schemaName);
            if (!$raw) {
                $schemaConfig = $this->prepareSchemaConfig($schemaConfig);
                // buffer for next invocation
                $this->schemaConfigs[$schemaName] = $schemaConfig;
            } else {
                return $schemaConfig;
            }
        }
        // NOTE: this may return a prepared config with $raw = true, if it was already prepared fully. This should be
        //       transparent to callers.
        return $this->schemaConfigs[$schemaName];
    }

    /**
     * Returns a schema configuration merged with defaults but no expensive processing, meaning
     * * no form item resolution
     * * no data store reference resolution
     *
     * @param string $schemaName
     * @return mixed[]
     * @throws UnknownSchemaException
     */
    protected function getSchemaBaseConfig($schemaName)
    {
        $entityConfig = $this->entity->getConfiguration() + array(
            'schemes' => array(),
        );
        if (empty($entityConfig['schemes'][$schemaName])) {
            throw new UnknownSchemaException("No such schema " . print_r($schemaName, true));
        }
        $schemaConfig = array_replace($this->getSchemaConfigDefaults(), $entityConfig['schemes'][$schemaName]);
        // always guarantee "schemaName" and "label" properties, even with $raw = true
        $schemaConfig['schemaName'] = $schemaName;
        if (empty($schemaConfig['label'])) {
            $schemaConfig['label'] = $schemaName;
        }
        return $schemaConfig;
    }

    /**
     * @param string $schemaName
     * @return mixed[]
     * @throws ConfigurationErrorException
     */
    protected function getDataStoreConfigForSchema($schemaName)
    {
        $schemaConfig = $this->getSchemaBaseConfig($schemaName);
        $dsConfigKey = $this->getDataStoreKeyInSchemaConfig();
        if (empty($schemaConfig[$dsConfigKey])) {
            throw new ConfigurationErrorException("Missing dataStore configuration for schema " . print_r($schemaName, true));
        }
        return $this->resolveDataStoreConfig($schemaConfig[$dsConfigKey]);
    }

    /**
     * @param mixed[] $rawConfig
     * @return mixed[]
     */
    protected function prepareSchemaConfig($rawConfig)
    {
        $prepared = $rawConfig;
        if (isset($rawConfig['formItems'])) {
            $prepared['formItems'] = $this->prepareItems($rawConfig['formItems']);
        }
        $dsConfigKey = $this->getDataStoreKeyInSchemaConfig();
        // lenient mode: ignore missing dataStore setting for Digitizer inheritance
        if (isset($rawConfig[$dsConfigKey])) {
            $prepared[$dsConfigKey] = $this->resolveDataStoreConfig($rawConfig[$dsConfigKey]);
        }
        return $prepared;
    }

    /**
     * Should return default values for missing schema configs.
     *
     * @return mixed[]
     */
    protected function getSchemaConfigDefaults()
    {
        return array(
            'allowEdit' => false,
            'fileUri' => $this->getDefaultUploadsPath(),
            'allowCreate' => true,
            'allowDelete' => true,
            'maxResults' => 5000,
        );
    }

    /**
     * Returns web-relative base path for uploads. Used in schema defaults.
     * @return string
     */
    protected function getDefaultUploadsPath()
    {
        return $this->container->getParameter("mapbender.uploads_dir") . "/data-store";
    }

    /**
     * @param string|array $value
     * @return mixed[]
     */
    protected function resolveDataStoreConfig($value)
    {
        if ($value && is_array($value)) {
            // Pre-unraveled configs cannot have a sensible id guaranteed
            // @todo: figure out who wants this id anyway, remove if possible
            return $value + array(
                'id' => null,
            );
        } elseif ($value && is_string($value)) {
            return $this->getDataStoreDefinition($value) + array(
                'id' => $value,
            );
        } else {
            throw new \RuntimeException("Invalid dataStore setting " . var_export($value, true));
        }
    }

    /**
     * @param string $storeId
     * @return mixed
     */
    protected function getDataStoreDefinition($storeId)
    {
        $storeConfigs = $this->container->getParameter('dataStores');
        return $storeConfigs[$storeId];
    }

    /**
     * @param DataStore $store
     * @param string $schemaName
     * @param mixed $itemId
     * @param string $fieldName
     * @return mixed[]
     * @todo: this is pretty much an exact match of the same logic in digitizer 1.1. Fold.
     * @todo: Digitizer already has a method uploadFileAction, but it has FeatureType interactions built in and
     *        returns the response immediately. Cannot safely have a method with incompatible signature.
     */
    protected function getUploadHandlerResponseData(DataStore $store, $schemaName, $itemId, $fieldName)
    {
        $urlParameters = $this->getUploadUrlParameters($store, $schemaName, $itemId, $fieldName);
        $uploadHandler = $this->getUploadHandler($store, $fieldName, $urlParameters);
        // @todo: TBD why we merge the url parameters into the response. This brings in a lot of dependencies for ... what?
        return array_merge($uploadHandler->get_response(), $urlParameters);
    }

    /**
     * @param DataStore $store
     * @param string $fieldName
     * @param string[] $urlParameters
     * @return Uploader
     */
    protected function getUploadHandler(DataStore $store, $fieldName, $urlParameters)
    {
        $uploadDir = $store->getFilePath($fieldName);
        $uploadUrl = $store->getFileUrl($fieldName) . "/";
        return new Uploader(array(
            'upload_dir' => $uploadDir . "/",
            'script_url' => $this->getUploadServerUrl($urlParameters),
            'upload_url' => $uploadUrl,
            'accept_file_types' => '/\.(gif|jpe?g|png)$/i',
            'print_response' => false,
            'access_control_allow_methods' => array(
                'OPTIONS',
                'HEAD',
                'GET',
                'POST',
                'PUT',
                'PATCH',
                //                        'DELETE'
            ),
        ));
    }

    /**
     * @param DataStore $store
     * @param string $schemaName
     * @param mixed $itemId
     * @param string $fieldName
     * @return array
     * @todo: this seems like a lot of work to generate something a)the UploadHandler does not even care about; b)the client
     *        code does not even look at
     *        => Determine safety of removal
     */
    protected function getUploadUrlParameters(DataStore $store, $schemaName, $itemId, $fieldName)
    {
        return array(
            'schema' => $schemaName,
            'fid' => $itemId,
            'field' => $fieldName,
            'uploadUrl' => $store->getFileUrl($fieldName) . "/",
        );
    }

    /**
     * @param string[] $params
     * @return string
     * @todo: this seems like a lot of work to generate something a)the UploadHandler does not even care about; b)the client
     *        code does not even look at
     *        => Determine safety of removal
     */
    protected function getUploadServerUrl($params)
    {
        unset($params['uploadUrl']);
        // really? $_SERVER?
        return preg_replace('/\\?.+$/', "", $_SERVER["REQUEST_URI"]) . "?" . http_build_query($params);
    }

    /**
     * Override to support translated string scalars in form items.
     *
     * @param mixed[] $item
     * @return mixed[]
     */
    protected function prepareItem($item)
    {
        $item = parent::prepareItem($item);
        static $translator = null;      // optimize away service lookup over repeated invocations
        foreach ($item as $key => $value) {
            if (is_string($value) && preg_match('#^trans:\w+([\.\-]\w+)*$#', $value)) {
                /** @var TranslatorInterface $translator */
                $translator = $translator ?: $this->container->get('translator');
                $item[$key] = $translator->trans(substr($value, /* strlen('trans:') */ 6));
            }
        }
        return $item;
    }

    /**
     * Names the key inside the schema top-level config where data store config
     * is located.
     * Override support for child classes (Digitizer uses featureType instead
     * of the default dataStore).
     * @return string
     * @todo: remove duplicated implementation (will require data-source ^0.1.17)
     */
    protected function getDataStoreKeyInSchemaConfig()
    {
        return 'dataStore';
    }

    /**
     * Run (invalid, undocumented, unsettable) custom data tables texts through translator.
     *
     * @param array $values
     * @return array
     */
    protected function resolveTableTranslations(array $values)
    {
        $translator = $this->getTranslator();
        foreach ($values as $key => $value) {
            if (is_string($value) && preg_match('#^trans:\w+([\.\-]\w+)*$#', $value)) {
                $values[$key] = $translator->trans(substr($value, /* strlen('trans:') */ 6));
            } elseif (is_array($value)) {
                $values[$key] = $this->resolveTableTranslations($values);
            }
        }
        return $values;
    }

    /**
     * @return TranslatorInterface
     */
    protected function getTranslator()
    {
        if (!$this->translator) {
            $this->translator = $this->container->get('translator');
        }
        return $this->translator;
    }
}
