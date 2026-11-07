import { getAppLogger } from '@core/logging/logger';
import { Users } from '@modules/users/users.model';
import { initialAdmin } from '@/seed/initial-admin';

/**
 * First admin (docs/backend/auth.md "İlk admin"): when no `admin` user exists, the one in `src/seed/initial-admin.ts`
 * (written by the Generator, bcrypt hash only) is created, or promoted when that e-mail already has an account.
 * Runs on every start after Mongo connects; does nothing once an admin exists.
 */
export async function seedAuth(): Promise<void> {
  if ((await Users.countDocuments({ role: 'admin' }).exec()) > 0) return;
  const email = initialAdmin.email.trim().toLowerCase();
  const existing = await Users.findOne({ email }).exec();
  if (existing) {
    existing.role = 'admin';
    existing.status = 'active';
    await existing.save();
  } else {
    await Users.create({
      email,
      name: initialAdmin.name,
      passwordHash: initialAdmin.passwordHash,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      provider: 'password'
    });
  }
  getAppLogger().info({ event: 'auth.seed', email }, 'İlk admin oluşturuldu');
}
