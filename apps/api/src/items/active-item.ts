import { isNull } from "drizzle-orm";
import { items } from "../schema";

/** The persistence rule shared by every ordinary Item interface. */
export const activeItem = () => isNull(items.deletedAt);
