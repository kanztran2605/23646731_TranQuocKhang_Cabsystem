"""Tạo đúng c1@c.com..c10@c.com / 123 bằng Gateway, chỉ cho demo local.

Chủ project đã chọn @c.com vì validator hiện hành từ chối email như c1@c.
Mặc định chỉ kiểm tra; --apply backup rồi tạo/bổ sung và kiểm tra API.
Không đổi mật khẩu, role, trạng thái hoặc hồ sơ tài khoản đã tồn tại.
--check-booking chỉ tạo tối đa một Booking test mới, không nhận Offer/Trip.
"""
import argparse
import base64
import datetime
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CUSTOMERS = [(f'c{i}@c.com', f'Customer {i}') for i in range(1, 11)]
NODE_QUERY = """const fs=require('fs');const {pool}=require('./src/config/database');
(async()=>{try{const q=JSON.parse(fs.readFileSync(0,'utf8'));let rows=(await pool.query(q.sql,q.params)).rows;
if(q.accounts){const bcrypt=require('bcryptjs');rows=await Promise.all(rows.map(async r=>{
const {pw_hash,...safe}=r;return {...safe,passwordValid:await bcrypt.compare('123',pw_hash),
hashValid:/^\\$2[aby]\\$[0-9]{2}\\$/.test(pw_hash)};}));}console.log(JSON.stringify(rows));
}catch(e){console.error('Database check failed');process.exitCode=1;}finally{await pool.end();}})();"""


def sql(service, statement, params=None, accounts=False):
    result = subprocess.run(['docker','compose','exec','-T',service+'-service','node','-e',NODE_QUERY],
        cwd=ROOT,input=json.dumps({'sql':statement,'params':params or [],'accounts':accounts}),
        text=True,capture_output=True,encoding='utf-8')
    if result.returncode:
        raise RuntimeError('Kiểm tra DB '+service+' thất bại; chưa được phép ghi đè dữ liệu.')
    return json.loads(result.stdout)


