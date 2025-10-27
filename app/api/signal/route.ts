import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for signaling (in production, use Redis or database)
const rooms = new Map<string, {
  offer?: string;
  answer?: string;
  offererConnected: boolean;
  answererConnected: boolean;
  createdAt: number;
}>();

// Clean up old rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > 10 * 60 * 1000) { // 10 minutes
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, code, data } = body;

    console.log(`[Signal API] Action: ${action}, Code: ${code}`);

    switch (action) {
      case 'create-room': {
        // Create a new room with the code, or reset if it already exists
        if (rooms.has(code)) {
          console.log('Room already exists, resetting...');
          // Reset the room for reconnection
          rooms.set(code, {
            offererConnected: true,
            answererConnected: false,
            createdAt: Date.now(),
          });
          return NextResponse.json({ success: true, code, reset: true });
        }

        rooms.set(code, {
          offererConnected: true,
          answererConnected: false,
          createdAt: Date.now(),
        });

        return NextResponse.json({ success: true, code });
      }

      case 'join-room': {
        // Join an existing room
        const room = rooms.get(code);
        if (!room) {
          return NextResponse.json({ error: 'Room not found' }, { status: 404 });
        }

        room.answererConnected = true;
        return NextResponse.json({ success: true, offer: room.offer });
      }

      case 'send-offer': {
        // Store offer in room
        const room = rooms.get(code);
        if (!room) {
          return NextResponse.json({ error: 'Room not found' }, { status: 404 });
        }

        room.offer = data;
        return NextResponse.json({ success: true });
      }

      case 'send-answer': {
        // Store answer in room
        const room = rooms.get(code);
        if (!room) {
          return NextResponse.json({ error: 'Room not found' }, { status: 404 });
        }

        room.answer = data;
        return NextResponse.json({ success: true });
      }

      case 'get-answer': {
        // Get answer from room (for offerer)
        const room = rooms.get(code);
        if (!room) {
          return NextResponse.json({ error: 'Room not found' }, { status: 404 });
        }

        if (room.answer) {
          return NextResponse.json({ success: true, answer: room.answer });
        }

        return NextResponse.json({ success: false, message: 'No answer yet' });
      }

      case 'check-room': {
        // Check if room exists and its status
        const room = rooms.get(code);
        if (!room) {
          return NextResponse.json({ exists: false });
        }

        return NextResponse.json({
          exists: true,
          offererConnected: room.offererConnected,
          answererConnected: room.answererConnected,
          hasOffer: !!room.offer,
          hasAnswer: !!room.answer,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Signal API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const type = searchParams.get('type');

  if (!code) {
    return NextResponse.json({ error: 'Code required' }, { status: 400 });
  }

  const room = rooms.get(code);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (type === 'status') {
    return NextResponse.json({
      offererConnected: room.offererConnected,
      answererConnected: room.answererConnected,
      hasOffer: !!room.offer,
      hasAnswer: !!room.answer,
    });
  }

  return NextResponse.json({ room });
}