# Data8 Dataverse Client

This directory contains a source copy of Data8's MIT-licensed Dataverse client.

- Upstream: https://github.com/Data8/DataverseClient
- Commit: `8dc10836d1c9ae8b4f203421234b5d3b8a8c75d7`
- Local change: federated username endpoint discovery considers all matching
  WS-Trust 1.3 policy/binding/port combinations and requires an HTTPS issuer,
  preferring the ADFS `usernamemixed` endpoint.
- Local change: use the organization-service address published by Dynamics when
  it differs from the requested address only by URI casing. This keeps the ADFS
  relying-party `AppliesTo` value aligned with the service metadata.

See `LICENSE` for the upstream license.
