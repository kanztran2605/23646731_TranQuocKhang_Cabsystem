"""Migration local: kiểm tra trước, backup các DB liên quan rồi mới thêm schema.

Mặc định chỉ kiểm tra. Dùng --apply để backup và áp dụng; có thể chạy lại.
Không xóa bảng, database, volume hay dữ liệu đã đăng ký. Không in mật khẩu.
"""
import argparse
import datetime
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
parser.add_argument('--backup-user', help='Superuser hiện có, chỉ dùng backup schema cũ bị hạn chế quyền')
parser.add_argument('--schema-user', help='Chủ sở hữu bảng/superuser hiện có để ALTER bảng trên volume cũ')
args = parser.parse_args()
config = json.loads(subprocess.check_output(['docker', 'compose', 'config', '--format', 'json'], cwd=ROOT))
container = config['services']['postgres']['container_name']
user = config['services']['postgres']['environment']['POSTGRES_USER']

def sql(database, statement):
    return subprocess.check_output(['docker', 'exec', container, 'psql', '-X', '-U', user,
                                   '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], text=True).strip()

# Kiểm tra trùng theo chuẩn mới trước mọi thay đổi, không tự xóa bản ghi trùng.
duplicates = int(sql('driver_db', 'SELECT count(*) FROM (SELECT upper(btrim(plate)) FROM vehicle GROUP BY 1 HAVING count(*)>1) d'))
if duplicates:
    raise SystemExit('DỪNG: biển số đang trùng sau chuẩn hóa; cần kiểm tra thủ công, chưa chạy migration.')
has_phone = sql('driver_db', "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='driver_profile' AND column_name='phone')") == 't'
if has_phone and int(sql('driver_db', 'SELECT count(*) FROM (SELECT phone FROM driver_profile WHERE phone IS NOT NULL GROUP BY phone HAVING count(*)>1) d')):
    raise SystemExit('DỪNG: phone Driver đang trùng; chưa chạy migration.')
print('PASS kiểm tra trước migration: không trùng biển số/phone', flush=True)
if not args.apply:
    print('Chưa thay đổi schema. Dùng --apply để backup và áp dụng.')
    raise SystemExit(0)

stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup = ROOT / '.backups' / ('rubric-migration-' + stamp)
backup.mkdir(parents=True, exist_ok=False)
for database in ['auth_db', 'customer_db', 'driver_db', 'booking_db', 'payment_db']:
    with (backup / (database + '.dump')).open('wb') as file:
        result = subprocess.run(['docker', 'exec', container, 'pg_dump', '-U', args.backup_user or user,
                                 '-d', database, '--format=custom'], stdout=file, stderr=subprocess.PIPE)
    if result.returncode:
        (backup / (database + '.error.log')).write_bytes(result.stderr)
        raise SystemExit('DỪNG: backup không thành công, chưa áp dụng migration.')
    print('PASS backup ' + database, flush=True)
source = (ROOT / 'infrastructure/postgres/migrations/20261027_demo_rubric.sql').read_bytes()
result = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-X', '-U', args.schema_user or user,
                         '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'runtime_user=' + user], input=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if result.returncode:
    (backup / 'migration.error.log').write_bytes(result.stderr)
    raise SystemExit('Migration dừng do lỗi schema/quyền; backup được giữ tại ' + str(backup))
print('PASS migration bổ sung schema; backup riêng tư: ' + str(backup))
