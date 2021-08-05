<?php


namespace Mapbender\DataManagerBundle\Component;


use Mapbender\CoreBundle\Entity\Element;
use Mapbender\DataSourceBundle\Component\RepositoryRegistry;

/**
 * Symfony 4-conformant service-type Element implementation for Mapbender >=3.2.6
 * Implements most of the element service methods, without formally declaring "implements" (for BC)
 * @see \Mapbender\Component\Element\ElementServiceInterface
 *
 * @todo: fold this into DataManager service (breaks Digitizer <= 1.4.10)
 */
class DataManagerBase
{
    /** @var RepositoryRegistry */
    protected $registry;
    /** @var SchemaFilter */
    protected $schemaFilter;
    /** @var BaseHttpHandler */
    protected $httpHandler;

    public function __construct(RepositoryRegistry $registry,
                                SchemaFilter $schemaFilter,
                                BaseHttpHandler $httpHandler)
    {
        $this->registry = $registry;
        $this->schemaFilter = $schemaFilter;
        $this->httpHandler = $httpHandler;
    }

    public static function getClassTitle()
    {
        // @todo: translations
        return "Data manager";
    }

    public static function getClassDescription()
    {
        // @todo: translation
        return "Data manager element";
    }


    /** @noinspection PhpUnusedParameterInspection */
    public function getWidgetName(Element $element)
    {
        return 'mapbender.mbDataManager';
    }

    public static function getDefaultConfiguration()
    {
        return array(
            'schemes' => null,
        );
    }

    /** @noinspection PhpUnusedParameterInspection */
    public function getRequiredAssets(Element $element)
    {
        return array(
            'css' => array(
                '@MapbenderDataManagerBundle/Resources/styles/dataManager.element.scss',
            ),
            'js' => array(
                '@MapbenderDataManagerBundle/Resources/public/FormRenderer.js',
                '@MapbenderDataManagerBundle/Resources/public/FormUtil.js',
                '@MapbenderDataManagerBundle/Resources/public/DialogFactory.js',
                '../../vendor/blueimp/jquery-file-upload/js/jquery.fileupload.js',
                '@MapbenderDataManagerBundle/Resources/public/TableRenderer.js',
                '@MapbenderDataManagerBundle/Resources/public/dataManager.element.js',
            ),
            'trans' => array(
                'mb.data-manager.*',
                'mb.data.store.*',  // legacy quirk: this is in our translation catalogs
            ),
        );
    }

    public static function getFormTemplate()
    {
        return 'MapbenderDataManagerBundle:ElementAdmin:dataManager.html.twig';
    }

    public static function getType()
    {
        return 'Mapbender\DataManagerBundle\Element\Type\DataManagerAdminType';
    }

    /**
     * @param Element $element
     * @return BaseHttpHandler
     * @noinspection PhpUnusedParameterInspection
     */
    public function getHttpHandler(Element $element)
    {
        return $this->httpHandler;
    }
}
