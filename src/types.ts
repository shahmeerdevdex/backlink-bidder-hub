
export interface Auction {
  id: string;
  title: string;
  description: string;
  starting_price: number;
  current_price: number;
  max_spots: number;
  filled_spots: number;
  ends_at: string;
}

export interface Bid {
  id: string;
  auction_id: string;
  user_id: string;
  amount: number;
  created_at: string;
  updated_at: string;
  status: string;
}
