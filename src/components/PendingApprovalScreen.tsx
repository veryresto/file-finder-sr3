import { useState, useEffect } from 'react';
import { Clock, LogOut, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function PendingApprovalScreen() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [houseNumber, setHouseNumber] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [savedHouseNumber, setSavedHouseNumber] = useState<string | null>(null);
  const [savedWhatsappNumber, setSavedWhatsappNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('house_number, whatsapp_number')
        .eq('id', user.id)
        .single();
      
      if (data?.house_number) {
        setSavedHouseNumber(data.house_number);
        setHouseNumber(data.house_number);
      }
      if (data?.whatsapp_number) {
        setSavedWhatsappNumber(data.whatsapp_number);
        setWhatsappNumber(data.whatsapp_number);
      }
      setFetching(false);
    };
    
    fetchProfile();
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!houseNumber.trim()) {
      toast({
        title: 'House number required',
        description: 'Please enter your house number',
        variant: 'destructive',
      });
      return;
    }

    if (houseNumber.length > 25) {
      toast({
        title: 'House number too long',
        description: 'House number must be 25 characters or less',
        variant: 'destructive',
      });
      return;
    }

    if (whatsappNumber && whatsappNumber.length > 25) {
      toast({
        title: 'WhatsApp number too long',
        description: 'WhatsApp number must be 25 characters or less',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const isFirstSubmission = !savedHouseNumber;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          house_number: houseNumber.trim(),
          whatsapp_number: whatsappNumber.trim() || null
        })
        .eq('id', user?.id);

      if (error) throw error;

      setSavedHouseNumber(houseNumber.trim());
      setSavedWhatsappNumber(whatsappNumber.trim() || null);
      
      // Send notification to admin if this is the first submission
      if (isFirstSubmission) {
        try {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'new_user',
              userEmail: user?.email,
              userName: user?.user_metadata?.full_name || user?.user_metadata?.name,
              houseNumber: houseNumber.trim(),
            },
          });
          console.log('Admin notification sent');
        } catch (notifError) {
          console.error('Failed to send admin notification:', notifError);
          // Don't throw - notification failure shouldn't block the form submission
        }
      }

      toast({
        title: 'House number saved',
        description: 'Your information has been submitted for approval',
      });
    } catch (error: any) {
      toast({
        title: 'Error saving house number',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
          <Clock className="w-10 h-10 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Awaiting Approval</h1>
          <p className="text-muted-foreground">
            Hi {user?.user_metadata?.full_name || user?.email}, your account is pending approval from an administrator.
          </p>
        </div>

        {!fetching && (
          savedHouseNumber ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-sm">
              <div className="flex items-center justify-center gap-2 text-green-600 mb-1">
                <Check className="w-4 h-4" />
                <span className="font-medium">Information submitted</span>
              </div>
              <p className="text-muted-foreground">
                House Number: <span className="font-medium text-foreground">{savedHouseNumber}</span>
              </p>
              {savedWhatsappNumber && (
                <p className="text-muted-foreground">
                  WhatsApp: <span className="font-medium text-foreground">{savedWhatsappNumber}</span>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div className="space-y-2">
                <Label htmlFor="houseNumber">House Number *</Label>
                <Input
                  id="houseNumber"
                  type="text"
                  placeholder="Enter your house number"
                  value={houseNumber}
                  onChange={(e) => setHouseNumber(e.target.value)}
                  maxLength={25}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Maximum 25 characters
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsappNumber">WhatsApp Number (optional)</Label>
                <Input
                  id="whatsappNumber"
                  type="tel"
                  placeholder="e.g., 08123456789"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  maxLength={25}
                />
                <p className="text-xs text-muted-foreground">
                  Your WhatsApp number may be used by admin to contact you for verification before approval.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit'}
              </Button>
            </form>
          )
        )}

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <p>
            Once approved, you'll be able to view and search files. Additional upload permissions may also be granted by the administrator.
          </p>
        </div>

        <Button variant="outline" onClick={signOut} className="gap-2">
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
