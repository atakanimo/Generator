import mongoose, { Schema, type Types } from 'mongoose';

/**
 * Auth's own collections (not a Generator model, no admin CRUD). Only hashes are stored.
 * `refresh_tokens`: one row per session; rotation sets `revokedAt` on the old row.
 */
export interface IRefreshToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  userAgent?: string;
  ip?: string;
  createdAt?: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String },
    ip: { type: String }
  },
  { collection: 'refresh_tokens', timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
// Mongo removes expired sessions itself.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokens = mongoose.model<IRefreshToken>('RefreshTokens', RefreshTokenSchema);
// @if register|password-reset

export type OtpPurpose = 'verify' | 'reset';

/** `otp_codes`: one open code per user and purpose; at most `OTP_MAX_ATTEMPTS` wrong tries. */
export interface IOtpCode {
  userId: Types.ObjectId;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt?: Date | null;
}

const OtpCodeSchema = new Schema<IOtpCode>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    purpose: { type: String, required: true, enum: ['verify', 'reset'] },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0 },
    consumedAt: { type: Date, default: null }
  },
  { collection: 'otp_codes', timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
OtpCodeSchema.index({ userId: 1, purpose: 1 });
OtpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpCodes = mongoose.model<IOtpCode>('OtpCodes', OtpCodeSchema);
// @endif
