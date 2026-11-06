import type { tr } from './tr';

export const en: typeof tr = {
  common: {
    name: '__App__',
    dashboard: 'Dashboard',
    login: 'Sign in',
    logout: 'Sign out',
    error: 'Error',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    view: 'View',
    search: 'Search',
    refresh: 'Refresh'
  },
  admin: {},
  layout: {
    envProduction: 'Production',
    envTest: 'Test'
  },
  auth: {
    adminOnly: 'Only admin users can sign in to this panel.'
  },
  dashboard: {
    welcome: 'Welcome to the Dashboard',
    resources: 'Resources'
  }
};

export default en;
