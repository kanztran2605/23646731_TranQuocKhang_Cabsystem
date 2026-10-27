"""Local demo bootstrap/readiness for the existing rabbitmq:3-management image.

Never renames, moves, resets or deletes Mnesia data. The official entrypoint stays
PID 1 after exec, retaining its privilege drop and shutdown/signal handling.
"""
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
import urllib.parse
import urllib.request


class BootstrapError(RuntimeError):
    """Validation failures whose fixed messages are safe for container logs."""


def credentials(env):
    user, password = env.get('RABBITMQ_DEFAULT_USER'), env.get('RABBITMQ_DEFAULT_PASS')
    if not user or not password or any(char in user for char in ':\r\n'):
        raise BootstrapError('Non-empty RabbitMQ credentials are required; username cannot contain colon/newline')
    return user, password


def check_storage(node, base):
    if not re.fullmatch(r'rabbit@[A-Za-z0-9][A-Za-z0-9_.-]*', node):
        raise BootstrapError('A valid explicit RABBITMQ_NODENAME is required')
    # Auxiliary plugin directories are not Mnesia node databases.
    databases = [p for p in base.glob('rabbit@*')
                 if p.is_dir() and not p.name.endswith('-plugins-expand')]
    if databases and not (base / node / 'schema.DAT').is_file():
        raise BootstrapError('Existing Mnesia belongs to another node; pin its inspected identity in the local override')


def seeded_definitions(topology, user, password):
    result = copy.deepcopy(topology)
    salt = secrets.token_bytes(4)
    password_hash = base64.b64encode(salt + hashlib.sha256(salt + password.encode('utf-8')).digest()).decode('ascii')
    account = {'name': user, 'password_hash': password_hash,
               'hashing_algorithm': 'rabbit_password_hashing_sha256', 'tags': ['administrator']}
    # Preserve any unrelated declared accounts; do not delete live broker users.
    result['users'] = [u for u in result.get('users', []) if u['name'] != user] + [account]
    permission = {'user': user, 'vhost': '/', 'configure': '.*', 'write': '.*', 'read': '.*'}
    result['permissions'] = [p for p in result.get('permissions', [])
                             if (p['user'], p['vhost']) != (user, '/')] + [permission]
    return result


def runtime_config(source, definitions_path):
    config, count = re.subn(r'^management\.load_definitions\s*=.*$',
                            lambda _match: 'management.load_definitions = ' + str(definitions_path),
                            source, flags=re.MULTILINE)
    if count != 1:
        raise BootstrapError('Expected one management.load_definitions setting in rabbitmq.conf')
    return config


def prepare(env, source_dir=Path('/etc/rabbitmq'), runtime_dir=Path('/run/cab-rabbitmq')):
    user, password = credentials(env)
    # A custom Mnesia directory could bypass the node identity guard.
    if env.get('RABBITMQ_MNESIA_DIR'):
        raise BootstrapError('Custom RABBITMQ_MNESIA_DIR needs an inspected migration; refusing automatic startup')
    check_storage(env.get('RABBITMQ_NODENAME', ''),
                  Path(env.get('RABBITMQ_MNESIA_BASE', '/var/lib/rabbitmq/mnesia')))
    topology = json.loads((source_dir / 'definitions.json').read_text(encoding='utf-8'))
    config = runtime_config((source_dir / 'rabbitmq.conf').read_text(encoding='utf-8'),
                            runtime_dir / 'definitions.json')
    runtime_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(runtime_dir, 0o700)
    definitions = runtime_dir / 'definitions.json'
    config_path = runtime_dir / 'rabbitmq.conf'
    for path, value in [(definitions, json.dumps(seeded_definitions(topology, user, password))),
                        (config_path, config)]:
        with path.open('w', encoding='utf-8') as handle:
            os.chmod(path, 0o600)
            handle.write(value + '\n')
    if os.getuid() == 0:
        import pwd
        account = pwd.getpwnam('rabbitmq')
        for path in [runtime_dir, definitions, config_path]:
            os.chown(path, account.pw_uid, account.pw_gid)
    return str(config_path)


def check_readiness(env, get_json=None):
    user, password = credentials(env)
    if get_json is None:
        auth = base64.b64encode((user + ':' + password).encode('utf-8')).decode('ascii')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        def get_json(path):
            req = urllib.request.Request('http://127.0.0.1:15672' + path,
                                         headers={'Authorization': 'Basic ' + auth})
            with opener.open(req, timeout=2) as response:
                return json.load(response)

    # These endpoints are available in the inspected RabbitMQ 3.13 image.
    for path in ['/api/health/checks/alarms', '/api/health/checks/virtual-hosts',
                 '/api/health/checks/port-listener/5672']:
        if get_json(path).get('status') != 'ok':
            raise ValueError('RabbitMQ is not ready for clients')
    permission = get_json('/api/permissions/%2F/' + urllib.parse.quote(user, safe=''))
    if any(permission.get(key) != '.*' for key in ['configure', 'write', 'read']):
        raise ValueError('RabbitMQ runtime account lacks required vhost permissions')


def main():
    if sys.argv[1:] == ['--healthcheck']:
        try:
            check_readiness(os.environ)
            return 0
        except Exception:
            # HTTP/config exceptions may contain credentials or local details.
            print('RabbitMQ readiness check failed', file=sys.stderr)
            return 1
    if sys.argv[1:]:
        print('Unsupported bootstrap argument', file=sys.stderr)
        return 1
    try:
        os.umask(0o077)
        os.environ['RABBITMQ_CONFIG_FILE'] = prepare(os.environ)
    except Exception as error:
        # Only fixed validation messages are safe; never print arbitrary errors.
        print(str(error) if isinstance(error, BootstrapError)
              else 'RabbitMQ bootstrap preparation failed', file=sys.stderr)
        return 1
    os.execvp('docker-entrypoint.sh', ['docker-entrypoint.sh', 'rabbitmq-server'])


if __name__ == '__main__':
    sys.exit(main())
