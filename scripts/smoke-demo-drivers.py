"""Nghiệm thu demo qua /api: 5 Driver + Trip alias; chỉ tạo chuyến test mới.

Giữ nguyên Trip đang BUSY của t2; t1 trở lại AVAILABLE nhờ event Trip terminal.
Không in token. Không xóa bất kỳ dữ liệu cũ hoặc mới nào.
"""
import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare',ROOT/'scripts/prepare-demo-drivers.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
api, sql = prepare.api, prepare.sql
run = uuid.uuid4().hex[:10]
checks, trips, events = [], [], []
customer_token = None


def check(label):
    checks.append(label)
    print('PASS '+label,flush=True)


def wait(fn, predicate, label):
    for _ in range(30):
        value = fn()
        if predicate(value):
            return value
        time.sleep(.5)
    raise AssertionError(label+' chưa đạt sau 15 giây')


def untouched(dids):
    # Hash đầy đủ các hàng Driver ngoài nhóm để phát hiện thay đổi ngoài ý muốn.
    return {table:sql('driver',f'SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,\'[]\')) AS hash FROM {table} t WHERE did<>ALL($1::bigint[])',[dids])[0]['hash']
        for table in ['driver','driver_profile','vehicle','driver_location','driver_application']}


config = json.loads(subprocess.check_output(['docker','compose','config','--format','json'],cwd=ROOT))
env = config['services']['rabbitmq']['environment']
port = next(p['published'] for p in config['services']['rabbitmq']['ports'] if p['target']==15672)
auth = 'Basic '+base64.b64encode((env['RABBITMQ_DEFAULT_USER']+':'+env['RABBITMQ_DEFAULT_PASS']).encode()).decode()
queue = 'cab.demo.alias.'+run


