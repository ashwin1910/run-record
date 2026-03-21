import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { RunSession } from '../lib/types';

interface RunHistoryProps {
  userId: string;
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMonthYear(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function RunHistory({ userId }: RunHistoryProps) {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('run_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('started_at', { ascending: false });

      if (!error && data) setRuns(data);
      setLoading(false);
    }
    load();
  }, [userId]);

  const handleDelete = useCallback(async (runId: string) => {
    setDeleting(true);
    const { error } = await supabase
      .from('run_sessions')
      .delete()
      .eq('id', runId);

    if (!error) {
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } else {
      console.error('Failed to delete run:', error);
    }
    setDeleting(false);
    setConfirmDeleteId(null);
  }, []);

  // Group by month
  const filteredRuns = searchQuery
    ? runs.filter(
        (r) =>
          r.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.topics?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : runs;

  const grouped = filteredRuns.reduce<Record<string, RunSession[]>>((acc, run) => {
    const key = getMonthYear(run.started_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(run);
    return acc;
  }, {});

  const confirmRun = confirmDeleteId ? runs.find((r) => r.id === confirmDeleteId) : null;

  return (
    <div className="min-h-screen bg-cream">
      {/* Delete confirmation modal */}
      {confirmDeleteId && confirmRun && (
        <div className="fixed inset-0 bg-espresso/40 flex items-center justify-center z-50 px-6">
          <div className="bg-cream rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="font-serif text-lg text-espresso mb-2">Delete this run?</h2>
            <p className="text-slate text-sm mb-1">
              {formatDate(confirmRun.started_at)} &middot; {formatDuration(confirmRun.duration_seconds)}
            </p>
            <p className="text-slate text-sm mb-6">
              This will permanently delete the run, all captured notes, and the full transcript. This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-2.5 border border-sand rounded-lg text-slate text-sm
                           hover:bg-linen transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-terracotta text-white rounded-lg text-sm font-medium
                           hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="px-6 py-5 border-b border-sand/50 flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="text-slate hover:text-espresso transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="font-serif text-lg text-espresso">Run History</h1>
      </header>

      <main className="px-6 py-6 max-w-lg mx-auto">
        {/* Search */}
        <input
          type="text"
          placeholder="Search runs and notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-sand rounded-lg text-espresso text-sm
                     placeholder:text-sand focus:outline-none focus:ring-2 focus:ring-warm-brown/30
                     focus:border-warm-brown transition-colors mb-6"
        />

        {loading ? (
          <p className="text-slate text-sm text-center">Loading...</p>
        ) : filteredRuns.length === 0 ? (
          <p className="text-slate text-sm text-center">
            {searchQuery ? 'No runs match your search.' : 'No completed runs yet.'}
          </p>
        ) : (
          Object.entries(grouped).map(([month, monthRuns]) => (
            <div key={month} className="mb-8">
              <h2 className="font-serif text-sm text-slate uppercase tracking-wider mb-3">
                {month}
              </h2>
              <div className="space-y-2">
                {monthRuns.map((run) => (
                  <div
                    key={run.id}
                    className="bg-white rounded-xl border border-sand/40 flex items-stretch
                               hover:border-warm-brown/30 hover:shadow-sm transition-all"
                  >
                    {/* Tap to view */}
                    <button
                      onClick={() => navigate(`/runs/${run.id}`)}
                      className="flex-1 p-4 text-left min-w-0"
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
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {run.topics.slice(0, 4).map((topic, i) => (
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
                        <p className="text-slate text-xs line-clamp-2">{run.summary}</p>
                      )}
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(run.id); }}
                      className="px-4 border-l border-sand/40 text-sand hover:text-terracotta
                                 transition-colors flex items-center rounded-r-xl"
                      aria-label="Delete run"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
