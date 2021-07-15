<?php

namespace Mapbender\DataManagerBundle\Element;

use Doctrine\DBAL\DBALException;
use Mapbender\CoreBundle\Component\Element;
use Mapbender\DataManagerBundle\Component\DataStoreUtil;
use Mapbender\DataManagerBundle\Component\FormItemFilter;
use Mapbender\DataManagerBundle\Component\LegacyHttpHandler;
use Mapbender\DataManagerBundle\Component\SchemaFilterLegacy;
use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataManagerBundle\Exception\UnknownSchemaException;
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
    /** @var LegacyHttpHandler|null */
    private $httpHandler;
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
            case 'file-upload':
                return $this->getHttpHandler()->dispatchRequest($this->entity, $request);
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
        return $this->getHttpHandler()->getSelectActionResponseData($this->entity, $request);
    }

    /**
     * @param Request $request
     * @return JsonResponse
     */
    protected function saveAction(Request $request)
    {
        $itemId = $request->query->get('id', null);
        $schemaName = $request->query->get('schema');
        if (!$this->getSchemaFilter()->checkAllowSave($this->entity, $schemaName, !$itemId)) {
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
        return $this->getHttpHandler()->getSaveActionResponseData($this->entity, $request);
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
        return $this->getSchemaFilter()->getDataStoreConfig($this->entity, $schemaName);
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
     * @return DataStoreService
     */
    protected function getDataStoreService()
    {
        /** @var DataStoreService $service */
        $service = $this->container->get('mb.data-manager.registry');
        return $service;
    }

    /**
     * @return LegacyHttpHandler
     * @internal
     */
    private function getHttpHandler()
    {
        if (!$this->httpHandler) {
            /** @var \Symfony\Component\Form\FormFactoryInterface $formFactory */
            $formFactory = $this->container->get('form.factory');
            $this->httpHandler = new LegacyHttpHandler($formFactory, $this->getSchemaFilter());
        }
        return $this->httpHandler;
    }

    /**
     * @return SchemaFilterLegacy
     */
    private function getSchemaFilter()
    {
        if (!$this->schemaFilter) {
            $uploadsBasePath = $this->container->getParameter('mapbender.uploads_dir');
            /** @var FormItemFilter $formItemFilter */
            $formItemFilter = $this->container->get('mb.data-manager.form_item_filter');
            $this->schemaFilter = new SchemaFilterLegacy($this->getDataStoreService(), $formItemFilter, $uploadsBasePath);
        }
        return $this->schemaFilter;
    }
}
