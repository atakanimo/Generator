/**
 * Shared auth scenarios (docs/backend/auth.md "Doğrulama"): the same HTTP checks for every stack's new host. Imported by
 * the stack gates (`express-bootstrap.mjs`, `python-bootstrap.mjs`, `dotnet-e2e.mjs`) against a running server with an
 * empty database and the bootstrap's first admin seeded.
 *
 *   await runAuthScenarios({ base, prefix, admin, usersAdmin, modules, readOtp, check });
 *
 * - `base`: `http://127.0.0.1:<port>`; `prefix`: `/api` or `/api/v1`.
 * - `admin`: `{ email, password }` of the seeded first admin.
 * - `usersAdmin`: admin CRUD base of `Users` (Express / .NET `/api/users/admin`, Python `/api/v1/admin-crud/users`).
 * - `modules`: picked auth modules; module scenarios run only when on.
 * - `readOtp(email, purpose)`: the last code the console mailer logged for that address (server output).
 * - `check(name, ok, detail)`: the gate's reporter.
 *
 * Rate limit runs last (it blocks login from this IP for the window).
 */

/** Every optional module (docs/backend/auth.md); gates bootstrap with all of them on. */
export const AUTH_ALL_MODULES = ['register', 'password-reset', 'google', 'apple', 'account-delete'];
/** First admin of the gates' hosts (test value, never a real account). */
export const AUTH_TEST_ADMIN = { email: 'admin@example.test', password: 'Test1234pass', name: 'Admin' };

