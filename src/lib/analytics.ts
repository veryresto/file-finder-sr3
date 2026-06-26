import { supabase } from '@/integrations/supabase/client';

export async function track(
  eventName: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    await supabase.from('analytics_events').insert({
      user_id: user.id,
      app_slug: 'ipl_finder',
      event_name: eventName,
      properties,
    });
  } catch (error) {
    // Fail silently, never affect application behavior
    console.error('[analytics] Failed to track event:', error);
  }
}
