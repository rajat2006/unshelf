import type { DailyFocusId, ItemId, UserId } from "@unshelf/shared";
import type { Database } from "../db";
import * as dailyFocusRepository from "./repository";

export const addTodayItem = ({
  db,
  userId,
  itemId,
}: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
}) => dailyFocusRepository.addTodayItem({ db, userId, itemId });

export const getTodayFocus = ({
  db,
  userId,
}: {
  db: Database;
  userId: UserId;
}) => dailyFocusRepository.getTodayFocus(db, userId);

export const removeTodayItem = ({
  db,
  userId,
  dailyFocusId,
  itemId,
}: {
  db: Database;
  userId: UserId;
  dailyFocusId: DailyFocusId;
  itemId: ItemId;
}) =>
  dailyFocusRepository.removeTodayItem({
    db,
    userId,
    dailyFocusId,
    itemId,
  });
