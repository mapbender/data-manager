<?php
namespace Mapbender\DataManagerBundle;

use Mapbender\CoreBundle\Component\MapbenderBundle;

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
}
