import { Status, Type } from "@unshelf/shared";

export const TYPE_LABELS: Record<Type, string> = {
  [Type.Article]: "Article",
  [Type.Video]: "Video",
  [Type.Playlist]: "Playlist",
  [Type.Course]: "Course",
  [Type.Book]: "Book",
  [Type.Other]: "Other",
};

export const STATUS_LABELS: Record<Status, string> = {
  [Status.NotStarted]: "Not started",
  [Status.InProgress]: "In progress",
  [Status.Done]: "Done",
};
