<?php

/**
 * @file
 * Idempotently imports prototype editions 166-169 into Drupal.
 *
 * Run through scripts/import-editions-local.sh. It defaults to a dry run.
 */

use Drupal\Core\File\FileExists;
use Drupal\Core\File\FileSystemInterface;
use Drupal\file\FileInterface;
use Drupal\node\Entity\Node;
use Drupal\taxonomy\Entity\Term;

$apply = in_array('--apply', $_SERVER['argv'] ?? [], TRUE);
$source_root = getenv('DWARS_EDITION_SOURCE') ?: '/var/www/html/public';
$editions = [
  166 => ['month' => 'oktober', 'date' => '2025-10-01', 'volume' => 25],
  167 => ['month' => 'november', 'date' => '2025-11-01', 'volume' => 25],
  168 => ['month' => 'december', 'date' => '2025-12-01', 'volume' => 25],
  169 => ['month' => 'maart', 'date' => '2026-03-01', 'volume' => 25],
];

$node_storage = \Drupal::entityTypeManager()->getStorage('node');
$file_repository = \Drupal::service('file.repository');
$file_system = \Drupal::service('file_system');
foreach (['public://edities', 'public://edities-covers'] as $directory) {
  if (!$file_system->prepareDirectory($directory, FileSystemInterface::CREATE_DIRECTORY | FileSystemInterface::MODIFY_PERMISSIONS)) {
    throw new RuntimeException("Could not prepare edition destination: $directory");
  }
}

foreach ($editions as $number => $edition) {
  $pdf_source = "$source_root/edities/dwars-$number.pdf";
  $cover_source = "$source_root/edities-covers/cover-$number.png";
  foreach ([$pdf_source, $cover_source] as $source) {
    if (!is_file($source)) {
      throw new RuntimeException("Missing edition source: $source");
    }
  }

  $existing = $node_storage->getQuery()
    ->accessCheck(FALSE)
    ->condition('type', 'dwars_nummer')
    ->condition('title', [(string) $number, "DWARS $number"], 'IN')
    ->range(0, 1)
    ->execute();
  if ($existing) {
    print "SKIP DWARS $number: node already exists (" . reset($existing) . ").\n";
    continue;
  }

  print ($apply ? 'IMPORT' : 'WOULD IMPORT') . " DWARS $number ({$edition['date']}).\n";
  if (!$apply) {
    continue;
  }

  $transaction = \Drupal::database()->startTransaction();
  try {
    $pdf = $file_repository->writeData(
      file_get_contents($pdf_source),
      "public://edities/dwars-$number.pdf",
      FileExists::Replace,
    );
    $cover = $file_repository->writeData(
      file_get_contents($cover_source),
      "public://edities-covers/cover-$number.png",
      FileExists::Replace,
    );

    $term_ids = \Drupal::entityTypeManager()->getStorage('taxonomy_term')->getQuery()
      ->accessCheck(FALSE)
      ->condition('vid', 'dwars_nummers')
      ->condition('name', (string) $number)
      ->range(0, 1)
      ->execute();
    $term = $term_ids ? Term::load(reset($term_ids)) : Term::create([
      'vid' => 'dwars_nummers',
      'name' => (string) $number,
    ]);
    if ($term->isNew()) {
      $term->save();
    }

    $values = [
      'type' => 'dwars_nummer',
      'title' => (string) $number,
      'status' => 1,
    ];
    $node = Node::create($values);
    _dwars_import_set($node, 'field_maand', $edition['month']);
    _dwars_import_set($node, 'field_publicatiedatum', $edition['date']);
    _dwars_import_set($node, 'field_jaargang', $edition['volume']);
    _dwars_import_set($node, 'field_bijzonder_nr_', 0);
    _dwars_import_set_file($node, 'field_pdf', $pdf, "DWARS $number (pdf)");
    _dwars_import_set_cover($node, 'field_voorpagina', $cover, "Cover DWARS $number");
    _dwars_import_set($node, 'field_dwarsnr', ['target_id' => $term->id()]);
    $node->save();
    print "IMPORTED DWARS $number as node {$node->id()}.\n";
  }
  catch (Throwable $error) {
    $transaction->rollBack();
    throw $error;
  }
}

/** Sets an optional field without assuming all historical config is present. */
function _dwars_import_set(Node $node, string $field_name, mixed $value): void {
  if ($node->hasField($field_name)) {
    $node->set($field_name, $value);
  }
}

/** Sets a file or image field. */
function _dwars_import_set_file(Node $node, string $field_name, FileInterface $file, string $description): void {
  if (!$node->hasField($field_name)) {
    return;
  }
  $node->set($field_name, [
    'target_id' => $file->id(),
    'description' => $description,
  ]);
}

/** Supports both a direct image field and the site's historical foto node. */
function _dwars_import_set_cover(Node $node, string $field_name, FileInterface $file, string $alt): void {
  if (!$node->hasField($field_name)) {
    return;
  }
  $definition = $node->getFieldDefinition($field_name);
  if ($definition->getType() === 'image') {
    $node->set($field_name, ['target_id' => $file->id(), 'alt' => $alt]);
    return;
  }
  if ($definition->getSetting('target_type') === 'node') {
    $photo = Node::create(['type' => 'foto', 'title' => $alt, 'status' => 1]);
    if (!$photo->hasField('field_fotozelf')) {
      throw new RuntimeException('The foto bundle has no field_fotozelf field.');
    }
    $photo->set('field_fotozelf', ['target_id' => $file->id(), 'alt' => $alt]);
    $photo->save();
    $node->set($field_name, ['target_id' => $photo->id()]);
    return;
  }
  $node->set($field_name, ['target_id' => $file->id()]);
}
