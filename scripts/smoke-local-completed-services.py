"""Real local demo smoke through Gateway only; never print tokens/credentials.

Uses existing demo records. The location write repeats its current coordinates;
pending availability is rejected, so approval/availability are never changed.
"""
import argparse
import json
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--customer-id', required=True)
parser.add_argument('--driver-id', required=True)
args = parser.parse_args()
BASE = 'http://localhost:8080'
checks = 0
throttles = 0


def request(method, path, body=None, token=None, expected=200):
    global throttles
    headers = {'Content-Type':'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    for attempt in range(3):
        req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
        try:
            # Allow Gateway's 5-second business RPC deadline to return its error.
            response = urllib.request.urlopen(req, timeout=8)
        except urllib.error.HTTPError as error:
            response = error
        result = json.loads(response.read())
        if response.code == 429 and attempt < 2:
            throttles += 1
            pause = int(response.headers.get('Retry-After','10'))
            assert 1 <= pause <= 10
            time.sleep(pause + 0.1)
            continue
        assert response.code == expected, path + ': expected HTTP ' + str(expected) + ', received ' + str(response.code)
        return result
    raise AssertionError('Rate limit did not reset in its configured window')


def passed(label):
    global checks
    checks += 1
    print('PASS ' + label, flush=True)


health = request('GET','/health')
assert health['s'] == 'UP'
passed('Gateway process health')
started = time.monotonic()
services = request('GET','/health/services')['services']
expected_services = [name+'-service' for name in ['auth','customer','driver','booking','trip','payment','notification','review']]
assert sorted(item['name'] for item in services) == sorted(expected_services)
assert len(services) == 8 and time.monotonic()-started < 5
assert all(next(item['s'] for item in services if item['name']==name+'-service')=='UP' for name in ['auth','customer','driver'])
passed('exactly eight services; completed gRPC HealthService checks UP')
ready = all(item['s']=='UP' for item in services)
started = time.monotonic()
assert request('GET','/ready',expected=200 if ready else 503)['s'] == ('UP' if ready else 'DOWN')
assert time.monotonic()-started < 5
passed('truthful bounded readiness')
tokens = {}
accounts = {}
for role,email in [('CUSTOMER','c@c.com'),('DRIVER','d@d.com'),('ADMIN','a@a.com')]:
    login = request('POST','/api/v1/login',{'email':email,'pw':'123'})
    assert login['role'] == role and login['token']
    tokens[role] = login['token']
    accounts[role] = login['uid']
    passed(role + ' canonical demo login')
customer = request('GET','/api/v1/customers/'+args.customer_id,token=tokens['CUSTOMER'])
assert customer['uid'] == accounts['CUSTOMER']
assert set(customer) == {'cid','uid','name','addr'}
passed('owned Customer profile, without credential fields')
driver = request('GET','/api/v1/drivers/'+args.driver_id,token=tokens['ADMIN'])
assert driver['uid'] == accounts['DRIVER'] and driver['vt'] == 'CAR'
request('GET','/api/v1/drivers/'+args.driver_id,token=tokens['CUSTOMER'],expected=403)
passed('same Driver detail endpoint: Admin 200, Customer 403')
pending = request('GET','/api/v1/drivers/pending-approval?page=1&limit=20',token=tokens['ADMIN'])['items']
assert pending and all(item['ap']=='PENDING_APPROVAL' for item in pending)
passed('pending Driver list')
nearby = request('GET','/api/v1/drivers/nearby?lat='+str(driver['lat'])+'&lng='+str(driver['lng'])+'&r=1&page=1&limit=20',token=tokens['ADMIN'])['items']
assert any(str(item['did'])==args.driver_id for item in nearby)
assert all(0 <= item['km'] <= 1 for item in nearby)
passed('Nearby 1 km radius and string vehicle category')
updated = request('PUT','/api/v1/drivers/me/location',{'lat':driver['lat'],'lng':driver['lng']},tokens['DRIVER'])
assert [updated[key] for key in ['did','ap','av','lat','lng']] == [driver[key] for key in ['did','ap','av','lat','lng']]
passed('location update preserves coordinates and Driver states')
pending_login = request('POST','/api/v1/login',{'email':'d4@d.com','pw':'123'})
pending_driver = next(item for item in pending if item['uid']==pending_login['uid'])
request('PATCH','/api/v1/drivers/me/availability',{'on':True},pending_login['token'],expected=409)
unchanged = request('GET','/api/v1/drivers/'+str(pending_driver['did']),token=tokens['ADMIN'])
assert unchanged['ap']=='PENDING_APPROVAL' and unchanged['av']=='OFFLINE'
passed('pending Driver cannot become AVAILABLE; original state retained')
print('RESULT:',checks,'checks passed, 0 failed;',throttles,'real HTTP 429 responses respected')
