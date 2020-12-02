<?php
namespace Mapbender\DataManagerBundle\Component;

if (!class_exists('UploadHandler')) {
    include_once('../vendor/blueimp/jquery-file-upload/server/php/UploadHandler.php');
}

/**
 * Class Uploader
 *
 * @package Mapbender\DigitizerBundle\Component
 * @author  Andriy Oblivantsev <eslider@gmail.com>
 */
class Uploader extends \UploadHandler
{
    /**
     * Reimplement to fix upstream error handling null $content_range
     */
    protected function get_unique_filename($file_path, $name, $size, $type, $error,
        $index, $content_range) {
        while(is_dir($this->get_upload_path($name))) {
            $name = $this->upcount_name($name);
        }
        while (is_file($this->get_upload_path($name))) {
            if ($content_range) {
                // Keep an existing filename if this is part of a chunked upload:
                $uploaded_bytes = $this->fix_integer_overflow((int)$content_range[1]);
                if ($uploaded_bytes === $this->get_file_size(
                        $this->get_upload_path($name))) {
                    break;
                }
            }
            $name = $this->upcount_name($name);
        }
        return $name;
    }

    /**
     * Overwrites name upcount
     *
     * @param $matches
     * @return string
     */
    protected function upcount_name_callback($matches)
    {
        $index = isset($matches[1]) ? ((int)$matches[1]) + 1 : 1;
        $ext   = isset($matches[2]) ? $matches[2] : '';
        return '.' . $index  . $ext;
    }

    /**
     * @param $name
     * @return mixed
     */
    protected function upcount_name($name) {
        return preg_replace_callback(
            '/(?:(?:\.([\d]+))?(\.[^.]+))?$/',
            array($this, 'upcount_name_callback'),
            $name,
            1
        );
    }
}
