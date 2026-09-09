import React from 'react';
import { Nav } from '@douyinfe/semi-ui';
import { IconStar, IconSetting, IconTerminal } from '@douyinfe/semi-icons';
import Logout from '../logout/Logout.jsx';
import Logo from '../logo/Logo.jsx';
import { useLocation, useNavigate } from 'react-router-dom';

import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';
import { useFeature } from '../../hooks/featureHook.js';

export default function Navigation({ isAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const width = useScreenWidth();
  const collapsed = width <= 850;
  const watchlistFeature = useFeature('WATCHLIST_MANAGEMENT') || false;

  const items = [
    { itemKey: '/jobs', text: 'Searches', icon: <IconTerminal /> },
    { itemKey: '/searchProfiles', text: 'Search Profiles' },
    { itemKey: '/listings', text: 'Listings', icon: <IconStar /> },
    { itemKey: '/sources', text: 'Sources' },
  ];

  if (isAdmin) {
    const settingsItems = [
      { itemKey: '/users', text: 'User Management' },
      { itemKey: '/generalSettings', text: 'General Settings' },
    ];
    if (watchlistFeature) {
      settingsItems.push({ itemKey: '/watchlistManagement', text: 'Watchlist Management' });
    }

    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: settingsItems,
    });
  }

  function parsePathName(name) {
    const split = name.split('/').filter((s) => s.length !== 0);
    return '/' + split[0];
  }

  return (
    <Nav
      className="navigate"
      style={{
        height: '100%',
        width: collapsed ? '68px' : '220px',
        minWidth: collapsed ? '68px' : '220px',
        background: 'var(--arpa-surface)',
        borderRight: '1px solid var(--arpa-line)',
      }}
      items={items}
      isCollapsed={collapsed}
      selectedKeys={[parsePathName(location.pathname)]}
      onSelect={(key) => navigate(key.itemKey)}
      header={
        <div className="navigate__brand">
          <Logo compact={collapsed} />
        </div>
      }
      footer={
        <div className="navigate__logoutButton">
          <Logout text={!collapsed} />
        </div>
      }
    />
  );
}
