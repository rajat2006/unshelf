# Database and schema

## Stack

Unshelf’s API database stack is PostgreSQL via `node-postgres` and Drizzle.

## Connection ownership

Don’t create new `Pool` connections in repository code unless you have a really good reason.

## Database triggers

Do not create PostgreSQL triggers. If a trigger appears absolutely necessary,
stop and obtain the User's explicit approval for the specific invariant and its
migration consequences before introducing it.

## Soft-delete column

Use a nullable `timestamp("deleted_at", { withTimezone: true })` column.
