
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { UserCog, Ban, CheckCircle, UserCheck } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface User {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  is_banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
}

interface AuctionStats {
  total: number;
  active: number;
  completed: number;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AuctionStats>({ total: 0, active: 0, completed: 0 });
  const [banReason, setBanReason] = useState('');
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setUsers(data || []);
  };

  const fetchStats = async () => {
    const now = new Date().toISOString();
    const { data: allAuctions, error: statsError } = await supabase
      .from('auctions')
      .select('id, ends_at');

    if (statsError) {
      toast({
        title: "Error fetching statistics",
        description: statsError.message,
        variant: "destructive",
      });
      return;
    }

    const total = allAuctions?.length || 0;
    const active = allAuctions?.filter(a => new Date(a.ends_at) > new Date()).length || 0;
    const completed = total - active;

    setStats({ total, active, completed });
  };

  const toggleAdminStatus = async (userId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !currentStatus })
      .eq('id', userId);

    if (error) {
      toast({
        title: "Error updating user",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: `User admin status ${currentStatus ? 'revoked' : 'granted'}`,
    });

    fetchUsers();
  };

  const handleBanUser = (userId: string) => {
    setSelectedUserId(userId);
    setBanReason('');
    setBanDialogOpen(true);
  };

  const handleUnbanUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_banned: false,
        banned_at: null,
        banned_reason: null
      })
      .eq('id', userId);

    if (error) {
      toast({
        title: "Error unbanning user",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "User has been unbanned",
    });

    fetchUsers();
  };

  const confirmBanUser = async () => {
    if (!selectedUserId) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        is_banned: true,
        banned_at: new Date().toISOString(),
        banned_reason: banReason || 'Banned by administrator'
      })
      .eq('id', selectedUserId);

    if (error) {
      toast({
        title: "Error banning user",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "User has been banned",
      });
      fetchUsers();
    }

    setBanDialogOpen(false);
    setSelectedUserId(null);
    setBanReason('');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total Auctions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Auctions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Completed Auctions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{stats.completed}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Admin Status</TableHead>
                <TableHead>Ban Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {user.is_admin ? (
                      <span className="flex items-center text-green-600">
                        <CheckCircle className="w-4 h-4 mr-1" /> Admin
                      </span>
                    ) : (
                      <span className="flex items-center text-gray-600">
                        <UserCog className="w-4 h-4 mr-1" /> User
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.is_banned ? (
                      <span className="flex items-center text-red-600">
                        <Ban className="w-4 h-4 mr-1" /> Banned
                      </span>
                    ) : (
                      <span className="flex items-center text-green-600">
                        <UserCheck className="w-4 h-4 mr-1" /> Active
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button
                      variant={user.is_admin ? "destructive" : "default"}
                      size="sm"
                      onClick={() => toggleAdminStatus(user.id, user.is_admin)}
                      className="mb-2 md:mb-0"
                    >
                      {user.is_admin ? (
                        <>
                          <Ban className="w-4 h-4 mr-1" />
                          Revoke Admin
                        </>
                      ) : (
                        <>
                          <UserCog className="w-4 h-4 mr-1" />
                          Make Admin
                        </>
                      )}
                    </Button>
                    
                    {user.is_banned ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnbanUser(user.id)}
                        className="whitespace-nowrap"
                      >
                        <UserCheck className="w-4 h-4 mr-1" />
                        Unban User
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleBanUser(user.id)}
                        className="whitespace-nowrap"
                      >
                        <Ban className="w-4 h-4 mr-1" />
                        Ban User
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>
              This action will prevent the user from logging in and using the platform. Provide a reason for the ban.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label htmlFor="banReason" className="block text-sm font-medium mb-2">
              Ban Reason
            </label>
            <Textarea
              id="banReason"
              placeholder="Enter the reason for banning this user"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmBanUser}>
              Ban User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
