// Intentional cycle: payments -> reservations -> payments.
import { reservationExists } from './reservations';
export function refund(id: string): string { return reservationExists(id) ? 'pending' : 'refunded'; }
