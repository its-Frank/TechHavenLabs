'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error } = isSignUp
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password })

      if (error) {
        setError(error.message ?? 'Something went wrong')
        setLoading(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm p-6 bg-slate-900 rounded-lg shadow-lg border border-slate-700">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isSignUp
              ? 'Sign up to get started'
              : 'Sign in to your account to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className="text-sm font-medium text-slate-200">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Your name"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-200">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="your@email.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-200">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium rounded transition-colors"
          >
            {loading
              ? 'Please wait...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-slate-400 text-center mt-6">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <Link
            href={isSignUp ? '/sign-in' : '/sign-up'}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </Link>
        </p>
      </div>
    </main>
  )
}
