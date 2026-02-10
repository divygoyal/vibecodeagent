'use client';

import { useState } from 'react';

export default function Onboarding() {
  const [githubId, setGithubId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleConnect = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubId, telegramToken: botToken }),
      });
      if (!res.ok) throw new Error('Failed to provision');
      setStatus('success');
    } catch (err) {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-4">VibeCode Agent 🦾</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        Connect your GitHub and Telegram bot to enter God Mode.
      </p>

      <div className="w-full max-w-md space-y-4">
        <input
          type="text"
          placeholder="GitHub Username"
          className="w-full bg-zinc-900 border border-zinc-800 rounded p-3 focus:outline-none focus:border-blue-500"
          value={githubId}
          onChange={(e) => setGithubId(e.target.value)}
        />
        <input
          type="password"
          placeholder="Telegram Bot Token"
          className="w-full bg-zinc-900 border border-zinc-800 rounded p-3 focus:outline-none focus:border-blue-500"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
        />
        <button
          onClick={handleConnect}
          disabled={status === 'loading'}
          className="w-full bg-blue-600 hover:bg-blue-500 font-bold p-3 rounded transition-colors disabled:opacity-50"
        >
          {status === 'loading' ? 'Provisioning...' : 'Enter God Mode'}
        </button>

        {status === 'success' && (
          <p className="text-green-500 text-center mt-4">
            Successfully provisioned! Go to your Telegram bot and send a message.
          </p>
        )}
        {status === 'error' && (
          <p className="text-red-500 text-center mt-4">
            Something went wrong. Please check your token and try again.
          </p>
        )}
      </div>
    </div>
  );
}
