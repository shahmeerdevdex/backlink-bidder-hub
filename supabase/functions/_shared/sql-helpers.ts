
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
DO $$
BEGIN
  -- Check if the trigger exists before trying to disable it
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'check_auction_spots_trigger'
  ) THEN
    ALTER TABLE public.bids DISABLE TRIGGER check_auction_spots_trigger;
  END IF;
END $$;
`;

export const SQL_ENABLE_TRIGGER = `
DO $$
BEGIN
  -- Check if the trigger exists before trying to enable it
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'check_auction_spots_trigger'
  ) THEN
    ALTER TABLE public.bids ENABLE TRIGGER check_auction_spots_trigger;
  END IF;
END $$;
`;
