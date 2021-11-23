<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;
use Symfony\Component\Form\FormFactoryInterface;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Handler for DataManager http actions NOT modified by inheriting Digitizer
 */
class BaseHttpHandler
{
    /** @var SchemaFilter */
    protected $schemaFilter;
    /** @var FormFactoryInterface */
    protected $formFactory;

    public function __construct(FormFactoryInterface $formFactory,
                                SchemaFilter $schemaFilter)
    {
        $this->formFactory = $formFactory;
        $this->schemaFilter = $schemaFilter;
    }

    /**
     * @param Element $element
     * @param Request $request
     * @return Response|null
     */
    public function dispatchRequest(Element $element, Request $request)
    {
        $schemaMatches = array();
        $action = $request->attributes->get('action');
        if (\preg_match('#^([\w\d\-_]+)/(attachment)$#', $action, $schemaMatches)) {
            $schemaName = $schemaMatches[1];
            $schemaAction = $schemaMatches[2];
            if ($response = $this->dispatchSchemaRequest($element, $request, $schemaName, $schemaAction)) {
                return $response;
            }
        }

        switch ($action) {
            case 'delete':
                return $this->deleteAction($element, $request);
            default:
                return null;
        }
    }

    protected function dispatchSchemaRequest(Element $element, Request $request, $schemaName, $schemaAction)
    {
        switch ($schemaAction) {
            case 'attachment':
                switch ($request->getMethod()) {
                    case Request::METHOD_POST:
                    case Request::METHOD_PUT:
                        return $this->fileUploadAction($element, $request, $schemaName);
                    case Request::METHOD_GET:
                        return $this->fileDownloadAction($element, $request, $schemaName);
                    default:
                        throw new BadRequestHttpException();
                }
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
        $criteria = array();
        $schemaConfig = $this->schemaFilter->getRawSchemaConfig($element, $schemaName, true);
        if (!empty($schemaConfig['maxResults'])) {
            $criteria['maxResults'] = $schemaConfig['maxResults'];
        }
        foreach ($repository->search($criteria) as $dataItem) {
            $results[] = $dataItem->toArray();
        }
        return $results;
    }

    protected function fileDownloadAction(Element $element, Request $request, $schemaName)
    {
        if (!($fieldName = $request->query->get('field'))) {
            throw new BadRequestHttpException('Missing field name');
        }
        $baseName = $request->query->get('name');
        $targetDir = $this->schemaFilter->getUploadPath($element, $schemaName, $fieldName);
        $path = "{$targetDir}/{$baseName}";
        if (!$baseName || !\is_file($path)) {
            throw new NotFoundHttpException();
        }
        $response = new BinaryFileResponse($path);
        $response->isNotModified($request);
        return $response;
    }

    /**
     * @param Element $element
     * @param Request $request
     * @param string $schemaName
     * @return JsonResponse
     */
    protected function fileUploadAction(Element $element, Request $request, $schemaName)
    {
        if (!$this->schemaFilter->checkAllowSave($element, $schemaName, false)) {
            return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
        }
        $fieldName = $request->query->get('field');

        $form = $this->formFactory->createNamed('files', 'Symfony\Component\Form\Extension\Core\Type\FileType', null, array(
            'property_path' => 'files',
            // @todo: blueimp client cannot disable multiple file supprt; drop if blueimp client removed / possible otherwise
            'multiple' => true,
        ));
        $form->handleRequest($request);
        if ($form->isSubmitted() && $form->isValid() && $data = $form->getData()) {
            assert(\is_array($data) && count($data) === 1);
            // @todo: blueimp client cannot disable multiple file supprt; drop if blueimp client removed / possible otherwise
            $data = $data[0];
            $targetDir = $this->schemaFilter->getUploadPath($element, $schemaName, $fieldName);
            $targetFile = $this->moveUpload($data, $targetDir);

            return new JsonResponse(array(
                'url' => $targetDir . '/' . $targetFile->getFilename(),
            ));
        } else {
            throw new BadRequestHttpException();
        }
    }

    /**
     * @param UploadedFile $file
     * @param string $targetDir
     * @return \Symfony\Component\HttpFoundation\File\File
     */
    protected function moveUpload(UploadedFile $file, $targetDir)
    {
        $webDir = \preg_replace('#^(.*?)[\w_]*\.php#i', '$1', $_SERVER['SCRIPT_FILENAME']);
        $suffix = null;
        $counter = 1;
        // Disambiguate
        $initialName = $name = $file->getClientOriginalName();
        $fullDir = $webDir . $targetDir;
        do {
            $fullPath = "{$fullDir}/{$name}";
            if (!\file_exists($fullPath)) {
                break;
            }
            $suffix = ".{$counter}";
            $name = \preg_replace('#(\.\w+)$#i', $suffix . '$1', $initialName);
            ++$counter;
        } while (true);

        return $file->move($fullDir, $name);
    }
}
