
// SQL helper functions for edge functions

export const SQL_CHECK_TRIGGER_STATUS = `
SELECT 
  trigger_name,
  action_statement,
  action_orientation,
  action_timing,
  CASE WHEN tgenabled = 'D' THEN 'disabled' ELSE 'enabled' END as status
FROM pg_trigger
WHERE tgname = 'check_auction_spots_trigger';
`;

export const SQL_DISABLE_TRIGGER = `
ALTER TABLE public.bids DISABLE TRIGGER IF EXISTS check_auction_spots_trigger;
`;

export const SQL_ENABLE_TRIGGER = `
ALTER TABLE public.bids ENABLE TRIGGER IF EXISTS check_auction_spots_trigger;
`;