async function call(base, method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const isEnvelope = (j) => j && typeof j.isSuccess === 'boolean' && 'data' in j && 'errorData' in j;
const isSession = (d) => d && typeof d.accessToken === 'string' && typeof d.refreshToken === 'string' && typeof d.expiresIn === 'number' && d.user?.id;
const brief = (r) => `${r.status} ${JSON.stringify(r.json?.errorData ?? r.json?.data ?? r.json)?.slice(0, 200)}`;

export async function runAuthScenarios({ base, prefix, admin, usersAdmin, modules = [], readOtp, check, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const auth = `${prefix}/auth`;
  const ok = (name, cond, r) => check(`auth: ${name}`, Boolean(cond), r ? brief(r) : '');

  // --- Core ---------------------------------------------------------------------------------------------------
  const login = await call(base, 'POST', `${auth}/login`, { body: { email: admin.email, password: admin.password } });
  if (!ok('seed admin login → session', login.status === 200 && isEnvelope(login.json) && isSession(login.json.data), login)) return;
  const adminSession = login.json.data;
  ok('session user role admin, no passwordHash', adminSession.user.role === 'admin' && !('passwordHash' in adminSession.user), login);

  const me = await call(base, 'GET', `${auth}/me`, { token: adminSession.accessToken });
  ok('me → AuthUser', me.status === 200 && me.json.data?.email === admin.email.toLowerCase() && me.json.data?.role === 'admin', me);
  ok('me.hasPassword true for the seed admin', me.json?.data?.hasPassword === true, me);
  ok('me without token → 401', (await call(base, 'GET', `${auth}/me`)).status === 401);
  ok('me with garbage token → 401', (await call(base, 'GET', `${auth}/me`, { token: 'x.y.z' })).status === 401);

  const wrong = await call(base, 'POST', `${auth}/login`, { body: { email: admin.email, password: 'Wrong-pass-1' } });
  const unknown = await call(base, 'POST', `${auth}/login`, { body: { email: 'nobody@example.test', password: 'Wrong-pass-1' } });
  ok(
    'wrong password and unknown e-mail → same 401',
    wrong.status === 401 && unknown.status === 401 && wrong.json?.errorData?.message === unknown.json?.errorData?.message,
    wrong
  );

  const list = await call(base, 'POST', `${usersAdmin}/get-all`, { token: adminSession.accessToken, body: { page: 1, limit: 20 } });
  const rows = list.json?.data?.items ?? list.json?.data?.data ?? list.json?.data?.rows ?? [];
  ok('admin lists Users, passwordHash never in rows', list.status === 200 && rows.length >= 1 && rows.every((u) => !('passwordHash' in u)), list);

  // Refresh rotation: new pair; the old refresh token is dead (only it: the new one keeps working).
  const r1 = await call(base, 'POST', `${auth}/refresh`, { body: { refreshToken: adminSession.refreshToken } });
  ok('refresh → new session', r1.status === 200 && isSession(r1.json.data) && r1.json.data.refreshToken !== adminSession.refreshToken, r1);
  const reuse = await call(base, 'POST', `${auth}/refresh`, { body: { refreshToken: adminSession.refreshToken } });
  ok('old refresh token → 401', reuse.status === 401, reuse);
  // Same token twice at once (two tabs): exactly one wins.
  const raced = await Promise.all([1, 2].map(() => call(base, 'POST', `${auth}/refresh`, { body: { refreshToken: r1.json.data?.refreshToken } })));
  const winners = raced.filter((r) => r.status === 200);
  ok('two refreshes with one token at once → one 200, one 401', winners.length === 1 && raced.some((r) => r.status === 401), raced.map((r) => r.status));
  const r3 = await call(base, 'POST', `${auth}/refresh`, { body: { refreshToken: winners[0]?.json.data?.refreshToken } });
  ok('the winner\'s token keeps working', r3.status === 200, r3);

  // A second user made by the admin: role user, password set by the admin.
  const userEmail = `user-${Date.now()}@example.test`;
  const userPassword = 'User1234pass';
  const created = await call(base, 'POST', `${usersAdmin}/create`, {
    token: adminSession.accessToken,
    body: { email: userEmail, name: 'Plain User', role: 'user', status: 'active', emailVerified: true }
  });
  const userId = created.json?.data?.id;
  if (!ok('admin creates a user', created.status === 200 && userId, created)) return;
  const setPw = await call(base, 'POST', `${auth}/admin/set-password`, { token: adminSession.accessToken, body: { userId, newPassword: userPassword } });
  ok('admin sets the user password', setPw.status === 200, setPw);
  const weak = await call(base, 'POST', `${auth}/admin/set-password`, { token: adminSession.accessToken, body: { userId, newPassword: 'short' } });
  ok('weak password → 400', weak.status === 400, weak);

  const userLogin = await call(base, 'POST', `${auth}/login`, { body: { email: userEmail, password: userPassword } });
  if (!ok('user login', userLogin.status === 200 && userLogin.json.data?.user?.role === 'user', userLogin)) return;
  let user = userLogin.json.data;
  const forbidden = await call(base, 'POST', `${usersAdmin}/get-all`, { token: user.accessToken, body: { page: 1, limit: 20 } });
  ok('user on admin CRUD → 403', forbidden.status === 403, forbidden);
  ok(
    'user on admin set-password → 403',
    (await call(base, 'POST', `${auth}/admin/set-password`, { token: user.accessToken, body: { userId, newPassword: userPassword } })).status === 403
  );

  // Role comes from the record: promote, the same token works; demote, the same token is refused.
  await call(base, 'POST', `${usersAdmin}/update/${userId}`, { token: adminSession.accessToken, body: { role: 'admin' } });
  const promoted = await call(base, 'POST', `${usersAdmin}/get-all`, { token: user.accessToken, body: { page: 1, limit: 20 } });
  ok('promoted to admin → same token passes admin CRUD', promoted.status === 200, promoted);
  await call(base, 'POST', `${usersAdmin}/update/${userId}`, { token: adminSession.accessToken, body: { role: 'user' } });
  const demoted = await call(base, 'POST', `${usersAdmin}/get-all`, { token: user.accessToken, body: { page: 1, limit: 20 } });
  ok('demoted to user → same token 403', demoted.status === 403, demoted);

  // Change password: old refresh tokens die; the new password logs in.
  const badCurrent = await call(base, 'POST', `${auth}/change-password`, {
    token: user.accessToken,
    body: { currentPassword: 'Nope1234pass', newPassword: 'Next1234pass' }
  });
  ok('change-password with wrong current → 400', badCurrent.status === 400, badCurrent);
  const changed = await call(base, 'POST', `${auth}/change-password`, {
    token: user.accessToken,
    body: { currentPassword: userPassword, newPassword: 'Next1234pass' }
  });
  ok('change-password', changed.status === 200, changed);
  ok('refresh after password change → 401', (await call(base, 'POST', `${auth}/refresh`, { body: { refreshToken: user.refreshToken } })).status === 401);
  const relogin = await call(base, 'POST', `${auth}/login`, { body: { email: userEmail, password: 'Next1234pass' } });
  ok('login with the new password', relogin.status === 200, relogin);
  user = relogin.json?.data ?? user;

  // Logout ends that session only.
  const out = await call(base, 'POST', `${auth}/logout`, { body: { refreshToken: user.refreshToken } });
  ok('logout', out.status === 200, out);
  ok('refresh after logout → 401', (await call(base, 'POST', `${auth}/refresh`, { body: { refreshToken: user.refreshToken } })).status === 401);

  // Suspended: the valid access token is refused at once.
  await call(base, 'POST', `${usersAdmin}/update/${userId}`, { token: adminSession.accessToken, body: { status: 'suspended' } });
  const suspendedMe = await call(base, 'GET', `${auth}/me`, { token: user.accessToken });
  ok('suspended user → 403 on me', suspendedMe.status === 403, suspendedMe);
  const suspendedLogin = await call(base, 'POST', `${auth}/login`, { body: { email: userEmail, password: 'Next1234pass' } });
  ok('suspended user login → 403', suspendedLogin.status === 403, suspendedLogin);

  // --- Admin accounts: e-mail + password only (docs/backend/auth.md "Admin ve kullanıcı") -----------------------
  // A second admin from the admin CRUD, e-mail not verified: still logs in (admins get no OTP to verify with).
  // Keep /login calls few here: the limiter allows 10 per minute and the rate-limit check comes last.
  const admin2Email = `admin2-${Date.now()}@example.test`;
  const admin2 = await call(base, 'POST', `${usersAdmin}/create`, {
    token: adminSession.accessToken,
    body: { email: admin2Email, name: 'Second Admin', role: 'admin', status: 'active', emailVerified: false }
  });
  const admin2Id = admin2.json?.data?.id;
  if (ok('admin creates a second admin (unverified e-mail)', admin2.status === 200 && admin2Id, admin2)) {
    await call(base, 'POST', `${auth}/admin/set-password`, { token: adminSession.accessToken, body: { userId: admin2Id, newPassword: 'Admin21234pass' } });
    const admin2Login = await call(base, 'POST', `${auth}/login`, { body: { email: admin2Email, password: 'Admin21234pass' } });
    ok('unverified admin logs in with password', admin2Login.status === 200 && admin2Login.json.data?.user?.role === 'admin', admin2Login);
    if (modules.includes('account-delete')) {
      const del2 = await call(base, 'DELETE', `${auth}/account`, { token: admin2Login.json?.data?.accessToken });
      ok('admin cannot delete own account even with another admin → 403', del2.status === 403, del2);
    }
    if (modules.includes('register')) {
      const regAdmin = await call(base, 'POST', `${auth}/register`, { body: { email: admin2Email, password: 'Taken1234pass', name: 'Intruder' } });
      await sleep(200);
      ok('register with an admin e-mail → same 200, no code sent', regAdmin.status === 200 && (await readOtp(admin2Email, 'verify')) === '000000', regAdmin);
    }
  }
  if (modules.includes('account-delete')) {
    const delSeed = await call(base, 'DELETE', `${auth}/account`, { token: adminSession.accessToken });
    ok('seed admin cannot delete own account → 403', delSeed.status === 403, delSeed);
  }
  if (modules.includes('password-reset')) {
    const forgotAdmin = await call(base, 'POST', `${auth}/forgot-password`, { body: { email: admin.email } });
    await sleep(200);
    ok('forgot-password for an admin → same 200, no code sent', forgotAdmin.status === 200 && (await readOtp(admin.email, 'reset')) === '000000', forgotAdmin);
  }
  if (modules.includes('google') || modules.includes('apple')) {
    const setAdmin = await call(base, 'POST', `${auth}/set-password`, { token: adminSession.accessToken, body: { newPassword: 'Other1234pass' } });
    ok('admin on set-password → 403', setAdmin.status === 403, setAdmin);
  }

  // --- Modules ------------------------------------------------------------------------------------------------
  if (modules.includes('register')) {
    const email = `reg-${Date.now()}@example.test`;
    const reg = await call(base, 'POST', `${auth}/register`, { body: { email, password: 'Reg1234pass', name: 'New One' } });
    ok('register → otp sent, no session', reg.status === 200 && reg.json.data === null, reg);
    const early = await call(base, 'POST', `${auth}/login`, { body: { email, password: 'Reg1234pass' } });
    ok('login before verification → EMAIL_NOT_VERIFIED', early.status === 463, early);
    await sleep(200);
    const code = await readOtp(email, 'verify');
    for (let i = 0; i < 5; i++) {
      await call(base, 'POST', `${auth}/verify-email`, { body: { email, code: code === '000000' ? '111111' : '000000' } });
    }
    const locked = await call(base, 'POST', `${auth}/verify-email`, { body: { email, code } });
    ok('5 wrong codes lock the code (right code then fails)', locked.status === 400, locked);
    await call(base, 'POST', `${auth}/send-otp`, { body: { email, purpose: 'verify' } });
    await sleep(200);
    const fresh = await readOtp(email, 'verify');
    const verified = await call(base, 'POST', `${auth}/verify-email`, { body: { email, code: fresh } });
    ok('verify-email with a new code → session (role user)', verified.status === 200 && isSession(verified.json.data) && verified.json.data.user.role === 'user', verified);
    const dup = await call(base, 'POST', `${auth}/register`, { body: { email, password: 'Reg1234pass', name: 'Again' } });
    ok('register again → same answer (e-mail not revealed)', dup.status === 200, dup);
    if (modules.includes('google') || modules.includes('apple')) {
      const already = await call(base, 'POST', `${auth}/set-password`, { token: verified.json.data?.accessToken, body: { newPassword: 'Other1234pass' } });
      ok('set-password when a password exists → 400', already.status === 400, already);
    }

    if (modules.includes('password-reset')) {
      const forgot = await call(base, 'POST', `${auth}/forgot-password`, { body: { email } });
      const forgotUnknown = await call(base, 'POST', `${auth}/forgot-password`, { body: { email: 'ghost@example.test' } });
      ok('forgot-password: same answer for unknown e-mail', forgot.status === 200 && forgotUnknown.status === 200, forgot);
      await sleep(200);
      const resetCode = await readOtp(email, 'reset');
      const reset = await call(base, 'POST', `${auth}/reset-password`, { body: { email, code: resetCode, newPassword: 'Reset1234pass' } });
      ok('reset-password', reset.status === 200, reset);
      ok('old session refresh after reset → 401', (await call(base, 'POST', `${auth}/refresh`, { body: { refreshToken: verified.json.data?.refreshToken } })).status === 401);
      ok('login with reset password', (await call(base, 'POST', `${auth}/login`, { body: { email, password: 'Reset1234pass' } })).status === 200);
    }
    if (modules.includes('account-delete')) {
      const del = await call(base, 'DELETE', `${auth}/account`, { token: verified.json.data?.accessToken });
      ok('user deletes own account → 200, token then 401', del.status === 200 && (await call(base, 'GET', `${auth}/me`, { token: verified.json.data?.accessToken })).status === 401, del);
    }
  }
  if (modules.includes('google')) {
    const g = await call(base, 'POST', `${auth}/google`, { body: { idToken: 'not-a-google-token' } });
    ok('google with an invalid token → 401 (or 500 without client ids)', g.status === 401 || g.status === 500, g);
  }

  // --- Rate limit (last) --------------------------------------------------------------------------------------
  let limited = null;
  for (let i = 0; i < 25 && !limited; i++) {
    const r = await call(base, 'POST', `${auth}/login`, { body: { email: 'nobody@example.test', password: 'Wrong-pass-1' } });
    if (r.status === 429) limited = r;
  }
  ok('login rate limit → 429 envelope', limited && isEnvelope(limited.json), limited ?? undefined);
}

/** `readOtp` for the console mailers: the last 6-digit code logged next to the address (subject tells the purpose). */
export function otpReaderFromLog(getOutput) {
  return async (email) => {
    const lines = getOutput().split('\n').filter((l) => l.includes(email));
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = /\b(\d{6})\b/.exec(lines[i]);
      if (m) return m[1];
    }
    return '000000';
  };
}
