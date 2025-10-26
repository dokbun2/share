import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  try {
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';

    // Find the local network IP
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      if (!interfaces) continue;

      for (const iface of interfaces) {
        // Skip internal and IPv6 addresses
        if (iface.internal || iface.family !== 'IPv4') continue;

        // Check for private IP ranges
        if (iface.address.startsWith('192.168.') ||
            iface.address.startsWith('10.') ||
            (iface.address.startsWith('172.') &&
             parseInt(iface.address.split('.')[1]) >= 16 &&
             parseInt(iface.address.split('.')[1]) <= 31)) {
          localIP = iface.address;
          break;
        }
      }

      if (localIP !== 'localhost') break;
    }

    return NextResponse.json({ ip: localIP });
  } catch (error) {
    console.error('Error getting network IP:', error);
    return NextResponse.json({ ip: 'localhost' });
  }
}