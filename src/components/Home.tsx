import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { RunSession } from '../lib/types';

interface HomeProps {
  userId: string;
  onSignOut: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Home({ userId, onSignOut }: HomeProps) {
  const navigate = useNavigate();
  const [recentRuns, setRecentRuns] = useState<RunSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRuns() {
      const { data, error } = await supabase
        .from('run_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setRecentRuns(data);
      }
      setLoading(false);
    }
    loadRuns();
  }, [userId]);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-sand/50">
        <h1 className="font-serif text-xl text-espresso">Run-Record</h1>
        <button
          onClick={onSignOut}
          className="text-slate text-sm hover:text-espresso transition-colors"
        >
          Sign out
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-8 max-w-lg mx-auto w-full">
        {/* Start Run CTA */}
        <div className="text-center mb-12">
          <button
            onClick={() => navigate('/run')}
            className="w-36 h-36 rounded-full bg-warm-brown text-white flex items-center justify-center
                       text-lg font-medium shadow-lg hover:bg-warm-brown-light active:scale-95
                       transition-all mx-auto"
          >
            Start Run
          </button>
          <p className="text-slate text-sm mt-4">
            Tap to begin your AI-powered run
          </p>
        </div>

        {/* Recent Runs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-espresso">Recent Runs</h2>
            {recentRuns.length > 0 && (
              <button
                onClick={() => navigate('/history')}
                className="text-warm-brown text-sm hover:underline"
              >
                View all
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-slate text-sm">Loading...</p>
          ) : recentRuns.length === 0 ? (
            <div className="bg-linen rounded-xl p-6 text-center">
              <p className="text-slate text-sm">
                No runs yet. Start your first run and I'll capture your thoughts along the way.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => navigate(`/runs/${run.id}`)}
                  className="w-full bg-white rounded-xl p-4 border border-sand/40 text-left
                             hover:border-warm-brown/30 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-espresso font-medium text-sm">
                      {formatDate(run.started_at)}
                    </span>
                    <span className="text-slate text-xs font-mono">
                      {formatDuration(run.duration_seconds)}
                    </span>
                  </div>
                  {run.topics && run.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {run.topics.slice(0, 3).map((topic, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 bg-linen text-warm-brown rounded-full"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                  {run.summary && (
                    <p className="text-slate text-xs line-clamp-2">
                      {run.summary}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
