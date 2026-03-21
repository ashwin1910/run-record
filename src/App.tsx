import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Home } from './components/Home';
import { ActiveRun } from './components/ActiveRun';
import { RunDetail } from './components/RunDetail';
import { RunHistory } from './components/RunHistory';
import type { User } from '@supabase/supabase-js';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="font-serif text-xl text-warm-brown">Run-Record</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home userId={user.id} onSignOut={handleSignOut} />} />
        <Route path="/run" element={<ActiveRun userId={user.id} />} />
        <Route path="/runs/:runId" element={<RunDetail />} />
        <Route path="/history" element={<RunHistory userId={user.id} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
