/**
 * Shared auth layer (docs/backend/auth.md): one definition for the three BE stacks, the bootstrap dialog and the
 * client data layer. The core (login, refresh, logout, me, change-password, `Users` model, first admin) is always
 * there; the optional modules are picked in the "Yeni … projesi" dialog and stored in `workspace.auth.modules`.
 *
 * Roles are only `admin` and `user` (`Users.role`); nothing is read from env.
 */
import type { NormalizedField, NormalizedModel } from './normalizedModel.js';

export type AuthModule = 'register' | 'password-reset' | 'google' | 'apple' | 'account-delete';

export const AUTH_MODULES: readonly AuthModule[] = ['register', 'password-reset', 'google', 'apple', 'account-delete'];

export type AuthRole = 'admin' | 'user';
export const AUTH_ROLES: readonly AuthRole[] = ['admin', 'user'];

export interface AuthEndpoint {
  method: 'GET' | 'POST' | 'DELETE';
  /** Path under `<prefix>/auth`. */
  path: string;
  /** Needs `Authorization: Bearer`. */
  auth: boolean;
  /** Client service function name. */
  fn: string;
}

/**
 * Endpoints of the core (`module` absent) and of the optional modules (an array: present when any of them is on).
 * Every optional endpoint is for `user` accounts only (see `AUTH_ADMIN_RULE`).
 */
export const AUTH_ENDPOINTS: ReadonlyArray<AuthEndpoint & { module?: AuthModule | readonly AuthModule[] }> = [
  { method: 'POST', path: '/login', auth: false, fn: 'login' },
  { method: 'POST', path: '/refresh', auth: false, fn: 'refresh' },
  { method: 'POST', path: '/logout', auth: false, fn: 'logout' },
  { method: 'GET', path: '/me', auth: true, fn: 'me' },
  { method: 'POST', path: '/change-password', auth: true, fn: 'changePassword' },
  { method: 'POST', path: '/register', auth: false, fn: 'register', module: 'register' },
  { method: 'POST', path: '/verify-email', auth: false, fn: 'verifyEmail', module: 'register' },
  { method: 'POST', path: '/send-otp', auth: false, fn: 'sendOtp', module: 'register' },
  { method: 'POST', path: '/forgot-password', auth: false, fn: 'forgotPassword', module: 'password-reset' },
  { method: 'POST', path: '/reset-password', auth: false, fn: 'resetPassword', module: 'password-reset' },
  { method: 'POST', path: '/google', auth: false, fn: 'loginWithGoogle', module: 'google' },
  { method: 'POST', path: '/apple', auth: false, fn: 'loginWithApple', module: 'apple' },
  // A Google / Apple account has no password: it can create one (then e-mail + password login works too).
  { method: 'POST', path: '/set-password', auth: true, fn: 'setPassword', module: ['google', 'apple'] },
  { method: 'DELETE', path: '/account', auth: true, fn: 'deleteAccount', module: 'account-delete' }
];

export interface AuthModuleInfo {
  module: AuthModule;
  label: string;
  description: string;
  /** Env keys the module reads (added to `.env.example`). */
  env: string[];
}

