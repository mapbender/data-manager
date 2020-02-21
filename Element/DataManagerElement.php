<?php

namespace Mapbender\DataManagerBundle\Element;

use Mapbender\DataSourceBundle\Component\DataStore;
use Mapbender\DataSourceBundle\Element\BaseElement;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * Class DataManagerElement
 *
 * @author  Andriy Oblivantsev <eslider@gmail.com>
 */
class DataManagerElement extends BaseElement
{
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

        if (isset($configuration["schemes"]) && is_array($configuration["schemes"])) {
            foreach ($configuration["schemes"] as $key => &$scheme) {
                if (is_string($scheme['dataStore'])) {
                    $storeId = $scheme['dataStore'];
                    $dataStore = $this->container->getParameter('dataStores');
                    $scheme['dataStore'] = $dataStore[$storeId];
                    $scheme['dataStore']["id"] = $storeId;
                }
                if (isset($scheme['formItems'])) {
                    $scheme['formItems'] = $this->prepareItems($scheme['formItems']);
                }
            }
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
        $configuration = $this->getConfiguration();
        $requestData = json_decode($request->getContent(), true);
        $schemas = $configuration["schemes"];
        $schemaName = isset($requestData["schema"]) ? $requestData["schema"] : $request->get("schema");
        $schemaConfigDefaults = array(
            'allowEdit' => false,
        );
        $schemaConfig = array_replace($schemaConfigDefaults, $schemas[$schemaName]);

        if (!empty($schemas[$schemaName]['dataStore'])) {
            $dataStore = new DataStore($this->container, $schemas[$schemaName]['dataStore']);
        } else {
            throw new \Exception("DataStore setup is not correct");
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
                // @todo: this is pretty much an exact copy of the same code in digitizer 1.1. Fold copy&paste.
                $fieldName = $request->get('field');
                $urlParameters = array('schema' => $schemaName,
                    'fid' => $request->get('fid'),
                    'field' => $fieldName);
                $serverUrl = preg_replace('/\\?.+$/', "", $_SERVER["REQUEST_URI"]) . "?" . http_build_query($urlParameters);
                $uploadDir = $dataStore->getFilePath($fieldName);
                $uploadUrl = $dataStore->getFileUrl($fieldName) . "/";
                $urlParameters['uploadUrl'] = $uploadUrl;
                $uploadHandler = new Uploader(array(
                    'upload_dir' => $uploadDir . "/",
                    'script_url' => $serverUrl,
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
                return new JsonResponse(array_merge($uploadHandler->get_response(), $urlParameters));

            default:
                return new JsonResponse(array('message' => 'Unsupported action ' . $action), JsonResponse::HTTP_BAD_REQUEST);
        }
    }
}
