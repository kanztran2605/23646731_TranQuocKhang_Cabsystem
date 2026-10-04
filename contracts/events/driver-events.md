# Driver Events Contract

Producer: `driver-service`
Exchange: `cab.events`

## `driver.approval.changed`

Consumer: `notification-service`

Payload:

```json
{
  "recipientUserIds": ["14"],
  "driverId": "5",
  "userId": "5",
  "approvalStatus": "APPROVED",
  "changedAt": "2026-10-04T01:05:00.000Z"
}
```

`approvalStatus` is `APPROVED` or `REJECTED`.
