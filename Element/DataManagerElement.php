<?php

namespace Mapbender\DataManagerBundle\Element;

use Doctrine\DBAL\DBALException;
use Mapbender\CoreBundle\Component\Element;
use Mapbender\DataManagerBundle\Component\DataStoreUtil;
use Mapbender\DataManagerBundle\Component\FormItemFilter;
use Mapbender\DataManagerBundle\Component\SchemaFilterLegacy;
use Mapbender\DataManagerBundle\Component\Uploader;
use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataManagerBundle\Exception\UnknownSchemaException;
use Mapbender\DataSourceBundle\Component\DataStore;
use Mapbender\DataSourceBundle\Component\DataStoreService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * @author  Andriy Oblivantsev <eslider@gmail.com>
 * @todo: add http method for form item reload (modified data may change "sql"-type select options, in any schema)
 * @todo: support lazy-loading of single schema, to speed up initialization
 * @todo: verify file upload field interactions
 */
class DataManagerElement extends Element
{
    /** @var SchemaFilterLegacy|null */
    private $schemaFilter;

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
                '@MapbenderDataManagerBundle/Resources/public/FormRenderer.js',
                '@MapbenderDataManagerBundle/Resources/public/FormUtil.js',
                '@MapbenderDataManagerBundle/Resources/public/DialogFactory.js',
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
     * @inheritdoc
     */
    public function getPublicConfiguration()
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
        $repository = $this->getDataStoreBySchemaName($schemaName);
        $results = array();
        foreach ($repository->search() as $dataItem) {
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
        return new JsonResponse($this->getUploadHandlerResponseData($repository, $request->query->get('field')));
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
        return $this->getSchemaFilter()->checkAllowSaveInConfig($config, $isNew);
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
        return DataStoreUtil::storeFromConfig($this->getDataStoreService(), $config);
    }

    /**
     * Get a mapping of ALL schema configurations, transformed. Transformed means
     * * formItems prepared
     *
     * @return mixed[] with schema names as string keys
     */
    protected function getSchemaConfigs()
    {
        $entityConfig = $this->entity->getConfiguration();
        if (empty($entityConfig['schemes'])) {
            throw new ConfigurationErrorException("Schema configuration completely empty");
        }
        $schemaConfigs = array();
        foreach (\array_keys($entityConfig['schemes']) as $schemaName) {
            $schemaConfigs[$schemaName] = $this->getSchemaBaseConfig($schemaName);
        }
        return $this->getSchemaFilter()->prepareConfigs($schemaConfigs);
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
     * @deprecated
     */
    protected function getDataStoreConfigForSchema($schemaName)
    {
        $schemaConfig = $this->getSchemaBaseConfig($schemaName);
        return DataStoreUtil::configFromSchemaConfig($this->getDataStoreService(), $schemaConfig, $schemaName);
    }

    /**
     * Should return default values for missing schema configs.
     *
     * @return mixed[]
     */
    protected function getSchemaConfigDefaults()
    {
        return $this->getSchemaFilter()->getConfigDefaults();
    }

    /**
     * @param string|array $value
     * @return mixed[]
     * @deprecated
     */
    protected function resolveDataStoreConfig($value)
    {
        if (\is_string($value)) {
            $storeConfigs = DataStoreUtil::getGlobalConfigs($this->getDataStoreService());
            return $storeConfigs[$value];
        } else {
            return $value;
        }
    }

    /**
     * @param DataStore $store
     * @param string $fieldName
     * @return mixed[]
     * @todo: this is pretty much an exact match of the same logic in digitizer 1.1. Fold.
     * @todo: Digitizer already has a method uploadFileAction, but it has FeatureType interactions built in and
     *        returns the response immediately. Cannot safely have a method with incompatible signature.
     */
    protected function getUploadHandlerResponseData(DataStore $store, $fieldName)
    {
        $uploadHandler = $this->getUploadHandler($store, $fieldName);
        return $uploadHandler->get_response();
    }

    /**
     * @param DataStore $store
     * @param string $fieldName
     * @return Uploader
     */
    protected function getUploadHandler(DataStore $store, $fieldName)
    {
        $uploadDir = $store->getFilePath($fieldName);
        $uploadUrl = $store->getFileUrl($fieldName) . "/";
        return new Uploader(array(
            'upload_dir' => $uploadDir . "/",
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
            'image_versions' => array('' => array()),
        ));
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

    /**
     * @return SchemaFilterLegacy
     */
    private function getSchemaFilter()
    {
        if (!$this->schemaFilter) {
            /** @var FormItemFilter $formItemFilter */
            $formItemFilter = $this->container->get('mb.data-manager.form_item_filter');
            $this->schemaFilter = new SchemaFilterLegacy($this->getDataStoreService(), $formItemFilter);
        }
        return $this->schemaFilter;
    }
}
