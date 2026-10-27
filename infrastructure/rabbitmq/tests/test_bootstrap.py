"""Offline configuration tests; never connect to or modify the real broker."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('bootstrap', ROOT / 'bootstrap.py')
bootstrap = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bootstrap)


class BootstrapTests(unittest.TestCase):
    def test_env_account_hash_matches_rabbitmq_format_and_keeps_topology(self):
        topology = json.loads((ROOT / 'definitions.json').read_text(encoding='utf-8'))
        original = copy.deepcopy(topology)
        password = 'demo-only-#-"-\\-mật khẩu'
        result = bootstrap.seeded_definitions(topology, 'demo-user', password)
        self.assertEqual(topology, original)
        self.assertEqual({k:v for k,v in result.items() if k not in ['users','permissions']}, original)
        self.assertNotIn(password, json.dumps(result, ensure_ascii=False))
        user = result['users'][0]
        decoded = base64.b64decode(user['password_hash'])
        self.assertEqual(len(decoded), 36)
        self.assertEqual(decoded[4:], hashlib.sha256(decoded[:4] + password.encode()).digest())
        self.assertEqual(user['hashing_algorithm'], 'rabbit_password_hashing_sha256')
        self.assertEqual(user['tags'], ['administrator'])
        self.assertEqual(result['permissions'], [{'user':'demo-user','vhost':'/','configure':'.*','write':'.*','read':'.*'}])

    def test_repeated_render_does_not_duplicate_user_or_permissions(self):
        topology = {'users':[{'name':'other'}], 'permissions':[{'user':'other','vhost':'/'}]}
        first = bootstrap.seeded_definitions(topology, 'demo-user', 'demo-password')
        second = bootstrap.seeded_definitions(first, 'demo-user', 'demo-password')
        self.assertEqual([u['name'] for u in second['users']], ['other','demo-user'])
        self.assertEqual(second['permissions'], first['permissions'])
        self.assertNotEqual(first['users'][1]['password_hash'], second['users'][1]['password_hash'])

    def test_credentials_are_required_without_disclosing_values(self):
        for env in [{}, {'RABBITMQ_DEFAULT_USER':'demo-user'},
                    {'RABBITMQ_DEFAULT_USER':'bad:user','RABBITMQ_DEFAULT_PASS':'private-fixture'}]:
            with self.assertRaises(bootstrap.BootstrapError) as error:
                bootstrap.credentials(env)
            self.assertNotIn('private-fixture', str(error.exception))

    def test_empty_volume_and_same_node_are_allowed_without_storage_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            bootstrap.check_storage('rabbit@stable', base)
            (base / 'rabbit@stable').mkdir()
            marker = base / 'rabbit@stable' / 'schema.DAT'
            marker.write_bytes(b'preserved-fixture')
            (base / 'rabbit@older').mkdir()
            bootstrap.check_storage('rabbit@stable', base)
            self.assertEqual(marker.read_bytes(), b'preserved-fixture')
            self.assertTrue((base / 'rabbit@older').is_dir())

    def test_wrong_or_invalid_node_refuses_startup_and_preserves_old_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / 'rabbit@old').mkdir()
            marker = base / 'rabbit@old' / 'schema.DAT'
            marker.write_bytes(b'preserved-fixture')
            for node in ['rabbit@new', '../escape', '']:
                with self.assertRaises(bootstrap.BootstrapError):
                    bootstrap.check_storage(node, base)
            self.assertEqual(marker.read_bytes(), b'preserved-fixture')
            self.assertEqual(sorted(p.name for p in base.iterdir()), ['rabbit@old'])

    def test_runtime_config_changes_only_the_import_path(self):
        source = (ROOT / 'rabbitmq.conf').read_text(encoding='utf-8')
        generated = bootstrap.runtime_config(source, '/run/cab-rabbitmq/definitions.json')
        self.assertEqual(generated.replace('/run/cab-rabbitmq/definitions.json','/etc/rabbitmq/definitions.json'), source)
        with self.assertRaises(bootstrap.BootstrapError):
            bootstrap.runtime_config('unrelated.setting = true', '/unused')

    def test_an_empty_new_node_directory_cannot_hide_an_existing_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / 'rabbit@old').mkdir()
            (base / 'rabbit@old' / 'schema.DAT').write_bytes(b'preserved-fixture')
            (base / 'rabbit@new').mkdir()
            with self.assertRaises(bootstrap.BootstrapError):
                bootstrap.check_storage('rabbit@new', base)
            self.assertFalse((base / 'rabbit@new' / 'schema.DAT').exists())

    def test_prepare_writes_only_runtime_files_and_keeps_sources_and_mnesia(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            mnesia, runtime = base / 'mnesia', base / 'runtime'
            mnesia.mkdir()
            source_before = (ROOT / 'definitions.json').read_bytes()
            env = {'RABBITMQ_DEFAULT_USER':'demo-user','RABBITMQ_DEFAULT_PASS':'private-fixture',
                   'RABBITMQ_NODENAME':'rabbit@stable','RABBITMQ_MNESIA_BASE':str(mnesia)}
            with patch.object(bootstrap.os, 'getuid', return_value=1000, create=True):
                config = bootstrap.prepare(env, ROOT, runtime)
            self.assertEqual(config, str(runtime / 'rabbitmq.conf'))
            self.assertEqual((ROOT / 'definitions.json').read_bytes(), source_before)
            self.assertEqual(list(mnesia.iterdir()), [])
            self.assertNotIn('private-fixture', (runtime / 'definitions.json').read_text())
            self.assertEqual(sorted(p.name for p in runtime.iterdir()), ['definitions.json','rabbitmq.conf'])
            with self.assertRaises(bootstrap.BootstrapError):
                bootstrap.prepare({**env,'RABBITMQ_MNESIA_DIR':'/custom'}, ROOT, runtime)

    def test_health_checks_alarms_vhosts_listener_authentication_and_permissions(self):
        calls = []
        def get_json(path):
            calls.append(path)
            return {'configure':'.*','write':'.*','read':'.*'} if '/permissions/' in path else {'status':'ok'}
        bootstrap.check_readiness({'RABBITMQ_DEFAULT_USER':'demo user','RABBITMQ_DEFAULT_PASS':'private-fixture'}, get_json)
        self.assertEqual(calls, ['/api/health/checks/alarms','/api/health/checks/virtual-hosts',
                                 '/api/health/checks/port-listener/5672','/api/permissions/%2F/demo%20user'])

    def test_health_rejects_alarms_missing_permissions_and_http_failures(self):
        env = {'RABBITMQ_DEFAULT_USER':'demo-user','RABBITMQ_DEFAULT_PASS':'private-fixture'}
        for answer in [{'status':'failed'}, {'status':'ok'}]:
            with self.assertRaises(ValueError):
                bootstrap.check_readiness(env, lambda _path: answer)
        with (patch.object(bootstrap, 'check_readiness', side_effect=OSError('private-fixture')),
              patch.object(bootstrap.sys, 'argv', ['bootstrap.py','--healthcheck']),
              patch.object(bootstrap.sys, 'stderr', new_callable=io.StringIO) as stderr):
            self.assertEqual(bootstrap.main(), 1)
            self.assertNotIn('private-fixture', stderr.getvalue())


if __name__ == '__main__':
    unittest.main()