export const AUTH_MODULE_INFO: Record<AuthModule, AuthModuleInfo> = {
  register: {
    module: 'register',
    label: 'Kayıt + e-posta doğrulama',
    description: 'register, verify-email, send-otp (6 haneli kod, e-postayla)',
    env: []
  },
  'password-reset': {
    module: 'password-reset',
    label: 'Şifremi unuttum',
    description: 'forgot-password, reset-password (e-postayla kod)',
    env: []
  },
  google: {
    module: 'google',
    label: 'Google ile giriş',
    description: 'POST /google { idToken } (+ şifre oluşturma: set-password)',
    env: ['GOOGLE_CLIENT_IDS']
  },
  apple: {
    module: 'apple',
    label: 'Apple ile giriş',
    description: 'POST /apple { identityToken, authorizationCode? } (+ şifre oluşturma: set-password; hesap silinince Apple token iptali)',
    // Team / key / .p8: Apple token'ı hesap silinince iptal etmek için (boşsa iptal atlanır).
    env: ['APPLE_CLIENT_IDS', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']
  },
  'account-delete': {
    module: 'account-delete',
    label: 'Hesap silme',
    description: 'DELETE /account (kullanıcı kendi hesabını siler; temizlik hook\'ta)',
    env: []
  }
};

/**
 * Admin accounts sign in with e-mail + password only (docs/backend/auth.md "Admin ve kullanıcı"): every optional module
 * is for `user` accounts. The BE stacks enforce it; the bootstrap dialog shows this text under "Admin paneli de kur".
 */
export const AUTH_ADMIN_RULE =
  'Admin hesapları yalnız e-posta + şifreyle girer. Kayıt, şifremi unuttum, Google / Apple girişi, şifre oluşturma ve hesap silme yalnız kullanıcılar içindir; admin şifresini profilden (change-password) değiştirir ya da başka bir admin atar (admin/set-password).';

/** Modules that send mail (mailer env keys go into `.env.example` when one of them is on). */
export function authUsesMail(modules: readonly AuthModule[]): boolean {
  return modules.includes('register') || modules.includes('password-reset');
}

export const AUTH_MAIL_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'];

export function normalizeAuthModules(modules: readonly string[] | undefined): AuthModule[] {
  const set = new Set(modules ?? []);
  return AUTH_MODULES.filter((m) => set.has(m));
}

export function authEndpointsFor(modules: readonly AuthModule[]): AuthEndpoint[] {
  return AUTH_ENDPOINTS.filter((e) => {
    if (e.module === undefined) return true;
    const needs: readonly AuthModule[] = typeof e.module === 'string' ? [e.module] : e.module;
    return needs.some((m) => modules.includes(m));
  });
}

/** What the bootstrap dialog sends: picked modules + the first admin (the password is hashed before it reaches a host). */
export interface AuthBootstrapOptions {
  modules: AuthModule[];
  admin: { email: string; password: string; name: string };
}

/** Password rule (docs/backend/auth.md "Güvenlik"): 8+ characters, at most 72 bytes, a letter and a digit. */
export function authPasswordError(password: string): string | null {
  if (password.length < 8) return 'Şifre en az 8 karakter olmalı.';
  if (new TextEncoder().encode(password).length > 72) return 'Şifre en fazla 72 bayt olabilir.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Şifre en az bir harf ve bir rakam içermeli.';
  return null;
}

export function authAdminError(admin: AuthBootstrapOptions['admin']): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email.trim())) return 'İlk admin e-postası geçerli değil.';
  if (!admin.name.trim()) return 'İlk admin adı boş olamaz.';
  return authPasswordError(admin.password);
}

// --- Users model -------------------------------------------------------------------------------------------

export const AUTH_USERS_ENTITY = 'Users';

/** Fields the auth layer reads and writes: the model editor does not delete or rename them. */
export const AUTH_LOCKED_USER_FIELDS: readonly string[] = [
  'email',
  'passwordHash',
  'name',
  'role',
  'status',
  'emailVerified',
  'provider',
  'providerUserId',
  'lastLoginAt'
];

/** Only with the `apple` module: Apple's refresh token, revoked when the account is deleted (App Store rule). */
export const AUTH_APPLE_TOKEN_FIELD = 'appleRefreshToken';

/** Locked fields for these modules (`appleRefreshToken` only with `apple`). */
export function authLockedUserFields(modules: readonly AuthModule[] = []): readonly string[] {
  return modules.includes('apple') ? [...AUTH_LOCKED_USER_FIELDS, AUTH_APPLE_TOKEN_FIELD] : AUTH_LOCKED_USER_FIELDS;
}

export function isAuthLockedField(entityName: string, fieldName: string, modules: readonly AuthModule[] = []): boolean {
  return entityName === AUTH_USERS_ENTITY && authLockedUserFields(modules).includes(fieldName);
}

const searchable = (type: 'regex' | 'enum' | 'boolean' | 'date-range') => ({ searchable: true, type });

