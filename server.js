const WebSocket = require("ws");
const http = require("http");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map();

function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;
    do {
        code = "";

        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));

    return code;
}

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

wss.on("connection", ws => {
    let roomCode = null;

    ws.on("message", raw => {
        let msg;

        try {
            msg = JSON.parse(raw.toString());
        } catch {
            return;
        }

        // CREATE ROOM
        if (msg.type === "create") {
            if (roomCode) return;

            roomCode = makeCode();

            rooms.set(roomCode, {
                host: ws,
                guest: null
            });

            send(ws, {
                type: "roomCreated",
                code: roomCode
            });

            return;
        }

        // JOIN ROOM
        if (msg.type === "join") {
            if (roomCode) return;

            const code = String(msg.code || "").toUpperCase();
            const room = rooms.get(code);

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "Room not found."
                });
                return;
            }

            if (room.guest) {
                send(ws, {
                    type: "error",
                    message: "Room is already full."
                });
                return;
            }

            room.guest = ws;
            roomCode = code;

            send(ws, {
                type: "joined",
                code
            });

            send(room.host, {
                type: "playerJoined"
            });

            return;
        }

        // WEBRTC SIGNALING
        if (
            msg.type === "offer" ||
            msg.type === "answer" ||
            msg.type === "candidate"
        ) {
            const room = rooms.get(roomCode);

            if (!room) return;

            const other =
                ws === room.host
                    ? room.guest
                    : room.host;

            if (other) {
                send(other, msg);
            }
        }
    });

    ws.on("close", () => {
        if (!roomCode) return;

        const room = rooms.get(roomCode);

        if (!room) return;

        if (ws === room.host) {
            if (room.guest) {
                send(room.guest, {
                    type: "hostLeft"
                });
            }

            rooms.delete(roomCode);
        } else {
            room.guest = null;

            if (room.host) {
                send(room.host, {
                    type: "playerLeft"
                });
            }
        }
    });
});

server.listen(3000, () => {
    console.log("Signaling server running on port 3000");
});
