import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

export async function POST(req: Request) {
  try {
    const { githubId, telegramToken } = await req.json();

    if (!githubId) {
      return NextResponse.json({ error: 'GitHub ID is required' }, { status: 400 });
    }

    // Use absolute path for reliability in production
    const scriptPath = "/home/ubuntu/.openclaw/workspace/vibecodeagent_analysis/scripts/provision_user.py";
    const command = `python3 "${scriptPath}" "${githubId}" "${telegramToken || ''}"`;

    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stdout) {
         console.error(`Provision stderr: ${stderr}`);
         return NextResponse.json({ error: 'Provisioning script error', details: stderr }, { status: 500 });
    }

    const result = JSON.parse(stdout);
    return NextResponse.json(result);

  } catch (err: any) {
    console.error('Provisioning error:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
