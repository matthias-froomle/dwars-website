<?php

declare(strict_types=1);

use Drupal\Core\Entity\ContentEntityInterface;
use Drupal\froomle_items\Sync\BackfillRepository;
use Drupal\froomle_items\Sync\SyncRepository;
use GuzzleHttp\Client;
use Psr\Http\Message\RequestInterface;

/**
 * Reconciles the real local catalogue through a payload-equivalent mapping.
 *
 * The default invocation is read-only and preflights every current/known item:
 *
 *   ddev drush php:script /var/www/html/scripts/test-froomle-items-real-catalogue-reconciliation.php
 *
 * Only after that reports PRECHECK READY, opt in to one direction:
 *
 *   ddev exec env FROOMLE_NOOP_APPLY=1 drush php:script /var/www/html/scripts/test-froomle-items-real-catalogue-reconciliation.php
 *
 * The first applied run adds an impossible scalar fallback before title.value;
 * the second restores title.value exactly. Both runs replace Drupal's HTTP
 * client with a fail-closed handler and abort unless every planned Items
 * operation is empty before the mapping is saved.
 */

const FROOMLE_MAPPING_ID = 'dwars_articles';
const FROOMLE_ORIGINAL_TITLE_SOURCE = 'title.value';
const FROOMLE_PROBE_TITLE_SOURCE = '__froomle_noop_probe.value|title.value';

$apply = getenv('FROOMLE_NOOP_APPLY') === '1';
$database = \Drupal::database();
$entityTypeManager = \Drupal::entityTypeManager();
$mappingStorage = $entityTypeManager->getStorage('froomle_item_mapping');
$mapping = $mappingStorage->load(FROOMLE_MAPPING_ID);
if ($mapping === NULL) {
  throw new RuntimeException('The DWARS item mapping is missing.');
}

$check = static function (bool $condition, string $message): void {
  if (!$condition) {
    throw new RuntimeException($message);
  }
  print "PASS {$message}\n";
};

foreach ([
  SyncRepository::QUEUE_NAME,
  SyncRepository::BACKFILL_QUEUE_NAME,
  BackfillRepository::QUEUE_NAME,
] as $queueName) {
  $check(\Drupal::queue($queueName)->numberOfItems() === 0, "{$queueName} starts empty");
}

$lifecycle = \Drupal::service('froomle_items.mapping_lifecycle');
$check(!$lifecycle->requiresReconciliation($mapping), 'mapping starts without a reconciliation requirement');
$backfills = \Drupal::service('froomle_items.backfill_repository');
$check(!$backfills->hasOpenJob(FROOMLE_MAPPING_ID), 'mapping starts without unfinished synchronization work');

$mappings = $mapping->mappings();
$titleIndex = NULL;
foreach ($mappings as $index => $row) {
  if ($row['target'] === 'title' && $row['resolver'] === 'scalar') {
    $titleIndex = $index;
    break;
  }
}
$check(is_int($titleIndex), 'title scalar mapping row exists');
$currentSource = $mappings[$titleIndex]['source'];
$candidateSource = match ($currentSource) {
  FROOMLE_ORIGINAL_TITLE_SOURCE => FROOMLE_PROBE_TITLE_SOURCE,
  FROOMLE_PROBE_TITLE_SOURCE => FROOMLE_ORIGINAL_TITLE_SOURCE,
  default => throw new RuntimeException('The title mapping is neither the exact original nor the acceptance probe.'),
};
$direction = $candidateSource === FROOMLE_PROBE_TITLE_SOURCE ? 'temporary' : 'restore';
$mappings[$titleIndex]['source'] = $candidateSource;
$candidate = clone $mapping;
$candidate->set('mappings', $mappings);

$fingerprints = \Drupal::service('froomle_items.mapping_fingerprint');
$check(
  !hash_equals($fingerprints->hash($mapping), $fingerprints->hash($candidate)),
  'candidate changes the mapping fingerprint',
);

$syncRepository = \Drupal::service('froomle_items.sync_repository');
$knownRows = $syncRepository->rowsForMapping(FROOMLE_MAPPING_ID);
$remainingKnownRows = $knownRows;
$payloadBuilder = \Drupal::service('froomle_items.payload_builder');
$eligibility = \Drupal::service('froomle_items.eligibility_checker');
$planner = \Drupal::service('froomle_items.sync_planner');
$storage = $entityTypeManager->getStorage($candidate->entityTypeId());
$definition = $entityTypeManager->getDefinition($candidate->entityTypeId());
$idKey = $definition->getKey('id');
$bundleKey = $definition->getKey('bundle');
$check(is_string($idKey) && $idKey !== '' && is_string($bundleKey) && $bundleKey !== '', 'mapped entity keys are available');

