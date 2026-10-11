// Round-trips web-written rows through the real mobile code.
//
// Layer 1 (per table): every fixture JSON goes through the exact calls SyncService._pullRemoteChanges makes:
//   fromJson(record)                          -> remote domain object (record still contains `user_id`)
//   fromJson({...record, syncStatus: synced}) -> toCompanion(true)
// Layer 2: a real SyncService + in-memory AppDatabase pulls ALL fixtures (via a fake CloudSyncProvider that returns
// them as PostgREST would) and we assert what landed in SQLite.
//
// Fixtures: every *.json under ../fixtures/<table>/ (override the root with SALIN_FIXTURES).
import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salin/core/database/database.dart';
import 'package:salin/core/services/sync/cloud_sync_provider.dart';
import 'package:salin/core/services/sync/sync_service.dart';
import 'package:salin/shared/enums/financial_enums.dart';

typedef Json = Map<String, dynamic>;

final fixtureRoot = Directory(Platform.environment['SALIN_FIXTURES'] ?? '../fixtures');

// Keys of the Postgres columns the web writes, per table (user_id is stripped by Drift's fromJson, never required).
const tables = ['accounts', 'categories', 'transfers', 'ledger_entries'];

Map<String, List<File>> loadFixtureFiles() {
  final out = <String, List<File>>{};
  for (final t in tables) {
    final dir = Directory('${fixtureRoot.path}/$t');
    out[t] = dir.existsSync()
        ? (dir.listSync().whereType<File>().where((f) => f.path.endsWith('.json')).toList()
          ..sort((a, b) => a.path.compareTo(b.path)))
        : <File>[];
  }
  return out;
}

Json readJson(File f) => jsonDecode(f.readAsStringSync()) as Json;

/// Each file holds one row object, or a list of row objects (handy for DB exports).
List<Json> readRows(File f) {
  final decoded = jsonDecode(f.readAsStringSync());
  if (decoded is List) return decoded.cast<Json>();
  return [decoded as Json];
}

class _Table {
  final dynamic Function(Json) fromJson;
  final Json Function(dynamic) toJson;
  final dynamic Function(dynamic) toCompanion;
  _Table(this.fromJson, this.toJson, this.toCompanion);
}

