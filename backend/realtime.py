from fastapi import WebSocket, WebSocketDisconnect


class RealtimeConnections:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def publish(self, event: str) -> None:
        disconnected = []
        for websocket in list(self._connections):
            try:
                await websocket.send_json({"event": event})
            except (RuntimeError, WebSocketDisconnect):
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(websocket)


realtime_connections = RealtimeConnections()