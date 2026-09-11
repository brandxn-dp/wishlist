import { useState } from 'react';
import { login, register, useStore } from '../store.js';
import { Group, Row, Segmented, Spinner } from '../ui.jsx';

const REGION_CURRENCY = {
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', IN: 'INR', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  PL: 'PLN', MX: 'MXN', BR: 'BRL', SG: 'SGD', HK: 'HKD', KR: 'KRW', ZA: 'ZAR', CN: 'CNY', IL: 'ILS', TR: 'TRY', AE: 'AED',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', FI: 'EUR', PT: 'EUR', GR: 'EUR',
};

function localeDefaults() {
  let region = 'US';
  try {
    region = new Intl.Locale(navigator.language).maximize().region || 'US';
  } catch {
    /* default */
  }
  return { currency: REGION_CURRENCY[region] || 'USD', units: ['US', 'LR', 'MM'].includes(region) ? 'imperial' : 'metric' };
}

export default function Auth() {
  const status = useStore((s) => s.authStatus);
  const setup = !!status?.needsSetup;
  const [mode, setMode] = useState(setup ? 'register' : 'login');
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isRegister = setup || mode === 'register';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isRegister) await register({ ...form, settings: localeDefaults() });
      else await login(form.username, form.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-inner" onSubmit={submit}>
        <img className="app-icon" src="/icons/icon-192.png" alt="" />
        <h1>Wishlist</h1>
        <p className="lede">{setup ? 'Create the admin account to get started.' : 'Every wishlist, in one place.'}</p>

        {!setup && status?.signupAllowed && (
          <Segmented
            value={mode}
            onChange={(m) => (setMode(m), setError(''))}
            options={[
              { value: 'login', label: 'Sign In' },
              { value: 'register', label: 'Create Account' },
            ]}
          />
        )}

        <Group>
          {isRegister && (
            <Row>
              <input className="row-input left" placeholder="Name" value={form.name} onChange={set('name')} autoComplete="name" />
            </Row>
          )}
          <Row>
            <input
              className="row-input left"
              placeholder="Username"
              value={form.username}
              onChange={set('username')}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </Row>
          <Row>
            <input
              className="row-input left"
              type="password"
              placeholder={isRegister ? 'Password (8+ characters)' : 'Password'}
              value={form.password}
              onChange={set('password')}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
          </Row>
        </Group>

        {error && <p className="error">{error}</p>}
        <button className="btn block" disabled={busy || !form.username || !form.password}>
          {busy ? <Spinner /> : isRegister ? (setup ? 'Get Started' : 'Create Account') : 'Sign In'}
        </button>
        <p className="fine">
          {setup
            ? "This account will be the admin. You can add family and friends later in Settings."
            : !status?.signupAllowed && 'Need an account? Ask whoever runs this server to create one for you.'}
        </p>
      </form>
    </div>
  );
}
