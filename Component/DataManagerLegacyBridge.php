<?php


namespace Mapbender\DataManagerBundle\Component;

use Mapbender\CoreBundle\Entity\Element;

/**
 * @property SchemaFilterLegacy $schemaFilter
 * @property LegacyHttpHandler $httpHandler
 * @method LegacyHttpHandler getHttpHandler(Element $element)
 *
 * Trivial public-access extension for legacy Element component and inheriting
 * Digitizer.
 *
 * @todo: remove DataManagerElement and this class (breaks Digitizer <= 1.4.10; requires Mapbender >= 3.2.6)
 */
class DataManagerLegacyBridge extends DataManagerBase
{
    /**
     * @return SchemaFilterLegacy
     */
    public function getSchemaFilter()
    {
        return $this->schemaFilter;
    }

    public function processSchemaBaseConfig(array $schemaConfig, $schemaName)
    {
        return parent::processSchemaBaseConfig($schemaConfig, $schemaName);
    }
}
