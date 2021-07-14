<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Handler for DataManager http actions NOT modified by inheriting Digitizer
 */
class BaseHttpHandler
{
    /** @var SchemaFilter */
    protected $schemaFilter;

    public function __construct(SchemaFilter $schemaFilter)
    {
        $this->schemaFilter = $schemaFilter;
    }

    /**
     * @param Element $element
     * @param Request $request
     * @return Response|null
     */
    public function dispatchRequest(Element $element, Request $request)
    {
        switch ($request->attributes->get('action')) {
            case 'delete':
                return $this->deleteAction($element, $request);
            case 'file-upload':
                return $this->fileUploadAction($element, $request);
            default:
                return null;
        }
    }

    /**
     * @param Element $element
     * @param Request $request
     * @return JsonResponse
     */
    protected function deleteAction(Element $element, Request $request)
    {
        $schemaName = $request->query->get('schema');
        if (!$this->schemaFilter->checkAllowDelete($element, $schemaName)) {
            return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
        }
        $repository = $this->schemaFilter->getDataStore($element, $schemaName);
        $id = $request->query->get('id');
        return new JsonResponse($repository->remove($id));
    }

    /**
     * @param Element $element
     * @param Request $request
     * @return array
     * @throws \Exception
     */
    protected function getSaveActionResponseData(Element $element, Request $request)
    {
        $itemId = $request->query->get('id', null);
        $schemaName = $request->query->get('schema');
        $repository = $this->schemaFilter->getDataStore($element, $schemaName);
        $requestData = json_decode($request->getContent(), true);
        if ($itemId) {
            // update existing item
            $dataItem = $repository->getById($itemId);
        } else {
            // store new item
            $dataItem = $repository->itemFactory();
        }
        $dataItem->setAttributes($requestData['dataItem']);
        return array(
            'dataItem' => $repository->save($dataItem)->toArray(),
        );
    }

    /**
     * @param Element $element
     * @param Request $request
     * @return array
     */
    protected function getSelectActionResponseData(Element $element, Request $request)
    {
        $schemaName = $request->query->get('schema');
        $repository = $this->schemaFilter->getDataStore($element, $schemaName);
        $results = array();
        foreach ($repository->search() as $dataItem) {
            $results[] = $dataItem->toArray();
        }
        return $results;
    }

    /**
     * @param Element $element
     * @param Request $request
     * @return JsonResponse
     */
    protected function fileUploadAction(Element $element, Request $request)
    {
        $schemaName = $request->query->get('schema');

        if (!$this->schemaFilter->checkAllowSave($element, $schemaName, false)) {
            return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
        }
        $fieldName = $request->query->get('field');
        // @todo: eliminate blueimp/jqueryfileupload client + server
        $handler = $this->getUploadHandler($element, $schemaName, $fieldName);
        return new JsonResponse($handler->get_response());
    }

    /**
     * @param Element $element
     * @param string $schemaName
     * @param string $fieldName
     * @return Uploader
     */
    protected function getUploadHandler(Element $element, $schemaName, $fieldName)
    {
        $uploadDir = $this->schemaFilter->getUploadPath($element, $schemaName, $fieldName);

        return new Uploader(array(
            'upload_dir' => $uploadDir . "/",
            'upload_url' => $uploadDir . "/",
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
}
