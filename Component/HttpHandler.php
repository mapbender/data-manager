<?php


namespace Mapbender\DataManagerBundle\Component;

use Doctrine\DBAL\DBALException;
use Mapbender\Component\Element\ElementHttpHandlerInterface;
use Mapbender\CoreBundle\Entity\Element;
use Mapbender\DataManagerBundle\Exception\ConfigurationErrorException;
use Mapbender\DataManagerBundle\Exception\UnknownSchemaException;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Data manager http handler for new (Mapbender >= 3.2.6) service Element
 * API.
 */
class HttpHandler extends BaseHttpHandler implements ElementHttpHandlerInterface
{
    public function handleRequest(Element $element, Request $request)
    {
        try {
            $response = $this->dispatchRequest($element, $request);
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
     * @param Element $element
     * @param Request $request
     * @return Response|null
     * @throws UnknownSchemaException
     * @throws ConfigurationErrorException
     */
    public function dispatchRequest(Element $element, Request $request)
    {
        $action = $request->attributes->get('action');
        switch ($action) {
            case 'select':
                return $this->selectAction($element, $request);
            case 'save':
                return $this->saveAction($element, $request);
            default:
                return parent::dispatchRequest($element, $request);
        }
    }

    /**
     * @param Element $element
     * @param Request $request
     * @return JsonResponse
     */
    protected function selectAction(Element $element, Request $request)
    {
        return new JsonResponse($this->getSelectActionResponseData($element, $request));
    }

    /**
     * @param Element $element
     * @param Request $request
     * @return JsonResponse
     * @throws \Exception
     */
    protected function saveAction(Element $element, Request $request)
    {
        $itemId = $request->query->get('id', null);
        $schemaName = $request->query->get('schema');
        if (!$this->schemaFilter->checkAllowSave($element, $schemaName, !$itemId)) {
            return new JsonResponse(array('message' => "It is not allowed to edit this data"), JsonResponse::HTTP_FORBIDDEN);
        }
        return new JsonResponse($this->getSaveActionResponseData($element, $request));
    }
}
