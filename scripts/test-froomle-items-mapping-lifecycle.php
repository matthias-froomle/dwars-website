<?php

declare(strict_types=1);

use Drupal\Core\Form\FormState;
use Drupal\froomle_items\Sync\BackfillRepository;
use Drupal\froomle_items\Sync\SyncRepository;
use Drupal\taxonomy\Entity\Term;
use Drupal\taxonomy\Entity\Vocabulary;
use GuzzleHttp\Client;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\Response;
use Psr\Http\Message\RequestInterface;

/**
 * Installed-runtime acceptance test for Froomle mapping lifecycle safety.
 *
 * Run only after scripts/verify-froomle-items-readiness.sh reports READY:
 *
 *   ddev drush php:script /var/www/html/scripts/test-froomle-items-mapping-lifecycle.php
 *
 * The script replaces Drupal's HTTP client before resolving any Froomle SDK
 * service. It therefore exercises OAuth and Items request construction without
 * allowing a network request. Temporary config/content/state/queue rows are
 * removed in the finally block.
 */

$mappingId = 'froomle_acceptance_20260815';
$sourceVocabularyId = 'froomle_acceptance_a';
$emptyVocabularyId = 'froomle_acceptance_b';
$stateKey = 'froomle_items.mapping_reconciliation';
$queueNames = [
  SyncRepository::QUEUE_NAME,
  SyncRepository::BACKFILL_QUEUE_NAME,
  BackfillRepository::QUEUE_NAME,
];
$database = \Drupal::database();
$entityTypeManager = \Drupal::entityTypeManager();
$mappingStorage = $entityTypeManager->getStorage('froomle_item_mapping');
$term = NULL;
$vocabularies = [];
$observed = [];
$ownedSyncIds = [];
$ownedJobIds = [];

$check = static function (bool $condition, string $message): void {
  if (!$condition) {
    throw new RuntimeException($message);
  }
  print "PASS {$message}\n";
};

$queueCount = static function (string $name): int {
  return \Drupal::queue($name)->numberOfItems();
};

$cleanup = static function () use (
  $database,
  $entityTypeManager,
  $mappingId,
  $sourceVocabularyId,
  $emptyVocabularyId,
  $stateKey,
  $queueNames,
  &$term,
  &$ownedSyncIds,
  &$ownedJobIds,
): void {
  $queued = $database->select('queue', 'queue')
    ->fields('queue', ['item_id', 'name', 'data'])
    ->condition('name', $queueNames, 'IN')
    ->execute();
  while (($item = $queued->fetchAssoc()) !== FALSE) {
    $data = @unserialize((string) $item['data'], ['allowed_classes' => FALSE]);
    if (!is_array($data) || !isset($data['id'])) {
      continue;
    }
    $ownedIds = $item['name'] === BackfillRepository::QUEUE_NAME
      ? $ownedJobIds
      : $ownedSyncIds;
    if (in_array((int) $data['id'], $ownedIds, TRUE)) {
      $database->delete('queue')
        ->condition('item_id', (int) $item['item_id'])
        ->execute();
    }
  }

  $jobIds = $database->select('froomle_items_backfill', 'job')
    ->fields('job', ['id'])
    ->condition('mapping_id', $mappingId)
    ->execute()
    ->fetchCol();
  if ($jobIds !== []) {
    $database->delete('froomle_items_backfill_item')
      ->condition('job_id', $jobIds, 'IN')
      ->execute();
  }
  $database->delete('froomle_items_backfill')
    ->condition('mapping_id', $mappingId)
    ->execute();
  $database->delete('froomle_items_sync')
    ->condition('mapping_id', $mappingId)
    ->execute();

  $requirements = \Drupal::state()->get($stateKey, []);
  if (is_array($requirements) && isset($requirements[$mappingId])) {
    unset($requirements[$mappingId]);
    \Drupal::state()->set($stateKey, $requirements);
  }

  $mapping = $entityTypeManager
    ->getStorage('froomle_item_mapping')
    ->load($mappingId);
  if ($mapping !== NULL) {
    $mapping->delete();
  }
  if ($term !== NULL && !$term->isNew()) {
    $term->delete();
  }
  foreach ([$sourceVocabularyId, $emptyVocabularyId] as $vocabularyId) {
    $vocabulary = $entityTypeManager
      ->getStorage('taxonomy_vocabulary')
      ->load($vocabularyId);
    if ($vocabulary !== NULL) {
      $vocabulary->delete();
    }
  }

  \Drupal::cache('froomle_oauth')->deleteAll();
};

