import { isNull } from "drizzle-orm";
import { items } from "../schema";

/** Exclude internal tombstones from an ordinary Item query. */
export const activeItem = () => isNull(items.deletedAt);
