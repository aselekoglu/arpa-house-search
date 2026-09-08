import React from 'react';

import Logo from '../../components/logo/Logo';
import { xhrPost } from '../../services/xhr';
import { useNavigate } from 'react-router-dom';
import { useActions, useSelector } from '../../services/state/store';
import { Input, Button, Banner, Toast } from '@douyinfe/semi-ui';

import './login.less';
import { IconUser, IconLock } from '@douyinfe/semi-icons';

export default function Login() {
  const actions = useActions();
  const [username, setUserName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const demoMode = useSelector((state) => state.demoMode.demoMode || false);
  const navigate = useNavigate();

  React.useEffect(() => {
    actions.demoMode.getDemoMode();
  }, []);

  const tryLogin = async () => {
    if (!username?.trim() || !password) {
      setError('Username and password are mandatory.');
      return;
    }
    setError(null);

    try {
      await xhrPost('/api/login', { username: username.trim(), password });
    } catch {
      Toast.error('Login unsuccessful…');
      return;
    }

    Toast.success('Login successful!');
    await actions.user.getCurrentUser();
    navigate('/jobs');
  };

  return (
    <main className="login">
      <section className="login__intro">
        <Logo />
        <p className="login__eyebrow">OTTAWA · RENTAL DISCOVERY</p>
        <h1>Find the home worth opening first.</h1>
        <p className="login__lede">
          One search surface for rental sources, filters, freshness, and the decisions that matter after the listing
          appears.
        </p>
      </section>

      <form className="login__form" onSubmit={(event) => event.preventDefault()}>
        <div className="login__formLabel">SIGN IN</div>
        {error && <Banner type="danger" closeIcon={null} description={error} />}
        <Input
          size="large"
          prefix={<IconUser />}
          placeholder="Username"
          value={username}
          showClear
          autoFocus
          onChange={(value) => setUserName(value)}
          onKeyPress={async (event) => event.key === 'Enter' && (await tryLogin())}
        />
        <Input
          size="large"
          mode="password"
          prefix={<IconLock />}
          value={password}
          placeholder="Password"
          onChange={(value) => setPassword(value)}
          onKeyPress={async (event) => event.key === 'Enter' && (await tryLogin())}
        />
        <Button type="primary" onClick={tryLogin} theme="solid" size="large">
          Login
        </Button>
        {demoMode && (
          <Banner
            fullMode={true}
            type="info"
            bordered
            closeIcon={null}
            description="Demo mode is enabled. Use 'demo' as both username and password."
          />
        )}
      </form>
    </main>
  );
}

Login.displayName = 'Login';
