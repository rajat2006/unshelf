import type { CSSProperties } from "react";
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

/**
 * The shared chrome for every control that sits on an Item's row — the Item's own
 * (Status, Target date) and those a list adds to it (add to a Stop). One app, one
 * layout, desktop and phone alike (ADR-0008) — so the rules that make a control
 * usable on a phone live here once, rather than in each control: a 44px touch
 * target, text large enough not to trigger an input zoom, and wrapping rather
 * than overflowing when the viewport is narrow.
 */
export const ITEM_CONTROL_ROW_STYLE: CSSProperties = {
  marginTop: "0.35rem",
};

export const ITEM_CONTROL_LABEL_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.5rem",
};

export const ITEM_CONTROL_STYLE: CSSProperties = {
  fontSize: "1rem",
  minHeight: "44px",
  maxWidth: "100%",
  padding: "0.5rem",
};

/** The quiet register: captions, hints, and the derived past-target note. */
export const ITEM_CONTROL_CAPTION_STYLE: CSSProperties = {
  fontSize: "0.85rem",
};

export const ITEM_CONTROL_ERROR_STYLE: CSSProperties = {
  color: "crimson",
  fontSize: "0.85rem",
};
