import React, { useEffect } from 'react';

import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import GeneralSettings from './views/generalSettings/GeneralSettings';
import JobMutation from './views/jobs/mutation/JobMutation';
import UserMutator from './views/user/mutation/UserMutator';
import JobInsight from './views/jobs/insights/JobInsight.jsx';
import { useActions, useSelector } from './services/state/store';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './views/login/Login';
import Users from './views/user/Users';
import Jobs from './views/jobs/Jobs';

import './App.less';
import { Banner, Divider, Layout } from '@douyinfe/semi-ui';
import Listings from './views/listings/Listings.jsx';
import Navigation from './components/navigation/Navigation.jsx';
import ArpaFooter from './components/footer/ArpaFooter.jsx';
import ProcessingTimes from './views/jobs/ProcessingTimes.jsx';
import WatchlistManagement from './views/listings/management/WatchlistManagement.jsx';

export default function ArpaHouseSearchApp() {
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);
  const currentUser = useSelector((state) => state.user.currentUser);
  const settings = useSelector((state) => state.generalSettings.settings);
  const processingTimes = useSelector((state) => state.jobs.processingTimes);

  useEffect(() => {
    async function init() {
      await actions.user.getCurrentUser();
      if (!needsLogin()) {
        await actions.features.getFeatures();
        await actions.provider.getProvider();
        await actions.jobs.getJobs();
        await actions.jobs.getProcessingTimes();
        await actions.jobs.getSharableUserList();
        await actions.notificationAdapter.getAdapter();
        await actions.generalSettings.getGeneralSettings();
      }
      setLoading(false);
    }

    init();
  }, [currentUser?.userId]);

  const needsLogin = () => currentUser == null || Object.keys(currentUser).length === 0;
  const isAdmin = () => currentUser != null && currentUser.isAdmin;
  const { Footer, Sider, Content } = Layout;

  return loading ? null : needsLogin() ? (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  ) : (
    <Layout className="app">
      <Layout className="app">
        <Sider>
          <Navigation isAdmin={isAdmin()} />
        </Sider>
        <Content>
          {settings.demoMode && (
            <>
              <Banner
                fullMode={true}
                type="info"
                bordered
                closeIcon={null}
                description="You're viewing ARPA House Search in demo mode. Search jobs do not crawl live websites and demo changes are reset at midnight."
              />
              <br />
            </>
          )}
          {processingTimes != null && <ProcessingTimes processingTimes={processingTimes} />}
          <Divider />
          <div className="app__content">
            <Routes>
              <Route path="/403" element={<InsufficientPermission />} />
              <Route path="/jobs/new" element={<JobMutation />} />
              <Route path="/jobs/edit/:jobId" element={<JobMutation />} />
              <Route path="/jobs/insights/:jobId" element={<JobInsight />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/listings" element={<Listings />} />
              <Route path="/watchlistManagement" element={<WatchlistManagement />} />
              <Route
                path="/users/new"
                element={
                  <PermissionAwareRoute currentUser={currentUser}>
                    <UserMutator />
                  </PermissionAwareRoute>
                }
              />
              <Route
                path="/users/edit/:userId"
                element={
                  <PermissionAwareRoute currentUser={currentUser}>
                    <UserMutator />
                  </PermissionAwareRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <PermissionAwareRoute currentUser={currentUser}>
                    <Users />
                  </PermissionAwareRoute>
                }
              />
              <Route
                path="/generalSettings"
                element={
                  <PermissionAwareRoute currentUser={currentUser}>
                    <GeneralSettings />
                  </PermissionAwareRoute>
                }
              />
              <Route path="/" element={<Navigate to="/jobs" replace />} />
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
