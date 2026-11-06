import React from 'react';
import { Box, Typography } from '@mui/material';
import { AdminDashboard } from '@atakanimo/ata-admin-base';
import { useTranslation } from 'react-i18next';
import { useCustomTranslation } from '@/hooks';
import { ProtectedRoutes, routeTitle } from '@/routes/routes';
import { resources } from '@/modules/resources.generated';

/** Başlangıç panosu: kaynak sayısı + menüdeki sayfalara kısayollar. Sayılar / tablolar için bir thunk ekleyip `cards` / `tables`'a verin. */
const Dashboard: React.FC = () => {
  const { customTranslate } = useCustomTranslation();
  const { t } = useTranslation();

  const links = ProtectedRoutes.filter(route => route.path !== '/dashboard').map(route => ({ to: route.path, title: routeTitle(route, t) }));

  return (
    <Box>
      <Typography variant='h4' sx={{ fontWeight: 600, mb: 3 }}>
        {customTranslate('dashboard', 'welcome')}
      </Typography>
      <AdminDashboard cards={[{ id: 'resources', label: customTranslate('dashboard', 'resources'), value: String(resources.length) }]} links={links} />
    </Box>
  );
};

export default Dashboard;
