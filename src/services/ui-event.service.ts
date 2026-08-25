import {
  UiEventModel,
  type UiEventAction,
  type UiEventElement,
} from "../models/ui-event.model.js";

export async function recordUiEvent(
  sessionId: string,
  element: UiEventElement,
  action: UiEventAction,
) {
  await UiEventModel.updateOne(
    { session_id: sessionId, element, action },
    { $setOnInsert: { session_id: sessionId, element, action } },
    { upsert: true },
  );
}
