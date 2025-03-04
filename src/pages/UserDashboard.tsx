import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, Clock, DollarSign } from 'lucide-react';

interface Auction {
  id: string;
  title: string;
  description: string;
  ends_at: string;
  current_price: number;
  // Add other properties as needed
}

interface UserBid {
  id: string;
  amount: number;
  auction_id: string;
  created_at: string;
  // Add other properties as needed
}

interface AuctionWinner {
  id: string;
  auction_id: string;
  user_id: string;
  status: string;
  payment_deadline: string;
  // Add other properties as needed
}

// Update the Notification interface to include optional auction_id
interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  auction_id?: string; // Make auction_id optional
  user_id: string;
}

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeAuctions, setActiveAuctions] = useState<Auction[]>([]);
  const [userBids, setUserBids] = useState<UserBid[]>([]);
  const [wonAuctions, setWonAuctions] = useState<AuctionWinner[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch active auctions created by the user
        const { data: auctionsData, error: auctionsError } = await supabase
          .from('auctions')
          .select('*')
          .eq('creator_id', user.id)
          .eq('status', 'active');

        if (auctionsError) throw auctionsError;
        setActiveAuctions(auctionsData || []);

        // Fetch user's bids
        const { data: bidsData, error: bidsError } = await supabase
          .from('bids')
          .select('*')
          .eq('user_id', user.id);

        if (bidsError) throw bidsError;
        setUserBids(bidsData || []);

        // Fetch auctions won by the user
        const { data: winnersData, error: winnersError } = await supabase
          .from('auction_winners')
          .select('*')
          .eq('user_id', user.id);

        if (winnersError) throw winnersError;
        setWonAuctions(winnersData || []);
      } catch (error: any) {
        console.error('Error fetching data:', error);
        toast({
          title: 'Error',
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, navigate, toast]);

  useEffect(() => {
    if (!user) return;
    
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
        
      if (error) throw error;
      
      // Process the notifications data to ensure proper types
      const processedData = (data || []).map(notification => ({
        ...notification,
        auction_id: notification.auction_id
      })) as Notification[];
      
      setNotifications(processedData);
      
      // Show toast notifications for unread items
      processedData.filter(n => !n.read).forEach(notification => {
        toast({
          title: notification.type === 'winner' ? 'Auction Won!' : 'Notification',
          description: notification.message,
        });
      });
      
      // Mark notifications as read
      if (processedData && processedData.length > 0) {
        const unreadIds = processedData.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length > 0) {
          await supabase
            .from('notifications')
            .update({ read: true })
            .in('id', unreadIds);
        }
      }
    };
    
    fetchNotifications().catch(err => console.error('Error fetching notifications:', err));
  }, [user, toast]);

  const handleNotificationClick = (notification: Notification) => {
    if (notification.auction_id) {
      navigate(`/auctions/${notification.auction_id}`);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-semibold mb-5">User Dashboard</h1>

      <Tabs defaultValue="activeAuctions" className="w-full">
        <TabsList>
          <TabsTrigger value="activeAuctions">Active Auctions</TabsTrigger>
          <TabsTrigger value="myBids">My Bids</TabsTrigger>
          <TabsTrigger value="wonAuctions">Won Auctions</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="activeAuctions" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeAuctions.map((auction) => (
              <Card key={auction.id}>
                <CardHeader>
                  <CardTitle>{auction.title}</CardTitle>
                  <CardDescription>{auction.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Current Price: ${auction.current_price}</p>
                  <p>Ends At: {new Date(auction.ends_at).toLocaleString()}</p>
                </CardContent>
                <CardFooter>
                  <Button onClick={() => navigate(`/auctions/${auction.id}`)}>
                    View Auction <ArrowRight className="ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="myBids" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userBids.map((bid) => (
              <Card key={bid.id}>
                <CardHeader>
                  <CardTitle>Bid on Auction ID: {bid.auction_id}</CardTitle>
                  <CardDescription>Placed on: {new Date(bid.created_at).toLocaleString()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Amount: ${bid.amount}</p>
                </CardContent>
                <CardFooter>
                  <Button onClick={() => navigate(`/auctions/${bid.auction_id}`)}>
                    View Auction <ArrowRight className="ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="wonAuctions" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wonAuctions.map((winner) => (
              <Card key={winner.id}>
                <CardHeader>
                  <CardTitle>Won Auction ID: {winner.auction_id}</CardTitle>
                  <CardDescription>Payment Deadline: {new Date(winner.payment_deadline).toLocaleString()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Status: {winner.status}</p>
                </CardContent>
                <CardFooter>
                  <Button onClick={() => navigate(`/auctions/${winner.auction_id}`)}>
                    View Auction <ArrowRight className="ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="notifications" className="mt-5">
          <div className="grid grid-cols-1 gap-4">
            {notifications.map((notification) => (
              <Card key={notification.id} className="cursor-pointer" onClick={() => handleNotificationClick(notification)}>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    {notification.type === 'winner' && <DollarSign className="mr-2 h-4 w-4 text-green-500" />}
                    {notification.type !== 'winner' && <Clock className="mr-2 h-4 w-4 text-gray-500" />}
                    {notification.type}
                  </CardTitle>
                  <CardDescription>{new Date(notification.created_at).toLocaleString()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>{notification.message}</p>
                </CardContent>
                <CardFooter>
                  {notification.read ? (
                    <Badge variant="secondary">Read</Badge>
                  ) : (
                    <Badge>Unread</Badge>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