$examined = 0;
$active = 0;
$disabled = 0;
$skipped = 0;
$payloadErrors = 0;
$plannedOperations = 0;
$missingKnownRows = 0;
$operationSamples = [];
$cursor = NULL;
do {
  $query = $storage->getQuery()
    ->accessCheck(FALSE)
    ->condition($bundleKey, $candidate->bundle())
    ->sort($idKey, 'ASC')
    ->range(0, 100);
  if ($cursor !== NULL) {
    $query->condition($idKey, $cursor, '>');
  }
  $ids = array_values($query->execute());
  $entities = $storage->loadMultiple($ids);
  foreach ($ids as $entityId) {
    $cursor = (string) $entityId;
    $examined++;
    $entity = $entities[$entityId] ?? NULL;
    if (!$entity instanceof ContentEntityInterface) {
      $payloadErrors++;
      continue;
    }
    $uuid = $entity->getUntranslated()->uuid();
    $known = $knownRows[$uuid] ?? NULL;
    unset($remainingKnownRows[$uuid]);
    if (!$eligibility->isEligible($entity, $candidate)) {
      if (!is_array($known)) {
        $skipped++;
        continue;
      }
      $disabled++;
      $operations = $planner->plan(
        'disabled',
        (string) $known['remote_state'],
        '',
        (string) $known['accepted_payload_hash'],
      );
    }
    else {
      $active++;
      if (!is_array($known)) {
        $missingKnownRows++;
        continue;
      }
      try {
        $payload = $payloadBuilder->build($entity, $candidate);
        $payloadHash = $payloadBuilder->hash($payload);
      }
      catch (Throwable) {
        $payloadErrors++;
        continue;
      }
      $operations = $planner->plan(
        'active',
        (string) $known['remote_state'],
        $payloadHash,
        (string) $known['accepted_payload_hash'],
      );
    }
    if ($operations !== []) {
      $plannedOperations++;
      if (count($operationSamples) < 3) {
        $operationSamples[] = [
          'item_id' => (string) $known['item_id'],
          'operations' => $operations,
        ];
      }
    }
  }
  if ($examined > 0 && ($examined % 500 === 0 || count($ids) < 100)) {
    print "PREFLIGHT examined={$examined} active={$active} disabled={$disabled} payload_errors={$payloadErrors} planned_operation_items={$plannedOperations}\n";
  }
  $storage->resetCache($ids);
  \Drupal::service('entity.memory_cache')->deleteAll();
  unset($entities);
  gc_collect_cycles();
} while (count($ids) === 100);

foreach ($remainingKnownRows as $known) {
  $disabled++;
  $operations = $planner->plan(
    'disabled',
    (string) $known['remote_state'],
    '',
    (string) $known['accepted_payload_hash'],
  );
  if ($operations !== []) {
    $plannedOperations++;
    if (count($operationSamples) < 3) {
      $operationSamples[] = [
        'item_id' => (string) $known['item_id'],
        'operations' => $operations,
      ];
    }
  }
}

