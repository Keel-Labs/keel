import React, { useState } from 'react';
import { KeelIcon, KeelWordmark } from './KeelIcon';
import { login, register } from '../../lib/api-client';

interface Props {
  onAuthenticated: () => void;
}

export default function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(email, password, name || undefined);
      } else {
        await login(email, password);
      }
      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-input)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-base)',
    borderRadius: 'var(--radius-lg)',
    padding: '10px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'var(--transition-base)',
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
    }}>
      <div style={{
        width: 360,
        padding: 'var(--space-6xl)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-2xl)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 'var(--space-4xl)' }}>
          <KeelIcon size={36} />
          <KeelWordmark height={20} />
        </div>

        <h2 style={{
          textAlign: 'center',
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 4,
        }}>
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p style={{
          textAlign: 'center',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-subtle)',
          marginBottom: 'var(--space-4xl)',
        }}>
          {mode === 'login'
            ? 'Sign in to your Keel account'
            : 'Get started with your AI chief of staff'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
          />

          {error && (
            <div style={{
              fontSize: 13,
              color: '#e55',
              background: 'rgba(238,85,85,0.1)',
              padding: '8px 12px',
              borderRadius: 8,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: 'var(--accent)',
              border: 'none',
              color: 'white',
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              borderRadius: 'var(--radius-lg)',
              padding: '11px 16px',
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'var(--transition-base)',
              marginTop: 4,
              fontFamily: 'inherit',
            }}
          >
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: 16,
          fontSize: 13,
          color: 'rgba(255,255,255,0.4)',
        }}>
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => { setMode('register'); setError(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: 0,
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: 0,
                }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
