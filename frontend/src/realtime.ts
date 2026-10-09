export type RealtimeEvent = "products.changed" | "orders.changed" | "farmers.changed";

export function subscribeRealtime(
  event: RealtimeEvent,
  callback: () => void,
): () => void {
  const listener = (message: Event) => {
    const detail = (message as CustomEvent<{ event: RealtimeEvent }>).detail;
    if (detail?.event === event) callback();
  };
  window.addEventListener("agrigo:realtime", listener);
  return () => window.removeEventListener("agrigo:realtime", listener);
}