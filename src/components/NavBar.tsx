
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { LogOut, Home, ShoppingBag, User, Users } from 'lucide-react';

export function NavBar() {
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="border-b">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink
                  className={navigationMenuTriggerStyle()}
                  onClick={() => navigate('/')}
                >
                  <Home className="w-4 h-4 mr-2" />
                  Home
                </NavigationMenuLink>
              </NavigationMenuItem>
              
              {user && (
                <>
                  <NavigationMenuItem>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                      onClick={() => navigate('/dashboard')}
                    >
                      <User className="w-4 h-4 mr-2" />
                      Dashboard
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                  
                  <NavigationMenuItem>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                      onClick={() => navigate('/my-auctions')}
                    >
                      <ShoppingBag className="w-4 h-4 mr-2" />
                      My Auctions
                    </NavigationMenuLink>
                  </NavigationMenuItem>

                  {isAdmin && (
                    <NavigationMenuItem>
                      <NavigationMenuLink
                        className={navigationMenuTriggerStyle()}
                        onClick={() => navigate('/admin')}
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Admin
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  )}
                </>
              )}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="flex items-center gap-4">
            {user ? (
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            ) : (
              <Button
                onClick={() => navigate('/auth')}
                className="flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