$previewer = \Drupal::service('froomle_items.backfill_previewer');
$preview = $previewer->preview($candidate, ['scope' => 'reconcile']);
print json_encode([
  'direction' => $direction,
  'apply' => $apply,
  'examined' => $examined,
  'known' => count($knownRows),
  'active' => $active,
  'disabled' => $disabled,
  'skipped' => $skipped,
  'payload_errors' => $payloadErrors,
  'missing_known_rows' => $missingKnownRows,
  'planned_operation_items' => $plannedOperations,
  'operation_samples' => $operationSamples,
  'preview_count' => $preview['count'],
  'preview_active' => $preview['active_count'],
  'preview_disable' => $preview['disable_count'],
  'preview_errors' => $preview['errors'],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;

$check($payloadErrors === 0, 'candidate builds every current eligible payload');
$check($missingKnownRows === 0, 'every eligible source item already has synchronization state');
$check($plannedOperations === 0, 'candidate plans zero Items API operations across the complete catalogue');
$check($preview['errors'] === 0, 'candidate reconciliation preview has no payload errors');
$check(
  $preview['count'] === $active + $disabled,
  'preview count matches the independently audited active and disabled population',
);

if (!$apply) {
  print "PRECHECK READY direction={$direction}; no configuration or queue state changed\n";
  return;
}

$httpCalls = 0;
$handler = static function (RequestInterface $request) use (&$httpCalls): object {
  $httpCalls++;
  throw new RuntimeException(sprintf(
    'Fail-closed catalogue test intercepted unexpected HTTP %s %s.',
    $request->getMethod(),
    $request->getUri()->getPath(),
  ));
};
\Drupal::getContainer()->set('http_client', new Client(['handler' => $handler]));

$mapping->set('mappings', $mappings);
$mapping->save();
$check($lifecycle->requiresReconciliation($mapping), 'saved candidate requires explicit reconciliation');
$check($httpCalls === 0, 'mapping save made no HTTP request');
foreach ([
  SyncRepository::QUEUE_NAME,
  SyncRepository::BACKFILL_QUEUE_NAME,
  BackfillRepository::QUEUE_NAME,
] as $queueName) {
  $check(\Drupal::queue($queueName)->numberOfItems() === 0, "{$queueName} remains empty after mapping save");
}

$jobId = $backfills->create(
  FROOMLE_MAPPING_ID,
  'reconcile',
  NULL,
  (int) $preview['count'],
  (string) $preview['fingerprint'],
  (int) $preview['examined'],
);
$enumerationQueue = \Drupal::queue(BackfillRepository::QUEUE_NAME);
$deliveryQueue = \Drupal::queue(SyncRepository::BACKFILL_QUEUE_NAME);
$backfillProcessor = \Drupal::service('froomle_items.backfill_processor');
$syncProcessor = \Drupal::service('froomle_items.sync_processor');

for ($page = 1; $page <= 100; $page++) {
  $wake = $enumerationQueue->claimItem(120);
  $check(
    is_object($wake)
      && is_array($wake->data)
      && (int) $wake->data['id'] === $jobId,
    "enumeration page {$page} wake belongs to job {$jobId}",
  );
  $backfillProcessor->process($jobId, TRUE);
  $enumerationQueue->deleteItem($wake);

  $delivered = 0;
  while (($item = $deliveryQueue->claimItem(120)) !== FALSE) {
    if (!is_array($item->data) || !isset($item->data['id'], $item->data['generation'])) {
      $deliveryQueue->releaseItem($item);
      throw new RuntimeException('The reconciliation delivery queue contained an invalid wake.');
    }
    $row = $syncRepository->load((int) $item->data['id']);
    if (!is_array($row) || (string) $row['mapping_id'] !== FROOMLE_MAPPING_ID) {
      $deliveryQueue->releaseItem($item);
      throw new RuntimeException('The reconciliation delivery queue contained work outside the DWARS mapping.');
    }
    $syncProcessor->process((int) $item->data['id'], (int) $item->data['generation']);
    $after = $syncRepository->load((int) $item->data['id']);
    if (
      !is_array($after)
      || (int) $after['generation'] !== (int) $after['accepted_generation']
      || $after['last_error'] !== NULL
    ) {
      $deliveryQueue->releaseItem($item);
      throw new RuntimeException('A supposedly payload-equivalent item did not settle without an API operation.');
    }
    $deliveryQueue->deleteItem($item);
    $delivered++;
  }

  $job = $backfills->load($jobId);
  if (!is_array($job)) {
    throw new RuntimeException('The reconciliation job disappeared.');
  }
  $outcomes = $backfills->outcomeCounts($jobId);
  print sprintf(
    "PROGRESS job=%d page=%d examined=%d scheduled=%d delivered_now=%d accepted=%d pending=%d failed=%d http_calls=%d\n",
    $jobId,
    $page,
    (int) $job['examined'],
    (int) $job['enqueued'],
    $delivered,
    $outcomes['accepted'],
    $outcomes['pending'],
    $outcomes['failed'],
    $httpCalls,
  );
  if ($job['status'] === 'completed') {
    $check($outcomes['accepted'] === (int) $preview['count'], 'all reconciliation items are accepted');
    $check($outcomes['pending'] === 0 && $outcomes['retrying'] === 0 && $outcomes['failed'] === 0, 'reconciliation has no unresolved outcomes');
    break;
  }
  if ($page === 100) {
    throw new RuntimeException('The reconciliation exceeded the 100-page safety limit.');
  }
}

$check($httpCalls === 0, 'full reconciliation made zero HTTP requests');
$check(!$lifecycle->requiresReconciliation($mapping), 'full enumeration cleared the exact reconciliation requirement');
$check($enumerationQueue->numberOfItems() === 0, 'enumeration queue is empty');
$check($deliveryQueue->numberOfItems() === 0, 'backfill delivery queue is empty');
$check(\Drupal::queue(SyncRepository::QUEUE_NAME)->numberOfItems() === 0, 'editorial queue is empty');

$unsettled = (int) $database->select('froomle_items_sync', 'sync')
  ->condition('mapping_id', FROOMLE_MAPPING_ID)
  ->where('generation <> accepted_generation')
  ->countQuery()
  ->execute()
  ->fetchField();
$check($unsettled === 0, 'all DWARS synchronization rows are settled');
print "RESULT catalogue reconciliation {$direction} passed with zero HTTP requests; job={$jobId}\n";
