
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, Clock, DollarSign, Tag, Calendar, User, Award } from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  auction_title?: string; // Add auction title
  // Add other properties as needed
}

interface AuctionWinner {
  id: string;
  auction_id: string;
  user_id: string;
  status: string;
  payment_deadline: string;
  auction_title?: string; // Add auction title
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

        // Fetch user's bids with auction titles
        const { data: bidsData, error: bidsError } = await supabase
          .from('bids')
          .select(`
            *,
            auctions:auction_id (
              title
            )
          `)
          .eq('user_id', user.id);

        if (bidsError) throw bidsError;
        
        // Process bids data to include auction title
        const processedBids = (bidsData || []).map(bid => ({
          ...bid,
          auction_title: bid.auctions?.title || 'Unknown Auction'
        }));
        
        setUserBids(processedBids);

        // Fetch auctions won by the user with auction titles
        const { data: winnersData, error: winnersError } = await supabase
          .from('auction_winners')
          .select(`
            *,
            auctions:auction_id (
              title
            )
          `)
          .eq('user_id', user.id);

        if (winnersError) throw winnersError;
        
        // Process winners data to include auction title
        const processedWinners = (winnersData || []).map(winner => ({
          ...winner,
          auction_title: winner.auctions?.title || 'Unknown Auction'
        }));
        
        setWonAuctions(processedWinners);
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
        <TabsList className="mb-4">
          <TabsTrigger value="activeAuctions">Active Auctions</TabsTrigger>
          <TabsTrigger value="myBids">My Bids</TabsTrigger>
          <TabsTrigger value="wonAuctions">Won Auctions</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        
        <TabsContent value="activeAuctions" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeAuctions.map((auction) => (
              <Card key={auction.id} className="h-full">
                <CardHeader>
                  <CardTitle>{auction.title}</CardTitle>
                  <CardDescription>{auction.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <span>Current Price: ${auction.current_price}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span>Ends At: {new Date(auction.ends_at).toLocaleString()}</span>
                  </p>
                </CardContent>
                <CardFooter>
                  <Button onClick={() => navigate(`/auctions/${auction.id}`)}>
                    View Auction <ArrowRight className="ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
            {activeAuctions.length === 0 && (
              <div className="col-span-full text-center py-10">
                <p className="text-gray-500">You don't have any active auctions.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="myBids" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>My Bids</CardTitle>
              <CardDescription>
                Bids you've placed across various auctions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Auction</TableHead>
                      <TableHead>Bid Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userBids.length > 0 ? (
                      userBids.map((bid) => (
                        <TableRow key={bid.id}>
                          <TableCell className="font-medium">
                            {bid.auction_title}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              ${bid.amount}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(bid.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/auctions/${bid.auction_id}`)}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                          You haven't placed any bids yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wonAuctions" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                Won Auctions
              </CardTitle>
              <CardDescription>
                Auctions you've successfully won
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Auction</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment Deadline</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wonAuctions.length > 0 ? (
                      wonAuctions.map((winner) => (
                        <TableRow key={winner.id}>
                          <TableCell className="font-medium">
                            {winner.auction_title}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={winner.status === 'paid' ? 'outline' : 'secondary'}
                              className={
                                winner.status === 'paid' 
                                  ? 'bg-green-100 text-green-800 border-green-300' 
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                              }
                            >
                              {winner.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(winner.payment_deadline).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/auctions/${winner.auction_id}`)}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                          You haven't won any auctions yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
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
            {notifications.length === 0 && (
              <div className="text-center py-10">
                <p className="text-gray-500">You don't have any notifications.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
