
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
import { Notifications } from '@/components/Notifications';

export function NavBar() {
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleElegantMentionsClick = () => {
    window.location.href = 'https://elegantmentions.com/';
  };

  return (
    <div className="border-b">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <div 
              className="flex items-center mr-4 cursor-pointer" 
              onClick={handleElegantMentionsClick}
            >
              <img 
                src="/lovable-uploads/3e02dde5-e671-4653-9d2d-b7ebef4132ad.png" 
                alt="Elegant Mentions Logo" 
                className="h-10 mr-2" 
              />
              <span className="font-bold text-xl text-purple-900">Elegant Mentions</span>
            </div>
            
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
          </div>

          <div className="flex items-center gap-4">
            {user && <Notifications />}
            
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
