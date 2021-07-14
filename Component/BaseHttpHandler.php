<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;
use Mapbender\DataSourceBundle\Component\DataStore;
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
     * @return JsonResponse
     */
    protected function fileUploadAction(Element $element, Request $request)
    {
        $schemaName = $request->query->get('schema');

        if (!$this->schemaFilter->checkAllowSave($element, $schemaName, false)) {
            return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
        }
        $repository = $this->schemaFilter->getDataStore($element, $schemaName);
        // @todo: eliminate blueimp/jqueryfileupload client + server
        $handler = $this->getUploadHandler($repository, $request->query->get('field'));
        return new JsonResponse($handler->get_response());
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
}