def api(method, path, body=None, token=None, expected=200):
    for _ in range(8):
        headers = {'Content-Type':'application/json'}
        if token:
            headers['Authorization'] = 'Bearer '+token
        request = urllib.request.Request('http://localhost:8080/api'+path,method=method,headers=headers,
            data=None if body is None else json.dumps(body).encode())
        try:
            response = urllib.request.urlopen(request,timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        result = json.loads(response.read())
        if response.code == 429:
            time.sleep(min(11,max(1,int(response.headers.get('Retry-After','10'))))+.2)
            continue
        if response.code != expected:
            raise RuntimeError(path+' trả HTTP '+str(response.code)+'; giữ nguyên dữ liệu để kiểm tra/chạy lại.')
        return result
    raise RuntimeError('Rate limit chưa hết trong thời gian chờ; không bypass Redis.')


def inspect():
    emails = [email for email, _ in CUSTOMERS]
    accounts = sql('auth','SELECT uid,email,role,s,pw_hash FROM user_account WHERE lower(email)=ANY($1::text[])',[emails],True)
    by_email = {row['email']:row for row in accounts}
    if len(by_email)!=len(accounts) or any(row['email'] not in emails for row in accounts):
        raise RuntimeError('Email trùng hoặc khác chữ hoa/thường; không tự chiếm tài khoản.')
    profiles = sql('customer','SELECT cid,uid,name,addr,phone FROM customer_profile WHERE uid=ANY($1::bigint[])',[[r['uid'] for r in accounts]])
    by_uid = {row['uid']:row for row in profiles}
    if len(by_uid)!=len(profiles):
        raise RuntimeError('UID Customer Profile không duy nhất.')
    for email, name in CUSTOMERS:
        account = by_email.get(email)
        if not account:
            continue
        if (account['role']!='CUSTOMER' or account['s']!='ACTIVE' or
                not account['passwordValid'] or not account['hashValid']):
            raise RuntimeError(email+' không khớp role/trạng thái/mật khẩu demo; không ghi đè.')
        profile = by_uid.get(account['uid'])
        if profile and profile['name']!=name:
            raise RuntimeError(email+' đang có tên hồ sơ khác; không chiếm tài khoản.')
    return by_email, by_uid


def outside_snapshot():
    # Chỉ trả hash tổng hợp, không đưa hash mật khẩu/phone thật ra terminal.
    emails = [email for email, _ in CUSTOMERS]
    accounts = sql('auth',"SELECT md5(COALESCE(jsonb_agg(to_jsonb(a) ORDER BY uid)::text,'[]')) AS hash FROM user_account a WHERE lower(email)<>ALL($1::text[])",[emails])[0]['hash']
    demo = sql('auth','SELECT uid FROM user_account WHERE email=ANY($1::text[])',[emails])
    profiles = sql('customer',"SELECT md5(COALESCE(jsonb_agg(to_jsonb(c) ORDER BY cid)::text,'[]')) AS hash FROM customer_profile c WHERE uid<>ALL($1::bigint[])",[[r['uid'] for r in demo]])[0]['hash']
    return accounts, profiles


def backup(user):
    config = json.loads(subprocess.check_output(['docker','compose','config','--format','json'],cwd=ROOT))
    user = user or config['services']['postgres']['environment']['POSTGRES_USER']
    folder = ROOT/'.backups'/('demo-customers-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    folder.mkdir(parents=True)
    for database in ['auth_db','customer_db']:
        with (folder/(database+'.dump')).open('wb') as file:
            result = subprocess.run(['docker','compose','exec','-T','postgres','pg_dump','-U',user,'-d',database,'--format=custom'],
                cwd=ROOT,stdout=file,stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Backup '+database+' thất bại; chưa tạo tài khoản.')
    return folder


def add_missing_profile(account, name):
    # Chỉ bổ sung sau login bằng mật khẩu đã kiểm chứng của đúng UID Customer.
    login = api('POST','/login',{'email':account['email'],'pw':'123'})
    if str(login['User ID'])!=account['uid'] or login['Role']!='CUSTOMER' or login['Customer ID'] is not None:
        raise RuntimeError('Danh tính/hồ sơ vừa thay đổi; không bổ sung tự động.')
    source = """const fs=require('fs');const s=require('./src/services/customer.service');
(async()=>{try{const r=await s.createCustomerProfile(JSON.parse(fs.readFileSync(0,'utf8')));
console.log(JSON.stringify({customerId:r.customerId,userId:r.userId}));}catch(e){console.error('Không tạo được profile; giữ Account hiện có');process.exitCode=1;}
finally{await require('./src/config/database').pool.end();}})();"""
    result = subprocess.run(['docker','compose','exec','-T','customer-service','node','-e',source],cwd=ROOT,
        input=json.dumps({'userId':account['uid'],'name':name}),text=True,capture_output=True,encoding='utf-8')
    if result.returncode:
        raise RuntimeError('Bổ sung Customer Profile thất bại; không đổi Account.')


def verify_booking_references(rows):
    # Dùng đúng client Booking → Customer hiện hành; không tạo thêm Booking.
    source = """const fs=require('fs'),assert=require('node:assert/strict');const c=require('./src/grpc/customer.client');
(async()=>{try{const rows=JSON.parse(fs.readFileSync(0,'utf8'));for(const r of rows){
const p=await c.getCustomerByUserId(String(r.uid),'seed-demo-customers');
const v=await c.validateCustomer(String(r.cid),'seed-demo-customers');
assert.equal(p.userId,String(r.uid));assert.equal(p.customerId,String(r.cid));
assert.equal(v.valid,true);assert.equal(v.userId,String(r.uid));assert.equal(v.customerId,String(r.cid));}
console.log(JSON.stringify({valid:rows.length}));}catch(e){console.error('Customer RPC không khớp danh tính');process.exitCode=1;}
finally{c.closeCustomerClient();}})();"""
    result = subprocess.run(['docker','compose','exec','-T','booking-service','node','-e',source],cwd=ROOT,
        input=json.dumps(rows),text=True,capture_output=True,encoding='utf-8')
    if result.returncode or json.loads(result.stdout)['valid']!=10:
        raise RuntimeError('Booking → Customer gRPC chưa xác minh đủ 10 hồ sơ.')
    print('PASS 10/10 Booking → Customer GetByUserId + ValidateCustomer gRPC.',flush=True)


def run(args):
    accounts, profiles = inspect()
    new = len(CUSTOMERS)-len(accounts)
    missing = sum(r['uid'] not in profiles for r in accounts.values())
    print(f'Kiểm tra: {new} cần tạo mới, {len(accounts)} đã tồn tại, {missing} cần bổ sung Profile.',flush=True)
    if not args.apply:
        print('Chỉ kiểm tra. --apply để backup, tạo dữ liệu và xác minh login/ownership.')
        return
    before = outside_snapshot()
    folder = backup(args.backup_user)
    print('PASS backup auth_db + customer_db trong .backups/ (gitignored).',flush=True)
    for email, name in CUSTOMERS:
        account = accounts.get(email)
        if not account:
            api('POST','/register',{'email':email,'pw':'123','name':name},expected=201)
        elif account['uid'] not in profiles:
            add_missing_profile(account,name)
    accounts, profiles = inspect()
    if len(accounts)!=10 or len(profiles)!=10 or len({r['cid'] for r in profiles.values()})!=10:
        raise RuntimeError('Chưa đủ 10 Account/Profile hoặc ID không duy nhất.')
    rows, sessions = [], []
    for email, name in CUSTOMERS:
        account = accounts[email]
        profile = profiles[account['uid']]
        login = api('POST','/login',{'email':email,'pw':'123'})
        token = login['Token']
        payload = token.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(payload+'='*((-len(payload))%4)))
        if (login['Role']!='CUSTOMER' or str(login['User ID'])!=account['uid'] or
                str(login['Customer ID'])!=profile['cid'] or claims.get('role')!='CUSTOMER' or claims.get('sub')!=account['uid']):
            raise RuntimeError('Login/JWT/UID/CID không khớp: '+email)
        # Gateway xác minh chữ ký/expiry JWT trước khi cho xem chính hồ sơ này.
        own = api('GET','/customers/'+profile['cid'],token=token)
        if own['Name']!=name or str(own['User ID'])!=account['uid'] or str(own['Customer ID'])!=profile['cid']:
            raise RuntimeError('Hồ sơ API không khớp database: '+email)
        sessions.append(token)
        rows.append({'email':email,'uid':int(account['uid']),'cid':int(profile['cid']),'login':'PASS','jwt':'PASS','ownProfile':'PASS','hash':'PASS'})
        print('PASS login/JWT/hồ sơ: '+email,flush=True)
    for i, row in enumerate(rows):
        target = rows[(i+1)%10]['cid']
        api('GET','/customers/'+str(target),token=sessions[i],expected=403)
    print('PASS 10/10 thử xem Customer khác trả HTTP 403.',flush=True)
    verify_booking_references(rows)
    booking_result = None
    if args.check_booking:
        # Chỉ một Booking mới, xa vùng demo Driver; không Accept hoặc tạo Trip.
        booking_result = api('POST','/bookings',{'p':{'lat':21.031,'lng':105.852},'d':{'lat':21.041,'lng':105.862}},sessions[0],201)
        if booking_result['Customer ID']!=rows[0]['cid'] or booking_result['Vehicle Type']!='BIKE':
            raise RuntimeError('Booking không thuộc Customer demo hoặc sai loại xe.')
        print('PASS c1 tạo một Booking hợp lệ, Booking ID '+str(booking_result['Booking ID'])+', '+booking_result['Status'],flush=True)
    if outside_snapshot()!=before:
        raise RuntimeError('Account/Profile ngoài nhóm thay đổi trong lúc chạy; kiểm tra hoạt động đồng thời, không tự rollback.')
    evidence = {'newAccounts':new,'existingAccounts':10-new,'addedProfiles':missing,'customers':rows,
        'crossOwner403':10,'bookingCustomerGrpcValid':10,'outsideAccountsProfilesUnchanged':True,'booking':booking_result}
    (folder/'result.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(evidence,ensure_ascii=False,indent=2),flush=True)
    print('PASS seed/verify; Account/Profile ngoài nhóm giữ nguyên; không ghi token hoặc password hash.',flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--backup-user',help='User PostgreSQL hiện có đủ quyền pg_dump, không phải mật khẩu')
    parser.add_argument('--check-booking',action='store_true',help='Tạo một Booking mới bằng c1 để kiểm tra; không tạo 10 Booking')
    args = parser.parse_args()
    try:
        run(args)
    except (RuntimeError,subprocess.CalledProcessError,urllib.error.URLError) as error:
        raise SystemExit('DỪNG: '+str(error))
