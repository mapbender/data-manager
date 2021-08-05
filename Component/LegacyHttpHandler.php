<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;
use Symfony\Component\HttpFoundation\Request;

/**
 * Http handler with extended public API access for legacy Digitizer
 * integration.
 *
 * @todo: drop this class (breaks DataManagerElement; breaks Digitizer <= 1.4.10)
 * @deprecated
 */
class LegacyHttpHandler extends BaseHttpHandler
{
    /**
     * Override parent to increase visibility protected => public.
     *
     * @param Element $element
     * @param Request $request
     * @return array
     */
    public function getSaveActionResponseData(Element $element, Request $request)
    {
        return parent::getSaveActionResponseData($element, $request);
    }

    /**
     * Override parent to increase visibility protected => public.
     *
     * @param Element $element
     * @param Request $request
     * @return array
     */
    public function getSelectActionResponseData(Element $element, Request $request)
    {
        return parent::getSelectActionResponseData($element, $request);
    }
}
