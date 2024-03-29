# Updating The Content of The Activity

endpoint: `/api/activities/update`

method: `PATCH`

query parameter: `support` (optional)

## Full Request Body

```json
{
    "activityId": "z8ifrds0uSeWQoWuWJoX",
    "timestamp": 1529650294688,
    "geopoint": {
        "latitude": 28.5482662,
        "longitude": 77.2030614
    },
    "activityName": "string",
    "venue": [{
        "venueDescriptor": "venue name from template",
        "location": "location name",
        "geopoint": {
        "latitude": 28.5482662,
        "longitude": 77.2030185
        },
        "address": "address string"
    }],
    "schedule": [{
        "name": "schedule name from template",
        "startTime": 1531896457042,
        "endTime": 1531896457641
    }]
}
```

## Minimal Request Body

```json
{

    "activityId": "z8ifrds0uSeWQoWuWJoX",
    "timestamp": 1529650294688,
    "geopoint": {
        "latitude": 28.5482662,
        "longitude": 77.2030614
    }
}
```

> Note: A request without any usable fields such as `activityName`, `schedule`, `venue`, or `share` will be rejected by the server. Make sure to include at least one (or any/all) of them.

## Preconditions

* An activity with the `activityId` from the request body must exist.

* You must have edit rights to the activity.

* You must be an assignee of the activity.
