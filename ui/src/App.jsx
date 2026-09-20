import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Divider, Layout } from '@douyinfe/semi-ui';
import { useActions, useSelector } from './services/state/store';
import Login from './views/login/Login';
import CustomSources from './views/sources/CustomSources.jsx';
import SearchProfiles from './views/searchProfiles/SearchProfiles.jsx';
import Listings from './views/listings/Listings.jsx';
import Navigation from './components/navigation/Navigation.jsx';
import ArpaFooter from './components/footer/ArpaFooter.jsx';
import './App.less';

export default function ArpaHouseSearchApp() {
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);
  const currentUser = useSelector((state) => state.user.currentUser);
  const { Footer, Sider, Content } = Layout;

  useEffect(() => {
    let active = true;
    actions.user
      .getCurrentUser()
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const needsLogin = () => currentUser == null || Object.keys(currentUser).length === 0;

  if (loading) return null;

  if (needsLogin()) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout className="app">
      <Layout className="app">
        <Sider>
          <Navigation />
        </Sider>
        <Content>
          <Divider />
          <div className="app__content">
            <Routes>
              <Route path="/listings" element={<Listings />} />
              <Route path="/sources" element={<CustomSources />} />
              <Route path="/searchProfiles" element={<SearchProfiles />} />
              <Route path="/" element={<Navigate to="/listings" replace />} />
              <Route path="*" element={<Navigate to="/listings" replace />} />
            </Routes>
          </div>
        </Content>
      </Layout>
      <Footer>
        <ArpaFooter />
      </Footer>
    </Layout>
  );
}

ArpaHouseSearchApp.displayName = 'ArpaHouseSearchApp';
