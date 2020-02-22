<?php

namespace Mapbender\DataManagerBundle\Element;

use Mapbender\DataManagerBundle\Component\Uploader;
use Mapbender\DataSourceBundle\Component\DataStore;
use Mapbender\DataSourceBundle\Element\BaseElement;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Translation\TranslatorInterface;

/**
 * Class DataManagerElement
 *
 * @author  Andriy Oblivantsev <eslider@gmail.com>
 */
class DataManagerElement extends BaseElement
{
    /** @var mixed[] lazy-initialized entries */
    protected $schemaConfigs = array();

    /**
     * @inheritdoc
     */
    public static function getClassTitle()
    {
        return "Data manager";
    }

    /**
     * @inheritdoc
     */
    public static function getClassDescription()
    {
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
        $configuration['fileUri'] = $this->container->getParameter("mapbender.uploads_dir") . "/data-store";
        $configuration['schemes'] = $this->getSchemaConfigs();
        if (isset($configuration['tableTranslation'])) {
            if (!in_array('tableTranslation', array_keys($this->getDefaultConfiguration()))) {
                // Policy: make a top-level configuration setting available for DB applications or not at all; Yaml-app-only HACKs are not acceptable
                @trigger_error("WARNING: element config for " .get_class($this) . "#{$this->entity->getId()} contains illegal settings for 'tableTranslation', configurable only in a Yaml-defined application", E_USER_DEPRECATED);
            }
            $configuration['tableTranslations'] = $this->resolveTableTranslations($configuration['tableTranslations'] ?: array());
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
        $requestData = json_decode($request->getContent(), true);
        $schemaName = isset($requestData["schema"]) ? $requestData["schema"] : $request->get("schema");
        // @todo: avoid full collateral formItem preparation overhead if all we need is a resolved dataStore config
        $schemaConfig = $this->getSchemaConfig($schemaName, true);
        if (!$schemaConfig) {
            return new JsonResponse(array('message' => 'Unknown schema ' . print_r($schemaName)), JsonResponse::HTTP_NOT_FOUND);
        } elseif (empty($schemaConfig['dataStore'])) {
            throw new \Exception("DataStore setup is not correct");
        } else {
            // @todo: use DataStoreService::dataStoreFactory (requires data-source >= 0.1.15)
            $dataStore = new DataStore($this->container, $schemaConfig['dataStore']);
        }

        switch ($action) {
            case 'select':
                $results = array();
                $defaultCriteria = array(
                    'returnType' => 'FeatureCollection',
                    'maxResults' => 2500,
                );
                foreach ($dataStore->search(array_merge($defaultCriteria, $requestData)) as $dataItem) {
                    $results[] = $dataItem->toArray();
                }
                return new JsonResponse($results);
            case 'save':
                if (!$schemaConfig['allowEdit']) {
                    return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
                }

                $uniqueIdKey = $dataStore->getDriver()->getUniqueId();
                if (empty($requestData['dataItem'][$uniqueIdKey])) {
                    unset($requestData['dataItem'][$uniqueIdKey]);
                }

                $dataItem = $dataStore->create($requestData['dataItem']);
                return new JsonResponse(array(
                    'dataItem' => $dataStore->save($dataItem)->toArray(),
                ));
            case 'delete':
                if (!$schemaConfig['allowEdit']) {
                    return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
                }
                $id = intval($requestData['id']);
                return new JsonResponse($dataStore->remove($id));
            case 'file-upload':
                if (!$schemaConfig['allowEdit']) {
                    return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
                }
                return new JsonResponse($this->getUploadHandlerResponseData($dataStore, $schemaName, $request->query->get('fid'), $request->query->get('field')));
            default:
                return new JsonResponse(array('message' => 'Unsupported action ' . $action), JsonResponse::HTTP_BAD_REQUEST);
        }
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
        $schemaNames = array_keys($entityConfig['schemes'] ?: array());
        $preparedConfigs = $this->schemaConfigs;
        foreach (array_diff($schemaNames, array_keys($preparedConfigs)) as $missingSchemaName) {
            // use get... instead of prepare... to buffer result for next time
            $preparedConfigs[$missingSchemaName] = $this->getSchemaConfig($missingSchemaName, false);
        }
        return $preparedConfigs;
    }

    /**
     * Get a single (default: transformed) schema configuration. Transformed means
     * * formItems prepared
     * * featureType string reference resolved to full featureType configuration + featureTypeName entry
     *
     * Pass $raw = true to skip prepareItems / featureType resolution
     *
     * @param string $schemaName
     * @param bool $raw
     * @return mixed[]|false
     */
    protected function getSchemaConfig($schemaName, $raw = false)
    {
        if (!array_key_exists($schemaName, $this->schemaConfigs)) {
            $entityConfig = $this->entity->getConfiguration() + array(
                'schemes' => array(),
            );
            if (empty($entityConfig['schemes'][$schemaName])) {
                $schemaConfig = false;
            } else {
                $schemaConfig = array_replace($this->getSchemaConfigDefaults(), $entityConfig['schemes'][$schemaName]);
                if (!$raw) {
                    $schemaConfig = $this->prepareSchemaConfig($schemaConfig);
                }
            }
            if (!$raw || !$schemaConfig) {
                // buffer for next invocation (including falsy value for missing schema)
                $this->schemaConfigs[$schemaName] = $schemaConfig;
            } elseif ($raw) {
                return $schemaConfig;
            }
        }
        // NOTE: this may return a prepared config with $raw = true, if it was already prepared fully. This should be
        //       transparent to callers.
        return $this->schemaConfigs[$schemaName];
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
        if (isset($rawConfig['dataStore'])) {
            $prepared['dataStore'] = $this->resolveDataStoreConfig($rawConfig['dataStore']);
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
        );
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
     * Run (invalid, undocumented, unsettable) custom data tables texts through translator.
     *
     * @param array $values
     * @return array
     */
    protected function resolveTableTranslations(array $values)
    {
        static $translator = null;      // optimize away service lookup over repeated invocations
        foreach ($values as $key => $value) {
            if (is_string($value) && preg_match('#^trans:\w+([\.\-]\w+)*$#', $value)) {
                /** @var TranslatorInterface $translator */
                $translator = $translator ?: $this->container->get('translator');
                $values[$key] = $translator->trans(substr($value, /* strlen('trans:') */ 6));
            } elseif (is_array($value)) {
                $values[$key] = $this->resolveTableTranslations($values);
            }
        }
        return $values;
    }
}