try {
  foreach ($queueNames as $queueName) {
    $check($queueCount($queueName) === 0, "{$queueName} starts empty");
  }
  $check($mappingStorage->load($mappingId) === NULL, 'temporary mapping ID is unused');
  $check(
    $entityTypeManager->getStorage('taxonomy_vocabulary')->load($sourceVocabularyId) === NULL
      && $entityTypeManager->getStorage('taxonomy_vocabulary')->load($emptyVocabularyId) === NULL,
    'temporary vocabulary IDs are unused',
  );

  // Never retain or print OAuth bodies: observe only sanitized method/path and
  // the non-secret Items operation shape needed for assertions.
  $handler = static function (RequestInterface $request) use (&$observed): object {
    $method = $request->getMethod();
    $path = $request->getUri()->getPath();
    if ($path === '/oauth/token') {
      $observed[] = ['operation' => 'oauth', 'method' => $method, 'path' => $path];
      return Create::promiseFor(new Response(200, [], json_encode([
        'access_token' => 'local-acceptance-token',
        'token_type' => 'Bearer',
        'expires_in' => 3600,
      ], JSON_THROW_ON_ERROR)));
    }

    $operation = match (TRUE) {
      str_ends_with($path, '/enable') => 'enable',
      str_ends_with($path, '/disable') => 'disable',
      str_ends_with($path, '/delete') => 'delete',
      $method === 'POST' => 'create',
      $method === 'PUT' => 'upsert',
      default => 'unknown',
    };
    $body = (string) $request->getBody();
    $payload = $body !== '' ? json_decode($body, TRUE, flags: JSON_THROW_ON_ERROR) : [];
    $observed[] = [
      'operation' => $operation,
      'method' => $method,
      'path' => $path,
      'item_type' => is_array($payload) ? ($payload['item_type'] ?? NULL) : NULL,
      'acceptance_version' => is_array($payload)
        ? ($payload['item_attributes']['acceptance_version'] ?? NULL)
        : NULL,
    ];

    $status = match ($operation) {
      'create' => 201,
      'enable' => 204,
      'disable' => 202,
      'upsert' => 200,
      default => 200,
    };
    return Create::promiseFor(new Response($status));
  };
  \Drupal::getContainer()->set('http_client', new Client(['handler' => $handler]));
  \Drupal::cache('froomle_oauth')->deleteAll();

  $vocabularies[] = Vocabulary::create([
    'vid' => $sourceVocabularyId,
    'name' => 'Froomle acceptance source',
  ]);
  $vocabularies[] = Vocabulary::create([
    'vid' => $emptyVocabularyId,
    'name' => 'Froomle acceptance empty source',
  ]);
  foreach ($vocabularies as $vocabulary) {
    $vocabulary->save();
  }
  $term = Term::create([
    'vid' => $sourceVocabularyId,
    'name' => 'Froomle mapping lifecycle acceptance',
  ]);
  $term->save();

  $mapping = $mappingStorage->create([
    'id' => $mappingId,
    'label' => 'Froomle mapping lifecycle acceptance',
    'status' => TRUE,
    'entity_type_id' => 'taxonomy_term',
    'bundle' => $sourceVocabularyId,
    'item_type' => 'acceptance_test',
    'public_origin' => 'https://example.test',
    'eligibility' => 'always',
    'delete_policy' => 'disable',
    'mappings' => [
      [
        'target' => 'title',
        'resolver' => 'scalar',
        'source' => 'name.value',
        'value' => '',
        'omit_empty' => TRUE,
      ],
    ],
  ]);
  $mapping->save();

  $syncRepository = \Drupal::service('froomle_items.sync_repository');
  $initial = $syncRepository->recordEntity($term, $mapping, TRUE);
  $ownedSyncIds[] = (int) $initial['id'];
  $editorialQueue = \Drupal::queue(SyncRepository::QUEUE_NAME);
  $initialWake = $editorialQueue->claimItem(30);
  $check(
    is_object($initialWake)
      && is_array($initialWake->data)
      && (int) $initialWake->data['id'] === (int) $initial['id']
      && (int) $initialWake->data['generation'] === (int) $initial['generation'],
    'initial editorial wake belongs to the temporary item',
  );
  \Drupal::service('froomle_items.sync_processor')->process(
    (int) $initial['id'],
    (int) $initial['generation'],
  );
  $editorialQueue->deleteItem($initialWake);
  $row = $syncRepository->load((int) $initial['id']);
  $check(is_array($row), 'initial synchronization row exists');
  $check(
    (int) $row['generation'] === (int) $row['accepted_generation']
      && $row['remote_state'] === 'active',
    'mock-backed create and enable are accepted',
  );
  $check(
    array_column($observed, 'operation') === ['oauth', 'create', 'enable'],
    'initial SDK request sequence is OAuth, create, enable',
  );

  $lifecycle = \Drupal::service('froomle_items.mapping_lifecycle');
  $check($lifecycle->hasAcceptedWrite($mappingId), 'mapping records an accepted remote write');
  $candidate = clone $mapping;
  $candidate->set('item_type', 'changed_identity');
  $identityBlocked = FALSE;
  try {
    $lifecycle->assertCanSave($mapping, $candidate);
  }
  catch (DomainException) {
    $identityBlocked = TRUE;
  }
  $check($identityBlocked, 'item type is immutable after an accepted write');

  $formObject = $entityTypeManager
    ->getFormObject('froomle_item_mapping', 'edit')
    ->setEntity($mapping);
  $form = \Drupal::formBuilder()->buildForm($formObject, new FormState());
  $check(($form['item_type']['#disabled'] ?? FALSE) === TRUE, 'edit form disables item type');

  $mapping->set('label', 'Froomle mapping lifecycle acceptance renamed');
  $mapping->set('delete_policy', 'delete');
  $mapping->save();
  $check(!$lifecycle->requiresReconciliation($mapping), 'label and deletion policy need no reconciliation');
  $check(count($observed) === 3, 'policy-only save makes no API request');

  $mappings = $mapping->mappings();
  $mappings[] = [
    'target' => 'item_attributes.acceptance_version',
    'resolver' => 'constant',
    'source' => '',
    'value' => 'v2',
    'omit_empty' => TRUE,
  ];
  $mapping->set('mappings', $mappings);
  $mapping->save();
  $check($lifecycle->requiresReconciliation($mapping), 'payload change requires reconciliation');
  $check(count($observed) === 3, 'payload mapping save makes no API request');
  foreach ($queueNames as $queueName) {
    $check($queueCount($queueName) === 0, "{$queueName} remains empty after mapping save");
  }

  $previewer = \Drupal::service('froomle_items.backfill_previewer');
  $preview = $previewer->preview($mapping, ['scope' => 'reconcile']);
  $check(
    $preview['examined'] === 1
      && $preview['active_count'] === 1
      && $preview['disable_count'] === 0
      && $preview['errors'] === 0,
    'first reconciliation preview selects one active item without errors',
  );
  $check(count($observed) === 3, 'reconciliation preview makes no API request');

  $backfills = \Drupal::service('froomle_items.backfill_repository');
  $firstJob = $backfills->create(
    $mappingId,
    'reconcile',
    NULL,
    $preview['count'],
    $preview['fingerprint'],
    $preview['examined'],
  );
  $ownedJobIds[] = $firstJob;
  $enumerationQueue = \Drupal::queue(BackfillRepository::QUEUE_NAME);
  $enumerationWake = $enumerationQueue->claimItem(30);
  $check(
    is_object($enumerationWake)
      && is_array($enumerationWake->data)
      && (int) $enumerationWake->data['id'] === $firstJob,
    'first reconciliation wake belongs to the temporary job',
  );
  \Drupal::service('froomle_items.backfill_processor')->process($firstJob, FALSE);
  $enumerationQueue->deleteItem($enumerationWake);
  $row = $syncRepository->findByMappingAndUuid($mappingId, $term->uuid());
  $check(is_array($row), 'first reconciliation retains the temporary synchronization row');
  $deliveryQueue = \Drupal::queue(SyncRepository::BACKFILL_QUEUE_NAME);
  $deliveryWake = $deliveryQueue->claimItem(30);
  $check(
    is_object($deliveryWake)
      && is_array($deliveryWake->data)
      && (int) $deliveryWake->data['id'] === (int) $row['id']
      && (int) $deliveryWake->data['generation'] === (int) $row['generation'],
    'first reconciliation delivery wake belongs to the temporary item',
  );
  \Drupal::service('froomle_items.sync_processor')->process(
    (int) $row['id'],
    (int) $row['generation'],
  );
  $deliveryQueue->deleteItem($deliveryWake);
  $check(
    $backfills->outcomeCounts($firstJob) === [
      'total' => 1,
      'accepted' => 1,
      'pending' => 0,
      'retrying' => 0,
      'failed' => 0,
    ],
    'payload reconciliation completes with one accepted item',
  );
  $check(!$lifecycle->requiresReconciliation($mapping), 'completed enumeration clears exact requirement');
  $lastObserved = $observed[array_key_last($observed)];
  $check(
    $lastObserved['operation'] === 'upsert'
      && $lastObserved['item_type'] === 'acceptance_test'
      && $lastObserved['acceptance_version'] === 'v2',
    'reconciliation sends the changed payload through the locked item type',
  );

  $mapping->set('bundle', $emptyVocabularyId);
  $mapping->save();
  $check($lifecycle->requiresReconciliation($mapping), 'source-bundle change requires reconciliation');
  $check(count($observed) === 4, 'source mapping save makes no API request');
  $preview = $previewer->preview($mapping, ['scope' => 'reconcile']);
  $check(
    $preview['examined'] === 0
      && $preview['active_count'] === 0
      && $preview['disable_count'] === 1
      && $preview['errors'] === 0,
    'second reconciliation preview identifies one stale item to disable',
  );

  $secondJob = $backfills->create(
    $mappingId,
    'reconcile',
    NULL,
    $preview['count'],
    $preview['fingerprint'],
    $preview['examined'],
  );
  $ownedJobIds[] = $secondJob;
  $enumerationWake = $enumerationQueue->claimItem(30);
  $check(
    is_object($enumerationWake)
      && is_array($enumerationWake->data)
      && (int) $enumerationWake->data['id'] === $secondJob,
    'stale-item reconciliation wake belongs to the temporary job',
  );
  \Drupal::service('froomle_items.backfill_processor')->process($secondJob, FALSE);
  $enumerationQueue->deleteItem($enumerationWake);
  $row = $syncRepository->findByMappingAndUuid($mappingId, $term->uuid());
  $check(is_array($row), 'stale-item reconciliation retains the temporary synchronization row');
  $deliveryWake = $deliveryQueue->claimItem(30);
  $check(
    is_object($deliveryWake)
      && is_array($deliveryWake->data)
      && (int) $deliveryWake->data['id'] === (int) $row['id']
      && (int) $deliveryWake->data['generation'] === (int) $row['generation'],
    'stale-item disable wake belongs to the temporary item',
  );
  \Drupal::service('froomle_items.sync_processor')->process(
    (int) $row['id'],
    (int) $row['generation'],
  );
  $deliveryQueue->deleteItem($deliveryWake);
  $check(
    $backfills->outcomeCounts($secondJob) === [
      'total' => 1,
      'accepted' => 1,
      'pending' => 0,
      'retrying' => 0,
      'failed' => 0,
    ],
    'stale-item reconciliation completes with one accepted disable',
  );
  $row = $syncRepository->load((int) $initial['id']);
  $check(
    is_array($row)
      && $row['remote_state'] === 'disabled'
      && (int) $row['generation'] === (int) $row['accepted_generation'],
    'stale item finishes settled and disabled',
  );
  $check(
    array_column($observed, 'operation') === ['oauth', 'create', 'enable', 'upsert', 'disable'],
    'complete sanitized request sequence matches the lifecycle contract',
  );

  print "RESULT installed mapping lifecycle acceptance passed\n";
}
finally {
  $cleanup();
  print "CLEANUP temporary mapping, content, state, queues, and OAuth cache removed\n";
}
