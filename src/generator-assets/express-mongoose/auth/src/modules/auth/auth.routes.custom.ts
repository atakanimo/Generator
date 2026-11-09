// Projeye özel auth uçları (`/api/auth` altında); ortak uçlardan sonra bağlanır.
import type { Router } from 'express';

export function mapCustomAuthRoutes(_router: Router): void {}
