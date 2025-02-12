
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { format } from 'date-fns';

interface AuctionForm {
  title: string;
  description: string;
  starting_price: string;
  max_spots: string;
  ends_at: string;
}

interface Auction {
  id: string;
  title: string;
  description: string;
  starting_price: number;
  current_price: number;
  max_spots: number;
  filled_spots: number;
  ends_at: string;
  creator_id: string;
}

export default function AuctionManagement() {
  const [myAuctions, setMyAuctions] = useState<Auction[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingAuction, setEditingAuction] = useState<Auction | null>(null);
  const [form, setForm] = useState<AuctionForm>({
    title: '',
    description: '',
    starting_price: '',
    max_spots: '',
    ends_at: '',
  });
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchMyAuctions();
  }, [user]);

  const fetchMyAuctions = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error fetching auctions",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setMyAuctions(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const auctionData = {
      title: form.title,
      description: form.description,
      starting_price: parseInt(form.starting_price),
      current_price: parseInt(form.starting_price),
      max_spots: parseInt(form.max_spots),
      ends_at: new Date(form.ends_at).toISOString(),
      starts_at: new Date().toISOString(),
      creator_id: user.id,
    };

    const { error } = editingAuction 
      ? await supabase
          .from('auctions')
          .update(auctionData)
          .eq('id', editingAuction.id)
      : await supabase
          .from('auctions')
          .insert([auctionData]);

    if (error) {
      toast({
        title: "Error saving auction",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: editingAuction ? "Auction updated" : "Auction created",
      description: editingAuction ? "Your auction has been updated successfully." : "Your new auction has been created successfully.",
    });

    setForm({
      title: '',
      description: '',
      starting_price: '',
      max_spots: '',
      ends_at: '',
    });
    setIsCreating(false);
    setEditingAuction(null);
    fetchMyAuctions();
  };

  const handleDelete = async (auctionId: string) => {
    const { error } = await supabase
      .from('auctions')
      .delete()
      .eq('id', auctionId);

    if (error) {
      toast({
        title: "Error deleting auction",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Auction deleted",
      description: "The auction has been deleted successfully.",
    });

    fetchMyAuctions();
  };

  const startEdit = (auction: Auction) => {
    setEditingAuction(auction);
    setForm({
      title: auction.title,
      description: auction.description,
      starting_price: auction.starting_price.toString(),
      max_spots: auction.max_spots.toString(),
      ends_at: format(new Date(auction.ends_at), "yyyy-MM-dd'T'HH:mm"),
    });
    setIsCreating(true);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Manage Your Auctions</h1>
        <Button 
          onClick={() => {
            setIsCreating(!isCreating);
            setEditingAuction(null);
            if (!isCreating) {
              setForm({
                title: '',
                description: '',
                starting_price: '',
                max_spots: '',
                ends_at: '',
              });
            }
          }}
        >
          {isCreating ? "Cancel" : "Create New Auction"}
        </Button>
      </div>

      {isCreating && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{editingAuction ? "Edit Auction" : "Create New Auction"}</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Enter auction title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Enter auction description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Starting Price ($)</label>
                <Input
                  required
                  type="number"
                  min="1"
                  value={form.starting_price}
                  onChange={(e) => setForm({ ...form, starting_price: e.target.value })}
                  placeholder="Enter starting price"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Maximum Spots</label>
                <Input
                  required
                  type="number"
                  min="1"
                  value={form.max_spots}
                  onChange={(e) => setForm({ ...form, max_spots: e.target.value })}
                  placeholder="Enter maximum number of spots"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date & Time</label>
                <Input
                  required
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit">{editingAuction ? "Update Auction" : "Create Auction"}</Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {myAuctions.map((auction) => (
          <Card key={auction.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex justify-between items-start">
                <span className="text-xl font-bold">{auction.title}</span>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => startEdit(auction)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => handleDelete(auction.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
              <p className="text-sm text-muted-foreground mb-4">{auction.description}</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Starting Price</span>
                  <span className="font-semibold">${auction.starting_price}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Price</span>
                  <span className="font-semibold">${auction.current_price}</span>
                </div>
                <div className="flex justify-between">
                  <span>Spots</span>
                  <span className="font-semibold">{auction.filled_spots}/{auction.max_spots}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ends At</span>
                  <span className="font-semibold">
                    {format(new Date(auction.ends_at), 'PPp')}
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => navigate(`/auctions/${auction.id}`)}
              >
                View Details
              </Button>
            </CardFooter>
          </Card>
        ))}
        {myAuctions.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            You haven't created any auctions yet.
          </div>
        )}
      </div>
    </div>
  );
}
