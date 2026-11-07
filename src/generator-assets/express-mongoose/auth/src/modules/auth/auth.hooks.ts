// Business rules of the auth module. Created once by the Generator and never overwritten: edit freely.
import type { IUsers } from '@modules/users/users.model';
import type { AuthSession } from './auth.service';

export interface AuthHooks {
  /** Before a new user is saved (register / first social login): fill project fields (e.g. `region`). */
  onRegister?(user: IUsers, input: Record<string, unknown>): Promise<void> | void;
  /** Extra fields on every session / `me` response (e.g. `subscription`); merged into `data`. */
  onSession?(user: IUsers, session: AuthSession | null): Promise<Record<string, unknown>> | Record<string, unknown>;
  // @if account-delete
  /** Deletes the user's own data before the user row is removed (`DELETE /auth/account`). */
  onAccountDelete?(user: IUsers): Promise<void> | void;
  // @endif
}

export const authHooks: AuthHooks = {};
