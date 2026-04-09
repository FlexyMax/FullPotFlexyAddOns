import { NextResponse } from 'next/server';
import { checkDbHealth } from '@/lib/db';

export async function GET() {
  try {
    const dbHealth = await checkDbHealth();
    const uptime = process.uptime();

    return NextResponse.json({
      status: dbHealth.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      app: 'FullPot FlexyAddOns',
      version: '1.0.0',
      db: {
        connected: dbHealth.connected,
        latencyMs: dbHealth.latencyMs,
      },
      uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
      modules: [
        { name: 'scanner', path: '/scanner', status: 'active' },
        { name: 'pos', path: '/pos', status: 'active' },
        { name: 'scan-out', path: '/scan-out', status: 'active' },
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
