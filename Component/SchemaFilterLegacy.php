<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;

class SchemaFilterLegacy extends SchemaFilter
{
    /** @var array */
    protected $schemaConfigDefaults = array();

    public function setSchemaConfigDefaults(array $defaults)
    {
        $this->schemaConfigDefaults = $defaults;
    }

    public function checkAllowSave(Element $element, $schemaName, $isNew)
    {
        $schemaConfig = $this->getRawSchemaConfig($element, $schemaName, false) + $this->schemaConfigDefaults;
        return $this->checkAllowSaveInternal($schemaConfig, $isNew);
    }

    public function checkAllowDelete(Element $element, $schemaName)
    {
        $schemaConfig = $this->getRawSchemaConfig($element, $schemaName, false)  + $this->schemaConfigDefaults;
        return $this->checkAllowDeleteInternal($schemaConfig);
    }
}
