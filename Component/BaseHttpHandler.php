<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;
use Symfony\Component\Form\FormFactoryInterface;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

/**
 * Handler for DataManager http actions NOT modified by inheriting Digitizer
 */
class BaseHttpHandler
{
    /** @var FormFactoryInterface */
    protected $formFactory;
    /** @var SchemaFilter */
    protected $schemaFilter;

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
