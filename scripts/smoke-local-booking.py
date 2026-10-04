"""Real Booking smoke: business requests go only through localhost:8080.

Creates two disposable Drivers and two Bookings. Keeps event source records so
queued Payment/Trip events remain valid for later milestones. The unassigned
Driver is returned OFFLINE. Only this run's temporary RabbitMQ observer queue
is removed; canonical queues/messages are never consumed by the smoke.
"""
import base64
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

run = uuid.uuid4().hex[:12]
correlation = 'booking-smoke-' + run
checks = 0
throttles = 0
created = []
bookings = []
configuration = json.loads(subprocess.check_output(['docker', 'compose', 'config', '--format', 'json']))
environment = configuration['services']['booking-service']['environment']
management_port = configuration['services']['rabbitmq']['ports'][0]['published']
authorization = 'Basic ' + base64.b64encode((environment['RABBITMQ_USER'] + ':' + environment['RABBITMQ_PASSWORD']).encode()).decode()
queue = 'cab.booking.smoke.' + run
queue_path = '/queues/%2F/' + queue
events = []


def broker(method, path, body=None):
    request = urllib.request.Request('http://localhost:' + str(management_port) + '/api' + path,
        data=None if body is None else json.dumps(body).encode(), method=method,
        headers={'Authorization': authorization, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=5) as response:
        content = response.read()
        return json.loads(content) if content else None


def api(method, path, body=None, token=None, expected=200):
    global throttles
    headers = {'Content-Type': 'application/json', 'X-Correlation-ID': correlation}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    for attempt in range(3):
        request = urllib.request.Request('http://localhost:8080' + path,
            data=None if body is None else json.dumps(body).encode(), method=method, headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=8)
        except urllib.error.HTTPError as error:
            response = error
        result = json.loads(response.read())
        if response.code == 429 and attempt < 2:
            throttles += 1
            pause = int(response.headers.get('Retry-After', '10'))
            assert 1 <= pause <= 10
            time.sleep(pause + 0.1)
            continue
        assert response.code == expected, path + ': expected ' + str(expected) + ', received ' + str(response.code)
        return result
    raise AssertionError('Rate limit did not reset')


def rows(database, query):
    output = subprocess.check_output(['docker', 'exec', 'cab-postgres', 'psql', '-X', '-U', 'cab_user',
        '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], text=True)
    return json.loads(output)


def passed(label):
    global checks
    checks += 1
    print('PASS ' + label, flush=True)


def login(email, role):
    result = api('POST', '/api/v1/login', {'email': email, 'pw': '123'})
    assert result['role'] == role
    return result['token']


def drain_observer():
    # This queue contains copies, never the canonical consumer messages.
    messages = broker('POST', queue_path + '/get', {'count': 100, 'ackmode': 'ack_requeue_false', 'encoding': 'auto', 'truncate': 10000})
    for message in messages:
        event = json.loads(message['payload'])
        assert message['routing_key'] == event['eventType']
        assert message['properties']['correlation_id'] == correlation
        assert set(event) == {'eventId', 'eventType', 'occurredAt', 'payload'}
        uuid.UUID(event['eventId'])
        events.append(event)


broker('PUT', queue_path, {'durable': False, 'auto_delete': False, 'arguments': {}})
try:
    for key in ['booking.created', 'offer.created', 'driver.accepted']:
        broker('POST', '/bindings/%2F/e/cab.events/q/' + queue, {'routing_key': key, 'arguments': {}})
    assert api('GET', '/health')['s'] == 'UP'
    started = time.monotonic()
    services = api('GET', '/health/services')['services']
    assert len(services) == 8 and time.monotonic() - started < 5
    assert next(item['s'] for item in services if item['name'] == 'booking-service') == 'UP'
    ready = all(item['s'] == 'UP' for item in services)
    assert api('GET', '/ready', expected=200 if ready else 503)['s'] == ('UP' if ready else 'DOWN')
    passed('Booking gRPC UP, Gateway healthy, unfinished downstream readiness truthful')
    customer = login('c@c.com', 'CUSTOMER')
    admin = login('a@a.com', 'ADMIN')
    other_driver = login('d@d.com', 'DRIVER')
    passed('canonical Customer/Admin/Driver logins')
    for index in range(2):
        email = 'bs-' + run + '-' + str(index) + '@d.com'
        result = api('POST', '/api/v1/drivers/register', {'email': email, 'pw': '123', 'otp': '123',
            'name': 'Booking Smoke ' + run, 'vt': 'CAR', 'plate': 'BS' + run + str(index)}, expected=201)
        assert result['ap'] == 'PENDING_APPROVAL'
        created.append(result)
        approved = api('PATCH', '/api/v1/drivers/' + str(result['did']) + '/approval', {'ap': 'APPROVED'}, admin)
        assert approved['ap'] == 'APPROVED'
        token = login(email, 'DRIVER')
        result['token'] = token
        api('PUT', '/api/v1/drivers/me/location', {'lat': index * 0.003, 'lng': 0}, token)
        assert api('PATCH', '/api/v1/drivers/me/availability', {'on': True}, token)['av'] == 'AVAILABLE'
    passed('two disposable APPROVED/AVAILABLE CAR Drivers in the 1 km radius')
    # Existing seeded records are elsewhere; nearest temporary Driver is at pickup.
    result = api('POST', '/api/v1/bookings', {'p': {'lat': 0, 'lng': 0}, 'd': {'lat': 0.01, 'lng': 0.01}, 'vt': 'CAR'}, customer, expected=201)
    bookings.append(result['bid'])
    assert result['s'] == 'SEARCHING' and result['did'] == created[0]['did'] and result['oid']
    bid, oid = result['bid'], result['oid']
    persisted = rows('booking_db', 'SELECT row_to_json(b) FROM booking b WHERE bid=' + str(bid))
    offers = rows('booking_db', "SELECT json_agg(o) FROM driver_offer o WHERE bid=" + str(bid))
    assert persisted['s'] == 'SEARCHING' and persisted['vt'] == 'CAR' and len(offers) == 1
    passed('Booking persisted, nearest eligible Driver selected, exactly one Offer')
    drain_observer()
    assert [event['eventType'] for event in events] == ['booking.created', 'offer.created']
    assert events[0]['payload']['bookingId'] == str(bid) and events[0]['payload']['customerId'] == str(result['cid'])
    assert events[1]['payload']['offerId'] == str(oid) and events[1]['payload']['driverId'] == str(created[0]['did'])
    passed('confirmed booking.created then offer.created with canonical envelope/payload')
    owned = api('GET', '/api/v1/drivers/me/offers', token=created[0]['token'])
    assert len([offer for offer in owned if offer['oid'] == oid]) == 1
    api('POST', '/api/v1/offers/' + str(oid) + '/accept', token=other_driver, expected=403)
    passed('Driver retrieves own Offer; another Driver receives 403')
    accepted = api('POST', '/api/v1/offers/' + str(oid) + '/accept', token=created[0]['token'])
    assert accepted == {'oid': oid, 'bid': bid, 's': 'ACCEPTED', 'tripPending': True}
    driver = api('GET', '/api/v1/drivers/' + str(created[0]['did']), token=admin)
    assert driver['av'] == 'BUSY'
    assignments = rows('booking_db', 'SELECT json_agg(a) FROM driver_assignment a WHERE bid=' + str(bid))
    assert len(assignments) == 1 and assignments[0]['did'] == created[0]['did']
    assert api('GET', '/api/v1/bookings/' + str(bid), token=customer)['s'] == 'ASSIGNED'
    passed('acceptance makes Driver BUSY and persists exactly one Assignment/ASSIGNED Booking')
    replay = api('POST', '/api/v1/offers/' + str(oid) + '/accept', token=created[0]['token'])
    assert replay == accepted
    drain_observer()
    assert [event['eventType'] for event in events] == ['booking.created', 'offer.created', 'driver.accepted']
    assert set(events[2]['payload']) == {'bookingId', 'customerId', 'driverId', 'vehicleId', 'acceptedAt', 'customerUserId', 'driverUserId'}
    assert events[2]['payload']['vehicleId'] == str(assignments[0]['vid'])
    assert events[2]['payload']['bookingId'] == str(bid)
    assert len(rows('booking_db', 'SELECT json_agg(a) FROM driver_assignment a WHERE bid=' + str(bid))) == 1
    passed('driver.accepted observed once; repeated accept does not reserve/persist/publish again')
    no_driver = api('POST', '/api/v1/bookings', {'p': {'lat': -80, 'lng': -100}, 'd': {'lat': -80.01, 'lng': -100.01}, 'vt': 'CAR'}, customer, expected=201)
    bookings.append(no_driver['bid'])
    assert no_driver['s'] == 'NO_DRIVER_FOUND' and no_driver['oid'] is None
    counts = rows('booking_db', 'SELECT json_build_array((SELECT count(*) FROM driver_offer WHERE bid=' + str(no_driver['bid']) + '),(SELECT count(*) FROM driver_assignment WHERE bid=' + str(no_driver['bid']) + '))')
    assert counts == [0, 0]
    drain_observer()
    assert [event['eventType'] for event in events] == ['booking.created', 'offer.created', 'driver.accepted', 'booking.created']
    passed('real NO_DRIVER_FOUND persists with no Offer/Assignment or extra event')
    history = api('GET', '/api/v1/customers/me/bookings?page=1&limit=2', token=customer)
    assert len(history['items']) == 2 and all(item['cid'] == result['cid'] for item in history['items'])
    passed('owned Booking history with page/limit')
    # Only unused disposable Driver can return OFFLINE through the real invariant.
    assert api('PATCH', '/api/v1/drivers/me/availability', {'on': False}, created[1]['token'])['av'] == 'OFFLINE'
    bindings = broker('GET', '/bindings/%2F')
    assert any(b['source'] == 'cab.events' and b['destination'] == 'cab.payment.q' and b['routing_key'] == 'booking.created' for b in bindings)
    assert any(b['source'] == 'cab.events' and b['destination'] == 'cab.trip.q' and b['routing_key'] == 'driver.accepted' for b in bindings)
    passed('canonical Payment/Trip queue bindings retained; Payment remains decoupled')
    print('PASS smoke:', checks, 'checks; rate-limit responses honored:', throttles, flush=True)
    print('Retained event-source Booking IDs:', bookings, 'disposable Driver IDs:', [item['did'] for item in created], flush=True)
finally:
    broker('DELETE', queue_path)
