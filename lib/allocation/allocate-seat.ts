// Allocation engine — wraps the `allocate_seat` repository call with the
// Postgres Cockatiel policy (timeout + retry + breaker). This is the
// application-layer surface the worker calls.
//
// Return contract is preserved from the repository: an AllocatedSeat row on
// success, `null` on sold_out (zero rows returned from the stored function).
// The breaker failing open-closed here means the worker sees a CockatielError
// that it can distinguish from a normal sold_out.

import { allocateSeat as rawAllocateSeat, type AllocatedSeat } from '@/lib/db/repositories/seats';
import { pgPolicy } from '@/lib/resilience/pg-policy';

export interface AllocateArgs {
  trainId: string;
  bookingId: string;
  passengerName: string;
  holdDurationSec?: number;
}

export async function allocateSeatWithPolicy(
  args: AllocateArgs,
): Promise<AllocatedSeat | null> {
  return pgPolicy.execute(() => rawAllocateSeat(args));
}
