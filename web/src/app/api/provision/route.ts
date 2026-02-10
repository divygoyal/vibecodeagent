import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { githubId, telegramToken } = await req.json();

    if (!githubId) {
      return NextResponse.json({ error: 'GitHub ID is required' }, { status: 400 });
    }

    // Call our provisioning script
    const scriptPath = path.resolve(process.cwd(), '../scripts/provision_user.py');
    const command = `python3 ${scriptPath} ${githubId} ${telegramToken || ''}`;

    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return resolve(NextResponse.json({ error: 'Provisioning failed' }, { status: 500 }));
        }
        const result = JSON.parse(stdout);
        resolve(NextResponse.json(result));
      });
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