def broker(method,path,body=None):
    request = urllib.request.Request('http://localhost:'+str(port)+'/api'+path,method=method,
        headers={'Authorization':auth,'Content-Type':'application/json'},
        data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(request,timeout=10) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def drain():
    rows = broker('POST','/queues/%2F/'+queue+'/get',{'count':300,'ackmode':'ack_requeue_false','encoding':'auto'})
    events.extend(json.loads(r['payload']) for r in rows)


def main():
    global customer_token
    admin = api('POST','/login',{'email':'a@a.com','pw':'123'})
    demos = [api('POST','/login',{'email':d[0],'pw':'123'}) for d in prepare.DRIVERS]
    dids = [d['Driver ID'] for d in demos]
    assert len(set(dids))==5 and 52 not in dids
    before = untouched(dids)
    nearby = api('GET','/drivers/nearby?lat=10.80&lng=106.72&r=1&page=1&limit=5',token=admin['Token'])
    assert [d['Driver ID'] for d in nearby['Items']]==dids
    for row,expected in zip(nearby['Items'],prepare.DRIVERS):
        assert (row['Name'],row['Approval Status'],row['Availability Status'],row['Vehicle Type'],row['License Plate'],row['Latitude'],row['Longitude']) == (expected[1],expected[3],expected[4],expected[5],expected[6],expected[7],expected[8])
        assert isinstance(row['Distance (km)'],(int,float))
    assert nearby['Items'][0]['Distance (km)']==0
    check('5 login; Nearby page 1 đúng 5 tổ hợp; khoảng cách PostGIS thực tế')
    busy = prepare.active(dids[1])
    assert len(busy)==1
    account = {'email':'alias-'+run+'@cab.demo','pw':'123','name':'Test alias '+run}
    api('POST','/register',account,expected=201)
    customer = api('POST','/login',{'email':account['email'],'pw':'123'})
    customer_token = customer['Token']
    other = api('POST','/register',{'email':'other-'+run+'@cab.demo','pw':'123','name':'Test owner '+run},expected=201)
    other = api('POST','/login',{'email':'other-'+run+'@cab.demo','pw':'123'})
    driver, wrong = demos[0], demos[2]

    def assignment():
        wait(lambda:sql('driver','SELECT av FROM driver WHERE did=$1',[dids[0]]),lambda r:r[0]['av']=='AVAILABLE','t1 AVAILABLE')
        booking = api('POST','/bookings',{'p':{'lat':10.80,'lng':106.72},'d':{'lat':10.81,'lng':106.73}},customer['Token'],201)
        assert booking['Vehicle Type']=='BIKE' and booking['Status']=='SEARCHING' and booking['Driver ID']==dids[0]
        bid,oid = booking['Booking ID'],booking['Offer ID']
        offers = api('GET','/drivers/me/offers',token=driver['Token'])
        assert any(o['Offer ID']==oid and o['Booking ID']==bid for o in offers)
        api('POST','/offers/'+str(oid)+'/accept',token=driver['Token'])
        rows = wait(lambda:sql('trip','SELECT tid,bid,did,s,paid FROM trip WHERE bid=$1',[bid]),bool,'Trip created')
        tid = int(rows[0]['tid'])
        trips.append({'bid':bid,'oid':oid,'tid':tid})
        assert rows[0]['s']=='ASSIGNED' and not rows[0]['paid']
        visible = api('GET','/trips/'+str(tid),token=customer['Token'])
        assert visible['Driver']=={'Driver ID':dids[0],'Name':'Nguyen Van An','Vehicle Type':'BIKE','License Plate':'59A10001'}
        api('GET','/trips/'+str(tid),token=other['Token'],expected=403)
        return tid

    tid = assignment()
    path = '/trips/'+str(tid)+'/status'
    check('Booking mặc định BIKE SEARCHING; Offer đúng t1; Accept tạo Trip; chỉ Customer sở hữu thấy Driver')
    api('PATCH',path,{'s':'X'},driver['Token'],400)
    api('PATCH',path,{'s':'C'},driver['Token'],400)
    api('PATCH',path,{'s':'A'},wrong['Token'],403)
    api('PATCH',path,{'s':'A'},customer['Token'],403)
    api('PATCH',path,{'s':'A'},expected=401)
    assert sql('trip','SELECT s FROM trip WHERE tid=$1',[tid])[0]['s']=='ASSIGNED'
    check('X=400; ASSIGNED→C=400; Driver khác/Customer=403; thiếu JWT=401; DB không đổi')
    for short,canonical in [('A','ARRIVED'),('I_G','IN_PROGRESS'),('C','COMPLETED')]:
        result = api('PATCH',path,{'s':short},driver['Token'])
        assert result['Status']==canonical
        assert sql('trip','SELECT s FROM trip WHERE tid=$1',[tid])[0]['s']==canonical
        if short=='I_G':
            api('PATCH','/trips/'+str(tid)+'/location',{'lat':10.805,'lng':106.725},driver['Token'])
    assert [r['to_s'] for r in sql('trip','SELECT to_s FROM trip_status_history WHERE tid=$1 ORDER BY hid',[tid])]==['ASSIGNED','ARRIVED','IN_PROGRESS','COMPLETED']
    api('PATCH',path,{'s':'A'},driver['Token'],409)
    check('A/I_G/C response + DB + history chuẩn; cập nhật tọa độ sau IN_PROGRESS; COMPLETED không đổi tiếp')
    tid2 = assignment()
    for status in ['ARRIVED','IN_PROGRESS','COMPLETED']:
        assert api('PATCH','/trips/'+str(tid2)+'/status',{'s':status},driver['Token'])['Status']==status
    check('ARRIVED/IN_PROGRESS/COMPLETED đầy đủ tiếp tục hoạt động trên Trip test thứ hai')
    tid3 = assignment()
    api('POST','/trips/'+str(tid3)+'/cancel',{'r':'test alias '+run},customer['Token'])
    api('PATCH','/trips/'+str(tid3)+'/status',{'s':'C'},driver['Token'],409)
    wait(lambda:sql('driver','SELECT av FROM driver WHERE did=$1',[dids[0]]),lambda r:r[0]['av']=='AVAILABLE','t1 released')
    assert prepare.active(dids[1])==busy
    assert untouched(dids)==before
    check('CANCELED không chuyển C; t1 trở lại AVAILABLE qua event; t2 Trip giữ nguyên; Driver ngoài nhóm không đổi')
    drain()
    own_events = [e for e in events if str(e['payload'].get('tripId',''))==str(tid)]
    assert [e['payload']['toStatus'] for e in own_events if e['eventType']=='trip.status.changed']==['ASSIGNED','ARRIVED','IN_PROGRESS','COMPLETED']
    assert any(e['eventType']=='trip.completed' for e in own_events)
    check('RabbitMQ trip.status.changed chỉ chứa trạng thái chuẩn; trip.completed consumer hoạt động')
    final = api('GET','/drivers/nearby?lat=10.80&lng=106.72&r=1&page=1&limit=5',token=admin['Token'])
    assert [(r['Driver ID'],r['Availability Status']) for r in final['Items']]==[(r['Driver ID'],r['Availability Status']) for r in nearby['Items']]
    (ROOT/'.backups'/('demo-alias-smoke-'+run+'.json')).write_text(json.dumps({'run':run,'checks':checks,'trips':trips,'nearby':final,'t2Trip':busy,'events':own_events},ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS '+str(len(checks))+' nhóm nghiệm thu; kết quả riêng tư .backups/demo-alias-smoke-'+run+'.json',flush=True)


if __name__ == '__main__':
    broker('PUT','/queues/%2F/'+queue,{'durable':False,'auto_delete':False,'arguments':{'x-expires':600000}})
    broker('POST','/bindings/%2F/e/cab.events/q/'+queue,{'routing_key':'#','arguments':{}})
    try:
        main()
    finally:
        # Khi test bị gián đoạn, chỉ hủy Trip mới do lần smoke này tạo, giữ mọi bản ghi.
        if customer_token:
            for trip in trips:
                state = sql('trip','SELECT s FROM trip WHERE tid=$1',[trip['tid']])[0]['s']
                if state not in ['COMPLETED','CANCELED']:
                    api('POST','/trips/'+str(trip['tid'])+'/cancel',{'r':'smoke interrupted '+run},customer_token)
        # Chỉ xóa queue observer do lần test này tạo; không đọc/purge queue service.
        broker('DELETE','/queues/%2F/'+queue)
