<?php


namespace Mapbender\DataManagerBundle\Component;


use Doctrine\DBAL\Connection;
use Doctrine\DBAL\FetchMode;
use Doctrine\Persistence\ConnectionRegistry;
use Symfony\Component\Translation\TranslatorInterface;

class FormItemFilter
{
    /** @var ConnectionRegistry */
    protected $connectionRegistry;
    /** @var TranslatorInterface */
    protected $translator;

    public function __construct(ConnectionRegistry $connectionRegistry,
                                TranslatorInterface $translator)
    {
        $this->connectionRegistry = $connectionRegistry;
        $this->translator = $translator;
    }

    public function prepareItems($items)
    {
        $itemsOut = array();
        foreach ($items as $item) {
            if ($item) {
                if (\is_array($item)) {
                    $itemsOut[] = $this->prepareItem($item);
                } else {
                    $itemsOut[] = $item;
                }
            }
        }
        return $itemsOut;
    }

    public function prepareItem(array $item)
    {
        if (!empty($item['type']) && $item['type'] === 'select') {
            return $this->prepareSelectItem($item);
        } else {
            if (!empty($item['children'])) {
                $item['children'] = $this->prepareItems($item['children']);
            } else {
                unset($item['children']);
            }
            return $this->translateProps($item, array(
                'title',
                'text',
            ));
        }
    }

    /**
     * @param mixed[] $item
     * @return mixed[]
     */
    protected function prepareSelectItem(array $item)
    {
        $this->checkSelectItem($item);
        if (!empty($item['options'])) {
            $options = $this->formatStaticSelectItemOptions($item);
        } else {
            $options = array();
        }
        if (!empty($item['sql'])) {
            $options = array_merge($options, $this->getSqlSelectItemOptions($item));
        }
        $item['options'] = $options;
        unset($item['sql']);
        unset($item['connection']);
        return $item;
    }

    /**
     * Reformat statically defined select item options for FormRenderer script
     *
     * @param mixed[] $item
     * @return array
     */
    protected function formatStaticSelectItemOptions($item)
    {
        $warnedAmbiguous = false;
        if (empty($item['options'])) {
            return array();
        } else {
            // bring options into same format as generated by
            // SQL path, so mix and match works.
            $options = array();
            foreach ($item['options'] as $key => $mapped) {
                if (\is_array($mapped)) {
                    $option = $mapped + array(
                        'label' => $key,
                        'value' => $key,
                    );
                } else {
                    $option = array(
                        'value' => $key,
                        'label' => $mapped,
                    );
                    if (!$warnedAmbiguous) {
                        @trigger_error("WARNING: ambiguous (label vs value) non-array select item option {$key} => {$mapped}. Prefer a list of objects with 'value' and 'label' properties.", E_USER_DEPRECATED);
                        $warnedAmbiguous = true;
                    }
                }
                $options[] = $option;
            }
            return $options;
        }
    }

    /**
     * @param mixed[] $item
     * @return mixed[]
     */
    protected function getSqlSelectItemOptions($item)
    {
        $options = array();
        $warnedSingleColumn = false;
        $connectionName = isset($item['connection']) ? $item['connection'] : 'default';
        /** @var Connection $connection */
        $connection = $this->connectionRegistry->getConnection($connectionName);
        foreach ($connection->executeQuery($item['sql'])->fetchAll(FetchMode::ASSOCIATIVE) as $row) {
            // throw out resource-type columns (certain Oracle types)
            $row = \array_filter($row, function($column) {
                return !\is_resource($column);
            });
            if (count($row) <= 1) {
                if (!$warnedSingleColumn) {
                    @trigger_error("Sql for select item options is single-column. Use a statement that generates a value (first) and label (second).", E_USER_DEPRECATED);
                    $warnedSingleColumn = true;
                }
                $both = array_values($row)[0];
                $options[] = array(
                    'label' => $both,
                    'value' => $both,
                    'properties' => $row,
                );
            } else {
                $flat = \array_values($row);
                $options[] = array(
                    'label' => $flat[0],
                    // Use LAST column, like legacy BaseElement
                    /** @see https://github.com/mapbender/data-source/blob/0.0.35/Element/BaseElement.php#L95 */
                    'value' => $flat[count($flat) - 1],
                    'properties' => $row,
                );
            }
        }
        return $options;
    }

    /**
     * @param array $item
     * @throws \RuntimeException
     */
    protected function checkSelectItem(array $item)
    {
        if (!empty($item['service'])) {
            throw new \RuntimeException("Unsupported select item property 'service'");
        }
        foreach (array('dataStore', 'featureType') as $invalidMode) {
            if (\array_key_exists($invalidMode, $item)) {
                throw new \RuntimeException("Unsupported select item property '{$invalidMode}'. Use 'sql' instead.");
            }
        }
        if (!empty($item['options']) && !\is_array($item['options'])) {
            throw new \RuntimeException("Invalid type " . gettype($item['options']) . " in select item options. Expected array. Item: " . print_r($item, true));
        }
    }

    /**
     * @param mixed[] $values
     * @param string[] $translatables
     * @return mixed[]
     */
    protected function translateProps(array $values, array $translatables)
    {
        foreach ($translatables as $translatable) {
            /** @todo: resolve config caching break (locale dependency not supported in config caching) */
            if (!empty($values[$translatable]) && \preg_match('#^trans:\w+([\.\-]\w+)*$#', $values[$translatable])) {
                $values[$translatable] = $this->translator->trans(substr($values[$translatable], /* strlen('trans:') */ 6));
            }
        }
        return $values;
    }
}
