/** Maps an event type string to a Badge variant. Shared by Overview and Events pages. */
export function eventVariant(
  type: string
): "default" | "success" | "error" | "info" | "warning" {
  if (type === "error") return "error";
  if (type === "task_fired") return "success";
  if (type === "message") return "info";
  return "default";
}
