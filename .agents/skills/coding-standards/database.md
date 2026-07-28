# Database and schema

## Stack

Unshelf’s API database stack is PostgreSQL via `node-postgres` and Drizzle.

## Connection ownership

Don’t create new `Pool` connections in repository code unless you have a really good reason.

## Soft-delete column

Use a nullable `timestamp("deleted_at", { withTimezone: true })` column.
