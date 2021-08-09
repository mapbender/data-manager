<?php
namespace Mapbender\DataManagerBundle;

use Mapbender\CoreBundle\Component\MapbenderBundle;
use Mapbender\DataSourceBundle\MapbenderDataSourceBundle;
use Symfony\Component\Config\FileLocator;
use Symfony\Component\Config\Resource\FileResource;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Loader\XmlFileLoader;

/**
 * Data manager bundle.
 * 
 * @author Andriy Oblivantsev
 */
class MapbenderDataManagerBundle extends MapbenderBundle
{
    /**
     * @inheritdoc
     */
    public function getElements()
    {
        if ($this->useService()) {
            return array();
        } else {
            return array(
                'Mapbender\DataManagerBundle\Element\DataManagerElement',
            );
        }
    }

    public function build(ContainerBuilder $container)
    {
        // Ensure DataSourceBundle services exist (independent of kernel registration)
        $dsBundle = new MapbenderDataSourceBundle();
        $dsBundle->build($container);

        $configLocator = new FileLocator(__DIR__ . '/Resources/config');
        $loader = new XmlFileLoader($container, $configLocator);
        $loader->load('services.xml');
        $container->addResource(new FileResource($loader->getLocator()->locate('services.xml')));
        if ($this->useService()) {
            $loader->load('elements.xml');
            $container->addResource(new FileResource($loader->getLocator()->locate('elements.xml')));
        }
    }

    protected static function useService()
    {
        try {
            return \class_exists('\Mapbender\Component\Element\AbstractElementService');
        } catch (\ErrorException $e) {
            // Thrown by Symfony 3+ debug class loader
            return false;
        }
    }
}
