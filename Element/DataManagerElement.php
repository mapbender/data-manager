<?php

namespace Mapbender\DataManagerBundle\Element;

use Doctrine\DBAL\DBALException;
use Mapbender\DataManagerBundle\Component\Uploader;
use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataManagerBundle\Exception\UnknownSchemaException;
use Mapbender\DataSourceBundle\Component\DataStore;
use Mapbender\DataSourceBundle\Component\DataStoreService;
use Mapbender\DataSourceBundle\Element\BaseElement;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Translation\TranslatorInterface;

/**
 * @author  Andriy Oblivantsev <eslider@gmail.com>
 * @todo: add http method for form item reload (modified data may change "sql"-type select options, in any schema)
 * @todo: supply reasonable defaults for "tableTranslation" option
 * @todo: support lazy-loading of single schema, to speed up initialization
 * @todo: verify file upload field interactions
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

    public function getFrontendTemplateVars()
    {
        // Twig template requires nothing except "id" variable, which is injected
        // automatically by Mapbender
        return array();
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
                '../../vendor/mapbender/vis-ui.js/src/js/jquery.form.generator.js',
                '../../vendor/mapbender/vis-ui.js/src/js/utils/fn.formData.js',
                '../../vendor/mapbender/vis-ui.js/src/js/elements/date.selector.js',    // only for legacy browsers
                '../../vendor/mapbender/vis-ui.js/src/js/elements/popup.dialog.js',
                '../../vendor/blueimp/jquery-file-upload/js/jquery.fileupload.js',
                '../../vendor/blueimp/jquery-file-upload/js/jquery.iframe-transport.js',
                '@MapbenderDataManagerBundle/Resources/public/TableRenderer.js',
                '@MapbenderDataManagerBundle/Resources/public/dataManager.element.js',
            ),
            'trans' => array(
                'mb.data-manager.*',
                'mb.data.store.*',  // legacy quirk: this is in our translation catalogs
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
        return $configuration;
    }

    /**
     * @param Request $request
     * @return Response
     */
    public function handleHttpRequest(Request $request)
    {
        try {
            $response = $this->dispatchRequest($request);
            if (!$response) {
                $action = $request->attributes->get('action');
                $response = new JsonResponse(array('message' => 'Unsupported action ' . $action), JsonResponse::HTTP_BAD_REQUEST);
            }
            return $response;
        } catch (UnknownSchemaException $e) {
            return new JsonResponse(array('message' => $e->getMessage()), JsonResponse::HTTP_NOT_FOUND);
        } catch (DBALException $e) {
            return new JsonResponse(array('message' => $e->getMessage()), JsonResponse::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @param Request $request
     * @return Response|null
     * @throws UnknownSchemaException
     * @throws ConfigurationErrorException
     */
    protected function dispatchRequest(Request $request)
    {
        $action = $request->attributes->get('action');
        switch ($action) {
            case 'select':
                return $this->selectAction($request);
            case 'save':
                return $this->saveAction($request);
            case 'delete':
                return $this->deleteAction($request);
            case 'file-upload':
                return $this->fileUploadAction($request);
            default:
                return null;
        }
    }

    /**
     * @param Request $request
     * @return JsonResponse
     */
    protected function selectAction(Request $request)
    {
        return new JsonResponse($this->getSelectActionResponseData($request));
    }

    /**
     * @param Request $request
     * @return mixed[]
     */
    protected function getSelectActionResponseData(Request $request)
    {
        $schemaName = $request->query->get('schema');
        $schemaConfig = $this->getSchemaConfig($schemaName, true);
        $repository = $this->getDataStoreBySchemaName($schemaName);
        $results = array();
        $criteria = array(
            'maxResults' => $schemaConfig['maxResults'],
        );
        foreach ($repository->search($criteria) as $dataItem) {
            $results[] = $dataItem->toArray();
        }
        return $results;
    }

    /**
     * @param Request $request
     * @return JsonResponse
     */
    protected function saveAction(Request $request)
    {
        $itemId = $request->query->get('id', null);
        $schemaName = $request->query->get('schema');
        if (!$this->checkAllowSave($schemaName, !$itemId, 'save')) {
            return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
        }
        return new JsonResponse($this->getSaveActionResponseData($request));
    }

    /**
     * @param Request $request
     * @return mixed[]
     */
    protected function getSaveActionResponseData(Request $request)
    {
        $itemId = $request->query->get('id', null);
        $schemaName = $request->query->get('schema');
        $repository = $this->getDataStoreBySchemaName($schemaName);
        $requestData = json_decode($request->getContent(), true);
        if ($itemId) {
            // update existing item
            $dataItem = $repository->getById($itemId);
            $dataItem->setAttributes($requestData['dataItem']);
        } else {
            // store new item
            $dataItem = $repository->create($requestData['dataItem']);
        }
        return array(
            'dataItem' => $repository->save($dataItem)->toArray(),
        );
    }

    /**
     * @param Request $request
     * @return JsonResponse
     */
    protected function deleteAction(Request $request)
    {
        $schemaName = $request->query->get('schema');
        if (!$this->checkAllowDelete($schemaName)) {
            return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
        }
        $repository = $this->getDataStoreBySchemaName($schemaName);
        $id = $request->query->get('id');
        return new JsonResponse($repository->remove($id));
    }

    /**
     * @param Request $request
     * @return JsonResponse
     */
    protected function fileUploadAction(Request $request)
    {
        $schemaName = $request->query->get('schema');
        if (!$this->checkAllowSave($schemaName, false, 'file-upload')) {
            return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
        }
        $repository = $this->getDataStoreBySchemaName($schemaName);
        return new JsonResponse($this->getUploadHandlerResponseData($repository, $schemaName, $request->query->get('fid'), $request->query->get('field')));
    }

    /**
     * Checks save access.
     *
     * @param string $schemaName
     * @param boolean $isNew
     * @param string $actionName 'save' or 'file-upload'
     * @return boolean
     * @since 1.0.7
     */
    protected function checkAllowSave($schemaName, $isNew, $actionName)
    {
        $config = $this->getSchemaBaseConfig($schemaName);
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
     * @since 1.0.7
     */
    protected function checkAllowDelete($schemaName)
    {
        $config = $this->getSchemaBaseConfig($schemaName);
        return !empty($config['allowDelete']);
    }

    /**
     * @param string $schemaName
     * @return DataStore
     * @throws ConfigurationErrorException
     * @since 1.0.7
     */
    protected function getDataStoreBySchemaName($schemaName)
    {
        $config = $this->getDataStoreConfigForSchema($schemaName);
        return $this->getDataStoreService()->dataStoreFactory($config);
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
     * @since 1.0.7
     */
    protected function getSchemaBaseConfig($schemaName)
    {
        $entityConfig = $this->entity->getConfiguration() + array(
            'schemes' => array(),
        );
        if (empty($entityConfig['schemes'][$schemaName])) {
            throw new UnknownSchemaException("No such schema " . print_r($schemaName, true));
        }
        $defaults = $this->getSchemaConfigDefaults();
        $rawConfig = $entityConfig['schemes'][$schemaName];
        $schemaConfig = array_replace($defaults, $rawConfig);
        // always guarantee "schemaName" and "label" properties, even with $raw = true
        $schemaConfig['schemaName'] = $schemaName;
        if (empty($schemaConfig['label'])) {
            $schemaConfig['label'] = $schemaName;
        }
        // Re-merge "popup" sub-array
        if (!empty($rawConfig['popup']) && !empty($defaults['popup'])) {
            $schemaConfig['popup'] = array_replace($defaults['popup'], $rawConfig['popup']);
        }
        // Re-merge "table" sub-array
        if (!empty($rawConfig['table']) && !empty($defaults['table'])) {
            $schemaConfig['table'] = array_replace($defaults['table'], $rawConfig['table']);
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
            'popup' => array(
                'title' => $this->getTranslator()->trans('mb.data.store.edit.title'),
                'width' => '550px',
            ),
            'table' => array(
                'searching' => true,
                'pageLength' => 16,
            ),
        );
    }

    /**
     * Returns web-relative base path for uploads. Used in schema defaults.
     * @return string
     * @since 1.0.7
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
            return $value;
        } elseif ($value && is_string($value)) {
            return $this->getDataStoreDefinition($value);
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
        $translator = $this->getTranslator();
        foreach ($item as $key => $value) {
            if (is_string($value) && preg_match('#^trans:\w+([\.\-]\w+)*$#', $value)) {
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
     * @since 1.0.7
     */
    protected function getDataStoreKeyInSchemaConfig()
    {
        return 'dataStore';
    }

    /**
     * @return TranslatorInterface
     * @since 1.0.7
     */
    protected function getTranslator()
    {
        if (!$this->translator) {
            $this->translator = $this->container->get('translator');
        }
        return $this->translator;
    }

    /**
     * @return DataStoreService
     */
    protected function getDataStoreService()
    {
        /** @var DataStoreService $service */
        $service = $this->container->get('mb.data-manager.registry');
        return $service;
    }
}
