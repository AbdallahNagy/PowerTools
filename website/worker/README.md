# Website worker

`index.ts` serves the static Astro build from `dist/` and handles one API route.

## `POST /api/heartbeat`

The desktop app sends at most one heartbeat per UTC day, unless the user turns off
**Help > Send Anonymous Usage Stats**. The body looks like this:

```json
{ "installId": "<random UUID v4>", "version": "1.0.1", "platform": "win32", "arch": "x64" }
```

The install ID is generated on first launch and is not derived from the machine,
user, or Dataverse organization. The worker validates the body against fixed
patterns, drops anything else, and does not store the request IP.

Each heartbeat is written to the `power_tools_usage` Workers Analytics Engine
dataset:

| Column    | Value        |
| --------- | ------------ |
| `index1`  | install ID   |
| `blob1`   | app version  |
| `blob2`   | platform     |
| `blob3`   | architecture |
| `double1` | always 1     |

## Reading the numbers

Query the dataset with the
[Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/).
You need an API token with **Account Analytics: Read**.

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/analytics_engine/sql" \
  --header "Authorization: Bearer $API_TOKEN" \
  --data "SELECT toStartOfDay(timestamp) AS day, count(DISTINCT index1) AS active_users FROM power_tools_usage WHERE timestamp > NOW() - INTERVAL '30' DAY GROUP BY day ORDER BY day"
```

Other useful queries:

```sql
-- Monthly active installs
SELECT count(DISTINCT index1) AS monthly_active
FROM power_tools_usage
WHERE timestamp > NOW() - INTERVAL '30' DAY

-- Active installs by app version over the last week
SELECT blob1 AS version, count(DISTINCT index1) AS installs
FROM power_tools_usage
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY version
ORDER BY installs DESC
```

Analytics Engine keeps data for three months.
