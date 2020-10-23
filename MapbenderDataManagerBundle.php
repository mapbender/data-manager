<?php
namespace Mapbender\DataManagerBundle;

use Mapbender\CoreBundle\Component\MapbenderBundle;
use Symfony\Component\Config\FileLocator;
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
        return array(
            'Mapbender\DataManagerBundle\Element\DataManagerElement',
        );
    }

    public function build(ContainerBuilder $container)
    {
        parent::build($container);
        $configLocator = new FileLocator(__DIR__ . '/Resources/config');
        $loader = new XmlFileLoader($container, $configLocator);
        $loader->load('services.xml');
    }
}
