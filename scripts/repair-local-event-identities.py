"""Local one-time repair for queued pre-recipient-contract events.

Only processes the three inspected, inactive downstream queues. Backs up the
original messages first, resolves logical references from owned DB snapshots for
this offline migration only, and republishes with unchanged event IDs. Runtime
Notification never performs these lookups. No queue/volume/database is purged.
"""
import base64
import datetime
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
config=json.loads(subprocess.check_output(['docker','compose','config','--format','json'],cwd=ROOT))
env=config['services']['rabbitmq']['environment']
auth=base64.b64encode((env['RABBITMQ_DEFAULT_USER']+':'+env['RABBITMQ_DEFAULT_PASS']).encode()).decode()
port=config['services']['rabbitmq']['ports'][0]['published']
def api(path,data=None):
    body=None if data is None else json.dumps(data).encode()
    request=urllib.request.Request('http://localhost:'+str(port)+'/api/'+path,data=body,
        headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=10) as response:return json.load(response)
def mapping(database,table,key):
    result=subprocess.check_output(['docker','exec','cab-postgres','psql','-U','cab_user','-d',database,'-Atc',
        "SELECT COALESCE(json_object_agg("+key+",uid),'{}'::json) FROM "+table],text=True)
    return {str(k):str(v) for k,v in json.loads(result).items()}
customers=mapping('customer_db','customer_profile','cid')
drivers=mapping('driver_db','driver','did')
queues=['cab.payment.q','cab.trip.q','cab.notification.q']
originals={}
for queue in queues:
    state=api('queues/%2F/'+queue)
    if state['consumers'] != 0:raise SystemExit('Identity repair requires inactive downstream consumers; no changes')
    count=state.get('messages_ready',0)
    if count>1000:raise SystemExit('Unexpected backlog; no automatic repair')
    originals[queue]=api('queues/%2F/'+queue+'/get',{'count':count,'ackmode':'ack_requeue_true','encoding':'auto','truncate':1000000}) if count else []
backups=ROOT/'.backups';backups.mkdir(exist_ok=True)
target=backups/('cab-events-before-identity-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
target.write_text(json.dumps(originals,indent=2),encoding='utf-8')
prepared={}
for queue,messages in originals.items():
    prepared[queue]=[]
    for message in messages:
        event=json.loads(message['payload']);p=event['payload'];type=event['eventType']
        if type in ['booking.created','driver.accepted','trip.completed']:p['customerUserId']=customers[str(p['customerId'])]
        if type in ['driver.accepted','trip.completed']:p['driverUserId']=drivers[str(p['driverId'])]
        if type in ['offer.created','driver.approval.changed']:p['recipientUserIds']=[drivers[str(p['driverId'])]]
        if type in ['trip.status.changed','payment.completed']:p['recipientUserIds']=[customers[str(p['customerId'])]]
        if type=='trip.canceled':p['recipientUserIds']=list(dict.fromkeys([customers[str(p['customerId'])],drivers[str(p['driverId'])]]))
        prepared[queue].append((message,event))
print('Backup saved:',target)
for queue,messages in prepared.items():
    if not messages:continue
    removed=api('queues/%2F/'+queue+'/get',{'count':len(messages),'ackmode':'ack_requeue_false','encoding':'auto','truncate':1000000})
    expected=sorted(json.loads(m['payload'])['eventId'] for m,_e in messages)
    if sorted(json.loads(m['payload'])['eventId'] for m in removed)!=expected:
        raise SystemExit('Queue changed unexpectedly; original messages remain in private backup for manual restore')
    for original,event in messages:
        result=api('exchanges/%2F/cab.events/publish',{'routing_key':event['eventType'],
            'properties':{**original.get('properties',{}),'delivery_mode':2,'content_type':'application/json'},
            'payload':json.dumps(event),'payload_encoding':'string'})
        if not result.get('routed'):raise SystemExit('Event replay failed; restore from private backup before starting consumers')
    print('PASS queued identities:',queue,len(messages),'event IDs preserved')
