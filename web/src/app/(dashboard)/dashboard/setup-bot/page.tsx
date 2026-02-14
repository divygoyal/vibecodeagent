"use client"
import { useState } from 'react'

export default function SetupBot() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('')

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setStatus('Configuring...')
    
    const res = await fetch('/api/setup-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })

    if (res.ok) {
      setStatus('Success! Bot connected.')
    } else {
      setStatus('Error connecting bot.')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">
        <h1 className="text-4xl font-bold mb-8">Connect Your Telegram Bot</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Paste your Bot Token here"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="p-2 border rounded text-black"
          />
          <button type="submit" className="p-2 bg-blue-500 text-white rounded">
            Connect
          </button>
        </form>
        {status && <p className="mt-4">{status}</p>}
      </main>
    </div>
  )
}
