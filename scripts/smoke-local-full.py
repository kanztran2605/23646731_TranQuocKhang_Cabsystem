"""Real CAB E2E and 30-rubric smoke. Business operations use Gateway :8080 only.

Creates disposable Drivers/Customer and retains their event-source records. Uses
only a temporary RabbitMQ observer queue; never consumes canonical queue messages.
Honors the actual Redis 3/10s limit. Private result JSON contains IDs, never tokens.
Defaults to /api readable responses; PostgreSQL credentials come from Compose.
Redelivery checks reuse original events only for this run's disposable records.
"""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import re
import time
import urllib.error
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--idempotency-key',default='P1',help='Use a fresh key for subsequent smoke runs; completed Payments are preserved')
parser.add_argument('--api-prefix',choices=['/api','/api/v1'],default='/api',help='Current readable REST API, or the compatible versioned API')
args=parser.parse_args()
payment_key=args.idempotency_key
if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',payment_key):
    raise SystemExit('Smoke idempotency key must be 1-100 letters, digits, underscores or hyphens')
run=uuid.uuid4().hex[:12]
correlation='full-smoke-'+run
config=json.loads(subprocess.check_output(['docker','compose','config','--format','json'],cwd=ROOT))
postgres_user=config['services']['postgres']['environment']['POSTGRES_USER']
env=config['services']['rabbitmq']['environment']
management=config['services']['rabbitmq']['ports'][0]['published']
authorization='Basic '+base64.b64encode((env['RABBITMQ_DEFAULT_USER']+':'+env['RABBITMQ_DEFAULT_PASS']).encode()).decode()
queue='cab.full.smoke.'+run
events=[];checks=[];rubrics=set();throttles=0;read_retries=0;drivers=[];record_ids={}
evidence={};replayed=set();cleanup=[]
pickup={'lat':25+(int(run[:6],16)%8000)/1000,'lng':35+(int(run[6:],16)%10000)/1000}
result_file=ROOT/'.backups'/('full-smoke-'+run+'.json')

# Decode only the public presentation labels documented for /api. Test requests
# remain short; internal script assertions can also exercise the legacy prefix.
response_aliases={
    'Token':'token','Role':'role','User ID':'uid','Customer ID':'cid','Driver ID':'did',
    'Vehicle ID':'vid','Booking ID':'bid','Offer ID':'oid','Trip ID':'tid','Payment ID':'pid',
    'Review ID':'rid','Notification ID':'nid','Event ID':'eid','Name':'name','Address':'addr',
    'Approval Status':'ap','Availability Status':'av','Vehicle Type':'vt','License Plate':'plate',
    'Latitude':'lat','Longitude':'lng','Distance (km)':'km','Pickup':'p','Destination':'d',
    'Status':'s','Paid':'paid','Cancel Reason':'r','Amount':'amt','Eligible':'eligible',
    'Idempotency Key':'key','Rating':'star','Comment':'c','Type':'type','Reference':'ref',
    'Message':'msg','Created At':'c_at','Page':'page','Limit':'limit','Items':'items',
    'OTP':'otp','Trip Pending':'tripPending','Phone':'phone','Driver':'driver',
}

def readable_result(value):
    if isinstance(value,list):return [readable_result(item) for item in value]
    if not isinstance(value,dict):return value
    assert not (set(value)&set(response_aliases.values())), 'Expected readable /api response labels'
    return {response_aliases.get(key,key):readable_result(item) for key,item in value.items()}

def record(label,*criteria):
    checks.append(label);rubrics.update(criteria)
    print('PASS '+label,flush=True)
    save()

def save():
    result_file.write_text(json.dumps({'run':run,'checks':checks,'rubrics':sorted(rubrics),'ids':record_ids,
        'apiPrefix':args.api_prefix,'idempotencyKey':payment_key,'evidence':evidence,
        'replayedEventTypes':sorted(replayed),'cleanup':cleanup,
        'rateLimitResponsesHonored':throttles,'readOnlyTransientRetries':read_retries},indent=2),encoding='utf-8')