void main() {
  final files = loadFixtureFiles();

  test('fixture folder is not empty', () {
    final total = files.values.fold<int>(0, (s, l) => s + l.length);
    expect(total, greaterThan(0), reason: 'no fixtures under ${fixtureRoot.absolute.path}; run npm run test:mobile-compat');
  });

  final specs = <String, _Table>{
    'accounts': _Table(AccountRow.fromJson, (r) => (r as AccountRow).toJson(), (r) => (r as AccountRow).toCompanion(true)),
    'categories': _Table(CategoryRow.fromJson, (r) => (r as CategoryRow).toJson(), (r) => (r as CategoryRow).toCompanion(true)),
    'transfers': _Table(TransferRow.fromJson, (r) => (r as TransferRow).toJson(), (r) => (r as TransferRow).toCompanion(true)),
    'ledger_entries': _Table(LedgerEntryRow.fromJson, (r) => (r as LedgerEntryRow).toJson(), (r) => (r as LedgerEntryRow).toCompanion(true)),
  };

  // Fields that must survive fromJson -> toJson unchanged (everything except user_id, which mobile drops).
  for (final t in tables) {
    group('pull path: $t', () {
      for (final f in files[t]!) {
        for (final (i, record) in readRows(f).indexed) {
          final label = '${f.uri.pathSegments.last}#$i';
          test(label, () {
            final spec = specs[t]!;
            expect(record.containsKey('user_id'), isTrue, reason: 'PostgREST select * always includes user_id');

            // Step 1 of _processTableChanges: fromJson(record) with user_id still present.
            final remote = spec.fromJson(record);
            // Step 2: the stored copy is forced to synced.
            final map = {...record, 'syncStatus': SyncStatus.synced.index};
            final row = spec.fromJson(map);
            // toCompanion(true) is what gets inserted.
            spec.toCompanion(row);

            final back = spec.toJson(row);
            final expected = {...record}..remove('user_id');
            expected['syncStatus'] = SyncStatus.synced.index;
            expect(back, equals(expected), reason: 'every column must survive the round trip');
            // spot-check the unforced object too
            expect(spec.toJson(remote)['id'], record['id']);
          });
        }
      }
    });
  }

  group('enums decode to real Dart enum values', () {
    for (final f in files['accounts']!) {
      for (final r in readRows(f)) {
        test('account ${r['id']} accountType', () {
          final idx = AccountRow.fromJson(r).accountType;
          expect(idx, inInclusiveRange(0, AccountType.values.length - 1));
          AccountType.values[idx]; // the repository does exactly this
          SyncStatus.values[AccountRow.fromJson(r).syncStatus];
        });
      }
    }
    for (final f in files['categories']!) {
      for (final r in readRows(f)) {
        test('category ${r['id']} categoryType', () {
          CategoryType.values[CategoryRow.fromJson(r).categoryType];
        });
      }
    }
    for (final f in files['ledger_entries']!) {
      for (final r in readRows(f)) {
        test('ledger ${r['id']} direction/origin', () {
          final row = LedgerEntryRow.fromJson(r);
          MoneyDirection.values[row.direction];
          LedgerOrigin.values[row.origin];
          expect(row.amountMinor, r['amountMinor']);
          expect(row.amountMinor, isNonNegative);
        });
      }
    }
  });

  group('real SyncService pull into an in-memory AppDatabase', () {
    late AppDatabase db;
    setUp(() => db = AppDatabase(NativeDatabase.memory()));
    tearDown(() => db.close());

    test('all fixtures land in SQLite as synced rows', () async {
      final changes = <String, List<Json>>{};
      for (final t in tables) {
        final rows = [for (final f in files[t]!) ...readRows(f)];
        if (rows.isNotEmpty) changes[t] = rows;
      }
      final sync = SyncService(db, _FixtureProvider(changes));
      final result = await sync.synchronize();
      expect(result.success, isTrue, reason: '${result.error}');

      final accounts = await db.select(db.accounts).get();
      for (final rec in changes['accounts'] ?? <Json>[]) {
        final row = accounts.singleWhere((a) => a.id == rec['id']);
        expect(row.name, rec['name']);
        expect(row.accountType, rec['accountType']);
        expect(row.openingBalanceMinor, rec['openingBalanceMinor']);
        expect(row.deletedAt, rec['deletedAt']);
        expect(row.createdAt, rec['createdAt']);
        expect(row.syncStatus, SyncStatus.synced.index);
      }
      final cats = await db.select(db.categories).get();
      for (final rec in changes['categories'] ?? <Json>[]) {
        final row = cats.singleWhere((c) => c.id == rec['id']);
        expect(row.name, rec['name']);
        expect(row.categoryType, rec['categoryType']);
        expect(row.isSystem, rec['isSystem']);
        expect(row.syncStatus, SyncStatus.synced.index);
      }
      final transfers = await db.select(db.transfers).get();
      for (final rec in changes['transfers'] ?? <Json>[]) {
        final row = transfers.singleWhere((x) => x.id == rec['id']);
        expect(row.fromAccountId, rec['fromAccountId']);
        expect(row.toAccountId, rec['toAccountId']);
        expect(row.note, rec['note']);
        expect(row.syncStatus, SyncStatus.synced.index);
      }
      final entries = await db.select(db.ledgerEntries).get();
      for (final rec in changes['ledger_entries'] ?? <Json>[]) {
        final row = entries.singleWhere((e) => e.id == rec['id']);
        expect(row.amountMinor, rec['amountMinor']);
        expect(row.direction, rec['direction']);
        expect(row.origin, rec['origin']);
        expect(row.occurredAt, rec['occurredAt']);
        expect(row.transferId, rec['transferId']);
        expect(row.deletedAt, rec['deletedAt']);
        expect(row.syncStatus, SyncStatus.synced.index);
      }
    });
  });
}

class _FixtureProvider implements CloudSyncProvider {
  final Map<String, List<Json>> changes;
  _FixtureProvider(this.changes);

  @override
  Future<String?> getCurrentUserEmail() async => 'web-compat@example.com';

  @override
  Future<SyncPushResult> push({required Map<String, List<Json>> changes, Map<String, List<Json>>? relations}) async =>
      SyncPushResult(success: true);

  @override
  Future<SyncPullResult> pull(int sinceTimestamp) async => SyncPullResult(
        success: true,
        serverTime: DateTime.now().toUtc().millisecondsSinceEpoch,
        changes: changes,
        relations: {},
      );

  @override
  Future<bool> register(String email, String password) async => true;
  @override
  Future<bool> login(String email, String password) async => true;
  @override
  Future<void> logout() async {}
  @override
  Future<bool> uploadBackup(String backupName, String encryptedData) async => true;
  @override
  Future<String?> downloadLatestBackup() async => null;
}
