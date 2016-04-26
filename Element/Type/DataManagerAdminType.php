<?php

namespace Mapbender\DataManagerBundle\Element\Type;

use Mapbender\ManagerBundle\Form\Type\YAMLConfigurationType;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolverInterface;

/**
 * Class DataManagerAdminType
 *
 * @package Mapbender\DataStoreBundle\Element\Type
 * @author  Andriy Oblivantsev <eslider@gmail.com>
 */
class DataManagerAdminType extends AbstractType
{

    /**
     * @inheritdoc
     */
    public function getName()
    {
        return 'dataManager';
    }

    /**
     * @inheritdoc
     */
    public function setDefaultOptions(OptionsResolverInterface $resolver)
    {
        $resolver->setDefaults(array(
            'application' => null
        ));
    }

    /**
     * @inheritdoc
     */
    public function buildForm(FormBuilderInterface $builder, array $options)
    {
        $builder->add('schemes', new YAMLConfigurationType(),
            array('required' => false, 'attr' => array('class' => 'code-yaml')));
    }
}