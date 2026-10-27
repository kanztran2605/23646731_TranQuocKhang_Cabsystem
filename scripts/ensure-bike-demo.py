"""Chuẩn bị BIKE demo qua Gateway, không sửa/xóa tài xế CAR hay dữ liệu cũ.

Chỉ tạo tài khoản riêng bike@cab.demo / 123 khi chưa có BIKE phù hợp.
Chạy lại an toàn; không ghi đè hồ sơ lạ hoặc đổi trạng thái BUSY/REJECTED.
"""
import json
import time
import urllib.error
import urllib.request

BASE = 'http://localhost:8080/api'


def api(method, path, body=None, token=None, allowed=(200,)):
    for attempt in range(5):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = urllib.request.Request(BASE + path, method=method, headers=headers,
            data=None if body is None else json.dumps(body).encode())
        try:
            response = urllib.request.urlopen(request, timeout=8)
        except urllib.error.HTTPError as error:
            response = error
        result = json.loads(response.read())
        if response.code == 429 and attempt < 4:
            time.sleep(min(10, max(1, int(response.headers.get('Retry-After', '10')))) + 0.2)
            continue
        if response.code not in allowed:
            raise SystemExit('DỪNG: ' + path + ' trả HTTP ' + str(response.code) + '; giữ nguyên dữ liệu.')
        return response.code, result
    raise SystemExit('DỪNG: Gateway chưa đáp ứng sau số lần thử giới hạn.')


_, admin = api('POST', '/login', {'email': 'a@a.com', 'pw': '123'})
_, nearby = api('GET', '/drivers/nearby?lat=10.76&lng=106.68&limit=20', token=admin['Token'])
eligible = [d for d in nearby['Items'] if d['Vehicle Type'] == 'BIKE'
    and d['Approval Status'] == 'APPROVED' and d['Availability Status'] == 'AVAILABLE']
if eligible:
    print('PASS: đã có BIKE APPROVED + AVAILABLE trong 1 km; không thay đổi Driver.')
    raise SystemExit(0)

body = {'phone': '0900000099', 'email': 'bike@cab.demo', 'pw': '123', 'otp': '123',
        'name': 'Driver BIKE Demo', 'plate': '59B00099'}
code, driver = api('POST', '/login', {'email': body['email'], 'pw': body['pw']}, allowed=(200, 401))
if code == 401:
    api('POST', '/drivers/otp', {'phone': body['phone']})
    api('POST', '/drivers/register', body, allowed=(201,))
    _, driver = api('POST', '/login', {'email': body['email'], 'pw': body['pw']})
did = driver['Driver ID']
_, detail = api('GET', '/drivers/' + str(did), token=admin['Token'])
if detail['Name'] != body['name'] or detail['Vehicle Type'] != 'BIKE' or detail['License Plate'] != body['plate']:
    raise SystemExit('DỪNG: tài khoản demo có hồ sơ khác dự kiến; không ghi đè.')
if detail['Availability Status'] == 'BUSY' or detail['Approval Status'] == 'REJECTED':
    raise SystemExit('DỪNG: BIKE demo đang BUSY/REJECTED; không tự sửa invariant.')
if detail['Approval Status'] == 'PENDING_APPROVAL':
    api('PATCH', '/drivers/' + str(did) + '/approval', {'ap': 'APPROVED'}, admin['Token'])
api('PUT', '/drivers/me/location', {'lat': 10.76, 'lng': 106.68}, driver['Token'])
_, result = api('PATCH', '/drivers/me/availability', {'on': True}, driver['Token'])
assert result['Availability Status'] == 'AVAILABLE'
print('PASS: BIKE demo Driver ID ' + str(did) + ', APPROVED + AVAILABLE tại 10.76,106.68.')
