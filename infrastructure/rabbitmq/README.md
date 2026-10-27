# RabbitMQ — CAB System MVP

Exchange: `cab.events` (`topic`, durable).

Queues / bindings:

| Queue | Routing keys |
|---|---|
| `cab.payment.q` | `booking.created`, `trip.completed` |
| `cab.trip.q` | `driver.accepted`, `payment.completed` |
| `cab.driver.q` | `trip.canceled`, `trip.completed` |
| `cab.notification.q` | `offer.created`, `driver.approval.changed`, `trip.status.changed`, `trip.canceled`, `payment.completed` |

Canonical events are documented in `contracts/events/` and `docs/api/asyncapi.yaml`.

Consumer side effects must be idempotent. The topology contains only the four queues and eight routing keys listed above.

## Stable node identity and preserved volumes

For a **new empty volume**, Compose fixes hostname `cab-rabbitmq` and node name
`rabbit@cab-rabbitmq`. `RABBITMQ_NODE_HOSTNAME` can select a different stable
hostname before the first boot. Application connections still use the Compose
service DNS name `rabbitmq`; no business-service configuration or event changes.

For an **existing volume**, retain its active node identity. Inspect first:

```bash
docker inspect cab-rabbitmq --format '{{.Config.Hostname}}'
docker compose exec -T rabbitmq rabbitmqctl -q eval 'node().'
docker compose exec -T rabbitmq rabbitmqctl -q eval 'mnesia:system_info(directory).'
```

The local `docker-compose.override.yml` is gitignored and automatically merged by
normal `docker compose` commands. It pins the inspected hostname and
`RABBITMQ_NODENAME`, preserving the active `/var/lib/rabbitmq/mnesia/rabbit@...`
directory in the unchanged named volume. Keep that local override with the
preserved stack. Do not use the base file alone (`-f docker-compose.yml`) for this
existing volume: that deliberately selects the fresh-install defaults.

`bootstrap.py` refuses startup when other node databases exist but the selected
node has no Mnesia `schema.DAT`, including an accidentally created empty target
directory. It never renames, moves, deletes, resets or automatically selects an
older Mnesia directory. A guard failure requires inspection, not a volume reset.
Old directories may contain historical queues/messages even when the active
node's queues are empty.

## Automatic environment account

RabbitMQ does not create the default user on a blank node when it imports
definitions at boot. Therefore ENV credentials alone with the old topology-only
definitions file were insufficient. See [RabbitMQ access control](https://www.rabbitmq.com/docs/access-control).

At the next approved container creation, the Python bootstrap uses
`RABBITMQ_DEFAULT_USER/PASS` supplied by Compose from `RABBITMQ_USER/PASSWORD`:

1. Read the unchanged canonical `definitions.json` and check the node identity.
2. Add the ENV account, a random-salted RabbitMQ SHA-256 password hash and its
   `/` vhost permissions to a private runtime copy. No plaintext password or hash
   is written into the repository or printed. The four queues and their bindings
   remain identical.
3. Store the generated definitions/config only in `/run/cab-rabbitmq` tmpfs
   (directory 0700, files 0600, owned by `rabbitmq`).
4. Exec the official image entrypoint, retaining privilege drop/PID 1 shutdown
   behavior. Native boot-time import creates or updates the ENV account and
   permissions, without deleting unrelated users or queues.

The inspected `rabbitmq:3-management` image is RabbitMQ 3.13.7 and already includes
Python 3 for its management CLI. No additional package or custom image is needed.
The generated config only changes `management.load_definitions` to the private
runtime copy. The mounted source `rabbitmq.conf` retains its original valid path,
so existing containers can still restart before bootstrap activation. The real
`.env` is not changed. Password changes take effect at an approved broker start,
not by editing the running broker's account automatically.

## Readiness

The proposed healthcheck uses four authenticated, read-only Management API checks
available in RabbitMQ 3.13: no alarms, running virtual hosts, AMQP listener 5672,
and the configured account's `/` configure/write/read permissions. Incorrect
credentials or unavailable dependencies fail health. It does not consume or
publish messages and prints no credentials. Defaults are interval 15s, timeout
10s, start period 40s, six retries.

## Existing Docker networks

All 13 inspected containers are attached to `cab-system_cab-network`. The older
`cab-network` is still attached to PostgreSQL and Redis, so it must not be removed
or disconnected as cleanup. The base configuration explicitly names the intended
network; fresh installs create a normal managed bridge. The local override marks
that already-existing network external, making Compose reference its exact name
without adopting/removing the old network. No live network membership is changed.
See [Docker network names/external networks](https://docs.docker.com/reference/compose-file/networks/).

## Activation boundary and acceptance

**No RabbitMQ recreate, node rename, data migration, account import or network
disconnect was performed while preparing these files.** The existing container
continues using its original entrypoint and healthcheck until an approved
recreate. A definitions snapshot is kept privately in `.backups/`; definitions
do **not** contain queued message bodies and are not a full Mnesia backup.

Before activation, obtain approval for a brief broker interruption, verify the
resolved node/volume again and plan a consistent full data backup. Never rename
the node to the fresh-install default on the preserved volume. Recreate can drop
AMQP connections; verify consumers afterwards and plan dependent-service recovery
in the same approved maintenance window. Do not remove volumes or reset data.

Non-disruptive acceptance commands (the healthcheck is installed after approval):

```bash
docker compose config --quiet
docker compose config --services
python -m unittest discover -s infrastructure/rabbitmq/tests -v
docker compose ps
docker compose exec -T rabbitmq rabbitmq-diagnostics -q check_running
docker compose exec -T rabbitmq rabbitmqctl list_queues name messages consumers
curl http://localhost:8080/api/ready
```

Before activation the new `--healthcheck` path was additionally exercised by
streaming `bootstrap.py` to Python stdin in the existing container, without
installing/changing its entrypoint. Tests cover fresh/same-node/mismatched-node
storage, real password-hash format, repeatable account seeding, unchanged topology,
runtime-only file generation, permissions and failure/redaction paths.
