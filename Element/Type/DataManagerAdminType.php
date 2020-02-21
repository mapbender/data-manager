<?php

namespace Mapbender\DataManagerBundle\Element\Type;

use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

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
    public function configureOptions(OptionsResolver $resolver)
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
        $builder
            ->add('schemes', 'Mapbender\ManagerBundle\Form\Type\YAMLConfigurationType', array(
                'required' => false,
                'attr' => array(
                    'class' => 'code-yaml',
                ),
            ))
            ->add('dataManager', 'Mapbender\\CoreBundle\\Element\Type\\TargetElementType', array(
                'element_class' => 'Mapbender\\DataManagerBundle\\Element\\DataManagerElement',
                'application'   => $options['application'],
                'label' => 'mb.digitizer.connectedDataManager',
                'required' => false,
            ))
        ;
    }
}