def broker(method,path,body=None):
    req=urllib.request.Request('http://localhost:'+str(management)+'/api'+path,
        data=None if body is None else json.dumps(body).encode(),method=method,
        headers={'Authorization':authorization,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=8) as response:
        data=response.read();return json.loads(data) if data else None

def raw(method,path,body=None,token=None,headers=None):
    business=path.startswith('/api/v1/')
    if business:path=args.api_prefix+path[len('/api/v1'):]
    merged={'Content-Type':'application/json','X-Correlation-ID':correlation,**(headers or {})}
    if token:merged['Authorization']='Bearer '+token
    req=urllib.request.Request('http://localhost:8080'+path,data=None if body is None else json.dumps(body).encode(),method=method,headers=merged)
    try:response=urllib.request.urlopen(req,timeout=8)
    except urllib.error.HTTPError as error:response=error
    result=json.loads(response.read())
    if business and args.api_prefix=='/api' and response.code<400:result=readable_result(result)
    return response.code,result,response.headers

def api(method,path,body=None,token=None,expected=200,headers=None):
    global throttles,read_retries
    for attempt in range(5):
        code,result,response_headers=raw(method,path,body,token,headers)
        if code==429 and attempt<4:
            throttles+=1;pause=int(response_headers.get('Retry-After','10'));assert 1<=pause<=10
            time.sleep(pause+0.15);continue
        if code in [503,504] and (method=='GET' or path=='/api/v1/login') and attempt<2:
            read_retries+=1;time.sleep(0.5);continue
        assert code==expected,path+': expected '+str(expected)+', received '+str(code)
        return result
    raise AssertionError('Bounded Gateway request failed')

def login(email,role):
    response=api('POST','/api/v1/login',{'email':email,'pw':'123'})
    assert response['role']==role
    return response

def pg(database,statement):
    wrapped="SELECT COALESCE((SELECT value FROM ("+statement+") q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) j),'null'::jsonb)"
    out=subprocess.check_output(['docker','exec','cab-postgres','psql','-X','-U',postgres_user,'-d',database,'-At','-v','ON_ERROR_STOP=1','-c',wrapped],text=True)
    return json.loads(out)

def mongo(filter):
    script="(async()=>{const db=require('./src/config/database');try{console.log(JSON.stringify(await db.database.collection('notifications').find("+json.dumps(filter)+").toArray()));}finally{await db.closeDatabase();}})().catch(()=>process.exit(1));"
    return json.loads(subprocess.check_output(['docker','exec','cab-notification-service','node','-e',script],text=True))

def wait(read,predicate,label,seconds=6):
    end=time.monotonic()+seconds
    while True:
        value=read()
        if predicate(value):return value
        if time.monotonic()>=end:raise AssertionError('Timed out: '+label)
        time.sleep(0.15)

def drain():
    messages=broker('POST','/queues/%2F/'+queue+'/get',{'count':200,'ackmode':'ack_requeue_false','encoding':'auto','truncate':20000})
    for message in messages:
        if message['properties'].get('correlation_id')!=correlation:continue
        event=json.loads(message['payload']);assert set(event)=={'eventId','eventType','occurredAt','payload'}
        assert message['routing_key']==event['eventType'];uuid.UUID(event['eventId']);events.append(event)

def observed(type,field,value):
    def read():
        drain();return [e for e in events if e['eventType']==type and str(e['payload'].get(field))==str(value)]
    return wait(read,lambda matches:bool(matches),type)[-1]

def notify(event,uids):
    expected=sorted(str(uid) for uid in uids)
    rows=wait(lambda:mongo({'eid':event['eventId']}),lambda rows:sorted(row['uid'] for row in rows)==expected,'Notification recipients')
    assert len(rows)==len(set(expected));return rows

def driver_state(did):
    return pg('driver_db','SELECT row_to_json(d) FROM driver d WHERE did='+str(did))

def consumers_settled():
    rows=json.loads(subprocess.check_output(['docker','exec','cab-rabbitmq','rabbitmqctl','-q','list_queues','-p','/',
        'name','messages_ready','messages_unacknowledged','consumers','--formatter=json'],text=True))
    canonical={q['name'] for q in json.loads((ROOT/'infrastructure/rabbitmq/definitions.json').read_text())['queues']}
    queues=[q for q in rows if q['name'] in canonical]
    return len(queues)==len(canonical) and all(q['consumers']>=1 and q['messages_ready']==0 and q['messages_unacknowledged']==0 for q in queues)

def replay_event(event):
    # Redeliver the original envelope only for this run's disposable records.
    # Never basic.get/purge any canonical service queue.
    result=broker('POST','/exchanges/%2F/cab.events/publish',{'routing_key':event['eventType'],
        'properties':{'content_type':'application/json','delivery_mode':2,'correlation_id':correlation},
        'payload':json.dumps(event),'payload_encoding':'string'})
    assert result['routed'] is True
    wait(consumers_settled,bool,'event redelivery acknowledgements')
    drain()

def assignment(customer,driver,payment_check=False):
    # Không nhập vt: kiểm tra mặc định BIKE trong toàn bộ happy path.
    booking=api('POST','/api/v1/bookings',{'p':pickup,'d':{'lat':pickup['lat']+0.01,'lng':pickup['lng']+0.01}},customer['token'],expected=201)
    assert booking['s']=='SEARCHING' and booking['did']==driver['did'] and booking['oid']
    bid,oid=booking['bid'],booking['oid'];record_ids.setdefault('bookings',[]).append(bid);save()
    persisted=pg('booking_db','SELECT row_to_json(b) FROM booking b WHERE bid='+str(bid));assert persisted['vt']=='BIKE'
    assert pg('booking_db','SELECT count(*) FROM driver_offer WHERE bid='+str(bid))==1
    created=observed('booking.created','bookingId',bid);assert created['payload']['customerUserId']==str(customer['uid'])
    offered=observed('offer.created','offerId',oid);assert offered['payload']['recipientUserIds']==[str(driver['uid'])]
    notify(offered,[driver['uid']])
    payment=wait(lambda:pg('payment_db','SELECT row_to_json(p) FROM payment p WHERE bid='+str(bid)),lambda p:p is not None,'early Payment')
    assert payment['amt']==50000 and payment['s']=='PENDING' and payment['eligible'] is False and payment['tid'] is None and payment['ikey'] is None
    if payment_check:
        evidence['initialPayment']={k:payment[k] for k in ['pid','bid','tid','cid','amt','s','eligible','ikey']}
        record('Booking persisted; one nearest Offer; booking.created created early 50000/PENDING Payment',4,7,15)
        replay_event(created)
        assert pg('payment_db','SELECT count(*) FROM payment WHERE bid='+str(bid))==1
        assert pg('payment_db','SELECT row_to_json(p) FROM payment p WHERE pid='+str(payment['pid']))==payment
        replayed.add('booking.created')
        replay_event(offered);notify(offered,[driver['uid']]);replayed.add('offer.created')
        record('booking.created replay keeps the original pending Payment; offer.created replay creates no duplicate Notification')
        response=api('GET','/api/v1/payments/by-booking/'+str(bid),token=customer['token']);assert response['pid']==payment['pid'] and response['tid'] is None
        api('POST','/api/v1/payments/'+str(payment['pid'])+'/pay',token=customer['token'],headers={'Idempotency-Key':payment_key},expected=409)
        notifications=api('GET','/api/v1/notifications?limit=20',token=driver['token']);assert any(n['eid']==offered['eventId'] and n['uid']==driver['uid'] for n in notifications['items'])
        record('Driver reads own Offer Notification; ineligible Payment cannot be charged')
    offers=api('GET','/api/v1/drivers/me/offers',token=driver['token']);assert any(o['oid']==oid for o in offers)
    result=api('POST','/api/v1/offers/'+str(oid)+'/accept',token=driver['token']);assert result['s']=='ACCEPTED'
    assert driver_state(driver['did'])['av']=='BUSY'
    assert pg('booking_db','SELECT count(*) FROM driver_assignment WHERE bid='+str(bid))==1
    accepted=observed('driver.accepted','bookingId',bid);assert accepted['payload']['customerUserId']==str(customer['uid']) and accepted['payload']['driverUserId']==str(driver['uid'])
    trip=wait(lambda:pg('trip_db','SELECT row_to_json(t) FROM trip t WHERE bid='+str(bid)),lambda t:t is not None,'Trip assignment')
    assert trip['s']=='ASSIGNED' and trip['paid'] is False and trip['customer_uid']==customer['uid'] and trip['driver_uid']==driver['uid']
    assert pg('trip_db','SELECT count(*) FROM trip_status_history WHERE tid='+str(trip['tid']))==1
    visible=api('GET','/api/v1/trips/by-booking/'+str(bid),token=customer['token']);assert visible['tid']==trip['tid']
    assert visible['driver']=={'did':driver['did'],'name':'Full Smoke '+run,'vt':'BIKE','plate':driver['plate']}
    if payment_check:record('Driver acceptance: BUSY, one Assignment, driver.accepted, one ASSIGNED unpaid Trip',16)
    if payment_check:
        repeated=api('POST','/api/v1/offers/'+str(oid)+'/accept',token=driver['token'])
        assert repeated==result
        drain()
        assert len([e for e in events if e['eventType']=='driver.accepted' and e['payload']['bookingId']==str(bid)])==1
        replay_event(accepted)
        assert pg('booking_db','SELECT count(*) FROM driver_assignment WHERE bid='+str(bid))==1
        assert pg('trip_db','SELECT count(*) FROM trip WHERE bid='+str(bid))==1
        assert pg('trip_db','SELECT count(*) FROM trip_status_history WHERE tid='+str(trip['tid']))==1
        replayed.add('driver.accepted')
        record('duplicate Offer acceptance and driver.accepted redelivery keep one Assignment and one Trip/history')
    return booking,payment,trip

def complete_trip(trip,driver):
    tid=trip['tid']
    for state in ['ARRIVED','IN_PROGRESS']:
        assert api('PATCH','/api/v1/trips/'+str(tid)+'/status',{'s':state},driver['token'])['s']==state
    assert api('PATCH','/api/v1/trips/'+str(tid)+'/location',{'lat':pickup['lat']+0.002,'lng':pickup['lng']+0.002},driver['token'])['tid']==tid
    assert pg('trip_db','SELECT count(*) FROM trip_location WHERE tid='+str(tid))==1
    assert pg('trip_db','SELECT s FROM trip WHERE tid='+str(tid))=='IN_PROGRESS'
    done=api('PATCH','/api/v1/trips/'+str(tid)+'/status',{'s':'COMPLETED'},driver['token']);assert done['s']=='COMPLETED' and done['paid'] is False
    event=observed('trip.completed','tripId',tid);assert event['payload']['customerUserId']==str(trip['customer_uid'])
    wait(lambda:driver_state(driver['did']),lambda d:d['av']=='AVAILABLE','Driver release')
    assert pg('trip_db','SELECT count(*) FROM trip_status_history WHERE tid='+str(tid))==4
    return event

if pg('payment_db',"SELECT count(*) FROM payment WHERE ikey='"+payment_key+"'"):
    raise SystemExit('This idempotency key already belongs to a preserved Payment. Replay that Payment, or use --idempotency-key with a fresh key for another smoke run.')
result_file.parent.mkdir(exist_ok=True)
broker('PUT','/queues/%2F/'+queue,{'durable':False,'auto_delete':False,'arguments':{}})
try:
    keys=['booking.created','offer.created','driver.accepted','driver.approval.changed','trip.status.changed','trip.canceled','trip.completed','payment.completed']
    for key in keys:broker('POST','/bindings/%2F/e/cab.events/q/'+queue,{'routing_key':key,'arguments':{}})
    expected={'postgres','mongodb','redis','rabbitmq','api-gateway',*[name+'-service' for name in ['auth','customer','driver','booking','trip','payment','notification','review']]}
    assert set(config['services'])==expected
    assert all(not value.get('ports') for name,value in config['services'].items() if name not in ['api-gateway','rabbitmq'])
    actual={p.name for p in (ROOT/'services').iterdir() if p.is_dir()};assert actual=={'api-gateway',*[name+'-service' for name in ['auth','customer','driver','booking','trip','payment','notification','review']]}
    record('exact architecture, 13-component Compose and Gateway-only business ingress',1,3,8)
    assert subprocess.run(['git','check-ignore','--quiet','.env'],cwd=ROOT).returncode==0
    assert not subprocess.check_output(['git','ls-files','.env'],cwd=ROOT).strip();assert (ROOT/'.env.example').exists()
    record('real .env ignored/untracked; example configuration available',2)
    assert api('GET','/health')['status']=='HEALTHY';assert api('GET','/ready')['status']=='HEALTHY'
    services=api('GET','/health/services')['services'];assert len(services)==8 and all(s['status']=='HEALTHY' for s in services)
    ps=subprocess.check_output(['docker','compose','ps','--format','{{.Service}} {{.State}} {{.Health}}'],text=True)
    assert len(ps.splitlines())==13 and all('running healthy' in line for line in ps.splitlines())
    record('13 containers healthy; /health 200, /ready 200, all eight gRPC service checks UP',5,6)
    customer=login('c@c.com','CUSTOMER');admin=login('a@a.com','ADMIN');seed_driver=login('d@d.com','DRIVER')
    cid=pg('customer_db','SELECT cid FROM customer_profile WHERE uid='+str(customer['uid']));did=pg('driver_db','SELECT did FROM driver WHERE uid='+str(seed_driver['uid']))
    record_ids.update({'customerUid':customer['uid'],'customerId':cid,'seedDriverId':did})
    record('canonical Customer/Driver/Admin logins',10)
    profile=api('GET','/api/v1/customers/'+str(cid),token=customer['token']);assert profile['uid']==customer['uid']
    api('GET','/api/v1/drivers/'+str(did),token=admin['token']);api('GET','/api/v1/drivers/'+str(did),token=customer['token'],expected=403)
    record('owned Customer profile; same Driver detail endpoint Admin 200 / Customer 403',11,12,28)
    other=customer
    new_email='fs-'+run+'@c.com';new=api('POST','/api/v1/register',{'email':new_email,'pw':'123','name':'An','phone':'+84 901 234 567'},expected=201)
    customer=login(new_email,'CUSTOMER');assert customer['uid']==new['uid'] and customer['cid']==new['cid']
    cid=new['cid'];record_ids.update({'customerUid':customer['uid'],'customerId':cid})
    profile=api('GET','/api/v1/customers/'+str(cid),token=customer['token']);assert profile['uid']==customer['uid']
    assert profile['phone']=='0901234567'
    assert pg('customer_db','SELECT uid FROM customer_profile WHERE cid='+str(cid))==customer['uid']
    record('disposable Customer account/profile registration, login and owned-DB persistence',9)
    # Use an empty, valid area so no existing Driver is selected or moved.
    for attempt in range(5):
        nearby=api('GET','/api/v1/drivers/nearby?lat='+str(pickup['lat'])+'&lng='+str(pickup['lng'])+'&r=1&page=1&limit=20',token=admin['token'])
        if not nearby['items']:break
        pickup['lat']+=0.1
    else:raise AssertionError('No isolated smoke location found; existing Drivers left unchanged')
    evidence['pickup']=pickup.copy()
    for index in range(2):
        email='fs-'+run+'-'+str(index)+'@d.com'
        phone='09'+str((int(run,16)+index)%100000000).zfill(8)
        body={'phone':phone,'email':email,'pw':'123','otp':'123','name':'Full Smoke '+run,'plate':'FS'+run+str(index)}
        assert api('POST','/api/v1/drivers/otp',{'phone':phone})['otp']=='123'
        api('POST','/api/v1/drivers/register',{**body,'otp':'wrong'},expected=400)
        assert pg('auth_db',"SELECT count(*) FROM user_account WHERE email='"+email+"'")==0
        row=api('POST','/api/v1/drivers/register',body,expected=201)
        row['plate']=body['plate'].upper()
        assert row['ap']=='PENDING_APPROVAL';drivers.append(row);record_ids['drivers']=[{'did':d['did'],'uid':d['uid']} for d in drivers];save()
        if index==0:
            record('mock OTP 123 and Driver PENDING_APPROVAL onboarding',21)
            pending=api('GET','/api/v1/drivers/pending-approval?page=1&limit=20',token=admin['token']);assert any(d['did']==row['did'] for d in pending['items'])
            api('GET','/api/v1/drivers/'+str(row['did']),token=admin['token'])
        assert api('PATCH','/api/v1/drivers/'+str(row['did'])+'/approval',{'ap':'APPROVED'},admin['token'])['ap']=='APPROVED'
        approved=observed('driver.approval.changed','driverId',row['did']);notify(approved,[row['uid']])
        if index==0:
            replay_event(approved);notify(approved,[row['uid']]);replayed.add('driver.approval.changed')
        row['token']=login(email,'DRIVER')['token']
        api('PUT','/api/v1/drivers/me/location',{'lat':pickup['lat']+index*0.005,'lng':pickup['lng']},row['token'])
        assert api('PATCH','/api/v1/drivers/me/availability',{'on':True},row['token'])['av']=='AVAILABLE'
        if index==0:
            record('Admin pending/detail/approve publishes Driver-recipient Notification',22)
            assert api('PATCH','/api/v1/drivers/me/availability',{'on':False},row['token'])['av']=='OFFLINE'
            assert api('PATCH','/api/v1/drivers/me/availability',{'on':True},row['token'])['av']=='AVAILABLE'
            record('approved Driver AVAILABLE -> OFFLINE -> AVAILABLE invariants',23)
    nearby=api('GET','/api/v1/drivers/nearby?lat=10.76&lng=106.68&r=1&page=1&limit=5',token=admin['token']);assert len(nearby['items'])==5
    assert all(d['km']<=1 and d['vt'] in ['CAR','BIKE'] for d in nearby['items']);assert len({(d['ap'],d['av']) for d in nearby['items']})>1
    api('GET','/api/v1/drivers/nearby',token=admin['token'],expected=400)
    record('Nearby seeded multiple statuses, 1 km radius and page/limit',13)
    booking,payment,trip=assignment(customer,drivers[0],True);bid,tid,pid=booking['bid'],trip['tid'],payment['pid'];record_ids.update({'happyBooking':bid,'happyTrip':tid,'happyPayment':pid});save()
    assert api('PATCH','/api/v1/drivers/me/availability',{'on':False},drivers[0]['token'],expected=409)
    assert api('PATCH','/api/v1/drivers/me/availability',{'on':False},drivers[1]['token'])['av']=='OFFLINE'
    api('GET','/api/v1/trips/'+str(tid),token=other['token'],expected=403)
    api('GET','/api/v1/payments/'+str(pid),token=other['token'],expected=403)
    api('POST','/api/v1/trips/'+str(tid)+'/reviews',{'star':5,'c':'wrong owner'},other['token'],expected=403)
    api('PATCH','/api/v1/trips/'+str(tid)+'/status',{'s':'COMPLETED'},drivers[0]['token'],expected=400)
    record('Trip/Payment/Review ownership and invalid transition rejected without side effects')
    completed=complete_trip(trip,drivers[0]);record('ARRIVED -> IN_PROGRESS -> location -> COMPLETED; four history rows, unpaid, Driver AVAILABLE',17)
    eligible=wait(lambda:pg('payment_db','SELECT row_to_json(p) FROM payment p WHERE pid='+str(pid)),lambda p:p['eligible'],'Payment eligibility')
    assert eligible['tid']==tid and eligible['s']=='PENDING' and eligible['pid']==pid
    assert pg('payment_db','SELECT count(*) FROM payment WHERE bid='+str(bid))==1
    evidence['eligiblePayment']={k:eligible[k] for k in ['pid','bid','tid','cid','amt','s','eligible','ikey']}
    replay_event(completed)
    assert pg('payment_db','SELECT row_to_json(p) FROM payment p WHERE pid='+str(pid))==eligible
    assert pg('payment_db','SELECT count(*) FROM payment WHERE bid='+str(bid))==1
    assert driver_state(drivers[0]['did'])['av']=='AVAILABLE'
    replayed.add('trip.completed')
    progressed=observed('trip.status.changed','tripId',tid)
    replay_event(progressed);notify(progressed,[customer['uid']]);replayed.add('trip.status.changed')
    assert pg('trip_db','SELECT count(*) FROM trip_status_history WHERE tid='+str(tid))==4
    assert pg('trip_db','SELECT s FROM trip WHERE tid='+str(tid))=='COMPLETED'
    record('trip.completed replay updates the SAME Payment once; normal progress Notification is deduplicated')
    api('POST','/api/v1/payments/'+str(pid)+'/callback',{'s':'COMPLETED'},customer['token'],expected=409)
    first_pay=api('POST','/api/v1/payments/'+str(pid)+'/pay',token=customer['token'],headers={'Idempotency-Key':payment_key})
    assert first_pay['s']=='PENDING'
    paid=api('POST','/api/v1/payments/'+str(pid)+'/callback',{'s':'COMPLETED'},customer['token']);assert paid['pid']==pid and paid['s']=='COMPLETED'
    payment_event=observed('payment.completed','paymentId',pid);notify(payment_event,[customer['uid']])
    wait(lambda:pg('trip_db','SELECT paid FROM trip WHERE tid='+str(tid)),bool,'Trip paid projection')
    assert api('GET','/api/v1/trips/'+str(tid),token=customer['token'])['paid'] is True
    record('same Payment becomes eligible; '+payment_key+' + local callback completes; Trip paid=true and Customer notified',19)
    replay=api('POST','/api/v1/payments/'+str(pid)+'/pay',token=customer['token'],headers={'Idempotency-Key':payment_key});assert replay==first_pay
    api('POST','/api/v1/payments/'+str(pid)+'/pay',{'amt':1},customer['token'],headers={'Idempotency-Key':payment_key},expected=409)
    assert api('GET','/api/v1/payments/'+str(pid),token=customer['token'])['s']=='COMPLETED'
    api('POST','/api/v1/payments/'+str(pid)+'/callback',{'s':'COMPLETED'},customer['token']);drain()
    assert pg('payment_db','SELECT count(*) FROM payment WHERE bid='+str(bid))==1
    assert len([e for e in events if e['eventType']=='payment.completed' and e['payload']['paymentId']==str(pid)])==1
    evidence['paymentCompletionEventsBeforeConsumerReplay']=1
    record(payment_key+' replay: same pid/result, one Payment, one completion/event',30)
    payment_before=pg('payment_db','SELECT row_to_json(p) FROM payment p WHERE pid='+str(pid))
    replay_event(payment_event);notify(payment_event,[customer['uid']]);replayed.add('payment.completed')
    assert pg('trip_db','SELECT paid FROM trip WHERE tid='+str(tid)) is True
    assert pg('payment_db','SELECT row_to_json(p) FROM payment p WHERE pid='+str(pid))==payment_before
    evidence['completedPayment']={k:payment_before[k] for k in ['pid','bid','tid','cid','amt','s','eligible','ikey','paid_at']}
    record('payment.completed redelivery keeps Trip paid=true, original Payment and one recipient Notification')
    notifications=api('GET','/api/v1/notifications?limit=20',token=customer['token']);assert any(n['eid']==payment_event['eventId'] and n['uid']==customer['uid'] for n in notifications['items'])
    review=api('POST','/api/v1/trips/'+str(tid)+'/reviews',{'star':5,'c':'ok'},customer['token'],expected=201);assert review['did']==drivers[0]['did'] and review['c']=='ok'
    api('POST','/api/v1/trips/'+str(tid)+'/reviews',{'star':5,'c':'ok'},customer['token'],expected=409)
    assert pg('review_db','SELECT count(*) FROM review WHERE tid='+str(tid))==1
    evidence['review']={'rid':review['rid'],'tid':tid,'cid':cid,'did':review['did'],'star':review['star'],'c':review['c']}
    record('star=5/c=ok Review persisted once; duplicate rejected',20)
    cancellation,_p,canceled_trip=assignment(customer,drivers[0]);cancel_tid=canceled_trip['tid'];record_ids['cancelTrip']=cancel_tid
    result=api('POST','/api/v1/trips/'+str(cancel_tid)+'/cancel',{'r':'x'},customer['token']);assert result['s']=='CANCELED' and result['r']=='x'
    canceled=observed('trip.canceled','tripId',cancel_tid);notify(canceled,[customer['uid'],drivers[0]['uid']])
    wait(lambda:driver_state(drivers[0]['did']),lambda d:d['av']=='AVAILABLE','cancellation release')
    replay_event(canceled);assert len(notify(canceled,[customer['uid'],drivers[0]['uid']]))==2
    assert driver_state(drivers[0]['did'])['av']=='AVAILABLE';replayed.add('trip.canceled')
    record('cancellation r=x: CANCELED, Driver AVAILABLE, TWO recipient docs; replay deduplicated',18)
    xss_booking,_p,xss_trip=assignment(customer,drivers[0]);complete_trip(xss_trip,drivers[0]);record_ids['xssTrip']=xss_trip['tid']
    xss=api('POST','/api/v1/trips/'+str(xss_trip['tid'])+'/reviews',{'star':5,'c':"<script>alert('hack')</script>"},customer['token'],expected=201)
    assert '<script' not in xss.get('c','').lower() and 'alert' not in xss.get('c','')
    stored=pg('review_db','SELECT cmt FROM review WHERE tid='+str(xss_trip['tid']));assert stored==xss.get('c','')
    record('real XSS Review input sanitized before storage and JSON response',26)
    # Supply this disposable Customer's history fixture without using seeded
    # Customer records. No eligible Drivers remain in the isolated test area.
    assert api('PATCH','/api/v1/drivers/me/availability',{'on':False},drivers[0]['token'])['av']=='OFFLINE'
    for _ in range(2):
        extra=api('POST','/api/v1/bookings',{'p':pickup,'d':pickup,'vt':'CAR'},customer['token'],expected=201)
        record_ids['bookings'].append(extra['bid']);save()
        assert extra['s']=='NO_DRIVER_FOUND' and extra['oid'] is None and extra['did'] is None
        assert pg('booking_db','SELECT count(*) FROM driver_offer WHERE bid='+str(extra['bid']))==0
    history=api('GET','/api/v1/customers/me/bookings?page=1&limit=2',token=customer['token']);assert len(history['items'])==2 and all(b['cid']==cid for b in history['items'])
    assert pg('booking_db','SELECT count(*) FROM booking WHERE cid='+str(cid))>=5
    record('Customer with >=5 Bookings has owned history and page/limit',14)
    assert pg('auth_db',"SELECT bool_and(pw_hash <> '123' AND pw_hash LIKE '$2%') FROM user_account WHERE uid IN ("+str(customer['uid'])+','+str(drivers[0]['uid'])+')') is True
    assert pg('driver_db',"SELECT lic_enc LIKE 'v1:%' AND lic_enc NOT LIKE '%DL-DEMO%' FROM driver_profile WHERE did="+str(did)) is True
    record('password hash and real versioned Driver-license ciphertext at rest',24)
    injection=api('POST','/api/v1/login',{'email':"' OR 1=1 --",'pw':'x'},expected=400);assert 'token' not in injection
    record('SQL injection login cannot bypass authentication',25)
    token=customer['token'];tampered=token[:-1]+('A' if token[-1]!='A' else 'B')
    api('GET','/api/v1/customers/'+str(cid),token=tampered,expected=401)
    api('GET','/api/v1/customers/'+str(cid),expected=401)
    record('tampered/missing JWT rejected with 401',27)
    time.sleep(10.2)
    responses=[raw('GET','/api/v1/vehicle-types',token=customer['token'])[0] for _ in range(4)]
    assert responses==[200,200,200,429];assert api('GET','/health')['status']=='HEALTHY'
    record('real Redis demo limit: three allowed requests, fourth 429; Gateway stays UP',29)
    bindings=broker('GET','/bindings/%2F');assert all(any(b['source']=='cab.events' and b['routing_key']==key for b in bindings) for key in keys)
    assert replayed==set(keys)
    assert consumers_settled()
    record('all eight canonical event types redelivered safely; consumers acknowledged with no duplicate domain records')
    assert rubrics==set(range(1,31))
    record('30/30 rubric supported; retained source records, disposable Drivers restored OFFLINE')
    print('PASS full smoke:',len(checks),'checks; 30/30 rubric; result:',result_file,flush=True)
finally:
    # Only this run's AVAILABLE Drivers may be taken OFFLINE. Never override
    # BUSY or terminal business invariants to hide a failed smoke assertion.
    for row in drivers:
        try:
            if row.get('token') and driver_state(row['did'])['av']=='AVAILABLE':
                api('PATCH','/api/v1/drivers/me/availability',{'on':False},row['token'])
            state=driver_state(row['did'])['av']
            cleanup.append({'did':row['did'],'availability':state})
        except Exception:
            cleanup.append({'did':row['did'],'error':'Inspect disposable Driver state'})
    evidence['observedEvents']=[{'eventId':e['eventId'],'eventType':e['eventType']} for e in events]
    save()
    broker('DELETE','/queues/%2F/'+queue)
