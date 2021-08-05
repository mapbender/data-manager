<?php


namespace Mapbender\DataManagerBundle\Element;


use Mapbender\Component\Element\ElementServiceInterface;
use Mapbender\Component\Element\HttpHandlerProvider;
use Mapbender\Component\Element\StaticView;
use Mapbender\CoreBundle\Entity\Element;
use Mapbender\DataManagerBundle\Component\BaseHttpHandler;
use Mapbender\DataManagerBundle\Component\DataManagerBase;
use Mapbender\DataManagerBundle\Component\SchemaFilter;
use Mapbender\DataSourceBundle\Component\RepositoryRegistry;

class DataManager extends DataManagerBase implements ElementServiceInterface, HttpHandlerProvider
{
    public function __construct(RepositoryRegistry $registry, SchemaFilter $schemaFilter, BaseHttpHandler $httpHandler)
    {
        parent::__construct($registry, $schemaFilter, $httpHandler);
    }

    public function getView(Element $element)
    {
        // no content
        $view = new StaticView('');
        $view->attributes['class'] = 'mb-element-data-manager';
        return $view;
    }

    public function getClientConfiguration(Element $element)
    {
        $configuration = $element->getConfiguration();
        $schemaConfigs = $configuration['schemes'];
        foreach (\array_keys($configuration['schemes']) as $schemaName) {
            $schemaConfig = $this->schemaFilter->getRawSchemaConfig($element, $schemaName, true);
            $schemaConfig = $this->schemaFilter->processSchemaBaseConfig($schemaConfig, $schemaName);
            $schemaConfigs[$schemaName] = $schemaConfig;
        }
        $configuration['schemes'] = $this->schemaFilter->prepareConfigs($schemaConfigs);
        return $configuration;
    }
}
