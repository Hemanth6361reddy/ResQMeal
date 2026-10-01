from typing import Dict, Set
from fastapi import WebSocket
import json


class ConnectionManager:
    """
    Manages active WebSocket connections grouped into rooms.
    For example: room 'delivery_123' contains the Driver, the Donor, and the NGO.
    """
    def __init__(self):
        # Maps room_id -> set of active WebSocket clients
        self.rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
        self.rooms[room_id].add(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].discard(websocket)
            if len(self.rooms[room_id]) == 0:
                del self.rooms[room_id]

    async def broadcast(self, room_id: str, message: dict):
        """Broadcasts a JSON message to all clients listening in that room."""
        if room_id in self.rooms:
            dead_sockets = set()
            for connection in self.rooms[room_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception:
                    dead_sockets.add(connection)
            
            # Clean up disconnected sockets
            for dead in dead_sockets:
                self.rooms[room_id].discard(dead)


# Global singleton connection manager
ws_manager = ConnectionManager()