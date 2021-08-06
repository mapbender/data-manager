<?php

namespace Mapbender\DataManagerBundle\Element;

use Doctrine\DBAL\DBALException;
use Mapbender\CoreBundle\Component\Element;
use Mapbender\DataManagerBundle\Component\DataManagerBase;
use Mapbender\DataManagerBundle\Component\DataManagerLegacyBridge;
use Mapbender\DataManagerBundle\Component\FormItemFilter;
use Mapbender\DataManagerBundle\Component\LegacyHttpHandler;
use Mapbender\DataManagerBundle\Component\SchemaFilterLegacy;
use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataManagerBundle\Exception\UnknownSchemaException;
use Mapbender\DataSourceBundle\Component\RepositoryRegistry;
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
    /** @var DataManagerLegacyBridge|null */
    private $bridge;

    /**
     * @inheritdoc
     */
    public static function getClassTitle()
    {
        return DataManagerBase::getClassTitle();
    }

    /**
     * @inheritdoc
     */
    public static function getClassDescription()
    {
        return DataManagerBase::getClassDescription();
    }

    /**
     * @inheritdoc
     */
    public function getWidgetName()
    {
        return $this->getBridge()->getWidgetName($this->entity);
    }

    /**
     * @inheritdoc
     */
    public static function getDefaultConfiguration()
    {
        return DataManagerBase::getDefaultConfiguration();
    }

    /**
     * @inheritdoc
     */
    public static function getType()
    {
        return DataManagerBase::getType();
    }

    /**
     * @inheritdoc
     */
    public static function getFormTemplate()
    {
        return DataManagerBase::getFormTemplate();
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
        return $this->getBridge()->getRequiredAssets($this->entity);
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
        $rawConfig = $this->getSchemaFilter()->getRawSchemaConfig($this->entity, $schemaName, false);
        $defaults = $this->getSchemaConfigDefaults();
        $schemaConfig = array_replace($defaults, $rawConfig);
        $schemaConfig = $this->getBridge()->getSchemaFilter()->processSchemaBaseConfig($schemaConfig, $schemaName);
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
            $storeConfigs = $this->getDataStoreService()->getDataStoreDeclarations();
            return $storeConfigs[$value];
        } else {
            return $value;
        }
    }

    /**
     * @return DataManagerLegacyBridge
     */
    private function getBridge()
    {
        if (!$this->bridge) {
            $uploadsBasePath = $this->container->getParameter('mapbender.uploads_dir');
            $registry = $this->getDataStoreService();
            /** @var FormItemFilter $formItemFilter */
            $formItemFilter = $this->container->get('mb.data-manager.form_item_filter');
            $schemaFilter = new SchemaFilterLegacy($registry, $formItemFilter, $uploadsBasePath);

            /** @var \Symfony\Component\Form\FormFactoryInterface $formFactory */
            $formFactory = $this->container->get('form.factory');
            $httpHandler = new LegacyHttpHandler($formFactory, $schemaFilter);

            // Initialize first (avoid infinite recursion from getSchemaConfigDefaults
            $this->bridge = new DataManagerLegacyBridge($registry, $schemaFilter, $httpHandler);
            $this->bridge->getSchemaFilter()->setSchemaConfigDefaults($this->getSchemaConfigDefaults());
        }
        return $this->bridge;
    }

    /**
     * @return RepositoryRegistry
     */
    protected function getDataStoreService()
    {
        /** @var RepositoryRegistry $service */
        $service = $this->container->get('mb.data-manager.registry');
        return $service;
    }

    /**
     * @return LegacyHttpHandler
     * @internal
     */
    private function getHttpHandler()
    {
        return $this->getBridge()->getHttpHandler($this->entity);
    }

    /**
     * @return SchemaFilterLegacy
     */
    private function getSchemaFilter()
    {
        return $this->getBridge()->getSchemaFilter();
    }
}
