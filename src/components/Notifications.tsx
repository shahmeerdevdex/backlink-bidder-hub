
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Award, ArrowUp, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  user_id: string;
  type: 'winner' | 'outbid' | 'auction_ending' | 'new_auction';
  message: string;
  auction_id?: string; // Make auction_id optional
  read: boolean;
  created_at: string;
}

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch notifications
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      console.log('Raw notifications data:', data);

      // Process the data to ensure it matches our Notification interface
      // This handles the type inconsistency and ensures auction_id is properly set
      const processedData: Notification[] = (data || []).map(item => ({
        id: item.id,
        user_id: item.user_id,
        // Cast the type to our specific union type
        type: (item.type as 'winner' | 'outbid' | 'auction_ending' | 'new_auction'),
        message: item.message,
        // Add auction_id property even if it doesn't exist in the database
        auction_id: (item as any).auction_id,
        read: !!item.read,
        created_at: item.created_at
      }));
      
      console.log('Processed notifications data:', processedData);
      setNotifications(processedData);
      setUnreadCount(processedData.filter(n => !n.read).length || 0);
    };

    fetchNotifications();

    // Subscribe to real-time updates for notifications
    const channel = supabase
      .channel('notifications_changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Notification update received:', payload);
          fetchNotifications();
          
          // Show toast for new notifications
          if (payload.eventType === 'INSERT') {
            const newNotification = payload.new as unknown as Notification;
            toast({
              title: getNotificationTitle(newNotification.type),
              description: newNotification.message,
              duration: 5000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  const getNotificationTitle = (type: string) => {
    switch (type) {
      case 'winner': return 'Auction Won!';
      case 'outbid': return 'You\'ve Been Outbid';
      case 'auction_ending': return 'Auction Ending Soon';
      case 'new_auction': return 'New Auction';
      default: return 'Notification';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'winner': return <Award className="h-4 w-4 text-green-500" />;
      case 'outbid': return <ArrowUp className="h-4 w-4 text-red-500" />;
      case 'auction_ending': return <Bell className="h-4 w-4 text-amber-500" />;
      case 'new_auction': return <Bell className="h-4 w-4 text-blue-500" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if not already read
    if (!notification.read) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notification.id);
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    // Navigate to the relevant auction if auction_id exists
    if (notification.auction_id) {
      setOpen(false);
      navigate(`/auctions/${notification.auction_id}`);
    }
  };

  const markAllAsRead = async () => {
    if (notifications.length === 0 || unreadCount === 0) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user?.id)
      .eq('read', false);

    if (error) {
      console.error('Error marking notifications as read:', error);
      return;
    }

    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    toast({
      title: "Notifications",
      description: "All notifications marked as read",
    });
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting notification:', error);
      return;
    }

    setNotifications(prev => prev.filter(n => n.id !== id));
    if (notifications.find(n => n.id === id)?.read === false) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  // Don't render anything if user is not logged in
  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-5 h-5 flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length > 0 ? (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className={`flex items-start p-4 gap-3 cursor-pointer hover:bg-accent transition-colors ${notification.read ? 'opacity-70' : 'bg-accent/10'}`} 
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {getNotificationTitle(notification.type)}
                    </p>
                    <p className="text-sm text-muted-foreground">{notification.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 opacity-60 hover:opacity-100"
                    onClick={(e) => deleteNotification(e, notification.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p>No notifications yet</p>
              <p className="text-sm">We'll notify you about auctions and bids</p>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
