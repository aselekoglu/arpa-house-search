import React from 'react';
import { Nav } from '@douyinfe/semi-ui';
import { IconStar } from '@douyinfe/semi-icons';
import Logout from '../logout/Logout.jsx';
import Logo from '../logo/Logo.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';

export default function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const width = useScreenWidth();
  const collapsed = width <= 850;

  const items = [
    { itemKey: '/listings', text: 'Listings', icon: <IconStar /> },
    { itemKey: '/searchProfiles', text: 'Search Profiles' },
    { itemKey: '/sources', text: 'Sources' },
  ];

  function parsePathName(name) {
    const split = name.split('/').filter((s) => s.length !== 0);
    return '/' + (split[0] || 'listings');
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
