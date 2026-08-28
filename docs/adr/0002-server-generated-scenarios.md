# ADR 0002: Keep anonymous scenarios server-generated

Status: accepted

Anonymous visitors can run only named, bounded scenarios. They cannot submit arbitrary payloads, destinations, or callback URLs. The genuine event producer endpoint remains available behind AWS IAM authorization for signed integration tests and CLI demonstrations.

This keeps the public demo inexpensive and prevents it from becoming an open webhook relay. The first release models receiver outcomes locally inside the delivery adapter. A signed built-in HTTP receiver is a later milestone and will not accept visitor-controlled destinations.
