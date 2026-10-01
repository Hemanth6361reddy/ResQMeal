from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.websocket.manager import ws_manager
import json

router = APIRouter()


@router.websocket("/delivery/{delivery_id}")
async def delivery_websocket_endpoint(websocket: WebSocket, delivery_id: str):
    """
    WebSocket channel for live delivery tracking:
    - Drivers broadcast: {"type": "LOCATION_UPDATE", "lat": 12.97, "lng": 77.59}
    - Server broadcasts to all viewers: Donors, NGOs, and Admins.
    """
    room_id = f"delivery_{delivery_id}"
    await ws_manager.connect(websocket, room_id)

    # Announce connection
    await ws_manager.broadcast(room_id, {
        "type": "USER_CONNECTED",
        "message": "Viewer joined the tracking room",
        "delivery_id": delivery_id
    })

    try:
        while True:
            # Listen for incoming messages from the driver or clients
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
                # Broadcast the event (e.g. driver GPS coordinates or status change)
                await ws_manager.broadcast(room_id, data)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, room_id)
        await ws_manager.broadcast(room_id, {
            "type": "USER_DISCONNECTED",
            "message": "A client left the tracking room",
            "delivery_id": delivery_id
        })