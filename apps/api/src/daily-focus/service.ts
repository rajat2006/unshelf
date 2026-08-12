import type {
  AddDailyFocusItemRequest,
  DailyFocusId,
  ItemId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import * as dailyFocusRepository from "./repository";

export const addTodayItem = ({
  db,
  userId,
  itemId,
  origin,
}: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
  origin: AddDailyFocusItemRequest["origin"];
}) => dailyFocusRepository.addTodayItem({ db, userId, itemId, origin });

export const getTodayFocus = ({
  db,
  userId,
}: {
  db: Database;
  userId: UserId;
}) => dailyFocusRepository.getTodayFocus(db, userId);

export const getHistoricalFocus = ({
  db,
  userId,
  date,
}: {
  db: Database;
  userId: UserId;
  date: string;
}) => dailyFocusRepository.getHistoricalFocus({ db, userId, date });

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