/** `Users` as NormalizedModel v2: written to the manifest by the bootstrap and generated like any other model. */
export function buildAuthUsersModel(modules: readonly AuthModule[] = []): NormalizedModel {
  const fields: NormalizedField[] = [
    {
      name: 'email',
      kind: 'string',
      isArray: false,
      required: true,
      unique: true,
      trim: true,
      format: 'email',
      filter: searchable('regex'),
      // Changed only by an admin: the normal API would skip e-mail verification.
      access: { adminOnly: true },
      ui: { label: 'E-posta', list: true }
    },
    {
      name: 'passwordHash',
      kind: 'string',
      isArray: false,
      required: false,
      access: { hidden: true, hiddenFromCreate: true, hiddenFromUpdate: true }
    },
    {
      name: 'name',
      kind: 'string',
      isArray: false,
      required: true,
      trim: true,
      constraints: { maxLength: 200 },
      filter: searchable('regex'),
      ui: { label: 'Ad', list: true }
    },
    {
      name: 'role',
      kind: 'enum',
      isArray: false,
      required: true,
      enum: { values: [...AUTH_ROLES] },
      default: 'user',
      filter: searchable('enum'),
      access: { adminOnly: true },
      ui: { label: 'Rol', list: true }
    },
    {
      name: 'status',
      kind: 'enum',
      isArray: false,
      required: true,
      enum: { values: ['active', 'suspended'] },
      default: 'active',
      filter: searchable('enum'),
      access: { adminOnly: true },
      ui: { label: 'Durum', list: true }
    },
    {
      name: 'emailVerified',
      kind: 'boolean',
      isArray: false,
      required: true,
      default: false,
      filter: searchable('boolean'),
      access: { adminOnly: true },
      ui: { label: 'E-posta doğrulandı' }
    },
    {
      name: 'provider',
      kind: 'enum',
      isArray: false,
      required: true,
      enum: { values: ['password', 'google', 'apple'] },
      default: 'password',
      filter: searchable('enum'),
      access: { readonly: true, hiddenFromCreate: true, hiddenFromUpdate: true },
      ui: { label: 'Giriş türü' }
    },
    {
      name: 'providerUserId',
      kind: 'string',
      isArray: false,
      required: false,
      access: { readonly: true, hiddenFromCreate: true, hiddenFromUpdate: true }
    },
    {
      name: 'lastLoginAt',
      kind: 'date',
      isArray: false,
      required: false,
      filter: searchable('date-range'),
      access: { readonly: true, hiddenFromCreate: true, hiddenFromUpdate: true },
      ui: { label: 'Son giriş', list: true }
    }
  ];
  if (modules.includes('apple')) {
    fields.push({
      name: AUTH_APPLE_TOKEN_FIELD,
      kind: 'string',
      isArray: false,
      required: false,
      access: { hidden: true, hiddenFromCreate: true, hiddenFromUpdate: true }
    });
  }
  return {
    schemaVersion: 2,
    entityName: AUTH_USERS_ENTITY,
    fields,
    timestamps: { createdAt: true, updatedAt: true },
    ownership: { kind: 'self' },
    api: {
      normalOperations: [],
      requiresAuth: true,
      admin: true,
      adminOperations: ['list', 'getOne', 'create', 'update', 'delete', 'export']
    },
    ui: { label: 'Kullanıcılar', titleField: 'email' }
  };
}

/**
 * Keeps the auth contract of `Users` whatever the editor / an import sends (docs/backend/auth.md "Users"): the locked
 * fields come from `buildAuthUsersModel()` (same place when present, appended otherwise), the host's own fields stay,
 * and so do ownership and the admin API the auth layer relies on. Only for a host with `workspace.auth`.
 */
export function lockAuthUsersModel(model: NormalizedModel, modules: readonly AuthModule[] = []): NormalizedModel {
  if (model.entityName !== AUTH_USERS_ENTITY) return model;
  const auth = buildAuthUsersModel(modules);
  const lockedNames = authLockedUserFields(modules);
  const locked = new Map(auth.fields.filter((f) => lockedNames.includes(f.name)).map((f) => [f.name, f]));
  const fields = model.fields.map((f) => locked.get(f.name) ?? f);
  for (const f of locked.values()) if (!fields.some((x) => x.name === f.name)) fields.push(f);
  return {
    ...model,
    fields,
    timestamps: auth.timestamps,
    ownership: auth.ownership,
    api: {
      ...auth.api,
      ...model.api,
      // The editor may open list / getOne / update; sign-up and account deletion go through the auth endpoints.
      normalOperations: (model.api?.normalOperations ?? []).filter((op) => op !== 'create' && op !== 'delete'),
      requiresAuth: true,
      admin: true
    }
  };
}

/** Manifest `workspace.auth` (absent on hosts made before the shared auth layer). */
export interface WorkspaceAuth {
  modules: AuthModule[];
  /** Product name in auth e-mails (Python `core/auth/messages.py`); the bootstrap's app name. */
  appName?: string;
}
